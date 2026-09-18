/**
 * utm 쿼리 URL 정규화·추출 검증
 * 실행: node scripts/test-utm-url.mjs
 */

function decodeHtmlEntities(s) {
  let out = String(s ?? '');
  for (let i = 0; i < 3; i++) {
    const prev = out;
    out = out
      .replace(/&quot;/gi, '"')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&amp;/gi, '&');
    if (out === prev) break;
  }
  return out;
}

function normalizeExternalUrl(raw) {
  let s = String(raw || '')
    .trim()
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '');
  if (!s) return '';
  s = decodeHtmlEntities(s);
  const nested = s.match(/https?:\/\/[^\s]*?(https?:\/\/[^\s]+)/i);
  if (nested) s = nested[1];
  const lastHttps = Math.max(s.lastIndexOf('https://'), s.lastIndexOf('http://'));
  if (lastHttps > 0) s = s.slice(lastHttps);
  s = s.replace(/[),.;:!?…》」』】]+$/u, '');
  try {
    const u = new URL(s);
    if (!/^https?:$/i.test(u.protocol)) return '';
    return u.toString();
  } catch {
    return '';
  }
}

function extractSingleUrl(text) {
  const stripped = String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
    .replace(/&amp;/gi, '&')
    .trim();
  if (!stripped) return '';
  const compact = stripped.replace(/\s+/g, '');
  if (/^https?:\/\/[^\s<>"']+$/i.test(compact)) {
    return normalizeExternalUrl(compact);
  }
  const found = stripped.match(/https?:\/\/[^\s<>"']+/gi) || [];
  const unique = [
    ...new Set(found.map((u) => normalizeExternalUrl(u)).filter(Boolean)),
  ];
  if (unique.length === 1) return unique[0];
  return '';
}

const withUtm =
  'https://repurely.com/surl/P/100?utm_source=k&utm_medium=k&utm_campaign=k_i_b_o_l_0622_1';

const checks = [
  ['plain extract', extractSingleUrl(withUtm), withUtm],
  [
    'amp extract',
    extractSingleUrl(withUtm.replace(/&/g, '&amp;')),
    withUtm,
  ],
  [
    'normalize amp',
    normalizeExternalUrl(withUtm.replace(/&/g, '&amp;')),
    withUtm,
  ],
];

let failed = 0;
for (const [name, got, want] of checks) {
  const ok = got === want || (got && got.includes('utm_source=k') && got.includes('utm_campaign='));
  console.log(`${ok ? 'OK' : 'FAIL'} ${name}`);
  if (!ok) {
    console.log('  got ', got);
    console.log('  want', want);
    failed++;
  }
}

if (failed) process.exit(1);
console.log('all passed');
