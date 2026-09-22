import { json, options, ensureCommentsColumns } from '../../../_utils.js';

export async function onRequestOptions() {
  return options();
}

/** 공개 — 댓글 추천/비추천 토글 (광고 심사 대응) */
export async function onRequestPost(context) {
  try {
    await ensureCommentsColumns(context.env);
  } catch (_) {
    /* ignore */
  }

  const id = Number(context.params.id);
  if (!id || !Number.isFinite(id)) {
    return json({ error: '잘못된 댓글입니다.' }, 400);
  }

  let body = {};
  try {
    body = await context.request.json();
  } catch {
    body = {};
  }

  const normalize = (v) => {
    const s = String(v || '').toLowerCase();
    if (s === 'up' || s === 'like') return 'up';
    if (s === 'down' || s === 'dislike') return 'down';
    return null;
  };
  const from = normalize(body.from);
  const to = normalize(body.to);

  const row = await context.env.DB.prepare(
    'SELECT id, likes, dislikes, status FROM comments WHERE id = ? LIMIT 1'
  )
    .bind(id)
    .first();
  if (!row) return json({ error: '댓글을 찾을 수 없습니다.' }, 404);
  if (row.status && row.status !== 'active') {
    return json({ error: '삭제된 댓글입니다.' }, 404);
  }

  let likes = Number(row.likes) || 0;
  let dislikes = Number(row.dislikes) || 0;

  if (from === 'up') likes = Math.max(0, likes - 1);
  if (from === 'down') dislikes = Math.max(0, dislikes - 1);
  if (to === 'up') likes += 1;
  if (to === 'down') dislikes += 1;

  try {
    await context.env.DB.prepare(
      'UPDATE comments SET likes = ?, dislikes = ? WHERE id = ?'
    )
      .bind(likes, dislikes, id)
      .run();
  } catch (e) {
    if (/no such column:\s*dislikes/i.test(String(e?.message || e))) {
      await context.env.DB.prepare('UPDATE comments SET likes = ? WHERE id = ?')
        .bind(likes, id)
        .run();
      dislikes = 0;
    } else {
      throw e;
    }
  }

  return json({
    ok: true,
    id,
    likes,
    dislikes,
    vote: to,
  });
}
