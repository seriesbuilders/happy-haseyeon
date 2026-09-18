/**
 * 네이버 [출처] 제거 로직 테스트
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

function assertNoSource(html, label) {
  const text = String(html).replace(/<[^>]+>/g, ' ');
  assert.ok(!/\[\s*출처\s*\]|［\s*출처\s*］/.test(text), `${label}: [출처] still present`);
  assert.ok(!/\|\s*작성자/.test(text), `${label}: | 작성자 still present`);
}

function assertKeeps(html, needle, label) {
  assert.ok(String(html).includes(needle), `${label}: missing expected content "${needle}"`);
}

// 고객 스크린샷과 동일한 중간 삽입 형태
const fixtureMid = `
<p style="text-align:center"><span style="background-color:yellow"><b>쫙 펴진 팔자주름이 보증수표입니다.</b></span></p>
<p style="text-align:center">너무 많은 사람들이 알면 엄마처럼 단골손님은 앰플을 구하기 더 어려워질 것 같아 하루만 올려둘게요. (내일 즉시 삭제 예정)</p>
<div style="border:1px dashed #bbb;padding:10px;background:#fafafa">
  <p><b>[출처]</b></p>
  <p><a href="https://blog.naver.com/seoyoungene_/224388671886">[팔자주름 셀프해결법] 70대 친정엄마 피부과 도움 없이 팔자주름 없애고 20년 회춘하심!! 효과 대박...</a> | 작성자 행복하서연</p>
</div>
<p style="text-align:center"><span style="color:red">※무단 공유 금지※</span></p>
<p>우리 엄마가 팔자주름 때문에 이렇게 스트레스 받을 줄은 몰랐네요.</p>
<p><span style="background-color:yellow"><b>딱 4주만에</b></span> <u><b>70대 엄마 팔자주름</b></u> <u><b>해결한 비법을</b></u></p>
`;

// 끝에 붙는 형태
const fixtureEnd = `
<p>본문 시작입니다. 효과가 좋았습니다.</p>
<p>자세한 후기를 남겨봅니다.</p>
<p><b>[출처]</b></p>
<p>[테스트글] 제목입니다!! 효과 대박... | 작성자 행복하서연</p>
`;

// 한 블록에 합쳐진 형태
const fixtureOneBlock = `
<p>본문입니다.</p>
<p>[출처]<br><a href="https://blog.naver.com/x/1">[제목] 설명...</a> | 작성자 테스트</p>
<p>이어지는 본문</p>
`;

// 전각 괄호
const fixtureFullwidth = `
<p>본문</p>
<p>［출처］</p>
<p>[제목] 내용 | 작성자 홍길동</p>
<p>끝</p>
`;

// plain text
const plain = `본문 첫줄
둘째줄
[출처]
[팔자주름 셀프해결법] 70대... | 작성자 행복하서연
셋째줄은 없어야? 아니요 출처 아래는 원래 끝에만`;

let passed = 0;

{
  const out = api.sanitizePastedHtml(fixtureMid);
  assertNoSource(out, 'mid');
  assertKeeps(out, '보증수표입니다', 'mid');
  assertKeeps(out, '무단 공유 금지', 'mid');
  assertKeeps(out, '딱 4주만에', 'mid');
  assertKeeps(out, '우리 엄마가', 'mid');
  passed++;
  console.log('OK mid-document source strip');
}

{
  const out = api.sanitizePastedHtml(fixtureEnd);
  assertNoSource(out, 'end');
  assertKeeps(out, '본문 시작입니다', 'end');
  passed++;
  console.log('OK end source strip');
}

{
  const out = api.sanitizePastedHtml(fixtureOneBlock);
  assertNoSource(out, 'one-block');
  assertKeeps(out, '본문입니다', 'one-block');
  assertKeeps(out, '이어지는 본문', 'one-block');
  passed++;
  console.log('OK one-block source strip');
}

{
  const out = api.sanitizePastedHtml(fixtureFullwidth);
  assertNoSource(out, 'fullwidth');
  assertKeeps(out, '본문', 'fullwidth');
  assertKeeps(out, '끝', 'fullwidth');
  passed++;
  console.log('OK fullwidth source strip');
}

{
  const out = api.stripNaverSourceFromPlain(plain);
  assert.ok(!/\[\s*출처\s*\]/.test(out), 'plain: 출처');
  assert.ok(!/\|\s*작성자/.test(out), 'plain: 작성자');
  assert.ok(out.includes('본문 첫줄'), 'plain: body');
  passed++;
  console.log('OK plain source strip');
}

{
  // 본문에 '출처' 단어만 있는 경우는 유지
  const body = `<p>이 글의 출처는 임상 결과입니다.</p><p>추가 설명</p>`;
  const out = api.sanitizePastedHtml(body);
  assertKeeps(out, '출처는 임상', 'keep-word');
  passed++;
  console.log('OK keep normal 출처 word');
}

console.log(`\nAll ${passed} tests passed.`);
