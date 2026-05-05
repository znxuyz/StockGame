import { useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Phaser from 'phaser';
import { db } from '@/db';
import { getCreature } from '@/data/creatures';
import { isCorrupted } from '@/types';
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
 * Phaser 沙漠地圖容器。
 *
 *  - 在 useEffect 建立 Phaser.Game，unmount 時 destroy
 *  - 視窗 resize 時讓 Phaser 重新調整 canvas 大小
 *  - holdings/pets/prices 任一變動就 syncPets() 推到 scene
 *  - scene 點擊事件透過 ref 轉成 React props.onPetClick
 */
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
      backgroundColor: '#f5deb3',
      scale: {
        mode: Phaser.Scale.RESIZE,
        width: '100%',
        height: '100%'
      },
      // 不需要物理引擎，純座標移動
      physics: { default: undefined },
      scene
    });
    gameRef.current = game;

    // 場景啟動完成後設 click handler（scene.create 是 async-like）
    const setHandler = () => {
      scene.setClickHandler((id) => onPetClickRef.current(id));
    };
    if (scene.scene.isActive()) setHandler();
    else scene.events.once(Phaser.Scenes.Events.CREATE, setHandler);

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
    if (!sceneRef.current) return;
    if (!holdings || !pets || !stocks) return;

    const stockMap = new Map(stocks.map((s) => [s.code, s]));
    const priceMap = new Map((prices ?? []).map((p) => [p.code, p]));
    const petByCode = new Map(pets.map((p) => [p.code, p]));

    const data: PetSpriteData[] = holdings
      .map((h) => {
        const pet = petByCode.get(h.code);
        const stock = stockMap.get(h.code);
        if (!pet || !stock) return null;
        const price = priceMap.get(h.code);
        const marketValue = price ? price.currentPrice * h.shares : h.avgCost * h.shares;
        const pnl = marketValue - h.totalCost;
        const species = getCreature(pet.speciesId);
        return {
          petId: pet.id,
          emoji: species?.emoji ?? '❓',
          stockName: stock.name,
          pnl,
          level: pet.level,
          tier: pet.tier,
          isCorrupted: isCorrupted(pet)
        } satisfies PetSpriteData;
      })
      .filter((x): x is PetSpriteData => x !== null);

    // sceneRef.current.scene.isActive 在 scene.create 之前可能 false，要等
    const trySync = () => {
      const scene = sceneRef.current;
      if (!scene) return;
      if (scene.scene.isActive()) {
        scene.syncPets(data);
      } else {
        scene.events.once(Phaser.Scenes.Events.CREATE, () => scene.syncPets(data));
      }
    };
    trySync();
  }, [holdings, pets, stocks, prices]);

  const isEmpty = (holdings ?? []).length === 0;

  return (
    <div className="relative flex-1 overflow-hidden">
      <div ref={containerRef} className="absolute inset-0" />

      {/* 刷新按鈕 */}
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className="absolute top-3 right-3 z-10 w-12 h-12 rounded-full bg-white/95 shadow-lg flex items-center justify-center text-2xl active:scale-90 transition-transform disabled:opacity-50"
        aria-label="更新股價"
      >
        {refreshing ? '⏳' : '🔄'}
      </button>

      {/* 重置視角 */}
      <button
        type="button"
        onClick={() => sceneRef.current?.centerCamera()}
        className="absolute top-3 right-[68px] z-10 w-12 h-12 rounded-full bg-white/95 shadow-lg flex items-center justify-center text-xl active:scale-90 transition-transform"
        aria-label="重置視角"
      >
        🎯
      </button>

      {/* 空狀態提示 */}
      {isEmpty && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center text-gray-700 max-w-xs px-4 bg-white/80 rounded-2xl py-4 shadow">
            <p className="text-5xl mb-2">🏜️</p>
            <p className="text-sm">這片沙漠還很安靜⋯</p>
            <p className="text-xs text-gray-500 mt-1">
              點擊下方「買入神獸」召喚第一隻吧
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
