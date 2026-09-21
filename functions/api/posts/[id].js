import { json, options, requireAdmin, ensurePostsColumns } from '../../_utils.js';
import { serializeAdPixels } from '../../_pixels.js';

export async function onRequestOptions() {
  return options();
}

export async function onRequestGet(context) {
  const id = context.params.id;
  const post = await context.env.DB.prepare('SELECT * FROM posts WHERE id = ?')
    .bind(id)
    .first();

  if (!post) return json({ error: '글을 찾을 수 없습니다.' }, 404);

  const { results: comments } = await context.env.DB.prepare(
    'SELECT * FROM comments WHERE post_id = ? ORDER BY sort_order ASC, id ASC'
  )
    .bind(post.id)
    .all();

  return json({ post, comments: comments || [] });
}

async function updatePostRow(env, id, body) {
  const attempts = [
    {
      sql: `UPDATE posts SET
        slug = COALESCE(?, slug),
        title = COALESCE(?, title),
        body = COALESCE(?, body),
        category = COALESCE(?, category),
        cover_image = COALESCE(?, cover_image),
        seo_title = COALESCE(?, seo_title),
        seo_description = COALESCE(?, seo_description),
        ad_pixels = COALESCE(?, ad_pixels),
        likes = COALESCE(?, likes),
        comment_count_display = COALESCE(?, comment_count_display),
        share_count_display = COALESCE(?, share_count_display),
        published_at = COALESCE(?, published_at),
        updated_at = datetime('now')
       WHERE id = ?`,
      binds: [
        body.slug ?? null,
        body.title ?? null,
        body.body ?? null,
        body.category ?? null,
        body.cover_image ?? null,
        body.seo_title !== undefined ? String(body.seo_title) : null,
        body.seo_description !== undefined ? String(body.seo_description) : null,
        body.ad_pixels !== undefined ? body.ad_pixels : null,
        body.likes !== undefined ? Number(body.likes) : null,
        body.comment_count_display !== undefined
          ? Number(body.comment_count_display)
          : null,
        body.share_count_display !== undefined
          ? Number(body.share_count_display)
          : null,
        body.published_at ?? null,
        id,
      ],
    },
    {
      sql: `UPDATE posts SET
        slug = COALESCE(?, slug),
        title = COALESCE(?, title),
        body = COALESCE(?, body),
        category = COALESCE(?, category),
        cover_image = COALESCE(?, cover_image),
        seo_title = COALESCE(?, seo_title),
        seo_description = COALESCE(?, seo_description),
        ad_pixels = COALESCE(?, ad_pixels),
        likes = COALESCE(?, likes),
        comment_count_display = COALESCE(?, comment_count_display),
        published_at = COALESCE(?, published_at),
        updated_at = datetime('now')
       WHERE id = ?`,
      binds: [
        body.slug ?? null,
        body.title ?? null,
        body.body ?? null,
        body.category ?? null,
        body.cover_image ?? null,
        body.seo_title !== undefined ? String(body.seo_title) : null,
        body.seo_description !== undefined ? String(body.seo_description) : null,
        body.ad_pixels !== undefined ? body.ad_pixels : null,
        body.likes !== undefined ? Number(body.likes) : null,
        body.comment_count_display !== undefined
          ? Number(body.comment_count_display)
          : null,
        body.published_at ?? null,
        id,
      ],
    },
    {
      sql: `UPDATE posts SET
        slug = COALESCE(?, slug),
        title = COALESCE(?, title),
        body = COALESCE(?, body),
        category = COALESCE(?, category),
        cover_image = COALESCE(?, cover_image),
        seo_title = COALESCE(?, seo_title),
        seo_description = COALESCE(?, seo_description),
        likes = COALESCE(?, likes),
        comment_count_display = COALESCE(?, comment_count_display),
        published_at = COALESCE(?, published_at),
        updated_at = datetime('now')
       WHERE id = ?`,
      binds: [
        body.slug ?? null,
        body.title ?? null,
        body.body ?? null,
        body.category ?? null,
        body.cover_image ?? null,
        body.seo_title !== undefined ? String(body.seo_title) : null,
        body.seo_description !== undefined ? String(body.seo_description) : null,
        body.likes !== undefined ? Number(body.likes) : null,
        body.comment_count_display !== undefined
          ? Number(body.comment_count_display)
          : null,
        body.published_at ?? null,
        id,
      ],
    },
    {
      sql: `UPDATE posts SET
        slug = COALESCE(?, slug),
        title = COALESCE(?, title),
        body = COALESCE(?, body),
        category = COALESCE(?, category),
        cover_image = COALESCE(?, cover_image),
        likes = COALESCE(?, likes),
        comment_count_display = COALESCE(?, comment_count_display),
        published_at = COALESCE(?, published_at),
        updated_at = datetime('now')
       WHERE id = ?`,
      binds: [
        body.slug ?? null,
        body.title ?? null,
        body.body ?? null,
        body.category ?? null,
        body.cover_image ?? null,
        body.likes !== undefined ? Number(body.likes) : null,
        body.comment_count_display !== undefined
          ? Number(body.comment_count_display)
          : null,
        body.published_at ?? null,
        id,
      ],
    },
    {
      sql: `UPDATE posts SET
        slug = COALESCE(?, slug),
        title = COALESCE(?, title),
        body = COALESCE(?, body),
        category = COALESCE(?, category),
        cover_image = COALESCE(?, cover_image),
        seo_title = COALESCE(?, seo_title),
        seo_description = COALESCE(?, seo_description),
        likes = COALESCE(?, likes),
        published_at = COALESCE(?, published_at),
        updated_at = datetime('now')
       WHERE id = ?`,
      binds: [
        body.slug ?? null,
        body.title ?? null,
        body.body ?? null,
        body.category ?? null,
        body.cover_image ?? null,
        body.seo_title !== undefined ? String(body.seo_title) : null,
        body.seo_description !== undefined ? String(body.seo_description) : null,
        body.likes !== undefined ? Number(body.likes) : null,
        body.published_at ?? null,
        id,
      ],
    },
    {
      sql: `UPDATE posts SET
        slug = COALESCE(?, slug),
        title = COALESCE(?, title),
        body = COALESCE(?, body),
        category = COALESCE(?, category),
        cover_image = COALESCE(?, cover_image),
        likes = COALESCE(?, likes),
        published_at = COALESCE(?, published_at),
        updated_at = datetime('now')
       WHERE id = ?`,
      binds: [
        body.slug ?? null,
        body.title ?? null,
        body.body ?? null,
        body.category ?? null,
        body.cover_image ?? null,
        body.likes !== undefined ? Number(body.likes) : null,
        body.published_at ?? null,
        id,
      ],
    },
    {
      sql: `UPDATE posts SET
        slug = COALESCE(?, slug),
        title = COALESCE(?, title),
        body = COALESCE(?, body),
        category = COALESCE(?, category),
        likes = COALESCE(?, likes),
        published_at = COALESCE(?, published_at),
        updated_at = datetime('now')
       WHERE id = ?`,
      binds: [
        body.slug ?? null,
        body.title ?? null,
        body.body ?? null,
        body.category ?? null,
        body.likes !== undefined ? Number(body.likes) : null,
        body.published_at ?? null,
        id,
      ],
    },
    {
      sql: `UPDATE posts SET
        slug = COALESCE(?, slug),
        title = COALESCE(?, title),
        body = COALESCE(?, body),
        likes = COALESCE(?, likes),
        published_at = COALESCE(?, published_at),
        updated_at = datetime('now')
       WHERE id = ?`,
      binds: [
        body.slug ?? null,
        body.title ?? null,
        body.body ?? null,
        body.likes !== undefined ? Number(body.likes) : null,
        body.published_at ?? null,
        id,
      ],
    },
  ];

  let lastErr;
  for (const attempt of attempts) {
    try {
      await env.DB.prepare(attempt.sql).bind(...attempt.binds).run();
      return;
    } catch (e) {
      lastErr = e;
      try {
        await ensurePostsColumns(env);
      } catch (_) {
        /* ignore */
      }
    }
  }
  throw lastErr;
}

