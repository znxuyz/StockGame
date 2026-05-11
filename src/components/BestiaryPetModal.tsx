import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Modal from './Modal';
import { db } from '@/db';
import {
  spendCultivation,
  effectLabel,
  realmLabel,
  unlockCreatureStory,
  STORY_UNLOCK_COST,
  type RingEffect,
  type SoulRealm
} from '@/services';
import { useCultivation } from '@/hooks/useCultivation';
import { getCreature, getPetDisplayName } from '@/data/creatures';
import { getCreatureStory } from '@/data/creatureStories';
import { COLOR_VARIANT_TINT } from '@/services';
import { formatInt, daysBetween } from '@/utils';
import type { Pet } from '@/types';

interface BestiaryPetModalProps {
  open: boolean;
  onClose: () => void;
  /** 點擊圖鑑卡傳進來,顯示這個 species 的所有 pet 實例 */
  speciesId: string | null;
}

const ETERNAL_COST = 2000;

const EFFECT_EMOJI: Record<RingEffect, string> = {
  dim: '💤',
  normal: '⚪',
  pulsing: '💓',
  rotating: '🔄',
  erupting: '✨'
};

const REALM_EMOJI: Record<SoulRealm, string> = {
  fan: '⚪',
  ling: '🟡',
  yao: '🟣',
  shen: '⚫',
  sheng: '🔴',
  xian: '🌈'
};

/**
 * 圖鑑神獸詳細頁(階段 4C.2)。
 *
 *  - 顯示該 species 基本資料 + 所有 pet 實例(賣光重買的話會有多筆)
 *  - 每個 pet row:出生 / 退役日期 / 巔峰境界 / 退役當下特效(finalEffect)
 *  - 退役 pet 加 [永恆紀念 💎2000] 按鈕,確認後 spendCultivation +
 *    db.pets.update({ isEternal: true, eternalDate: now })
 *  - 已永恆紀念顯示「✨ 已紀念 · YYYY/MM/DD」+ 卡片金邊
 *  - 仍在世(未退役)顯示「(現役中)」灰底,不能紀念
 *  - 修為不足按鈕變灰「💎不足」
 *
 * 慶祝動畫由全域 EternalCelebration 元件接 'cultivation:spend' reason='eternal' 觸發,
 * 不需要 modal 內部處理(modal 關掉動畫照樣播)。
 */
