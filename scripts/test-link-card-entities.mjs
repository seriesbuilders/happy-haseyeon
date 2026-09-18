/**
 * 링크카드 HTML 엔티티 디코드 테스트
 */
function decodeHtmlEntities(s) {
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

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const raw =
  "사용 후 불만족시 100% 환불 보장! 국.내.최.초 &#039;바르는 올레샷&#039; ✅지중해 3국 올리브";
const decoded = decodeHtmlEntities(raw);
if (decoded.includes('&#039;') || decoded.includes('&#39;')) {
  throw new Error('decode failed: ' + decoded);
}
if (!decoded.includes("'바르는 올레샷'")) {
  throw new Error('quote missing: ' + decoded);
}
const rendered = escapeHtml(decoded);
if (rendered.includes('&amp;#039;') || rendered.includes('&#039;')) {
  throw new Error('double escape: ' + rendered);
}
console.log('OK entity decode:', decoded.slice(0, 60));

// 이중 인코딩도 복구
const double = escapeHtml(raw); // &amp;#039;
const fixed = escapeHtml(decodeHtmlEntities(double));
if (fixed.includes('&amp;#') || fixed.includes('&#039;')) {
  throw new Error('double still broken: ' + fixed);
}
console.log('OK double-encoded recovery');
console.log('All entity tests passed');
