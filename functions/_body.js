/** 공개 글본문 보정: 빈 링크카드 복구 + 안전한 마크업 */

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function decodeEntities(s) {
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

function faviconFor(hostname) {
  if (!hostname) return '';
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=128`;
}

function parseUrlMeta(rawHref) {
  const url = decodeEntities(rawHref).trim();
  let hostname = '';
  let domain = '';
  try {
    const u = new URL(url);
    hostname = u.hostname;
    domain = hostname.replace(/^www\./, '');
  } catch {
    domain = url.slice(0, 80);
  }
  return { url, hostname, domain };
}

function buildLinkCardBlockHtml({ url, title, description, image, domain, align = 'center' }) {
  const safeUrl = escapeHtml(decodeEntities(url || ''));
  const safeTitle = escapeHtml(decodeEntities(title || domain || url || ''));
  const safeDesc = escapeHtml(decodeEntities(description || ''));
  const safeImage = escapeHtml(decodeEntities(image || ''));
  const safeDomain = escapeHtml(decodeEntities(domain || ''));
  const tableMargin = align === 'left' ? 'margin:0 auto 0 0;' : 'margin:0 auto;';

  const mediaTd = image
    ? `<td class="link-card-media" style="padding:0;margin:0;line-height:0;font-size:0;background-color:#f3f4f6;background-image:url('${safeImage}');background-repeat:no-repeat;background-position:center center;background-size:cover;">` +
      `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="display:block;text-decoration:none;line-height:0;">` +
      `<span class="link-card-media-spacer" style="display:block;width:100%;padding-top:56%;height:0;overflow:hidden;font-size:0;line-height:0;">&nbsp;</span>` +
      `</a></td>`
    : `<td class="link-card-media link-card-thumb--empty" style="padding:0;margin:0;background:#f0f2f5;">` +
      `<span class="link-card-media-spacer" style="display:block;width:100%;padding-top:56%;height:0;">&nbsp;</span></td>`;

  const descRow = description
    ? `<a class="link-card-desc" href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="display:block;margin-top:6px;font-size:13px;line-height:1.45;color:#666666;text-decoration:none;">${safeDesc}</a>`
    : '';

  const table =
    `<table class="link-card" data-lc="1" data-align="${align}" data-url="${safeUrl}" data-title="${safeTitle}" data-desc="${safeDesc}" data-image="${safeImage}" data-domain="${safeDomain}" cellpadding="0" cellspacing="0" border="0" style="display:table;width:400px;max-width:100%;${tableMargin}border:1px solid #e5e8eb;border-radius:10px;border-collapse:separate;border-spacing:0;overflow:hidden;background:#ffffff;text-align:left;table-layout:fixed;">` +
    `<tbody>` +
    `<tr>${mediaTd}</tr>` +
    `<tr><td class="link-card-body" style="padding:14px 16px 16px;margin:0;background:#ffffff;text-align:left;vertical-align:top;">` +
    `<a class="link-card-title" href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="display:block;font-size:16px;font-weight:700;line-height:1.4;color:#222222;text-decoration:none;">${safeTitle}</a>` +
    descRow +
    `<a class="link-card-domain" href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="display:block;margin-top:6px;font-size:12px;line-height:1.4;color:#2e9e4d;text-decoration:none;">${safeDomain}</a>` +
    `</td></tr>` +
    `</tbody></table>`;

  // <p> 안에 <table>은 무효 → 브라우저/에디터가 비워 버림. 반드시 div 사용
  // 래퍼에도 data-* 를 두어 테이블이 비워져도 복구 가능
  return (
    `<div class="link-card-block" data-lc="1" data-lc-part="card" data-align="${align}" data-url="${safeUrl}" data-title="${safeTitle}" data-desc="${safeDesc}" data-image="${safeImage}" data-domain="${safeDomain}" style="text-align:${align};margin:0 0 16px;">` +
    table +
    `</div>`
  );
}

/** 저장된 빈 .link-card-block 을 data-url / URL 줄 기준으로 다시 채움 (URL 줄은 제거) */
export function rebuildEmptyLinkCards(html) {
  if (!html || !/link-card/i.test(html)) return html || '';

  let out = html.replace(
    /(<p\b[^>]*\bclass="[^"]*\blink-card-url-line\b[^"]*"[^>]*>[\s\S]*?<a\b[^>]*\bhref="([^"]+)"[^>]*>[\s\S]*?<\/p>)\s*<(?:p|div)\b([^>]*\bclass="[^"]*\blink-card-block\b[^"]*"[^>]*)>\s*<\/(?:p|div)>/gi,
    (full, urlLine, href, openAttrs) => {
      const { url, hostname, domain } = parseUrlMeta(href);
      const align = /\bdata-align\s*=\s*["']left["']/i.test(openAttrs || '') ? 'left' : 'center';
      return buildLinkCardBlockHtml({
        url,
        title: domain,
        description: '',
        image: faviconFor(hostname),
        domain,
        align,
      });
    }
  );

  // 빈 카드 블록: 래퍼 data-url 로 복구 (URL 줄 없는 신규 저장 포맷)
  out = out.replace(
    /<(?:p|div)\b([^>]*\bclass="[^"]*\blink-card-block\b[^"]*"[^>]*)>\s*<\/(?:p|div)>/gi,
    (full, openAttrs) => {
      const urlM = String(openAttrs || '').match(/\bdata-url\s*=\s*["']([^"']+)["']/i);
      if (!urlM?.[1]) return full;
      const href = decodeEntities(urlM[1]);
      const { url, hostname, domain: hostDomain } = parseUrlMeta(href);
      const pick = (name) => {
        const m = String(openAttrs || '').match(
          new RegExp(`\\bdata-${name}\\s*=\\s*["']([^"']*)["']`, 'i')
        );
        return m?.[1] ? decodeEntities(m[1]) : '';
      };
      const align = /\bdata-align\s*=\s*["']left["']/i.test(openAttrs || '') ? 'left' : 'center';
      const domain = pick('domain') || hostDomain;
      return buildLinkCardBlockHtml({
        url,
        title: pick('title') || domain,
        description: pick('desc') || '',
        image: pick('image') || faviconFor(hostname),
        domain,
        align,
      });
    }
  );

  // 남아 있는 URL 주소 줄 제거
  out = out.replace(
    /<p\b[^>]*\bclass="[^"]*\blink-card-url-line\b[^"]*"[^>]*>[\s\S]*?<\/p>/gi,
    ''
  );
  return out;
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
    if (m?.[1]) {
      return decodeEntities(m[1].trim());
    }
  }
  return '';
}

async function fetchOgCard(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.7',
      },
    });
    if (!res.ok) return null;
    const finalUrl = res.url || url;
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf.slice(0, 350000));
    const html = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    let image =
      pickMeta(html, 'og:image') ||
      pickMeta(html, 'og:image:url') ||
      pickMeta(html, 'twitter:image') ||
      '';
    if (image) {
      try {
        image = new URL(image, finalUrl).toString();
      } catch {
        /* keep */
      }
    }
    const title =
      pickMeta(html, 'og:title') ||
      pickMeta(html, 'twitter:title') ||
      decodeEntities((html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || '').trim());
    const description =
      pickMeta(html, 'og:description') ||
      pickMeta(html, 'twitter:description') ||
      pickMeta(html, 'description') ||
      '';
    let domain = '';
    try {
      domain = new URL(finalUrl).hostname.replace(/^www\./, '');
    } catch {
      domain = '';
    }
    return {
      url: finalUrl,
      title: String(title || domain).slice(0, 200),
      description: String(description || '').slice(0, 300),
      image,
      domain,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 링크카드에 OG 썸네일·제목을 채움 (SSR용, 타임아웃 제한)
 */
export async function enrichLinkCardPreviews(html, opts = {}) {
  if (!html || !/link-card/i.test(html)) return html || '';
  const timeoutMs = opts.timeoutMs ?? 3500;
  const limit = opts.limit ?? 12;

  const urls = [];
  const seen = new Set();
  const re = /data-url="([^"]+)"/gi;
  let m;
  while ((m = re.exec(html)) && urls.length < limit) {
    const url = decodeEntities(m[1]);
    if (!url || seen.has(url)) continue;
    if (!/^https?:\/\//i.test(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  if (!urls.length) return html;

  const results = await Promise.all(
    urls.map(async (url) => {
      const og = await fetchOgCard(url, timeoutMs);
      return [url, og];
    })
  );

  let out = html;
  for (const [url, og] of results) {
    if (!og) continue;
    const safeUrl = escapeHtml(url);
    const tableRe = new RegExp(
      `(<table\\b[^>]*\\bclass="[^"]*\\blink-card\\b[^"]*"[^>]*data-url="${safeUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>)([\\s\\S]*?)(<\\/table>)`,
      'i'
    );
    out = out.replace(tableRe, (full, open, inner, close) => {
      const { url: finalUrl, title, description, image, domain } = og;
      const meta = parseUrlMeta(url);
      const card = buildLinkCardBlockHtml({
        url: finalUrl || url,
        title: title || meta.domain,
        description,
        image: image || faviconFor(meta.hostname),
        domain: domain || meta.domain,
        align: /data-align="left"/.test(open) ? 'left' : 'center',
      });
      // buildLinkCardBlockHtml wraps in div — extract table only
      const tm = card.match(/<table[\s\S]*<\/table>/i);
      return tm ? tm[0] : full;
    });
  }
  return out;
}

export function sanitizePostBodyHtml(html) {
  return rebuildEmptyLinkCards(html || '');
}