export default function BestiaryPetModal({ open, onClose, speciesId }: BestiaryPetModalProps) {
  const cultivation = useCultivation();
  const balance = cultivation.amount;
  const [busyPetId, setBusyPetId] = useState<string | null>(null);
  const [unlockingStory, setUnlockingStory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 訂閱該 species 所有 pet,改名/退役/紀念都即時反映
  const pets = useLiveQuery<Pet[]>(
    async () => {
      if (!speciesId) return [];
      return db.pets.where('speciesId').equals(speciesId).toArray();
    },
    [speciesId]
  );

  // 階段 4C.3:訂閱該 creature 的故事解鎖紀錄
  const unlock = useLiveQuery(
    async () => {
      if (!speciesId) return null;
      return (
        (await db.creatureUnlocks.where('creatureId').equals(speciesId).first()) ?? null
      );
    },
    [speciesId]
  );

  if (!speciesId) return null;
  const species = getCreature(speciesId);
  if (!species) return null;
  const story = getCreatureStory(speciesId);
  const isStoryUnlocked = !!unlock;
  const storyInsufficient = balance < STORY_UNLOCK_COST;

  async function handleUnlockStory() {
    if (unlockingStory || !species) return;
    setError(null);
    if (storyInsufficient) {
      setError(`修為不足,還差 ${STORY_UNLOCK_COST - balance}`);
      return;
    }
    setUnlockingStory(true);
    const r = await unlockCreatureStory(species.id, species.name);
    setUnlockingStory(false);
    if (!r.success) {
      setError(r.reason === 'insufficient' ? '修為不足' : '操作失敗,請稍後再試');
    }
  }

  async function handleEternal(pet: Pet) {
    if (busyPetId) return;
    setError(null);
    if (balance < ETERNAL_COST) {
      setError(`修為不足,還差 ${ETERNAL_COST - balance}`);
      return;
    }
    setBusyPetId(pet.id);

    const displayName = getPetDisplayName(pet, species);
    const r = await spendCultivation(
      ETERNAL_COST,
      'eternal',
      `永恆封印:${displayName}`,
      pet.id
    );
    if (!r.success) {
      setBusyPetId(null);
      setError(r.reason === 'insufficient' ? '修為不足' : '操作失敗,請稍後再試');
      return;
    }

    await db.pets.update(pet.id, {
      isEternal: true,
      eternalDate: Date.now()
    });
    setBusyPetId(null);
    // 慶祝動畫由 EternalCelebration 接 cultivation:spend 觸發,不在這裡管
  }

  const sortedPets = (pets ?? []).slice().sort((a, b) => {
    // 已退役放前(date desc),仍在世放最後(active 永遠在底)
    if (a.retiredAt && b.retiredAt) return b.retiredAt - a.retiredAt;
    if (a.retiredAt && !b.retiredAt) return -1;
    if (!a.retiredAt && b.retiredAt) return 1;
    return b.bornAt - a.bornAt;
  });

  return (
    <Modal open={open} onClose={busyPetId ? () => {} : onClose} title="神獸詳細" hideClose={!!busyPetId}>
      <div className="space-y-3 text-sm">
        {/* species 基本資訊 */}
        <div className="flex items-center gap-3">
          <div className="w-20 h-20 flex items-center justify-center shrink-0 rounded-lg bg-amber-50 border border-amber-200">
            {species.art ? (
              <img
                src={`/sprites/${species.id}.png`}
                alt={species.name}
                className="w-full h-full object-contain p-1"
              />
            ) : (
              <span className="text-4xl">{species.emoji}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold">{species.name}</h3>
            <p className="text-xs text-gray-500 italic mt-0.5">{species.description}</p>
            <p className="text-[11px] text-gray-400 mt-1">{species.category}</p>
          </div>
        </div>

        {/* 階段 4C.3 修仙傳說區塊 */}
        <div className="data-card p-3 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-gray-700">📜 修仙傳說</h4>
            {isStoryUnlocked && unlock && (
              <span className="text-[10px] text-amber-700">
                ✨ 已解鎖 · {new Date(unlock.unlockedAt).toLocaleDateString('zh-TW')}
              </span>
            )}
          </div>
          {isStoryUnlocked ? (
            <p
              key={species.id /* 換 species 時 re-mount 重跑 fade-in */}
              className="story-fade-in text-xs leading-relaxed text-gray-700 whitespace-pre-line"
            >
              {story}
            </p>
          ) : (
            <div className="text-center py-2 space-y-2">
              <p className="text-xs text-gray-500">🔒 故事尚未解鎖</p>
              <p className="text-[11px] text-gray-500">
                解鎖 {species.name} 的修仙傳說?消耗 💎 {STORY_UNLOCK_COST} 修為
              </p>
              <button
                type="button"
                onClick={handleUnlockStory}
                disabled={unlockingStory || storyInsufficient}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold active:scale-95 transition-transform disabled:active:scale-100 ${
                  storyInsufficient ? 'bg-gray-300 text-gray-500' : 'bg-amber-500 text-white'
                }`}
              >
                {unlockingStory
                  ? '解鎖中⋯'
                  : storyInsufficient
                    ? `💎不足(差 ${STORY_UNLOCK_COST - balance})`
                    : `解鎖故事 💎${STORY_UNLOCK_COST}`}
              </button>
            </div>
          )}
        </div>

        {(pets ?? []).length === 0 ? (
          <div className="data-card p-4 text-center text-gray-500 text-xs">
            🔒 尚未召喚過這隻神獸
          </div>
        ) : (
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-gray-600">召喚紀錄({sortedPets.length})</h4>
            {sortedPets.map((pet) => (
              <PetRow
                key={pet.id}
                pet={pet}
                speciesName={species.name}
                balance={balance}
                isBusy={busyPetId === pet.id}
                anyBusy={!!busyPetId}
                onEternal={() => handleEternal(pet)}
              />
            ))}
          </div>
        )}

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
            {error}
          </p>
        )}

        <div className="text-xs text-gray-500 text-right">
          目前餘額:💎 {balance} 修為
        </div>
      </div>
    </Modal>
  );
}

function PetRow({
  pet,
  speciesName,
  balance,
  isBusy,
  anyBusy,
  onEternal
}: {
  pet: Pet;
  speciesName: string;
  balance: number;
  isBusy: boolean;
  anyBusy: boolean;
  onEternal: () => void;
}) {
  const isRetired = !!pet.retiredAt;
  const isEternal = !!pet.isEternal;
  const insufficient = balance < ETERNAL_COST;
  const displayName = pet.customName?.trim() || speciesName;
  const tint = COLOR_VARIANT_TINT[pet.colorVariant ?? 'default'];

  // 持有期間(出生 → 退役 / 至今)
  const endTs = pet.retiredAt ?? Date.now();
  const days = daysBetween(pet.bornAt, endTs);

  const peakRealm = pet.lastRealmCheck ?? 'fan';
  const finalEff = pet.finalEffect; // 退役 pet 才有

  return (
    <div
      className={`item-card px-3 py-2.5 ${
        isEternal ? 'ring-2 ring-amber-400 bg-gradient-to-br from-amber-50 to-amber-100' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-sm">
              {isEternal && '✨ '}
              {displayName}
            </span>
            {pet.code && (
              <span className="text-[11px] text-gray-500">
                ({pet.code})
              </span>
            )}
            {!isRetired && (
              <span className="text-[10px] text-emerald-600 font-bold ml-1">(現役中)</span>
            )}
          </div>
          <div className="text-[11px] text-gray-500 mt-0.5">
            {REALM_EMOJI[peakRealm]} 巔峰{realmLabel(peakRealm)}境
            {isRetired && finalEff && (
              <>
                {' · '}
                {EFFECT_EMOJI[finalEff]} 退役特效:{effectLabel(finalEff)}
              </>
            )}
          </div>
          <div className="text-[11px] text-gray-400 mt-0.5">
            等級 Lv.{pet.level} · 持有 {formatInt(days)} 天
            {isRetired && (
              <>
                {' · 退役 '}
                {new Date(pet.retiredAt!).toLocaleDateString('zh-TW')}
              </>
            )}
            {tint != null && (
              <>
                {' · '}
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full align-middle"
                  style={{
                    background: `#${tint.toString(16).padStart(6, '0')}`,
                    border: '1px solid rgba(0,0,0,0.2)'
                  }}
                />
              </>
            )}
          </div>
          {isEternal && pet.eternalDate && (
            <div className="text-[11px] text-amber-700 font-bold mt-1">
              ✨ 已永恆紀念 · {new Date(pet.eternalDate).toLocaleDateString('zh-TW')}
            </div>
          )}
        </div>

        <div className="shrink-0">
          {!isRetired ? (
            <span className="text-[10px] text-gray-400 px-2 py-1.5">
              尚未退役
            </span>
          ) : isEternal ? (
            <span className="text-[10px] text-amber-700 px-2 py-1.5 font-bold">
              已紀念
            </span>
          ) : (
            <button
              type="button"
              onClick={onEternal}
              disabled={anyBusy || insufficient}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold active:scale-95 transition-transform disabled:active:scale-100 ${
                insufficient
                  ? 'bg-gray-300 text-gray-500'
                  : 'bg-amber-500 text-white'
              }`}
            >
              {isBusy
                ? '紀念中⋯'
                : insufficient
                  ? `💎不足(差 ${ETERNAL_COST - balance})`
                  : `永恆紀念 💎${ETERNAL_COST}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
