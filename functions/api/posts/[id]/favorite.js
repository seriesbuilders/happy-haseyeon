import { json, options, requireAdmin, ensurePostsColumns, purgeAdListCache } from '../../../_utils.js';

export async function onRequestOptions() {
  return options();
}

/** POST /api/posts/:id/favorite  { is_favorite: 1|0 } — 관리자 즐겨찾기 표시만 바꾼다 (글 내용은 건드리지 않음) */
export async function onRequestPost(context) {
  const auth = await requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  const id = Number(context.params.id);
  if (!id) return json({ error: '글 번호가 필요합니다.' }, 400);

  try {
    await ensurePostsColumns(context.env);
  } catch (e) {
    console.error('ensurePostsColumns', e);
  }

  const body = await context.request.json().catch(() => ({}));
  const value = Number(body.is_favorite) ? 1 : 0;

  const row = await context.env.DB.prepare('SELECT id FROM posts WHERE id = ? LIMIT 1').bind(id).first();
  if (!row) return json({ error: '글을 찾을 수 없습니다.' }, 404);

  await context.env.DB.prepare('UPDATE posts SET is_favorite = ? WHERE id = ?').bind(value, id).run();
  await purgeAdListCache(context.request);
  return json({ ok: true, id, is_favorite: value });
}
