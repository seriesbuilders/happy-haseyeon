/**
 * 에디터 저장 HTML ↔ 공개 페이지 sanitize 패리티 검증
 * 실행: node scripts/test-link-save-parity.mjs
 */
import { pathToFileURL } from 'url';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { JSDOM } from 'jsdom';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.document = dom.window.document;
globalThis.NodeFilter = dom.window.NodeFilter;
globalThis.Node = dom.window.Node;

const Naver = require('../js/naver-paste-sanitize.js');
const { sanitizePostBodyHtml, rebuildEmptyLinkCards } = await import(
  pathToFileURL(join(root, 'functions/_body.js')).href
);

const UTM =
  'https://repurely.com/surl/P/100?utm_source=k&utm_medium=k&utm_campaign=k_i_b_o_l_0622_1';
const UTM_ESC = UTM.replace(/&/g, '&amp;');

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** admin buildLinkCardHtml 핵심과 동일 구조 */
function buildFullCard({ url, title, description, image, domain }) {
  const safeUrl = escapeHtml(url);
  const safeTitle = escapeHtml(title);
  const safeDesc = escapeHtml(description || '');
  const safeImage = escapeHtml(image || '');
  const safeDomain = escapeHtml(domain);
  const media =
    `<td class="link-card-media" style="background-image:url('${safeImage}')">` +
    `<a href="${safeUrl}"><span class="link-card-media-spacer">&nbsp;</span></a></td>`;
  const table =
    `<table class="link-card" data-lc="1" data-url="${safeUrl}" data-title="${safeTitle}" data-desc="${safeDesc}" data-image="${safeImage}" data-domain="${safeDomain}">` +
    `<tbody><tr>${media}</tr><tr><td class="link-card-body">` +
    `<a class="link-card-title" href="${safeUrl}">${safeTitle}</a>` +
    (description
      ? `<a class="link-card-desc" href="${safeUrl}">${safeDesc}</a>`
      : '') +
    `<a class="link-card-domain" href="${safeUrl}">${safeDomain}</a>` +
    `</td></tr></tbody></table>`;
  return (
    `<div class="link-card-block" data-lc="1" data-url="${safeUrl}" data-title="${safeTitle}" data-desc="${safeDesc}" data-image="${safeImage}" data-domain="${safeDomain}">` +
    table +
    `</div>`
  );
}

