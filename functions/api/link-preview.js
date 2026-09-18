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

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    let res;
    try {
      res = await fetch(parsed.toString(), {
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
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
    const bytes = new Uint8Array(buf.slice(0, 400000));
    const html = new TextDecoder('utf-8', { fatal: false }).decode(bytes);

    const title =
      pickMeta(html, 'og:title') ||
      pickMeta(html, 'twitter:title') ||
      decodeHtml((html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || '').trim()) ||
      finalParsed.hostname;

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
    if (!image) image = faviconFor(finalParsed.hostname);

  // 반환 URL은 요청한 원본(utm 유지). finalUrl은 리다이렉트 추적용으로만 사용
    return json({
      ok: true,
      url: parsed.toString(),
      title: String(title).slice(0, 200),
      description: String(description).slice(0, 300),
      image,
      domain: finalParsed.hostname.replace(/^www\./, ''),
      finalUrl,
    });
  } catch (e) {
    console.error('link-preview', e);
    // 차단·타임아웃이어도 카드는 나오게
    return json(fallbackCard(parsed));
  }
}
