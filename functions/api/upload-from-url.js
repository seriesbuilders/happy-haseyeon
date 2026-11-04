import { json, options, requireAdmin } from '../_utils.js';

const MAX_IMAGE = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20000;

export async function onRequestOptions() {
  return options();
}

function decodeHtmlEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeImageUrl(raw) {
  return decodeHtmlEntities(String(raw || '').trim());
}

/** 다음/티스토리 썸네일 래퍼 → 원본 kakaocdn URL 추출 */
function unwrapProxyImageUrl(url) {
  const u = normalizeImageUrl(url);
  if (!u) return u;
  try {
    const parsed = new URL(u);
    // img1.daumcdn.net/thumb/...?fname=https%3A%2F%2Fblog.kakaocdn.net%2F...
    if (/daumcdn\.net$/i.test(parsed.hostname) && parsed.searchParams.has('fname')) {
      const fname = parsed.searchParams.get('fname');
      if (fname && /^https?:\/\//i.test(fname)) return normalizeImageUrl(fname);
    }
    // t1.daumcdn.net/cfile/... 등은 그대로
  } catch {
    /* ignore */
  }
  return u;
}

function isOwnedImageUrl(url, env) {
  const u = normalizeImageUrl(url);
  if (!u || /^data:/i.test(u)) return true;
  const base = (env.R2_PUBLIC_URL || '').replace(/\/$/, '');
  if (base && u.startsWith(base + '/')) return true;
  // 예전 R2 주소(pub-….r2.dev)도 우리 파일이다. 다시 올리면 같은 사진이 두 벌 생기므로 건너뛴다.
  const oldBase = (env.IMAGE_HOST_OLD || '').replace(/\/$/, '');
  if (oldBase && u.startsWith(oldBase + '/')) return true;
  if (/^\/images\//i.test(u)) return true;
  try {
    const host = new URL(u, 'https://tennis0915.com').hostname;
    if (/happy-haseyeon\.pages\.dev$/i.test(host) && /\/images\//i.test(u)) return true;
  } catch {
    /* ignore */
  }
  return false;
}

function extFromContentType(type, url) {
  const map = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/bmp': 'bmp',
    'image/svg+xml': 'svg',
  };
  if (map[type]) return map[type];
  const fromPath = (url.split('?')[0].split('.').pop() || '').toLowerCase();
  return /^[a-z0-9]{2,5}$/.test(fromPath) ? fromPath.replace('jpeg', 'jpg') : 'jpg';
}

function referersForHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (/kakaocdn\.net$|daumcdn\.net$|kakaocdn\.com$/i.test(h)) {
    return [
      'https://blog.kakaocdn.net/',
      'https://tistory.com/',
      'https://www.tistory.com/',
      'https://blog.naver.com/',
    ];
  }
  if (/pstatic\.net$|naver\.net$|naver\.com$/i.test(h)) {
    return ['https://blog.naver.com/', 'https://m.blog.naver.com/'];
  }
  if (/googleusercontent\.com$|ggpht\.com$/i.test(h)) {
    return ['https://www.google.com/'];
  }
  try {
    return [`https://${h}/`];
  } catch {
    return ['https://www.google.com/'];
  }
}

async function fetchOnce(url, referer) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const headers = {
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    };
    if (referer) {
      headers.Referer = referer;
      try {
        headers.Origin = new URL(referer).origin;
      } catch {
        /* ignore */
      }
    }
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (type && !type.startsWith('image/') && type !== 'application/octet-stream') {
      throw new Error(`이미지가 아닙니다 (${type})`);
    }
    const bytes = await res.arrayBuffer();
    if (!bytes.byteLength) throw new Error('빈 파일');
    if (bytes.byteLength > MAX_IMAGE) throw new Error('10MB 초과');
    return {
      bytes,
      contentType: type && type.startsWith('image/') ? type : 'image/jpeg',
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchImageBytes(url) {
  let hostname = '';
  try {
    hostname = new URL(url).hostname;
  } catch {
    throw new Error('잘못된 URL');
  }

  const referers = [null, ...referersForHost(hostname)];
  let lastErr = null;
  for (const referer of referers) {
    try {
      return await fetchOnce(url, referer);
    } catch (e) {
      lastErr = e;
      // 404/410은 재시도 무의미
      if (/HTTP 404|HTTP 410/i.test(String(e?.message || ''))) break;
    }
  }
  if (lastErr?.name === 'AbortError') throw new Error('다운로드 시간 초과');
  throw lastErr || new Error('다운로드 실패');
}

async function mirrorOneUrl(env, rawUrl) {
  const original = normalizeImageUrl(rawUrl);
  const url = unwrapProxyImageUrl(original);
  if (!url) return { url: rawUrl, ok: false, error: 'URL 없음' };
  if (isOwnedImageUrl(url, env) || isOwnedImageUrl(original, env)) {
    return { url: original, ok: true, mirrorUrl: original, skipped: true };
  }
  if (!/^https?:\/\//i.test(url)) {
    return { url: original, ok: false, error: 'http(s) URL만 지원' };
  }

  if (!env.IMAGES) {
    return { url: original, ok: false, error: 'R2 바인딩 없음' };
  }

  try {
    const { bytes, contentType } = await fetchImageBytes(url);
    const ext = extFromContentType(contentType, url);
    const key = `uploads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    await env.IMAGES.put(key, bytes, {
      httpMetadata: { contentType },
    });
    const base = (env.R2_PUBLIC_URL || '').replace(/\/$/, '');
    const mirrorUrl = base ? `${base}/${key}` : `/api/upload?key=${encodeURIComponent(key)}`;
    // 원본(썸네일 래퍼 포함) URL도 교체되도록 original 기준으로 반환
    return { url: original, ok: true, mirrorUrl, key };
  } catch (e) {
    const msg = e?.name === 'AbortError' ? '다운로드 시간 초과' : e?.message || '다운로드 실패';
    return { url: original, ok: false, error: msg };
  }
}

export async function onRequestPost(context) {
  const auth = await requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  let body = {};
  try {
    body = await context.request.json();
  } catch {
    return json({ error: 'JSON body가 필요합니다.' }, 400);
  }

  const list = Array.isArray(body.urls)
    ? body.urls
    : body.url
      ? [body.url]
      : [];

  const urls = [...new Set(list.map(normalizeImageUrl).filter(Boolean))];
  if (!urls.length) {
    return json({ error: 'url 또는 urls가 필요합니다.' }, 400);
  }
  if (urls.length > 80) {
    return json({ error: '한 번에 80개까지 처리할 수 있습니다.' }, 400);
  }

  const results = [];
  for (const url of urls) {
    results.push(await mirrorOneUrl(context.env, url));
  }

  const failed = results.filter((r) => !r.ok);
  return json({
    ok: failed.length === 0,
    results,
    failed: failed.map((r) => ({ url: r.url, error: r.error })),
    mirrored: results.filter((r) => r.ok && !r.skipped).length,
  });
}
