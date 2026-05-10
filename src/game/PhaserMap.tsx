import { useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Phaser from 'phaser';
import { db } from '@/db';
import { getCreature } from '@/data/creatures';
import {
  getPetStatus,
  realmRank,
  realmLabel,
  EFFECT_ORDER,
  earnCultivation,
  emitTaskTrigger,
  type SoulRealm
} from '@/services';
import { WorldScene } from './scene';
import type { PetSpriteData } from './petSprite';

interface PhaserMapProps {
  /** 玩家點到寵物（World scene 點擊事件轉出） */
  onPetClick: (petId: string) => void;
  /** 右上角刷新鈕 */
  onRefresh: () => void;
  refreshing: boolean;
}

/**
 * Phaser 世界地圖容器(米紙水墨風)。
 *
 *  - 在 useEffect 建立 Phaser.Game，unmount 時 destroy
 *  - 視窗 resize 時讓 Phaser 重新調整 canvas 大小
 *  - holdings/pets/prices 任一變動就 syncPets() 推到 scene
 *  - scene 點擊事件透過 ref 轉成 React props.onPetClick
 */

/**
 * 等到 scene.create() 跑完、可以安全呼叫 syncPets / setClickHandler 才執行 cb。
 *
 * 重點：剛 new Phaser.Game() 完，scene.scene / scene.events 還是 undefined，
 * 要等 SceneManager.bootQueue（在 game READY 之後跑）裡 sys.init 把 plugin
 * 注入完才會有。直接讀 scene.scene.isActive() 會炸
 * "Cannot read properties of undefined (reading 'isActive')"。
 *
 * 注意：game.isBooted 在 game.boot() 開頭就 true，比 sys.init 早很多，
 * 不可拿來判斷 scene plugin 是否注入；要看 game.scene.isBooted（SceneManager
 * 在 bootQueue 結束才設 true，那時 sys.init 已跑完）。
 */
function waitForSceneReady(
  game: Phaser.Game,
  scene: WorldScene,
  cb: () => void
): void {
  const attach = () => {
    if (scene.scene.isActive()) cb();
    else scene.events.once(Phaser.Scenes.Events.CREATE, () => cb());
  };
  if (game.scene.isBooted) attach();
  else game.events.once(Phaser.Core.Events.READY, attach);
}

export default function PhaserMap({ onPetClick, onRefresh, refreshing }: PhaserMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<WorldScene | null>(null);
  const onPetClickRef = useRef(onPetClick);
  onPetClickRef.current = onPetClick;

  // 建立 Phaser 遊戲
  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new WorldScene();
    sceneRef.current = scene;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      // 米紙底色,跟 scene RICE_PAPER_BG + manifest theme 一致
      backgroundColor: '#efe6cf',
      scale: {
        mode: Phaser.Scale.RESIZE,
        width: '100%',
        height: '100%'
      },
      // 不需要物理引擎，純座標移動
      physics: { default: undefined },
      // 打開 multi-touch(預設只追單指)讓雙指 pinch zoom 能用
      input: { activePointers: 3 },
      scene
    });
    gameRef.current = game;

    // scene.events / scene.scene 由 SceneManager.bootQueue 在 game READY 後注入；
    // 在 bootQueue 跑之前直接讀 scene.scene.isActive() 會炸 undefined。
    const setHandler = () => {
      scene.setClickHandler((id) => onPetClickRef.current(id));
    };
    waitForSceneReady(game, scene, setHandler);

    return () => {
      sceneRef.current = null;
      game.destroy(true);
      gameRef.current = null;
    };
  }, []);

  // 觀察持倉 / 寵物 / 價格，推到 scene
  const holdings = useLiveQuery(() => db.holdings.toArray(), []);
  const pets = useLiveQuery(() => db.pets.filter((p) => !p.retiredAt).toArray(), []);
  const stocks = useLiveQuery(() => db.stocks.toArray(), []);
  const prices = useLiveQuery(() => db.prices.toArray(), []);

  useEffect(() => {
    const scene = sceneRef.current;
    const game = gameRef.current;
    if (!scene || !game) return;
    if (!holdings || !pets || !stocks) return;

    const stockMap = new Map(stocks.map((s) => [s.code, s]));
    const priceMap = new Map((prices ?? []).map((p) => [p.code, p]));
    const petByCode = new Map(pets.map((p) => [p.code, p]));

    /**
     * 階段 1.7:境界突破偵測。
     * 走訪每隻 pet,比對 status.realm vs pet.lastRealmCheck:
     *   - 升級(rank↑)        → 觸發 scene.celebrateBreakthrough + 寫回 lastRealmCheck
     *   - 第一次(undefined)→ 只寫回不慶祝(避免新建神獸瞬間放動畫)
     *   - 同階                → 跳過
     *   - 降級(理論不會)    → 只寫回不慶祝(safety net)
     * 寫回 db.pets.update 後 useLiveQuery 會 retrigger,但下次比對相等就 skip,無 loop。
     */
    const breakthroughs: Array<{ petId: string; newRealm: SoulRealm; speciesName: string }> = [];

    const data: PetSpriteData[] = holdings
      .map((h) => {
        const pet = petByCode.get(h.code);
        const stock = stockMap.get(h.code);
        if (!pet || !stock) return null;
        const price = priceMap.get(h.code);
        const marketValue = price ? price.currentPrice * h.shares : h.avgCost * h.shares;
        const pnl = marketValue - h.totalCost;
        const species = getCreature(pet.speciesId);
        // 三維度狀態(階段 1.1):level / realm / effect 即時算
        // monthsHeld 用 holding.firstPurchasedAt — 賣光重買時 holding 被刪除重建,
        // firstPurchasedAt 重設成重買日,歷史持有時間不累積(設計如此)。
        const status = getPetStatus(pet, h, price);

        // 境界突破偵測
        if (pet.lastRealmCheck !== status.realm) {
          if (
            pet.lastRealmCheck !== undefined &&
            realmRank(status.realm) > realmRank(pet.lastRealmCheck)
          ) {
            breakthroughs.push({
              petId: pet.id,
              newRealm: status.realm,
              speciesName: species?.name ?? '神獸'
            });
            // 階段 2.3:升境 +200 修為
            earnCultivation(
              200,
              'realm_breakthrough',
              `${species?.name ?? '神獸'} 突破至${realmLabel(status.realm)}境`,
              pet.id
            );
            // 階段 3.7:任務 trigger 計次
            emitTaskTrigger('realm_breakthrough', 1);
          }
          // 升級 / 第一次初始化 / 降級 都寫回(下次跑不再觸發)
          db.pets.update(pet.id, { lastRealmCheck: status.realm });
        }

        // 階段 2.3:報酬率特效升級偵測(從低升高才獎勵,從高降低不扣,防震盪洗修為)
        // 階段 4A.4 修:用 naturalEffect 比對(無淬煉 boost),避免玩家花 500
        // 修為淬煉後拿回 +50 effect_unlock 雙重給付
        if (pet.lastEffectCheck !== status.naturalEffect) {
          if (pet.lastEffectCheck !== undefined) {
            const oldRank = EFFECT_ORDER.indexOf(pet.lastEffectCheck);
            const newRank = EFFECT_ORDER.indexOf(status.naturalEffect);
            if (newRank > oldRank) {
              // pulsing(>20%) / rotating(>50%) → 50;erupting(>100%) → 100
              const reward = status.naturalEffect === 'erupting' ? 100 : 50;
              const labels: Record<string, string> = {
                pulsing: '魂環開始脈動(+20%)',
                rotating: '魂環開始旋轉(+50%)',
                erupting: '魂環噴發金光(+100%)'
              };
              earnCultivation(
                reward,
                'effect_unlock',
                `${species?.name ?? '神獸'} ${labels[status.naturalEffect] ?? '魂環升級'}`,
                pet.id
              );
              // 階段 3.7:任務 trigger 計次(只升才發,降級不發)
              emitTaskTrigger('effect_unlock', 1);
            }
          }
          db.pets.update(pet.id, { lastEffectCheck: status.naturalEffect });
        }

        return {
          petId: pet.id,
          speciesId: pet.speciesId,
          hasArt: species?.art === true,
          emoji: species?.emoji ?? '❓',
          stockName: stock.name,
          pnl,
          level: status.level,
          realm: status.realm,
          effect: status.effect,
          // 階段 4B.2:配色淬煉 — 沒設過的舊 pet 預設 'default'
          colorVariant: pet.colorVariant ?? 'default'
        } satisfies PetSpriteData;
      })
      .filter((x): x is PetSpriteData => x !== null);

    // scene.scene / scene.events 在 game READY 後才存在；create() 後 isActive() 才為 true
    waitForSceneReady(game, scene, () => {
      scene.syncPets(data);
      // syncPets 完才有 sprite 可以放動畫
      for (const bt of breakthroughs) {
        scene.celebrateBreakthrough(bt.petId, bt.newRealm, bt.speciesName);
      }
    });
  }, [holdings, pets, stocks, prices]);

  const isEmpty = (holdings ?? []).length === 0;

  return (
    <div className="relative flex-1 overflow-hidden">
      <div ref={containerRef} className="absolute inset-0" />

      {/*
        浮動按鈕 top 用 var(--hud-height) 避讓固定 HUD,
        12 / 68 / 124 是按鈕之間的相對 offset,加上 HUD 高度才是實際 top
      */}
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className="absolute right-3 z-10 w-12 h-12 rounded-full bg-white/95 shadow-lg flex items-center justify-center text-2xl active:scale-90 transition-transform disabled:opacity-50"
        style={{ top: 'calc(12px + var(--hud-height, 80px))' }}
        aria-label="更新股價"
      >
        {refreshing ? '⏳' : '🔄'}
      </button>

      <button
        type="button"
        onClick={() => sceneRef.current?.zoomBy(1.25)}
        className="absolute right-3 z-10 w-12 h-12 rounded-full bg-white/95 shadow-lg flex items-center justify-center text-2xl font-bold active:scale-90 transition-transform"
        style={{ top: 'calc(68px + var(--hud-height, 80px))' }}
        aria-label="放大"
      >
        ＋
      </button>
      <button
        type="button"
        onClick={() => sceneRef.current?.zoomBy(0.8)}
        className="absolute right-3 z-10 w-12 h-12 rounded-full bg-white/95 shadow-lg flex items-center justify-center text-2xl font-bold active:scale-90 transition-transform"
        style={{ top: 'calc(124px + var(--hud-height, 80px))' }}
        aria-label="縮小"
      >
        －
      </button>

      {/* 空狀態提示 */}
      {isEmpty && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center text-gray-700 max-w-xs px-4 bg-white/80 rounded-2xl py-4 shadow">
            <p className="text-5xl mb-2">☁️</p>
            <p className="text-sm">這片山水還很清靜⋯</p>
            <p className="text-xs text-gray-500 mt-1">
              點擊下方「買入神獸」召喚第一隻吧
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
