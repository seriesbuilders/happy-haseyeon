/**
 * 네이버 블로그 글 → 사이트 본문 HTML
 *
 * 네이버 스마트에디터(SE)의 원래 구조와 클래스 이름을 그대로 두고,
 * 브라우저에서 글을 복사해 붙여넣었을 때 따라오는 서식 값(여백·줄높이·글꼴·크기)을
 * 인라인 스타일로 넣는다. 사이트 CSS(.post-body .se-…)가 이 클래스들을 기준으로 만들어져 있다.
 *
 * 서식 값은 관리자 페이지에서 직접 붙여넣어 만든 글(#47)에서 뽑은 것이다.
 *
 * 랜딩발행기(auto-blog/naver-import.mjs)와 같은 변환기. 관리자 「네이버 주소로 가져오기」(/api/naver-import)가 쓴다.
 * 다른 점: 제품 카드 감싸개 이름표를 se-oglink → se-linkcard 로 바꿈
 *   (관리자 편집기 저장 정리 코드가 글 끝의 'oglink' 이름표 덩어리를 네이버 잔여물로 보고 지우기 때문).
 */
import { parse } from 'node-html-parser';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const SE_FONT = "se-nanumgothic, arial, 'Nanum Gothic', 나눔고딕, nanumgothic, sans-serif";
const FONT_BY_CLASS = {
  nanumgothic: SE_FONT,
  nanummyeongjo: "se-nanummyeongjo, 'Nanum Myeongjo', 나눔명조, nanummyeongjo, serif",
  nanumbarungothic: "se-nanumbarungothic, 'Nanum Gothic', 나눔바른고딕, nanumbarungothic, sans-serif",
  nanumsquare: "se-nanumsquare, 'Nanum Gothic', 나눔스퀘어, nanumsquare, sans-serif",
  nanummaruburi: "se-nanummaruburi, 'Nanum Myeongjo', 마루부리, nanummaruburi, serif",
};

/**
 * 기기마다 다르게 보이지 않도록 본문 맨 앞에 넣는 자체 규칙.
 *  - 웹폰트: 사이트가 글꼴 파일을 주지 않아 기기 기본 글꼴(아이폰/갤럭시/PC 제각각)로 보이던 것을 통일
 *  - text-size-adjust: 안드로이드 크롬·삼성 인터넷·iOS 가 긴 글의 글자 크기를 제멋대로 키우는 것을 막음
 *  - 폭 700px 제한: 폴드 안쪽 화면·태블릿·PC 에서 이미지가 화면 폭만큼 커지지 않게 (네이버 본문 폭과 동일)
 */
const RESPONSIVE_HEAD =
  "<style>@import url('https://fonts.googleapis.com/css2?family=Nanum+Gothic:wght@400;700;800&family=Nanum+Myeongjo:wght@400;700&display=swap');" +
  '.nvp{max-width:700px;margin:0 auto;-webkit-text-size-adjust:100%;text-size-adjust:100%;word-break:break-word;overflow-wrap:break-word}' +
  '.nvp *{-webkit-text-size-adjust:100%;text-size-adjust:100%}' +
  '.nvp img{max-width:100%;height:auto}' +
  '.nvp table.link-card{max-width:100%}' +
  '</style>';

const WRAPPER_STYLE =
  'max-width:700px;margin:0 auto;-webkit-text-size-adjust:100%;text-size-adjust:100%;word-break:break-word;overflow-wrap:break-word';

const RESET = 'margin:0;padding:0;border:0';
// width·box-sizing·overflow: 사이트 CSS(.post-body .se-component)가 하던 일을 인라인으로 (이름표를 nv-component 로 바꿨기 때문)
const COMPONENT_BASE = `width:100%;max-width:100%;box-sizing:border-box;overflow:hidden;padding:0;border:0;font-weight:400;font-size:12px;font-family:${SE_FONT};position:relative;color:rgb(138,138,138);text-align:left;background-color:rgb(255,255,255)`;

