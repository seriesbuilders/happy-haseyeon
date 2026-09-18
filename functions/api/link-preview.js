import { json, options, requireAdmin } from '../_utils.js';

export async function onRequestOptions() {
  return options();
}

function pickMeta(html, prop) {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`,
      'i'
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`,
      'i'
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeHtml(m[1].trim());
  }
  return '';
}

function decodeHtml(s) {
  let out = String(s ?? '');
  for (let i = 0; i < 3; i++) {
    const prev = out;
    out = out
      .replace(/&nbsp;/gi, ' ')
      .replace(/&quot;/gi, '"')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&apos;/gi, "'")
      .replace(/&#0*39;/g, "'")
      .replace(/&#x0*27;/gi, "'")
      .replace(/&#(\d+);/g, (_, n) => {
        const code = Number(n);
        if (!code || code > 0x10ffff) return _;
        try {
          return String.fromCodePoint(code);
        } catch {
          return _;
        }
      })
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
        const code = parseInt(h, 16);
        if (!code || code > 0x10ffff) return _;
        try {
          return String.fromCodePoint(code);
        } catch {
          return _;
        }
      })
      .replace(/&amp;/gi, '&');
    if (out === prev) break;
  }
  return out;
}

function absolutize(base, url) {
  if (!url) return '';
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}

function normalizeTargetUrl(raw) {
  let s = String(raw || '')
    .trim()
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
    .replace(/&amp;/gi, '&')
    .replace(/&#0*38;/g, '&');
  // admin 상대경로로 깨진 경우: https://host/admin/https://real.com/...
  const nested = s.match(/https?:\/\/[^\s]*?(https?:\/\/[^\s]+)/i);
  if (nested) s = nested[1];
  const lastHttps = Math.max(s.lastIndexOf('https://'), s.lastIndexOf('http://'));
  if (lastHttps > 0) s = s.slice(lastHttps);
  s = s.replace(/[),.;:!?…]+$/u, '');
  return s;
}

function faviconFor(hostname) {
  if (!hostname) return '';
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=128`;
}

function isNaverBlogHost(hostname) {
  const h = String(hostname || '')
    .replace(/^www\./i, '')
    .toLowerCase();
  return h === 'blog.naver.com' || h === 'm.blog.naver.com';
}

/** 카카오톡과 동일하게 PostView/모바일에서 OG를 읽기 위한 URL */
function toNaverFetchUrl(parsed) {
  if (!parsed || !isNaverBlogHost(parsed.hostname)) return parsed.toString();
  if (/PostView\.naver/i.test(parsed.pathname)) {
    const u = new URL(parsed.toString());
    u.searchParams.set('noTrackingCode', 'true');
    return u.toString();
  }
  const parts = parsed.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  if (parts.length >= 2 && /^\d{5,}$/.test(parts[parts.length - 1])) {
    const logNo = parts[parts.length - 1];
    const blogId = parts[parts.length - 2];
    return (
      `https://blog.naver.com/PostView.naver?blogId=${encodeURIComponent(blogId)}` +
      `&logNo=${encodeURIComponent(logNo)}&redirect=Dlog&widgetTypeCall=true&noTrackingCode=true`
    );
  }
  // blogId / logNo 쿼리형
  const blogId = parsed.searchParams.get('blogId');
  const logNo = parsed.searchParams.get('logNo');
  if (blogId && logNo) {
    return (
      `https://blog.naver.com/PostView.naver?blogId=${encodeURIComponent(blogId)}` +
      `&logNo=${encodeURIComponent(logNo)}&redirect=Dlog&widgetTypeCall=true&noTrackingCode=true`
    );
  }
  // 폴백: 모바일
  return parsed
    .toString()
    .replace(/:\/\/(?:www\.)?blog\.naver\.com/i, '://m.blog.naver.com');
}

function isGenericNaverOgImage(url) {
  return /ssl\.pstatic\.net\/static\/blog\/icon\/og_/i.test(String(url || ''));
}

