import {
  json,
  options,
  requireAdmin,
  randomSlug,
  encryptedSlug,
  ensurePostsColumns,
  AD_CATEGORY,
} from '../../_utils.js';
import { serializeAdPixels } from '../../_pixels.js';

export async function onRequestOptions() {
  return options();
}

export async function onRequestGet(context) {
  try {
    await ensurePostsColumns(context.env);
  } catch (e) {
    console.error(e);
  }

  const url = new URL(context.request.url);
  const slug = url.searchParams.get('slug');

  if (slug) {
    const post = await context.env.DB.prepare(
      'SELECT * FROM posts WHERE slug = ? LIMIT 1'
    )
      .bind(slug)
      .first();

    if (!post) return json({ error: '글을 찾을 수 없습니다.' }, 404);

    const { results: comments } = await context.env.DB.prepare(
      'SELECT * FROM comments WHERE post_id = ? ORDER BY sort_order ASC, id ASC'
    )
      .bind(post.id)
      .all();

    return json({ post, comments: comments || [] });
  }

  const category = url.searchParams.get('category');
  // 광고 글은 index/일반 목록에 노출하지 않음. category=광고 는 관리자만 조회.
  const isAdCategory = category === AD_CATEGORY;
  if (isAdCategory) {
    const auth = await requireAdmin(context.request, context.env);
    if (!auth.ok) return auth.response;
  }
  const excludeAd = !isAdCategory;

  let sql = `SELECT
      p.id, p.slug, p.title, p.category, p.cover_image, p.likes,
      COALESCE((SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id), 0) AS comment_count,
      p.comment_count_display, p.published_at, p.created_at
    FROM posts p`;
  const binds = [];
  const where = [];
  if (category) {
    where.push('p.category = ?');
    binds.push(category);
  } else if (excludeAd) {
    where.push('(p.category IS NULL OR p.category != ?)');
    binds.push(AD_CATEGORY);
  }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY p.id DESC';

  try {
    const stmt = context.env.DB.prepare(sql);
    const { results } = binds.length
      ? await stmt.bind(...binds).all()
      : await stmt.all();
    return json({ posts: results || [] });
  } catch (e) {
    // cover_image 없는 구버전 DB 폴백
    let fallback = `SELECT id, slug, title, category, likes, comment_count_display, published_at, created_at FROM posts`;
    const fbBinds = [];
    const fbWhere = [];
    if (category) {
      fbWhere.push('category = ?');
      fbBinds.push(category);
    } else if (excludeAd) {
      fbWhere.push('(category IS NULL OR category != ?)');
      fbBinds.push(AD_CATEGORY);
    }
    if (fbWhere.length) fallback += ' WHERE ' + fbWhere.join(' AND ');
    fallback += ' ORDER BY id DESC';
    try {
      const stmt = context.env.DB.prepare(fallback);
      const { results } = fbBinds.length
        ? await stmt.bind(...fbBinds).all()
        : await stmt.all();
      return json({ posts: results || [] });
    } catch (e2) {
      const stmt = context.env.DB.prepare(
        'SELECT id, slug, title, likes, comment_count_display, published_at, created_at FROM posts ORDER BY id DESC'
      );
      const { results } = await stmt.all();
      return json({ posts: results || [] });
    }
  }
}

