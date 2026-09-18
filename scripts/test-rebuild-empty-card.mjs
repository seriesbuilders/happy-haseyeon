/**
 * 빈 link-card-block + data-url 복구 검증
 * 실행: node scripts/test-rebuild-empty-card.mjs
 */
import { pathToFileURL } from 'url';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { rebuildEmptyLinkCards, sanitizePostBodyHtml } = await import(
  pathToFileURL(join(root, 'functions/_body.js')).href
);

const empty =
  `<p>본문</p>` +
  `<div class="link-card-block" data-lc="1" data-lc-part="card" data-align="center" data-url="https://repurely.com/surl/P/100" data-title="리퓨얼리 제품" data-desc="설명" data-image="https://example.com/a.jpg" data-domain="repurely.com" style="text-align:center;margin:0 0 16px;"></div>` +
  `<p>끝</p>`;

const rebuilt = sanitizePostBodyHtml(empty);
const checks = [
  ['keeps body', /본문/],
  ['keeps end', /끝/],
  ['rebuilds table', /<table\b[^>]*\blink-card\b/i],
  ['keeps url', /data-url="https:\/\/repurely\.com\/surl\/P\/100"/],
  ['keeps title', /리퓨얼리 제품/],
  ['no empty block left', /link-card-block[^>]*>\s*<table/i],
];

let failed = 0;
for (const [name, re] of checks) {
  const ok = re.test(rebuilt);
  console.log(`${ok ? 'OK' : 'FAIL'} ${name}`);
  if (!ok) failed++;
}

const direct = rebuildEmptyLinkCards(empty);
if (!/<table\b[^>]*\blink-card\b/i.test(direct)) {
  console.log('FAIL rebuildEmptyLinkCards direct');
  failed++;
} else {
  console.log('OK rebuildEmptyLinkCards direct');
}

const hollow =
  `<p>본문</p>` +
  `<div class="link-card-block" data-lc="1" data-url="https://repurely.com/surl/P/100" data-title="올레놀샷 NMN" data-desc="환불" data-image="https://example.com/a.jpg" data-domain="repurely.com">` +
  `<table class="link-card" data-url="https://repurely.com/surl/P/100" data-title="올레놀샷 NMN" data-domain="repurely.com"><tbody></tbody></table>` +
  `</div>` +
  `<p>끝</p>`;

const hollowOut = sanitizePostBodyHtml(hollow);
const hollowChecks = [
  ['hollow keeps body', /본문/],
  ['hollow rebuilds title', /올레놀샷 NMN/],
  ['hollow has media or title class', /link-card-title/],
  ['hollow keeps end', /끝/],
];
for (const [name, re] of hollowChecks) {
  const ok = re.test(hollowOut);
  console.log(`${ok ? 'OK' : 'FAIL'} ${name}`);
  if (!ok) failed++;
}

if (failed) {
  console.error(rebuilt.slice(0, 500));
  console.error('--- hollow ---');
  console.error(hollowOut.slice(0, 500));
  process.exit(1);
}
console.log('all passed');
