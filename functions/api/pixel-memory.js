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

  let postPixels = [];
  try {
    const { results: posts } = await context.env.DB.prepare(
      `SELECT id, title, slug, ad_pixels FROM posts
       WHERE category = ? AND TRIM(COALESCE(ad_pixels,'')) != ''
       ORDER BY id DESC
       LIMIT 300`
    )
      .bind(AD_CATEGORY)
      .all();
    postPixels = (posts || [])
      .map(summarizePostPixels)
      .filter((row) => row.tags.length > 0);
  } catch (e) {
    console.error('post pixels summary', e);
  }

  return json({
    common: {
      gtm_id: AD_COMMON_GTM_ID,
      scope: 'global',
      target: '광고 블로그 랜딩 전체',
      note: 'Google Ads(AW) 전환 태그와 별도. 모든 광고 랜딩 head/body에 자동 삽입.',
    },
    items: results || [],
    post_pixels: postPixels,
  });
}

export async function onRequestPost(context) {
  const auth = await requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  try {
    await ensurePixelMemory(context.env);
  } catch (e) {
    console.error(e);
  }

  const body = await context.request.json().catch(() => ({}));
  const scope = String(body.scope || 'global').trim() || 'global';
  const channel = String(body.channel || '').trim();
  const identifier = String(body.identifier || '').trim();
  const note = String(body.note || '').trim();
  const post_id = Number(body.post_id) || null;
  const post_title = String(body.post_title || '').trim();

  if (!channel) {
    return json(
      { error: '채널(매체)을 입력하세요. 예: GTM, Google Ads, Meta' },
      400
    );
  }
  if (!identifier && !note) {
    return json({ error: 'ID 또는 메모를 입력하세요.' }, 400);
  }

  const result = await context.env.DB.prepare(
    `INSERT INTO pixel_memory (scope, channel, identifier, note, post_id, post_title)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(scope, channel, identifier, note, post_id, post_title)
    .run();

  return json({
    ok: true,
    id: result.meta.last_row_id,
  });
}

export async function onRequestDelete(context) {
  const auth = await requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  const url = new URL(context.request.url);
  const id = Number(url.searchParams.get('id'));
  if (!id) return json({ error: 'id가 필요합니다.' }, 400);

  await context.env.DB.prepare('DELETE FROM pixel_memory WHERE id = ?')
    .bind(id)
    .run();

  return json({ ok: true });
}