export function parseNaverUrl(raw) {
  const u = new URL(String(raw).trim());
  if (!/(^|\.)blog\.naver\.com$/i.test(u.hostname)) throw new Error('네이버 블로그 주소가 아닙니다: ' + raw);
  let blogId = u.searchParams.get('blogId');
  let logNo = u.searchParams.get('logNo');
  if (!blogId || !logNo) {
    const m = u.pathname.match(/^\/([^/]+)\/(\d+)/);
    if (m) [, blogId, logNo] = m;
  }
  if (!blogId || !logNo) throw new Error('글 번호를 찾을 수 없습니다: ' + raw);
  return { blogId, logNo };
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function decode(s) {
  return String(s ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

const kindOf = (comp) => ((comp.getAttribute('class') || '').match(/se-component se-([A-Za-z]+)/) || [])[1] || '';
const hasClass = (el, name) => (' ' + (el.getAttribute('class') || '') + ' ').includes(' ' + name + ' ');

/** 네이버 뷰어 CSS 의 컴포넌트 사이 여백 규칙 */
function marginTop(kind, prevKind) {
  if (!prevKind) return 0;
  if (kind === 'horizontalLine' || prevKind === 'horizontalLine') return 30;
  if (kind === 'quotation' || prevKind === 'quotation') return 40;
  const img = (k) => k === 'image' || k === 'imageStrip' || k === 'imageGroup';
  if (img(kind) && img(prevKind)) return 5;
  return 20;
}

function parseLinkData(a) {
  try {
    return JSON.parse(decode(a?.getAttribute('data-linkdata') || ''));
  } catch {
    return null;
  }
}

/** 네이버 이미지 주소 → 내려받을 수 있는 큰 원본 */
/** 우리 사이트 주소인지 (랜딩에서 복사해 네이버에 붙인 사진에는 우리 홈 링크가 딸려 온다) */
const OWN_HOSTS = ['tennis0915.com', 'happy-haseyeon.pages.dev'];
function isOwnSiteUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return OWN_HOSTS.some((h) => host === h || host.endsWith('.' + h));
  } catch {
    return false;
  }
}

function bestImageUrl(img, linkData) {
  let src = decode(img.getAttribute('data-lazy-src') || img.getAttribute('src') || '');
  if (linkData?.src) src = linkData.src;
  // blogfiles 는 type=w1(원본)만 허용. 지연로딩용 흐린 썸네일(w80_blur)만 큰 사이즈로 교체
  if (/(postfiles|mblogthumb-phinf)\.pstatic\.net/i.test(src) && /[?&]type=w\d+_blur/i.test(src)) {
    src = src.replace(/([?&])type=[^&]*/i, '$1type=w966');
  }
  return src;
}

/** 원본에 있던 인라인 스타일 중 의미 있는 것만 남긴다 */
function sourceStyle(el, allow) {
  const out = [];
  for (const part of String(el.getAttribute('style') || '').split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const k = part.slice(0, i).trim().toLowerCase();
    const v = part.slice(i + 1).trim();
    if (allow.includes(k) && v) out.push(`${k}:${v}`);
  }
  return out;
}

const KEEP_ATTRS = new Set(['class', 'style', 'href', 'target', 'rel', 'src', 'alt', 'colspan', 'rowspan', 'width', 'height']);

function stripAttrs(el) {
  for (const name of Object.keys(el.attributes)) {
    if (!KEEP_ATTRS.has(name.toLowerCase())) el.removeAttribute(name);
  }
  // SE 내부용 클래스는 뺀다
  // se-component* 는 관리자 편집기(SunEditor)가 자기 사진 틀 이름표로 써서, 그대로 두면 사진 틀로 착각해
  // 오류를 내고 저장이 멈춘다 → nv-component* 로 바꾼다 (사이트 CSS 가 하던 폭·여백은 인라인 스타일로 대신 넣음)
  const cls = (el.getAttribute('class') || '')
    .split(/\s+/)
    .filter((c) => c && !/^(__se|egjs|_)/.test(c))
    .map((c) => (/^se-component/.test(c) ? c.replace(/^se-component/, 'nv-component') : c))
    .join(' ');
  if (cls) el.setAttribute('class', cls);
  else el.removeAttribute('class');
}

const MYEONGJO = FONT_BY_CLASS.nanummyeongjo;
const BARUN = FONT_BY_CLASS.nanumbarungothic;

/** 인용구 6종: 글 정렬·글꼴·장식 (네이버 se.viewer CSS 의 .se-section-quotation.se-l-* 규칙) */
const QUOTE = {
  default: { align: 'center', font: MYEONGJO, spanExtra: 'font-style:italic', box: 'padding:31px 0' },
  quotation_line: { align: 'left', font: SE_FONT, box: 'padding:0 20px' },
  quotation_bubble: { align: 'center', font: MYEONGJO, spanExtra: 'font-weight:700', box: 'max-width:460px;padding:22px 21px 27px;border:5px solid #e4e4e4;margin-bottom:24px' },
  quotation_underline: { align: 'left', font: MYEONGJO, box: 'padding:35px 0 20px;border-bottom:1px solid #9b9b9b' },
  quotation_postit: { align: 'center', font: BARUN, box: 'max-width:460px;padding:33px;border:4px solid #d5d5d5' },
  quotation_corner: { align: 'center', font: BARUN, box: 'max-width:460px;padding:38px 36px' },
};

const MARK = "position:absolute;display:block;width:30px;height:18px;overflow:hidden;font:700 46px/36px Georgia,'Times New Roman',serif;color:rgb(200,200,200);text-align:center";

/** 네이버가 CSS(::before/::after)로 그리는 장식은 복사해도 안 따라오므로 실제 요소로 넣는다 */
function quoteDecorations(variant) {
  switch (variant) {
    case 'default':
      return [`<span style="${MARK};top:0;left:0;right:0;margin:auto">“</span>`, `<span style="${MARK};bottom:0;left:0;right:0;margin:auto">”</span>`];
    case 'quotation_line':
      return ['<span style="position:absolute;top:0;bottom:0;left:0;border-left:6px solid #515151"></span>', ''];
    case 'quotation_bubble':
      return ['', '<span style="position:absolute;top:100%;left:30%;width:16px;height:16px;margin-top:-6px;background:#fff;border-right:5px solid #e4e4e4;border-bottom:5px solid #e4e4e4;transform:rotate(45deg)"></span>'];
    case 'quotation_underline':
      return [`<span style="${MARK};top:0;left:0">“</span>`, ''];
    case 'quotation_corner':
      return [
        '<span style="position:absolute;top:0;left:0;width:26px;height:26px;border:solid #4a4a4a;border-width:6px 0 0 6px;box-sizing:border-box"></span>',
        '<span style="position:absolute;bottom:0;right:0;width:26px;height:26px;border:solid #4a4a4a;border-width:0 6px 6px 0;box-sizing:border-box"></span>',
      ];
    default:
      return ['', ''];
  }
}

function zoneDefaults(ctx) {
  if (ctx.zone === 'caption') return { align: 'center', lineHeight: 1.5, size: '13', font: SE_FONT, color: '#555' };
  if (ctx.zone === 'cite') return { align: QUOTE[ctx.quote]?.align || 'center', lineHeight: 1.5, size: '13', font: SE_FONT };
  if (ctx.zone === 'quote') {
    const q = QUOTE[ctx.quote] || QUOTE.default;
    return { align: q.align, lineHeight: 1.8, size: '19', font: q.font, spanExtra: q.spanExtra };
  }
  return { align: 'left', lineHeight: 1.8, size: '15', font: SE_FONT };
}

/** 요소 하나에 "붙여넣었을 때의 서식"을 입힌다 */
function styleElement(el, ctx) {
  const tag = el.rawTagName.toLowerCase();
  const kept = [];

  // 영역별 기본값 (네이버 se.viewer CSS 기준): 일반 글 / 이미지 캡션 / 인용구 / 인용구 출처
  const zone = zoneDefaults(ctx);

  if (tag === 'p' && hasClass(el, 'se-text-paragraph')) {
    const cls = el.getAttribute('class') || '';
    const align = (cls.match(/align-(center|right|justify|left)/) || [])[1] || zone.align;
    const lh = sourceStyle(el, ['line-height'])[0] || `line-height:${zone.lineHeight}`;
    el.setAttribute('style', `${RESET};font-size:11px;${lh};word-break:break-word;overflow-wrap:break-word;white-space:break-spaces;text-align:${align}`);
    return;
  }

  if (tag === 'span') {
    const cls = el.getAttribute('class') || '';
    const hasSeClass = /se-f[sf]-/.test(cls);
    const size = (cls.match(/se-fs-fs(\d+)/) || [])[1] || (hasSeClass ? zone.size : '');
    const ff = (cls.match(/se-ff-([a-z]+)/) || [])[1];
    const own = sourceStyle(el, ['color', 'background-color']);
    kept.push(...own);
    if (zone.color && !own.some((x) => x.startsWith('color:'))) kept.push(`color:${zone.color}`);
    if (size) kept.push(`font-size:${size}px`);
    const family = ff && ff !== 'system' ? FONT_BY_CLASS[ff] : !ff && hasSeClass ? zone.font : '';
    if (family) kept.push(`font-family:${family}`);
    if (zone.spanExtra) kept.push(zone.spanExtra);
    if (kept.length) el.setAttribute('style', kept.join(';'));
    else el.removeAttribute('style');
    return;
  }

  if (tag === 'img') {
    const a = el.closest('a');
    const data = parseLinkData(a);
    const sticker = hasClass(el, 'se-sticker-image');
    // 움직이는 사진(GIF)은 미리 넣어 둔 원본 GIF 주소를 그대로 쓴다 (linkData.src 는 56px 짜리 작은 판이라 쓰면 안 됨)
    const isGif = el.getAttribute('data-nv-gif') === '1';
    const src = isGif ? decode(el.getAttribute('src') || '') : bestImageUrl(el, sticker ? null : data);
    if (isGif) ctx.gifs += 1;
    el.setAttribute('src', src);
    if (src) ctx.images.push(src);
    el.removeAttribute('data-lazy-src');
    if (sticker) {
      // 네이버 스티커 표시 크기(높이 160px). 좁은 화면에서도 비율이 깨지지 않게 폭은 자동
      el.setAttribute('style', 'border:0;margin:0 auto;padding:0;display:block;position:relative;height:160px;width:auto;max-width:100%;object-fit:contain');
    } else {
      // 네이버가 이 이미지에 준 표시 폭(섹션 max-width)까지만 커지고, 화면이 좁으면 화면 폭에 맞춰 줄어든다
      const sectionStyle = el.closest('.se-section')?.getAttribute('style') || '';
      const cap = (sectionStyle.match(/max-width:\s*(\d+)px/) || [])[1];
      const maxW = cap ? `min(100%,${cap}px)` : '100%';
      // 움직이는 사진은 원본이 작아도(예: 282px) 네이버처럼 칸 폭에 꽉 차게 보여 준다
      const gifWidth = isGif ? 'width:100%;' : '';
      el.setAttribute('style', `border:0;margin:0 auto;padding:0;display:block;position:relative;${gifWidth}max-width:${maxW};height:auto`);
    }
    if (!el.getAttribute('alt')) el.setAttribute('alt', '');
    return;
  }

  if (tag === 'a') {
    if (hasClass(el, 'se-module-image-link')) {
      const data = parseLinkData(el);
      let link = data?.linkUse === 'true' && /^https?:\/\//i.test(data.link || '') ? data.link : '';
      // 사진에 걸린 우리 사이트 링크는 뗀다. 남겨 두면 관리자 편집기가 사진을 홈 링크 카드로 바꿔 버린다.
      if (link && isOwnSiteUrl(link)) {
        link = '';
        ctx.ownLinks += 1;
      }
      if (link) {
        el.setAttribute('href', link);
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
        ctx.links.push(link);
      } else el.removeAttribute('href');
      el.setAttribute('style', `text-decoration:none;${RESET};position:relative;display:block`);
    } else {
      const href = decode(el.getAttribute('href') || '');
      if (/^https?:\/\//i.test(href)) {
        el.setAttribute('href', href);
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
        ctx.links.push(href);
      } else el.removeAttribute('href');
    }
    return;
  }

  if (tag === 'hr') {
    el.setAttribute('style', 'display:block;margin:0 auto;border:0;width:100%;max-width:693px;height:1px;background-color:rgb(221,221,221)');
    return;
  }

  if (tag === 'blockquote') {
    const q = QUOTE[ctx.quote] || QUOTE.default;
    el.setAttribute('style', `margin:auto;border:0;quotes:none;position:relative;box-sizing:border-box;${q.box}`);
    return;
  }

  if (tag === 'td' || tag === 'th') {
    el.setAttribute('style', ['border:1px solid rgb(221,221,221)', 'padding:6px 8px', ...sourceStyle(el, ['width', 'height', 'background-color'])].join(';'));
    return;
  }
  if (tag === 'table') {
    el.setAttribute('style', 'border-collapse:collapse;width:100%;margin:0 auto');
    return;
  }

  if (tag === 'div') {
    if (hasClass(el, 'se-component-content')) {
      // 사이트 CSS 가 .se-component-content 의 좌우 여백을 0 으로 덮어쓰던 것과 같은 결과
      el.setAttribute('style', 'margin:0 auto;padding:0;border:0;width:100%;max-width:100%;box-sizing:border-box');
    } else if (hasClass(el, 'se-section-horizontalLine') || hasClass(el, 'se-section-image')) {
      el.setAttribute('style', ['margin:0 auto', 'padding:0', 'border:0', ...sourceStyle(el, ['max-width'])].join(';'));
    } else if (hasClass(el, 'se-section-quotation')) {
      el.setAttribute('style', 'margin:0 auto;padding:10px 0;border:0');
    } else if (hasClass(el, 'se-section-sticker')) {
      el.setAttribute('style', 'margin:0 auto;padding:0;border:0;display:table');
    } else if (hasClass(el, 'se-module-horizontalLine')) {
      el.setAttribute('style', 'margin:0;padding:30px 0 29px;border:0;width:100%;max-width:693px');
    } else if (hasClass(el, 'se-imageStrip-container')) {
      el.setAttribute('style', `${RESET};padding:0 5px 0 0;font-size:0;position:relative;white-space:nowrap`);
    } else if (hasClass(el, 'se-caption')) {
      el.setAttribute('style', 'margin:10px auto 20px;padding:0;border:0');
    } else if (hasClass(el, 'se-cite')) {
      el.setAttribute('style', 'margin:20px 0 0;padding:0;border:0');
    } else if (hasClass(el, 'se-module-image')) {
      el.setAttribute('style', [RESET, 'position:relative', 'display:block', ...sourceStyle(el, ['width'])].join(';'));
    } else {
      el.setAttribute('style', RESET);
    }
    return;
  }

  // b, u, i, strike, sup, sub, br … 는 그대로
  el.removeAttribute('style');
}

function walk(el, ctx) {
  for (const child of [...el.childNodes]) {
    if (child.nodeType !== 1) continue;
    const tag = child.rawTagName?.toLowerCase();
    if (tag === 'script' || tag === 'style' || tag === 'iframe' || tag === 'button') {
      child.remove();
      continue;
    }
    const prevZone = ctx.zone;
    if (hasClass(child, 'se-caption')) ctx.zone = 'caption';
    else if (hasClass(child, 'se-cite')) ctx.zone = 'cite';
    else if (hasClass(child, 'se-quote')) ctx.zone = 'quote';
    styleElement(child, ctx);
    stripAttrs(child);
    walk(child, ctx);
    ctx.zone = prevZone;
    // 인용구 장식(따옴표·세로줄·모서리·말풍선 꼬리)을 실제 요소로 넣는다
    if (tag === 'blockquote') {
      const [before, after] = quoteDecorations(ctx.quote);
      child.set_content(before + child.innerHTML + after);
    }
  }
}

/** 사이트(관리자 에디터)와 같은 링크카드 마크업 */
export function linkCardHtml({ url, title, desc, image }) {
  let domain = '';
  try {
    domain = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    /* ignore */
  }
  const u = esc(url);
  const media = image
    ? `<tr><td class="link-card-media" style="padding:0;margin:0;line-height:0;font-size:0;background-color:#f3f4f6;background-image:url('${esc(image)}');background-repeat:no-repeat;background-position:center center;background-size:cover;"><a href="${u}" target="_blank" rel="noopener noreferrer" style="display:block;text-decoration:none;line-height:0;"><span class="link-card-media-spacer" style="display:block;width:100%;padding-top:56%;height:0;overflow:hidden;font-size:0;line-height:0;">&nbsp;</span></a></td></tr>`
    : '';
  const descHtml = desc
    ? `<a class="link-card-desc" href="${u}" target="_blank" rel="noopener noreferrer" style="display:block;margin-top:6px;font-size:13px;line-height:1.45;color:#666666;text-decoration:none;">${esc(desc)}</a>`
    : '';
  return `<div class="link-card-block" data-lc-part="card" data-align="center" style="text-align:center;margin:0 0 16px;"><table class="link-card" data-lc="1" data-align="center" data-url="${u}" data-title="${esc(title)}" data-desc="${esc(desc)}" data-image="${esc(image)}" data-domain="${esc(domain)}" cellpadding="0" cellspacing="0" border="0" contenteditable="false" style="display:table;width:400px;max-width:100%;margin:0 auto;border:1px solid #e5e8eb;border-radius:10px;border-collapse:separate;border-spacing:0;overflow:hidden;background:#ffffff;text-align:left;table-layout:fixed;"><tbody>${media}<tr><td class="link-card-body" style="padding:14px 16px 16px;margin:0;background:#ffffff;text-align:left;vertical-align:top;"><a class="link-card-title" href="${u}" target="_blank" rel="noopener noreferrer" style="display:block;font-size:16px;font-weight:700;line-height:1.4;color:#222222;text-decoration:none;">${esc(title || url)}</a>${descHtml}<a class="link-card-domain" href="${u}" target="_blank" rel="noopener noreferrer" style="display:block;margin-top:6px;font-size:12px;line-height:1.4;color:#2e9e4d;text-decoration:none;">${esc(domain)}</a></td></tr></tbody></table></div>`;
}

function convertOglink(comp, ctx, top) {
  const a = comp.querySelector('a.se-oglink-info') || comp.querySelector('a');
  const url = decode(a?.getAttribute('href') || '');
  if (!/^https?:\/\//i.test(url)) return '';
  const img = comp.querySelector('img.se-oglink-thumbnail-resource');
  let image = decode(img?.getAttribute('src') || '');
  const m = image.match(/[?&]src=%22([^&]+?)%22/i) || image.match(/[?&]src="([^"&]+)"/i);
  if (m) image = decodeURIComponent(m[1]);
  if (image) ctx.images.push(image);
  ctx.links.push(url);
  const card = linkCardHtml({
    url,
    title: decode(comp.querySelector('.se-oglink-title')?.text || '').trim(),
    desc: decode(comp.querySelector('.se-oglink-summary')?.text || '').trim(),
    image,
  });
  return `<div class="nv-component se-linkcard" style="margin:${top}px 0 0;${COMPONENT_BASE}">${card}</div>`;
}

const SUPPORTED = new Set(['text', 'image', 'imageStrip', 'imageGroup', 'sticker', 'quotation', 'horizontalLine', 'table', 'oglink']);

export async function fetchNaverPost(rawUrl) {
  const { blogId, logNo } = parseNaverUrl(rawUrl);
  const viewUrl = `https://blog.naver.com/PostView.naver?blogId=${encodeURIComponent(blogId)}&logNo=${logNo}`;
  const res = await fetch(viewUrl, { headers: { 'User-Agent': UA, Referer: 'https://blog.naver.com/' } });
  if (!res.ok) throw new Error(`네이버 글을 불러오지 못했습니다 (${res.status})`);
  const doc = parse(await res.text(), { comment: false });

  const main = doc.querySelector('.se-main-container');
  if (!main) throw new Error('본문을 찾지 못했습니다. 비공개 글이거나 구버전 에디터 글일 수 있습니다.');

  const title =
    decode(doc.querySelector('.se-documentTitle .se-title-text')?.text || '').replace(/​/g, '').trim() ||
    decode(doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || '').trim();

  const text = decode(main.text.replace(/\s+/g, ' ').trim()).replace(/​/g, '');
  const ctx = { images: [], links: [], skipped: [], zone: 'text', quote: 'default', gifs: 0, ownLinks: 0 };

  // 네이버는 움직이는 사진(GIF)을 화면에 낼 때 <video class="_gifmp4"> 영상으로 바꿔 내보낸다.
  // 영상은 사진 복사 단계에서 "이미지가 아님"으로 빠지므로, 옆에 적힌 원본 GIF 주소의 <img> 로 되돌린다.
  for (const v of main.querySelectorAll('video')) {
    const gif = decode(v.getAttribute('data-gif-url') || '');
    if (!/^https?:\/\//i.test(gif)) continue;
    v.replaceWith(`<img src="${gif.replace(/"/g, '&quot;')}" class="se-image-resource" data-nv-gif="1" alt="">`);
  }
  const blocks = [];
  let prevKind = '';
  const comps = main.querySelectorAll('.se-component').filter((c) => !c.parentNode?.closest?.('.se-component'));
  for (const comp of comps) {
    const kind = kindOf(comp);
    if (kind === 'documentTitle') continue;
    if (!SUPPORTED.has(kind)) {
      ctx.skipped.push(kind || 'unknown'); // 영상·지도·코드 등
      continue;
    }
    const top = marginTop(kind, prevKind);
    prevKind = kind;
    if (kind === 'oglink') {
      const html = convertOglink(comp, ctx, top);
      if (html) blocks.push(html);
      continue;
    }
    // 인용구 종류: se-l-default / se-l-quotation_line / _bubble / _underline / _postit / _corner
    ctx.quote = ((comp.getAttribute('class') || '').match(/se-l-(default|quotation_[a-z]+)/) || [])[1] || 'default';
    ctx.zone = 'text';
    walk(comp, ctx);
    stripAttrs(comp);
    comp.setAttribute('style', `margin:${top}px 0 0;${COMPONENT_BASE}`);
    blocks.push(comp.outerHTML.replace(/\n\s*/g, ''));
  }

  return {
    blogId,
    logNo,
    title,
    // 폭 제한·글자 크기 고정은 감싸는 div 에 직접 적는다 → 관리자 편집기에서 다시 저장해도 남는다.
    // <style> 블록(웹폰트)은 편집기가 지울 수 있으므로, 없어져도 서식이 깨지지 않는 보조용으로만 둔다.
    body: `${RESPONSIVE_HEAD}<div class="nvp" style="${WRAPPER_STYLE}">\n${blocks.join('\n')}\n</div>`,
    images: [...new Set(ctx.images)],
    links: [...new Set(ctx.links)],
    skipped: ctx.skipped,
    gifs: ctx.gifs,
    ownLinksRemoved: ctx.ownLinks,
    description: text.slice(0, 150),
  };
}
