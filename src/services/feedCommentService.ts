/**
 * 階段 5D:動態評論。
 *
 *  - addComment 限制 1-200 字(DB constraint 同樣檢查)
 *  - 自己評論可軟刪除(is_deleted=true)
 *  - getComments 撈某個 event 所有未刪除評論 + join user_profile 取暱稱 / 頭像
 */

import { supabase, isCloudConfigured } from '@/lib/supabase';
import { getProfilesByIds } from './profileService';
import type { FeedComment, UserProfile } from '@/types';

interface FeedCommentRow {
  id: number;
  event_id: number;
  user_id: string;
  content: string;
  created_at: string;
  is_deleted: boolean;
}

function rowToComment(row: FeedCommentRow): FeedComment {
  return {
    id: row.id,
    eventId: row.event_id,
    userId: row.user_id,
    content: row.content,
    createdAt: row.created_at,
    isDeleted: row.is_deleted
  };
}

async function getCurrentUserId(): Promise<string | null> {
  if (!isCloudConfigured) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

export interface CommentWithAuthor extends FeedComment {
  author: UserProfile | null;
}

export async function addComment(
  eventId: number,
  rawContent: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false, error: '尚未登入' };
  const content = rawContent.trim();
  if (content.length < 1) return { ok: false, error: '評論不能空白' };
  if (content.length > 200) return { ok: false, error: '評論最多 200 字' };
  const { error } = await supabase
    .from('feed_comments')
    .insert({ event_id: eventId, user_id: userId, content });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function getComments(eventId: number): Promise<CommentWithAuthor[]> {
  if (!isCloudConfigured) return [];
  const { data, error } = await supabase
    .from('feed_comments')
    .select('*')
    .eq('event_id', eventId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true });
  if (error || !data) {
    if (error) console.warn('[feedComment] getComments:', error.message);
    return [];
  }
  const comments = (data as FeedCommentRow[]).map(rowToComment);
  const ids = Array.from(new Set(comments.map((c) => c.userId)));
  const profiles = await getProfilesByIds(ids);
  return comments.map((c) => ({ ...c, author: profiles.get(c.userId) ?? null }));
}

/** 軟刪除自己的評論 */
export async function deleteComment(commentId: number): Promise<{ ok: boolean; error?: string }> {
  if (!isCloudConfigured) return { ok: false, error: '雲端未啟用' };
  const { error } = await supabase
    .from('feed_comments')
    .update({ is_deleted: true })
    .eq('id', commentId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