/** 스키마 차이에 대비한 단계적 INSERT */
async function insertPostRow(env, row) {
  const attempts = [
    {
      sql: `INSERT INTO posts (slug, title, body, category, cover_image, seo_title, seo_description, ad_pixels, likes, comment_count_display, share_count_display, published_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      binds: [
        row.slug,
        row.title,
        row.body,
        row.category,
        row.cover,
        row.seo_title,
        row.seo_description,
        row.ad_pixels,
        row.likes,
        row.comment_count_display,
        row.share_count_display,
        row.published,
      ],
    },
    {
      sql: `INSERT INTO posts (slug, title, body, category, cover_image, seo_title, seo_description, ad_pixels, likes, comment_count_display, published_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      binds: [
        row.slug,
        row.title,
        row.body,
        row.category,
        row.cover,
        row.seo_title,
        row.seo_description,
        row.ad_pixels,
        row.likes,
        row.comment_count_display,
        row.published,
      ],
    },
    {
      sql: `INSERT INTO posts (slug, title, body, category, cover_image, seo_title, seo_description, likes, comment_count_display, published_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      binds: [
        row.slug,
        row.title,
        row.body,
        row.category,
        row.cover,
        row.seo_title,
        row.seo_description,
        row.likes,
        row.comment_count_display,
        row.published,
      ],
    },
    {
      sql: `INSERT INTO posts (slug, title, body, category, cover_image, likes, comment_count_display, published_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      binds: [
        row.slug,
        row.title,
        row.body,
        row.category,
        row.cover,
        row.likes,
        row.comment_count_display,
        row.published,
      ],
    },
    {
      sql: `INSERT INTO posts (slug, title, body, category, likes, comment_count_display, published_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      binds: [
        row.slug,
        row.title,
        row.body,
        row.category,
        row.likes,
        row.comment_count_display,
        row.published,
      ],
    },
    {
      sql: `INSERT INTO posts (slug, title, body, likes, comment_count_display, published_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      binds: [
        row.slug,
        row.title,
        row.body,
        row.likes,
        row.comment_count_display,
        row.published,
      ],
    },
    {
      sql: `INSERT INTO posts (slug, title, body, likes, comment_count_display, published_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      binds: [
        row.slug,
        row.title,
        row.body,
        row.likes,
        row.comment_count_display,
        row.published,
      ],
    },
  ];

  let lastErr;
  for (const attempt of attempts) {
    try {
      return await env.DB.prepare(attempt.sql).bind(...attempt.binds).run();
    } catch (e) {
      lastErr = e;
      console.error('insert attempt failed', String(e?.message || e));
      try {
        await ensurePostsColumns(env);
      } catch (_) {
        /* ignore */
      }
    }
  }
  throw lastErr;
}

export async function onRequestPost(context) {
  try {
    const auth = await requireAdmin(context.request, context.env);
    if (!auth.ok) return auth.response;

    try {
      await ensurePostsColumns(context.env);
    } catch (e) {
      console.error('ensurePostsColumns', e);
    }

    const body = await context.request.json();
    const category = body.category || '후기';
    const isAd = category === AD_CATEGORY;
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

    const title = String(body.title || '').trim();
    if (!title) {
      return json({ error: '제목을 입력해 주세요.' }, 400);
    }

    const html = body.body || '';
    const cover = body.cover_image || '';
    const likes = Number(body.likes) || 0;
    const comment_count_display = Number(body.comment_count_display) || 0;
    const share_count_display = Number(body.share_count_display) || 0;
    const published = body.published_at || '';
    const seo_title = String(body.seo_title || '').trim();
    const seo_description = String(body.seo_description || '').trim();
    const ad_pixels = serializeAdPixels(body.ad_pixels || {});

    const result = await insertPostRow(context.env, {
      slug,
      title,
      body: html,
      category,
      cover,
      likes,
      comment_count_display,
      share_count_display,
      published,
      seo_title,
      seo_description,
      ad_pixels,
    });

    return json({
      ok: true,
      id: result.meta.last_row_id,
      slug,
    });
  } catch (e) {
    console.error('POST /api/posts', e);
    const detail = String(e?.message || e);
    let hint = '';
    if (/no such column:\s*cover_image/i.test(detail)) {
      hint =
        'DB에 cover_image 컬럼이 없습니다. migrations/006_cover_image_safe.sql 을 실행해 주세요.';
    } else if (/no such column:\s*category/i.test(detail)) {
      hint = 'DB에 category 컬럼이 없습니다. 마이그레이션을 실행해 주세요.';
    } else if (/too big|too large|max size|SQLITE_TOOBIG/i.test(detail)) {
      hint =
        '본문이 너무 큽니다. 이미지는 URL 업로드를 사용하고, 본문에 base64 이미지를 넣지 마세요.';
    }
    return json(
      {
        error: hint || '글 저장에 실패했습니다.',
        detail,
      },
      500
    );
  }
}