export async function onRequestPut(context) {
  try {
    const auth = await requireAdmin(context.request, context.env);
    if (!auth.ok) return auth.response;

    try {
      await ensurePostsColumns(context.env);
    } catch (e) {
      console.error(e);
    }

    const id = context.params.id;
    const body = await context.request.json();

    const existing = await context.env.DB.prepare(
      'SELECT id FROM posts WHERE id = ?'
    )
      .bind(id)
      .first();
    if (!existing) return json({ error: '글을 찾을 수 없습니다.' }, 404);

    if (body.slug !== undefined) {
      body.slug = String(body.slug || '')
        .trim()
        .replace(/^\/+|\/+$/g, '');
    }

    if (body.slug) {
      const conflict = await context.env.DB.prepare(
        'SELECT id FROM posts WHERE slug = ? AND id != ?'
      )
        .bind(body.slug, id)
        .first();
      if (conflict) return json({ error: '이미 사용 중인 주소입니다.' }, 400);
    }

    if (body.ad_pixels !== undefined) {
      body.ad_pixels = serializeAdPixels(body.ad_pixels || {});
    }

    await updatePostRow(context.env, id, body);

    const post = await context.env.DB.prepare('SELECT * FROM posts WHERE id = ?')
      .bind(id)
      .first();

    return json({ ok: true, post });
  } catch (e) {
    console.error('PUT /api/posts', e);
    return json(
      { error: '글 수정에 실패했습니다.', detail: String(e?.message || e) },
      500
    );
  }
}

export async function onRequestDelete(context) {
  const auth = await requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  const id = context.params.id;
  await context.env.DB.prepare('DELETE FROM comments WHERE post_id = ?')
    .bind(id)
    .run();
  await context.env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(id).run();

  return json({ ok: true });
}