function unwrapDthumbSrc(url) {
  try {
    const u = new URL(String(url || ''));
    if (!/dthumb-phinf\.pstatic\.net/i.test(u.hostname)) return String(url || '');
    let src = u.searchParams.get('src') || '';
    src = decodeHtml(src).replace(/^["']|["']$/g, '').trim();
    if (/^https?:\/\//i.test(src)) return src;
  } catch {
    /* ignore */
  }
  return String(url || '');
}

/** 네이버 글 본문/JSON에서 실제 썸네일 (카카오톡 미리보기와 유사) */
function extractNaverPostImage(html) {
  const decoded = decodeHtml(String(html || ''));
  const candidates = [];

  const push = (raw) => {
    if (!raw) return;
    let u = String(raw)
      .replace(/\\u002F/gi, '/')
      .replace(/\\\//g, '/')
      .trim();
    u = unwrapDthumbSrc(u);
    u = decodeHtml(u).replace(/^["']|["']$/g, '').trim();
    if (!/^https?:\/\//i.test(u)) return;
    if (isGenericNaverOgImage(u)) return;
    if (/blogimgs\.pstatic\.net|static\/blog\/icon/i.test(u)) return;
    candidates.push(u);
  };

  for (const re of [
    /"thumbnailUrl"\s*:\s*"([^"]+)"/gi,
    /"thumbnail(?:Path)?"\s*:\s*"([^"]+)"/gi,
    /thumbnail["']?\s*[:=]\s*["']([^"']+)["']/gi,
  ]) {
    let m;
    while ((m = re.exec(decoded)) && candidates.length < 8) push(m[1]);
  }

  // dthumb src= 안의 원본
  let m;
  const dthumbRe =
    /dthumb-phinf\.pstatic\.net\/\?[^"'<\s]*?\bsrc=([^&"'<\s]+)/gi;
  while ((m = dthumbRe.exec(decoded)) && candidates.length < 8) {
    try {
      push(decodeURIComponent(m[1]));
    } catch {
      push(m[1]);
    }
  }

  const fileRe =
    /https?:\/\/(?:blogfiles|postfiles\d*)\.pstatic\.net\/[^\s"'<>\\]+/gi;
  while ((m = fileRe.exec(decoded)) && candidates.length < 8) push(m[0]);

  return candidates[0] || '';
}

function fallbackCard(parsed, extra = {}) {
  const domain = parsed.hostname.replace(/^www\./, '');
  return {
    ok: true,
    url: parsed.toString(),
    title: extra.title || domain,
    description: extra.description || '',
    image: extra.image || faviconFor(parsed.hostname),
    domain,
  };
}

export async function onRequestGet(context) {
  const auth = await requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  const target = normalizeTargetUrl(
    new URL(context.request.url).searchParams.get('url') || ''
  );
  let parsed;
  try {
    parsed = new URL(target);
    if (!/^https?:$/i.test(parsed.protocol)) {
      return json({ error: 'http(s) URL만 지원합니다.' }, 400);
    }
  } catch {
    return json({ error: '올바른 URL을 입력해 주세요.' }, 400);
  }

  const isNaver = isNaverBlogHost(parsed.hostname);
  const fetchUrl = isNaver ? toNaverFetchUrl(parsed) : parsed.toString();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    let res;
    try {
      res = await fetch(fetchUrl, {
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          // 네이버는 일반 UA로 PC 껍데일만 주고 OG가 비는 경우가 많음 → 스크래퍼 UA
          'User-Agent': isNaver
            ? 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'
            : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      return json(fallbackCard(parsed, { title: parsed.hostname }));
    }

    const finalUrl = res.url || parsed.toString();
    let finalParsed = parsed;
    try {
      finalParsed = new URL(finalUrl);
    } catch {
      /* keep */
    }

    const ct = res.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml/i.test(ct) && !ct.includes('text/')) {
      return json(fallbackCard(finalParsed));
    }

    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf.slice(0, 500000));
    const html = new TextDecoder('utf-8', { fatal: false }).decode(bytes);

    let title =
      pickMeta(html, 'og:title') ||
      pickMeta(html, 'twitter:title') ||
      decodeHtml((html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || '').trim()) ||
      finalParsed.hostname;

    // PC 껍데일 title(블로그명만)이면 PostView/모바일 메타가 더 낫다
    if (isNaver && (!title || /:\s*네이버\s*블로그\s*$/i.test(title) && title.length < 40)) {
      const ogTitle = pickMeta(html, 'og:title');
      if (ogTitle) title = ogTitle;
    }

    const description =
      pickMeta(html, 'og:description') ||
      pickMeta(html, 'twitter:description') ||
      pickMeta(html, 'description') ||
      '';

    let image = absolutize(
      finalUrl,
      pickMeta(html, 'og:image') ||
        pickMeta(html, 'og:image:url') ||
        pickMeta(html, 'twitter:image') ||
        ''
    );
    if (isNaver && (!image || isGenericNaverOgImage(image))) {
      const better = extractNaverPostImage(html);
      if (better) image = better;
    }
    if (!image) image = faviconFor(finalParsed.hostname);

    return json({
      ok: true,
      url: parsed.toString(),
      title: String(title).slice(0, 200),
      description: String(description).slice(0, 300),
      image,
      domain: isNaver
        ? 'blog.naver.com'
        : finalParsed.hostname.replace(/^www\./, ''),
      finalUrl,
    });
  } catch (e) {
    console.error('link-preview', e);
    return json(fallbackCard(parsed));
  }
}
