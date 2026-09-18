import { json, options } from '../../../_utils.js';

export async function onRequestOptions() {
  return options();
}

/** 공개 — 게시글 좋아요 토글 (광고 랜딩·심사 대응). 관리자 기준 likes에 ±1 */
export async function onRequestPost(context) {
  const id = Number(context.params.id);
  if (!id || !Number.isFinite(id)) {
    return json({ error: '잘못된 글입니다.' }, 400);
  }

  let body = {};
  try {
    body = await context.request.json();
  } catch {
    body = {};
  }

  const action = String(body.action || 'like').toLowerCase() === 'unlike' ? 'unlike' : 'like';
  const delta = action === 'unlike' ? -1 : 1;

  const post = await context.env.DB.prepare(
    'SELECT id, likes FROM posts WHERE id = ? LIMIT 1'
  )
    .bind(id)
    .first();
  if (!post) return json({ error: '글을 찾을 수 없습니다.' }, 404);

  if (action === 'unlike') {
    await context.env.DB.prepare(
      `UPDATE posts SET likes = CASE WHEN likes > 0 THEN likes - 1 ELSE 0 END, updated_at = datetime('now') WHERE id = ?`
    )
      .bind(id)
      .run();
  } else {
    await context.env.DB.prepare(
      `UPDATE posts SET likes = likes + 1, updated_at = datetime('now') WHERE id = ?`
    )
      .bind(id)
      .run();
  }

  const updated = await context.env.DB.prepare(
    'SELECT likes FROM posts WHERE id = ? LIMIT 1'
  )
    .bind(id)
    .first();

  return json({
    ok: true,
    post_id: id,
    action,
    likes: Number(updated?.likes) || Math.max(0, (Number(post.likes) || 0) + delta),
  });
}
