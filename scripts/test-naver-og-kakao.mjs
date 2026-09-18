/**
 * 네이버 블로그 OG가 카카오톡형(제목+본문썸네일)인지 검증
 * link-preview.js 로직을 복제 호출
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// Worker 모듈은 직접 import가 어려워 핵심 추출 로직만 인라인 검증
const BLOG = 'https://blog.naver.com/seoyoungene_/224388671886';
const fetchUrl =
  'https://blog.naver.com/PostView.naver?blogId=seoyoungene_&logNo=224388671886&redirect=Dlog&widgetTypeCall=true&noTrackingCode=true';

function decodeHtml(s) {
  let out = String(s ?? '');
  for (let i = 0; i < 3; i++) {
    const prev = out;
    out = out
      .replace(/&quot;/gi, '"')
      .replace(/&#x3D;/gi, '=')
      .replace(/&amp;/gi, '&');
    if (out === prev) break;
  }
  return out;
}

function pickMeta(html, prop) {
  const a = html.match(
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`,
      'i'
    )
  );
  const b = html.match(
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`,
      'i'
    )
  );
  return (a && a[1]) || (b && b[1]) || '';
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

function isGeneric(url) {
  return /ssl\.pstatic\.net\/static\/blog\/icon\/og_/i.test(url || '');
}

function extractNaverPostImage(html) {
  const decoded = decodeHtml(html);
  const candidates = [];
  const push = (raw) => {
    if (!raw) return;
    let u = String(raw).replace(/\\\//g, '/').trim();
    u = unwrapDthumbSrc(u);
    u = decodeHtml(u).replace(/^["']|["']$/g, '').trim();
    if (!/^https?:\/\//i.test(u) || isGeneric(u)) return;
    if (/blogimgs\.pstatic\.net|static\/blog\/icon/i.test(u)) return;
    candidates.push(u);
  };
  let m;
  const re = /"thumbnailUrl"\s*:\s*"([^"]+)"/gi;
  while ((m = re.exec(decoded))) push(m[1]);
  const dthumbRe = /dthumb-phinf\.pstatic\.net\/\?[^"'<\s]*?\bsrc=([^&"'<\s]+)/gi;
  while ((m = dthumbRe.exec(decoded))) {
    try {
      push(decodeURIComponent(m[1]));
    } catch {
      push(m[1]);
    }
  }
  return candidates[0] || '';
}

const res = await fetch(fetchUrl, {
  headers: {
    'User-Agent':
      'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    Accept: 'text/html',
  },
});
const html = await res.text();
const title = pickMeta(html, 'og:title');
const ogImage = pickMeta(html, 'og:image');
const image = (!ogImage || isGeneric(ogImage) ? extractNaverPostImage(html) : ogImage) || ogImage;

console.log('title', title.slice(0, 80));
console.log('og:image', ogImage.slice(0, 80));
console.log('resolved image', image.slice(0, 120));

if (!/팔자주름/.test(title)) {
  console.error('FAIL title should be post title');
  process.exit(1);
}
if (isGeneric(image)) {
  console.error('FAIL image still generic');
  process.exit(1);
}
if (!/repurely\.com|blogfiles\.pstatic|postfiles/i.test(image)) {
  console.error('FAIL unexpected image', image);
  process.exit(1);
}
console.log('OK naver og matches kakao-like title+thumb');
void BLOG;
void readFileSync;
void root;
