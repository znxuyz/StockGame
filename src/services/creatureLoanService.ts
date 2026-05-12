/**
 * 階段 5E:神獸借展。
 *
 *  - 24 小時自動歸還,App.tsx 每分鐘檢一次自己的 active loans
 *    過期就 client-side 把 status 改 'returned'(出借方寫得進去,RLS OK)
 *  - 雙方 +100 修為,用 lender/borrower_reward_given 兩個 flag 防重發
 *  - 借展限制:
 *      只有 isEternal=true 的本地 pet 才能借出(由 caller 過濾)
 *      同隻神獸同時只能借一個人(借出時撈 lender_user_id+species_id+status='active' 檢查)
 *      每人最多同時借出 / 借入 3 隻
 *  - 提前收回:status='cancelled'(雙方仍領過獎的話也不會收回獎勵)
 *
 * 不上 Phaser scene 渲染(改在「我借入的神獸」list view 顯示),MVP 簡化。
 */

import { supabase, isCloudConfigured } from '@/lib/supabase';
import {
  earnCultivation
} from './cultivationService';
import { getProfile, getProfilesByIds } from './profileService';
import { notify } from './notificationService';
import { getCreature } from '@/data/creatures';
import {
  LOAN_DURATION_MS,
  LOAN_REWARD,
  MAX_ACTIVE_LOANS_BORROWED,
  MAX_ACTIVE_LOANS_LENT,
  type CreatureLoan,
  type LoanStatus,
  type UserProfile
} from '@/types';

interface LoanRow {
  id: number;
  lender_user_id: string;
  borrower_user_id: string;
  creature_species_id: string;
  status: LoanStatus;
  loaned_at: string;
  returns_at: string;
  returned_at: string | null;
  lender_reward_given: boolean;
  borrower_reward_given: boolean;
}

function rowToLoan(row: LoanRow): CreatureLoan {
  return {
    id: row.id,
    lenderUserId: row.lender_user_id,
    borrowerUserId: row.borrower_user_id,
    creatureSpeciesId: row.creature_species_id,
    status: row.status,
    loanedAt: row.loaned_at,
    returnsAt: row.returns_at,
    returnedAt: row.returned_at,
    lenderRewardGiven: row.lender_reward_given,
    borrowerRewardGiven: row.borrower_reward_given
  };
}

