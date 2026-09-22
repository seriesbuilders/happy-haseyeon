import {
  json,
  options,
  requireAdmin,
  randomSlug,
  encryptedSlug,
  ensurePostsColumns,
  ensureCommentsColumns,
  AD_CATEGORY,
} from '../../../_utils.js';

export async function onRequestOptions() {
  return options();
}

export async function onRequestPost(context) {
  const auth = await requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  try {
    await ensurePostsColumns(context.env);
    await ensureCommentsColumns(context.env);
  } catch (e) {
    console.error(e);
  }

  const id = context.params.id;
  const source = await context.env.DB.prepare('SELECT * FROM posts WHERE id = ?')
    .bind(id)
    .first();
  if (!source) return json({ error: '원본 글을 찾을 수 없습니다.' }, 404);

  const body = await context.request.json().catch(() => ({}));
  const isAd = source.category === AD_CATEGORY;
  let slug = String(body.slug || '')
    .trim()
    .replace(/^\/+|\/+$/g, '');
  if (!slug) slug = isAd ? encryptedSlug() : randomSlug();

  const exists = await context.env.DB.prepare(
    'SELECT id FROM posts WHERE slug = ?'
  )
    .bind(slug)
    .first();
  if (exists) slug = isAd ? encryptedSlug() : randomSlug();

  let insert;
  try {
    insert = await context.env.DB.prepare(
      `INSERT INTO posts (
        slug, title, body, category, cover_image, seo_title, seo_description, ad_pixels,
        likes, comment_count_display, share_count_display, published_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    )
      .bind(
        slug,
        source.title,
        source.body,
        source.category || '후기',
        source.cover_image || '',
        source.seo_title || '',
        source.seo_description || '',
        source.ad_pixels || '',
        Number(source.likes) || 0,
        Number(source.comment_count_display) || 0,
        Number(source.share_count_display) || 0,
        source.published_at || ''
      )
      .run();
  } catch (e) {
    console.error('copy insert post', e);
    try {
      insert = await context.env.DB.prepare(
        `INSERT INTO posts (
          slug, title, body, category, cover_image, seo_title, seo_description, ad_pixels,
          likes, comment_count_display, published_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      )
        .bind(
          slug,
          source.title,
          source.body,
          source.category || '후기',
          source.cover_image || '',
          source.seo_title || '',
          source.seo_description || '',
          source.ad_pixels || '',
          Number(source.likes) || 0,
          Number(source.comment_count_display) || 0,
          source.published_at || ''
        )
        .run();
    } catch (e2) {
      try {
        insert = await context.env.DB.prepare(
          `INSERT INTO posts (
            slug, title, body, category, cover_image, seo_title, seo_description,
            likes, comment_count_display, published_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
        )
          .bind(
            slug,
            source.title,
            source.body,
            source.category || '후기',
            source.cover_image || '',
            source.seo_title || '',
            source.seo_description || '',
            Number(source.likes) || 0,
            Number(source.comment_count_display) || 0,
            source.published_at || ''
          )
          .run();
      } catch (e3) {
        insert = await context.env.DB.prepare(
          `INSERT INTO posts (
            slug, title, body, category, cover_image, likes, comment_count_display, published_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
        )
          .bind(
            slug,
            source.title,
            source.body,
            source.category || '후기',
            source.cover_image || '',
            Number(source.likes) || 0,
            Number(source.comment_count_display) || 0,
            source.published_at || ''
          )
          .run();
      }
    }
  }

  const newId = insert.meta.last_row_id;
  const { results: comments } = await context.env.DB.prepare(
    'SELECT * FROM comments WHERE post_id = ? ORDER BY sort_order ASC, id ASC'
  )
    .bind(source.id)
    .all();

  const idMap = new Map();
  // 부모 먼저 복사 위해 parent_id 없는 것 우선
  const sorted = [...(comments || [])].sort((a, b) => {
    const ap = Number(a.parent_id) || 0;
    const bp = Number(b.parent_id) || 0;
    if (!ap && bp) return -1;
    if (ap && !bp) return 1;
    return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || a.id - b.id;
  });

  for (const c of sorted) {
    const mappedParent =
      c.parent_id && idMap.has(Number(c.parent_id))
        ? idMap.get(Number(c.parent_id))
        : null;
    let inserted;
    try {
      inserted = await context.env.DB.prepare(
        `INSERT INTO comments (
          post_id, author, content, likes, dislikes, created_at, sort_order, profile_image, parent_id, is_pinned, is_admin
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          newId,
          c.author || '',
          c.content || '',
          Number(c.likes) || 0,
          Number(c.dislikes) || 0,
          c.created_at || '',
          Number(c.sort_order) || 0,
          c.profile_image || '',
          mappedParent,
          mappedParent ? 0 : Number(c.is_pinned) ? 1 : 0,
          Number(c.is_admin) ? 1 : 0
        )
        .run();
    } catch (e) {
      const msg = String(e?.message || e);
      if (/no such column:\s*is_admin/i.test(msg)) {
        inserted = await context.env.DB.prepare(
          `INSERT INTO comments (
            post_id, author, content, likes, dislikes, created_at, sort_order, profile_image, parent_id, is_pinned
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            newId,
            c.author || '',
            c.content || '',
            Number(c.likes) || 0,
            Number(c.dislikes) || 0,
            c.created_at || '',
            Number(c.sort_order) || 0,
            c.profile_image || '',
            mappedParent,
            mappedParent ? 0 : Number(c.is_pinned) ? 1 : 0
          )
          .run();
      } else if (/no such column:\s*is_pinned/i.test(msg)) {
        inserted = await context.env.DB.prepare(
          `INSERT INTO comments (
            post_id, author, content, likes, dislikes, created_at, sort_order, profile_image, parent_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            newId,
            c.author || '',
            c.content || '',
            Number(c.likes) || 0,
            Number(c.dislikes) || 0,
            c.created_at || '',
            Number(c.sort_order) || 0,
            c.profile_image || '',
            mappedParent
          )
          .run();
      } else if (/no such column:\s*parent_id/i.test(msg)) {
        inserted = await context.env.DB.prepare(
          `INSERT INTO comments (
            post_id, author, content, likes, dislikes, created_at, sort_order, profile_image
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            newId,
            c.author || '',
            c.content || '',
            Number(c.likes) || 0,
            Number(c.dislikes) || 0,
            c.created_at || '',
            Number(c.sort_order) || 0,
            c.profile_image || ''
          )
          .run();
      } else if (/no such column:\s*profile_image/i.test(msg)) {
        inserted = await context.env.DB.prepare(
          `INSERT INTO comments (
            post_id, author, content, likes, dislikes, created_at, sort_order
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            newId,
            c.author || '',
            c.content || '',
            Number(c.likes) || 0,
            Number(c.dislikes) || 0,
            c.created_at || '',
            Number(c.sort_order) || 0
          )
          .run();
      } else if (/no such column:\s*dislikes/i.test(msg)) {
        inserted = await context.env.DB.prepare(
          `INSERT INTO comments (
            post_id, author, content, likes, created_at, sort_order
          ) VALUES (?, ?, ?, ?, ?, ?)`
        )
          .bind(
            newId,
            c.author || '',
            c.content || '',
            Number(c.likes) || 0,
            c.created_at || '',
            Number(c.sort_order) || 0
          )
          .run();
      } else {
        throw e;
      }
    }
    idMap.set(Number(c.id), inserted.meta.last_row_id);
  }

  return json({
    ok: true,
    id: newId,
    slug,
    comment_copied: (comments || []).length,
  });
}
