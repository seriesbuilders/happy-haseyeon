/**
 * 네이버 [출처]/블로그URL + 제품카드 URL줄 제거 테스트
 */
import { JSDOM } from 'jsdom';
import { createRequire } from 'module';
import assert from 'assert';

const require = createRequire(import.meta.url);
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.document = dom.window.document;
globalThis.NodeFilter = dom.window.NodeFilter;
globalThis.Node = dom.window.Node;

const api = require('../js/naver-paste-sanitize.js');

function plain(html) {
  return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

let passed = 0;

{
  // 1+3: 본문 + 출처원문 이중 + 블로그 주소
  const html = `
<p>본문 첫 문단입니다. 효과가 좋았습니다.</p>
<p>본문 둘째 문단입니다.</p>
<p><b>[출처]</b></p>
<p><a href="https://blog.naver.com/seoyoungene_/224388671886">[팔자주름] 원문 제목...</a> | 작성자 행복하서연</p>
<p>https://blog.naver.com/PostView.naver?blogId=seoyoungene_&logNo=224388671886</p>
<p>출처원문 추가 본문이 또 들어옴</p>
`;
  const out = api.sanitizePastedHtml(html);
  const text = plain(out);
  assert.ok(text.includes('본문 첫 문단'), 'keep body');
  assert.ok(!/출처/.test(text), 'no 출처: ' + text);
  assert.ok(!/blog\.naver\.com/i.test(out), 'no blog url');
  assert.ok(!/출처원문/.test(text), 'no source original body');
  passed++;
  console.log('OK body keeps, source original stripped');
}

{
  // product card HTML with url line should not be stripped by sanitize
  const productUrl = 'https://repurely.com/surl/P/100';
  const html = `
<p>하루만 올려둘게요.</p>
<div class="link-card-block">
  <table class="link-card" data-url="${productUrl}" data-domain="repurely.com" data-image="https://img.example/a.jpg">
    <tr><td class="link-card-media"></td></tr>
    <tr><td><a class="link-card-title" href="${productUrl}">올레놀샷</a></td></tr>
  </table>
</div>
`;
  const out = api.sanitizePastedHtml(html);
  assert.ok(out.includes('link-card'), 'keep product card');
  assert.ok(out.includes('repurely.com'), 'keep product domain in card attrs');
  passed++;
  console.log('OK product card kept');
}

{
  // 제품 카드 바로 아래 [출처]|작성자 잔여 → 제거, 카드는 유지
  const productUrl = 'https://repurely.com/surl/P/100';
  const html = `
<p>딱 하루만 링크 올려둘게요.</p>
<div class="link-card-block" data-url="${productUrl}" data-domain="repurely.com">
  <table class="link-card" data-url="${productUrl}" data-domain="repurely.com">
    <tr><td class="link-card-media"></td></tr>
    <tr><td><a class="link-card-title" href="${productUrl}">올레놀샷 NMN</a></td></tr>
  </table>
</div>
<p>[출처] [팔자주름 셀프해결법] 70대 친정엄마 피부과 도움 없이 팔자주름 없애고 20년 회춘하심!! 효과 대박...|작성자 행복하서연</p>
`;
  const out = api.sanitizePastedHtml(html);
  const text = plain(out);
  assert.ok(out.includes('link-card'), 'keep card beside citation');
  assert.ok(out.includes('올레놀샷'), 'keep card title');
  assert.ok(!/\[\s*출처\s*\]/.test(text), 'strip citation label: ' + text);
  assert.ok(!/작성자\s*행복하서연/.test(text), 'strip author: ' + text);
  passed++;
  console.log('OK citation under product card stripped');
}

{
  // 네이버 OG 모듈에 utm 제품 URL이 있으면 삭제하지 말고 <a>로 보존
  const utm =
    'https://repurely.com/surl/P/100?utm_source=k&utm_medium=k&utm_campaign=k_i_b_o_l_0622_1';
  const html = `
<div class="se-component se-oglink">
  <div class="se-module se-module-oglink">
    <a href="${utm.replace(/&/g, '&amp;')}" class="se-oglink-info">제품 보기</a>
  </div>
</div>
`;
  const out = api.sanitizePastedHtml(html);
  assert.ok(!/se-oglink|se-module-oglink/i.test(out), 'og module removed');
  assert.ok(/repurely\.com\/surl\/P\/100/i.test(out), 'product url kept: ' + out);
  assert.ok(/utm_source=k/i.test(out.replace(/&amp;/g, '&')), 'utm kept: ' + out);
  assert.ok(/<a\b[^>]*href=/i.test(out), 'anchor present');
  passed++;
  console.log('OK utm product oglink salvaged');
}

{
  assert.ok(api.isNaverBlogUrl('https://blog.naver.com/a/1'));
  assert.ok(!api.isNaverBlogUrl('https://repurely.com/surl/P/100'));
  passed++;
  console.log('OK url classifiers');
}

console.log(`\nAll ${passed} tests passed.`);