async function getCurrentUserId(): Promise<string | null> {
  if (!isCloudConfigured) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

export type LoanResult =
  | { ok: true; loanId: number }
  | {
      ok: false;
      reason:
        | 'not_signed_in'
        | 'self_loan'
        | 'not_eternal'
        | 'already_loaned'
        | 'lender_limit'
        | 'borrower_limit'
        | 'unknown';
      error?: string;
    };

/**
 * 出借神獸給好友。
 *  - 由 caller 確保 creature 是 isEternal(server 端沒這資訊,本地檢查)
 *  - 撈雙方 active 借展數確認上限
 *  - 同隻 species 已經由自己借出中 → 拒絕
 */
export async function loanCreature(
  borrowerUserId: string,
  creatureSpeciesId: string
): Promise<LoanResult> {
  if (!isCloudConfigured) return { ok: false, reason: 'not_signed_in' };
  const me = await getCurrentUserId();
  if (!me) return { ok: false, reason: 'not_signed_in' };
  if (me === borrowerUserId) return { ok: false, reason: 'self_loan' };

  // 自己當前借出 active 數
  const { count: lenderCount } = await supabase
    .from('creature_loans')
    .select('id', { count: 'exact', head: true })
    .eq('lender_user_id', me)
    .eq('status', 'active');
  if ((lenderCount ?? 0) >= MAX_ACTIVE_LOANS_LENT) {
    return { ok: false, reason: 'lender_limit' };
  }

  // 對方當前借入 active 數
  const { count: borrowerCount } = await supabase
    .from('creature_loans')
    .select('id', { count: 'exact', head: true })
    .eq('borrower_user_id', borrowerUserId)
    .eq('status', 'active');
  if ((borrowerCount ?? 0) >= MAX_ACTIVE_LOANS_BORROWED) {
    return { ok: false, reason: 'borrower_limit' };
  }

  // 同隻神獸已借出?
  const { data: existing } = await supabase
    .from('creature_loans')
    .select('id')
    .eq('lender_user_id', me)
    .eq('creature_species_id', creatureSpeciesId)
    .eq('status', 'active')
    .maybeSingle();
  if (existing) return { ok: false, reason: 'already_loaned' };

  const returnsAt = new Date(Date.now() + LOAN_DURATION_MS).toISOString();

  const { data, error } = await supabase
    .from('creature_loans')
    .insert({
      lender_user_id: me,
      borrower_user_id: borrowerUserId,
      creature_species_id: creatureSpeciesId,
      status: 'active',
      returns_at: returnsAt
    })
    .select('id')
    .single();
  if (error || !data) {
    return { ok: false, reason: 'unknown', error: error?.message };
  }

  // 雙方領 100 修為(只給自己 = lender;borrower 由對方下次打開 app 時自己領)
  try {
    await earnCultivation(
      LOAN_REWARD,
      'pet_added_codex', // 借暫用既有 reason,UI 上不會混(reason_text 用「神獸借展」)
      `🎁 借展神獸給好友 +${LOAN_REWARD}`,
      undefined
    );
    await supabase
      .from('creature_loans')
      .update({ lender_reward_given: true })
      .eq('id', data.id);
  } catch (e) {
    console.warn('[loan] lender reward failed:', e);
  }

  // 階段 5F:通知借入人
  try {
    const myProfile = await getProfile(me);
    const nickname = myProfile?.nickname ?? '修仙者';
    const creatureName = getCreature(creatureSpeciesId)?.name ?? creatureSpeciesId;
    void notify({
      targetUserId: borrowerUserId,
      type: 'loan_received',
      title: '🎁 收到神獸借展',
      message: `${nickname} 借了 ${creatureName} 給你 24 小時`,
      relatedData: {
        fromUserId: me,
        fromNickname: nickname,
        loanId: data.id as number,
        creatureSpeciesId,
        creatureName
      }
    });
  } catch (e) {
    console.warn('[loan] notify borrower failed:', e);
  }

  return { ok: true, loanId: data.id as number };
}

/** 出借人提前收回(status → cancelled);不退獎勵 */
export async function recallLoan(loanId: number): Promise<{ ok: boolean; error?: string }> {
  if (!isCloudConfigured) return { ok: false, error: '雲端未啟用' };
  const me = await getCurrentUserId();
  if (!me) return { ok: false, error: '尚未登入' };
  const { error } = await supabase
    .from('creature_loans')
    .update({ status: 'cancelled', returned_at: new Date().toISOString() })
    .eq('id', loanId)
    .eq('lender_user_id', me)
    .eq('status', 'active');
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * 借入人領 100 修為:打開借展神獸頁時 caller 觸發。
 *  - 若 borrower_reward_given 已 true → noop
 *  - 用 lender_user_id 對應 loan + RLS 限制由 borrower 寫入(我們改用「update 整 row 必須是
 *    出借人或借入人,RLS 已允許」)
 */
export async function claimBorrowerReward(loanId: number): Promise<{ ok: boolean }> {
  if (!isCloudConfigured) return { ok: false };
  const me = await getCurrentUserId();
  if (!me) return { ok: false };
  const { data: loan } = await supabase
    .from('creature_loans')
    .select('*')
    .eq('id', loanId)
    .maybeSingle();
  if (!loan || loan.borrower_user_id !== me) return { ok: false };
  if (loan.borrower_reward_given) return { ok: true };

  await earnCultivation(
    LOAN_REWARD,
    'pet_added_codex',
    `🎁 接受借展神獸 +${LOAN_REWARD}`,
    undefined
  );
  const { error } = await supabase
    .from('creature_loans')
    .update({ borrower_reward_given: true })
    .eq('id', loanId);
  if (error) {
    console.warn('[loan] claimBorrowerReward update flag:', error.message);
    return { ok: false };
  }
  return { ok: true };
}

/**
 * 撈所有「我借出 OR 借入」的 active 借展。
 * loanedFromMe / loanedToMe 拆開回傳給 UI 用。
 */
export interface ActiveLoansBundle {
  /** 我借出去的(borrower profile 也帶過來) */
  outgoing: Array<{ loan: CreatureLoan; counterpart: UserProfile | null }>;
  /** 我借入的(lender profile 帶過來) */
  incoming: Array<{ loan: CreatureLoan; counterpart: UserProfile | null }>;
}

export async function getMyActiveLoans(): Promise<ActiveLoansBundle> {
  if (!isCloudConfigured) return { outgoing: [], incoming: [] };
  const me = await getCurrentUserId();
  if (!me) return { outgoing: [], incoming: [] };

  const { data: rows } = await supabase
    .from('creature_loans')
    .select('*')
    .or(`lender_user_id.eq.${me},borrower_user_id.eq.${me}`)
    .eq('status', 'active')
    .order('loaned_at', { ascending: false });
  const loans = ((rows as LoanRow[]) ?? []).map(rowToLoan);

  const otherIds = Array.from(
    new Set(
      loans.map((l) => (l.lenderUserId === me ? l.borrowerUserId : l.lenderUserId))
    )
  );
  const profiles = await getProfilesByIds(otherIds);

  const outgoing: ActiveLoansBundle['outgoing'] = [];
  const incoming: ActiveLoansBundle['incoming'] = [];
  for (const loan of loans) {
    const counterpartId =
      loan.lenderUserId === me ? loan.borrowerUserId : loan.lenderUserId;
    const counterpart = profiles.get(counterpartId) ?? null;
    if (loan.lenderUserId === me) outgoing.push({ loan, counterpart });
    else incoming.push({ loan, counterpart });
  }
  return { outgoing, incoming };
}

/**
 * 撈某個好友家園的借入神獸(他借入別人的);用於好友個人頁顯示。
 *  - 純讀 borrower=友人 的 active 借展 + lender profile
 */
export async function getFriendIncomingLoans(
  friendUserId: string
): Promise<Array<{ loan: CreatureLoan; lender: UserProfile | null }>> {
  if (!isCloudConfigured) return [];
  const { data: rows } = await supabase
    .from('creature_loans')
    .select('*')
    .eq('borrower_user_id', friendUserId)
    .eq('status', 'active')
    .order('loaned_at', { ascending: false });
  const loans = ((rows as LoanRow[]) ?? []).map(rowToLoan);
  const lenderIds = Array.from(new Set(loans.map((l) => l.lenderUserId)));
  const profiles = await getProfilesByIds(lenderIds);
  return loans.map((loan) => ({
    loan,
    lender: profiles.get(loan.lenderUserId) ?? null
  }));
}

/**
 * 檢查所有「我參與的」active loans 是否過期 → 自動歸還。
 * App.tsx 每分鐘呼叫一次。失敗只 warn。
 */
export async function checkExpiredLoans(): Promise<void> {
  if (!isCloudConfigured) return;
  const me = await getCurrentUserId();
  if (!me) return;
  const now = new Date().toISOString();
  // RLS 限制:loan_participants_full 允許 lender 寫入(借入人也是 participants 但 update
  // 需要符合 with check = auth.uid()=lender)。為了讓借入人也能標記過期歸還,
  // 我們改成只標記「自己當 lender」的 — 借入人那邊 caller 自己進到該 modal 時觸發
  // (簡化:出借人這邊 update,client UI 上仍能看到狀態變化)
  const { error } = await supabase
    .from('creature_loans')
    .update({ status: 'returned', returned_at: now })
    .eq('lender_user_id', me)
    .eq('status', 'active')
    .lt('returns_at', now);
  if (error) console.warn('[loan] checkExpiredLoans:', error.message);
}
