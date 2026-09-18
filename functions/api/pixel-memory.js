import {
  json,
  options,
  requireAdmin,
  ensurePixelMemory,
  AD_CATEGORY,
} from '../_utils.js';
import { AD_COMMON_GTM_ID, parseAdPixels } from '../_pixels.js';

export async function onRequestOptions() {
  return options();
}

function summarizePostPixels(post) {
  const p = parseAdPixels(post.ad_pixels || '');
  const tags = [];
  if (p.google_ads_id) {
    const label = p.google_ads_label || p.google_ads_label_lead || '';
    tags.push({
      channel: 'Google Ads',
      identifier: label ? `${p.google_ads_id} / ${label}` : p.google_ads_id,
    });
  }
  if (p.google_gtm_id) {
    tags.push({ channel: 'GTM(글별)', identifier: p.google_gtm_id });
  }
  if (p.google_ga4_id) {
    tags.push({ channel: 'GA4', identifier: p.google_ga4_id });
  }
  if (p.meta_pixel_id) {
    tags.push({ channel: 'Meta', identifier: p.meta_pixel_id });
  }
  if (p.tiktok_pixel_id) {
    tags.push({ channel: 'TikTok', identifier: p.tiktok_pixel_id });
  }
  if (p.kakao_pixel_id) {
    tags.push({ channel: 'Kakao', identifier: p.kakao_pixel_id });
  }
  if (p.naver_wcs_id) {
    tags.push({ channel: 'Naver', identifier: p.naver_wcs_id });
  }
  return {
    post_id: post.id,
    title: post.title || '',
    slug: post.slug || '',
    tags,
  };
}

function buildPostPixelsFromRows(rows) {
  const map = new Map();
  for (const row of rows || []) {
    if (row.scope !== 'post') continue;
    const id = Number(row.post_id) || 0;
    if (!id) continue;
    if (!map.has(id)) {
      map.set(id, {
        post_id: id,
        title: row.post_title || '',
        slug: '',
        tags: [],
      });
    }
    const item = map.get(id);
    if (row.post_title) item.title = row.post_title;
    item.tags.push({
      channel: row.channel || '',
      identifier: row.identifier || '',
    });
  }
  return [...map.values()];
}

async function loadAllAdPosts(env) {
  const { results } = await env.DB.prepare(
    `SELECT id, title, slug, ad_pixels FROM posts
     WHERE category = ?
     ORDER BY id DESC
     LIMIT 1000`
  )
    .bind(AD_CATEGORY)
    .all();
  return results || [];
}

export async function onRequestGet(context) {
  const auth = await requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  try {
    await ensurePixelMemory(context.env);
  } catch (e) {
    console.error(e);
  }

  const { results } = await context.env.DB.prepare(
    `SELECT id, scope, channel, identifier, note, post_id, post_title, created_at
     FROM pixel_memory
     ORDER BY id DESC
     LIMIT 500`
  ).all();

  const items = results || [];
  const syncLogs = items.filter(
    (r) => r.scope === 'note' && r.channel === '동기화'
  );
  const postPixels = buildPostPixelsFromRows(items);

  return json({
    common: {
      gtm_id: AD_COMMON_GTM_ID,
      scope: 'global',
      target: '광고 블로그 랜딩 전체',
      note: 'Google Ads(AW) 전환 태그와 별도. 모든 광고 랜딩 head/body에 자동 삽입.',
    },
    items: syncLogs,
    post_pixels: postPixels,
    synced: postPixels.length > 0,
  });
}

/** 전체 광고 블로그 스캔 → 글별 픽셀 현황 동기화 */
export async function onRequestPost(context) {
  const auth = await requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  try {
    await ensurePixelMemory(context.env);
  } catch (e) {
    console.error(e);
  }

  const body = await context.request.json().catch(() => ({}));
  if (body.action && body.action !== 'sync') {
    return json({ error: '지원하지 않는 요청입니다.' }, 400);
  }

  const posts = await loadAllAdPosts(context.env);
  await context.env.DB.prepare(
    `DELETE FROM pixel_memory WHERE scope = 'post'`
  ).run();

  let tagCount = 0;
  let postsWithTags = 0;
  const postPixels = [];

  for (const post of posts) {
    const summary = summarizePostPixels(post);
    if (!summary.tags.length) continue;
    postsWithTags += 1;
    postPixels.push(summary);
    for (const tag of summary.tags) {
      tagCount += 1;
      await context.env.DB.prepare(
        `INSERT INTO pixel_memory (scope, channel, identifier, note, post_id, post_title)
         VALUES ('post', ?, ?, '', ?, ?)`
      )
        .bind(tag.channel, tag.identifier, summary.post_id, summary.title)
        .run();
    }
  }

  await context.env.DB.prepare(
    `INSERT INTO pixel_memory (scope, channel, identifier, note, post_title)
     VALUES ('note', '동기화', ?, ?, '')`
  )
    .bind(
      `광고 ${posts.length}개 스캔`,
      `글별 태그 ${postsWithTags}개 글 · ${tagCount}건 반영 (공통 GTM ${AD_COMMON_GTM_ID} 별도)`
    )
    .run();

  const { results: syncLogs } = await context.env.DB.prepare(
    `SELECT id, scope, channel, identifier, note, post_id, post_title, created_at
     FROM pixel_memory
     WHERE scope = 'note' AND channel = '동기화'
     ORDER BY id DESC
     LIMIT 100`
  ).all();

  return json({
    ok: true,
    scanned: posts.length,
    posts_with_tags: postsWithTags,
    tag_count: tagCount,
    post_pixels: postPixels,
    items: syncLogs || [],
    common: {
      gtm_id: AD_COMMON_GTM_ID,
      scope: 'global',
      target: '광고 블로그 랜딩 전체',
      note: 'Google Ads(AW) 전환 태그와 별도. 모든 광고 랜딩 head/body에 자동 삽입.',
    },
  });
}
