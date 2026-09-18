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
  assert.ok(api.isNaverBlogUrl('https://blog.naver.com/a/1'));
  assert.ok(!api.isNaverBlogUrl('https://repurely.com/surl/P/100'));
  passed++;
  console.log('OK url classifiers');
}

console.log(`\nAll ${passed} tests passed.`);