/** 저장 직전 prepareLinkCardsHtml 과 동일한 출처 제거 + 빈카드는 서버에 맡김 */
function editorPrepareLike(html) {
  const doc = new DOMParser().parseFromString(
    `<div id="__root__">${html}</div>`,
    'text/html'
  );
  const root = doc.getElementById('__root__');
  Naver.stripNaverSourceCitation(root);
  // 카드 다음 출처 형제
  for (const block of [...root.querySelectorAll('.link-card-block')]) {
    let sib = block.nextElementSibling;
    let g = 0;
    while (sib && g++ < 6) {
      const next = sib.nextElementSibling;
      const t = (sib.textContent || '').replace(/\s+/g, ' ').trim();
      if (!t) {
        sib = next;
        continue;
      }
      if (Naver.isCitationText(t) || /\[\s*출처\s*\]/.test(t)) {
        sib.remove();
        sib = next;
        continue;
      }
      break;
    }
  }
  return root.innerHTML;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function hasTitle(html) {
  return /link-card-title/i.test(html);
}
function hasUtm(html) {
  const s = html.replace(/&amp;/g, '&');
  return /utm_source=k/i.test(s) && /utm_campaign=/i.test(s);
}
function hasSource(html) {
  return /\[\s*출처\s*\]|작성자\s*행복하서연/i.test(html.replace(/<[^>]+>/g, ' '));
}

let n = 0;
function ok(name) {
  n++;
  console.log(`OK ${name}`);
}

// 1) 정상 카드 + 출처 → 에디터 prepare 후 공개 sanitize
{
  const intro = '<p>딱 하루만 링크 올려둘게요.</p>';
  const card = buildFullCard({
    url: UTM,
    title: '올레놀샷 NMN 포뮬러 - Re:purely',
    description: '사용 후 불만족시 100% 환불 보장!',
    image: 'https://repurely.com/web/product/big/a.png',
    domain: 'repurely.com',
  });
  const cite =
    '<p>[출처] [팔자주름 셀프해결법] 효과 대박...|작성자 행복하서연</p>';
  const editorHtml = intro + card + cite;

  const saved = editorPrepareLike(editorHtml); // ≈ prepareLinkCardsHtml
  assert(hasTitle(saved), 'editor prepare keeps title');
  assert(hasUtm(saved), 'editor prepare keeps utm');
  assert(!hasSource(saved), 'editor prepare strips 출처: ' + saved.slice(0, 300));

  const published = sanitizePostBodyHtml(saved); // 공개 페이지
  assert(hasTitle(published), 'public keeps title');
  assert(hasUtm(published), 'public keeps utm');
  assert(!hasSource(published), 'public strips 출처');
  ok('full card + citation: editor==public');
}

// 2) SunEditor가 속을 비운 껍질(+utm data-url) → 저장본 → 공개 복구
{
  const hollow =
    `<p>본문</p>` +
    `<div class="link-card-block" data-lc="1" data-url="${UTM_ESC}" data-title="올레놀샷 NMN" data-desc="환불" data-image="https://example.com/a.jpg" data-domain="repurely.com">` +
    `<table class="link-card" data-url="${UTM_ESC}" data-title="올레놀샷 NMN" data-domain="repurely.com"><tbody></tbody></table>` +
    `</div>` +
    `<p>[출처] 남은출처|작성자 행복하서연</p>`;

  // 저장 시 prepare가 출처 제거 + (클라이언트는 빈카드도 재생성하지만)
  // 설령 빈 껍질이 DB에 들어가도 공개 sanitize가 복구해야 함
  const afterEditor = editorPrepareLike(hollow);
  assert(!hasSource(afterEditor), 'hollow: editor strips 출처');

  const published = sanitizePostBodyHtml(
    // DB에 출처 없이 빈 카드만 남은 경우
    afterEditor.includes('link-card-title')
      ? afterEditor
      : rebuildEmptyLinkCards(
          hollow.replace(/<p>\[출처\][\s\S]*?<\/p>/i, '')
        )
  );
  assert(hasTitle(published), 'hollow public rebuilds title: ' + published.slice(0, 400));
  assert(hasUtm(published), 'hollow public keeps utm');
  assert(!hasSource(published), 'hollow public no 출처');
  ok('hollow utm card recovers on public');
}

// 3) 공개 경로만: DB에 출처가 실수로 남은 경우도 제거되어야 함
{
  const dirty =
    buildFullCard({
      url: UTM,
      title: '올레놀샷',
      description: '',
      image: 'https://example.com/a.jpg',
      domain: 'repurely.com',
    }) + '<p>[출처] 테스트|작성자 행복하서연</p>';
  const published = sanitizePostBodyHtml(dirty);
  assert(hasTitle(published), 'dirty db keeps card');
  assert(hasUtm(published), 'dirty db keeps utm');
  assert(!hasSource(published), 'dirty db public strips 출처: ' + published);
  ok('public sanitize strips leftover 출처');
}

// 4) oglink + utm → sanitize → 앵커 보존 (이후 카드 승격 대상)
{
  const html = `
<div class="se-component se-oglink">
  <div class="se-module se-module-oglink">
    <a href="${UTM_ESC}">제품</a>
  </div>
</div>
<p>[출처] x|작성자 행복하서연</p>`;
  const out = Naver.sanitizePastedHtml(html);
  assert(/repurely\.com\/surl\/P\/100/i.test(out), 'paste keeps product');
  assert(/utm_source=k/i.test(out.replace(/&amp;/g, '&')), 'paste keeps utm');
  assert(!/se-oglink/i.test(out), 'paste removes og module');
  assert(!hasSource(out), 'paste strips 출처');
  ok('paste oglink utm salvaged');
}

// 5) getEditorHtml 점수: 빈 API vs 풍부 DOM
{
  const rich = buildFullCard({
    url: UTM,
    title: '올레놀샷',
    description: 'desc',
    image: 'https://example.com/a.jpg',
    domain: 'repurely.com',
  });
  const hollowApi =
    `<div class="link-card-block" data-url="${UTM_ESC}"><table class="link-card" data-url="${UTM_ESC}"><tbody></tbody></table></div>`;
  const score = (html) => {
    const s = String(html || '');
    const tables = (s.match(/<table\b[^>]*\blink-card\b/gi) || []).length;
    const titles = (s.match(/link-card-title/gi) || []).length;
    const media = (s.match(/link-card-media/gi) || []).length;
    const dataUrls = (s.match(/\bdata-url\s*=/gi) || []).length;
    return tables * 10 + titles * 80 + media * 40 + dataUrls * 15 + Math.min(s.length, 80000) / 800;
  };
  assert(score(rich) > score(hollowApi), 'DOM score beats hollow getContents');
  ok('getEditorHtml richness prefers DOM');
}

console.log(`\nAll ${n} parity checks passed.`);
