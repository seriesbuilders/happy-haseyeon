/**
 * 네이버 [출처] + blog.naver.com 임베드 제거 테스트
 * 실행: node scripts/test-naver-source-strip.mjs
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

function assertNoSource(html, label) {
  const text = plain(html);
  assert.ok(!/\[\s*출처\s*\]|［\s*출처\s*］/.test(text), `${label}: [출처] remains`);
  assert.ok(!/\|\s*작성자/.test(text), `${label}: | 작성자 remains`);
}

function assertNoNaverBlog(html, label) {
  const s = String(html);
  assert.ok(!/blog\.naver\.com/i.test(s), `${label}: blog.naver.com remains\n${s.slice(0, 400)}`);
  assert.ok(!/PostView\.naver/i.test(s), `${label}: PostView.naver remains`);
}

function assertKeeps(html, needle, label) {
  assert.ok(String(html).includes(needle), `${label}: missing "${needle}"`);
}

let passed = 0;

{
  const fixtureMid = `
<p style="text-align:center"><b>쫙 펴진 팔자주름이 보증수표입니다.</b></p>
<p>하루만 올려둘게요. (내일 즉시 삭제 예정)</p>
<div style="border:1px dashed #bbb;padding:10px">
  <p><b>[출처]</b></p>
  <p><a href="https://blog.naver.com/seoyoungene_/224388671886">[팔자주름 셀프해결법] 효과 대박...</a> | 작성자 행복하서연</p>
</div>
<p><span style="color:red">※무단 공유 금지※</span></p>
<p>우리 엄마가 팔자주름 때문에</p>
<p><b>딱 4주만에</b> 해결한 비법을</p>
`;
  const out = api.sanitizePastedHtml(fixtureMid);
  assertNoSource(out, 'mid');
  assertNoNaverBlog(out, 'mid');
  assertKeeps(out, '보증수표입니다', 'mid');
  assertKeeps(out, '무단 공유 금지', 'mid');
  assertKeeps(out, '딱 4주만에', 'mid');
  passed++;
  console.log('OK mid source strip');
}

{
  // 고객 스크린샷: 본문 중간에 PostView URL + 링크카드
  const fixtureUrlCard = `
<p>그리고 저희 엄마는 주로 집에 계시다 보니 화장도 잘 안하셔서 틈날 때마다 수시로 덧바르셨거든요.</p>
<p>https://blog.naver.com/PostView.naver?blogId=seoyoungene_&amp;logNo=224411418896&amp;redirect=Dlog&amp;widgetTypeCall=true&amp;topReferer=https%3A%2F%2Fwww.google.com%2F&amp;trackingCode=external&amp;directAccess=false</p>
<p class="link-card-url-line" data-lc-part="url"><a class="link-card-url" href="https://blog.naver.com/PostView.naver?blogId=seoyoungene_&logNo=224411418896">https://blog.naver.com/PostView.naver?blogId=seoyoungene_&logNo=224411418896</a></p>
<div class="link-card-block" data-lc-part="card">
  <table class="link-card" data-lc="1" data-url="https://blog.naver.com/PostView.naver?blogId=seoyoungene_&logNo=224411418896" data-domain="blog.naver.com">
    <tr><td>card</td></tr>
  </table>
</div>
<p>참고로 웬만하면 공식몰에서 구매하세요.</p>
`;
  const out = api.sanitizePastedHtml(fixtureUrlCard);
  assertNoNaverBlog(out, 'url-card');
  assertKeeps(out, '공식몰에서 구매', 'url-card');
  assertKeeps(out, '화장도 잘 안하셔서', 'url-card');
  assert.ok(!/link-card/i.test(out), 'url-card: link-card remains');
  passed++;
  console.log('OK mid blog.naver.com url+card strip');
}

{
  const fixtureOg = `
<p>본문 앞</p>
<div class="se-component se-oglink">
  <div class="se-module se-module-oglink">
    <a href="https://blog.naver.com/foo/123">og</a>
  </div>
</div>
<p>본문 뒤</p>
`;
  const out = api.sanitizePastedHtml(fixtureOg);
  assertNoNaverBlog(out, 'og');
  assertKeeps(out, '본문 앞', 'og');
  assertKeeps(out, '본문 뒤', 'og');
  passed++;
  console.log('OK se-oglink strip');
}

{
  const fixtureAnchor = `
<p>설명 문장입니다.</p>
<p><a href="https://blog.naver.com/seoyoungene_/224411418896">[팔자주름 셀프해결법] 70대...</a></p>
<p>이어지는 문장</p>
`;
  const out = api.sanitizePastedHtml(fixtureAnchor);
  assertNoNaverBlog(out, 'anchor');
  assertKeeps(out, '설명 문장', 'anchor');
  assertKeeps(out, '이어지는 문장', 'anchor');
  passed++;
  console.log('OK standalone naver anchor strip');
}

{
  assert.ok(api.isNaverBlogUrl('https://blog.naver.com/a/1'));
  assert.ok(api.isNaverBlogUrl('https://m.blog.naver.com/a/1'));
  assert.ok(
    api.isNaverBlogUrl(
      'https://blog.naver.com/PostView.naver?blogId=seoyoungene_&logNo=224411418896'
    )
  );
  assert.ok(!api.isNaverBlogUrl('https://shopping.naver.com/item/1'));
  assert.ok(!api.isNaverBlogUrl('https://example.com'));
  passed++;
  console.log('OK isNaverBlogUrl');
}

{
  const body = `<p>이 글의 출처는 임상 결과입니다.</p><p>추가 설명</p>`;
  const out = api.sanitizePastedHtml(body);
  assertKeeps(out, '출처는 임상', 'keep-word');
  passed++;
  console.log('OK keep normal 출처 word');
}

{
  const plainIn = `본문\nhttps://blog.naver.com/PostView.naver?blogId=x&logNo=1\n다음줄`;
  const out = api.stripNaverSourceFromPlain(plainIn);
  assert.ok(!/blog\.naver\.com/i.test(out), 'plain url');
  assert.ok(out.includes('본문'), 'plain body');
  passed++;
  console.log('OK plain naver url strip');
}

console.log(`\nAll ${passed} tests passed.`);
