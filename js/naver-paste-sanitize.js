/**
 * 네이버 블로그 복붙 정리
 * - [출처] / ［출처］ 인용 블록 제거 (글 중간·끝 모두)
 * - 동일 본문 반복 붙여넣기 축약
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.NaverPasteSanitize = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const SOURCE_LABEL_RE = /\[\s*출처\s*\]|［\s*출처\s*］/;
  const AUTHOR_RE = /\|\s*작성자\s*\S+/;
  const SOURCE_START_RE = /^\s*(?:\[\s*출처\s*\]|［\s*출처\s*］|출처\s*[:：])/;

  function cleanText(s) {
    return String(s || '')
      .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getParser() {
    if (typeof DOMParser !== 'undefined') return new DOMParser();
    throw new Error('DOMParser unavailable');
  }

  function parseRoot(html) {
    const doc = getParser().parseFromString(
      `<div id="__nv_paste_root__">${html}</div>`,
      'text/html'
    );
    return doc.getElementById('__nv_paste_root__');
  }

  /** 출처 인용 블록으로 보이는지 */
  function isCitationText(t) {
    const text = cleanText(t);
    if (!text) return false;
    if (SOURCE_LABEL_RE.test(text) && AUTHOR_RE.test(text) && text.length <= 800) {
      return true;
    }
    if (SOURCE_START_RE.test(text) && text.length <= 40) return true;
    if (SOURCE_LABEL_RE.test(text) && text.length <= 80) return true;
    // [출처] + 제목만 (작성자 줄이 다음 형제로 분리된 경우)
    if (SOURCE_LABEL_RE.test(text) && text.length <= 500) {
      const after = text.replace(SOURCE_LABEL_RE, '').trim();
      if (!after || after.length < 360) return true;
    }
    // 작성자 줄만
    if (AUTHOR_RE.test(text) && text.length <= 360 && /\[.+\]/.test(text)) {
      return true;
    }
    return false;
  }

  function pickCitationTarget(el, root) {
    if (!el || el === root) return el;
    let best = el;
    let cur = el.parentElement;
    while (cur && cur !== root) {
      const t = cleanText(cur.textContent);
      if (isCitationText(t) && t.length <= 800) {
        best = cur;
      } else {
        break;
      }
      cur = cur.parentElement;
    }
    return best;
  }

  function stripNaverSourceCitation(root) {
    if (!root) return;

    const victims = new Set();

    const consider = (el) => {
      if (!el || el === root || !el.isConnected) return;
      const t = cleanText(el.textContent);
      if (!isCitationText(t)) return;
      victims.add(pickCitationTarget(el, root));
    };

    // 1) 명시적 출처 라벨이 있는 노드
    for (const el of [...root.querySelectorAll('p, div, span, li, td, th, a, table, blockquote, section, article')]) {
      const t = cleanText(el.textContent);
      if (!SOURCE_LABEL_RE.test(t) && !AUTHOR_RE.test(t)) continue;
      // 본문 전체가 잡히지 않게: 출처/작성자 인용 형태만
      if (isCitationText(t)) consider(el);
    }

    // 2) [출처]만 있는 줄 + 바로 다음 "| 작성자" 줄
    for (const el of [...root.querySelectorAll('p, div, li, span')]) {
      if (!el.isConnected) continue;
      const t = cleanText(el.textContent);
      if (!SOURCE_LABEL_RE.test(t)) continue;
      if (t.replace(SOURCE_LABEL_RE, '').trim().length > 20 && !isCitationText(t)) continue;
      victims.add(pickCitationTarget(el, root));
      const next = el.nextElementSibling;
      if (next) {
        const nt = cleanText(next.textContent);
        if (
          AUTHOR_RE.test(nt) ||
          (nt.length <= 360 && /작성자/.test(nt) && /\[.+\]/.test(nt))
        ) {
          victims.add(pickCitationTarget(next, root));
        }
      }
    }

    for (const el of victims) {
      try {
        el.remove();
      } catch (_) {
        /* ignore */
      }
    }

    // 3) 인라인: 한 노드 안에 본문 + [출처]…작성자
    const textNodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    for (const node of textNodes) {
      if (!node.isConnected) continue;
      const val = node.nodeValue || '';
      const idx = val.search(SOURCE_LABEL_RE);
      if (idx < 0) continue;
      const after = val.slice(idx);
      if (!(AUTHOR_RE.test(after) || after.length <= 500)) continue;
      // 출처 앞이 긴 본문이면 출처 이후만 절단
      node.nodeValue = val.slice(0, idx);
      let sib = node.nextSibling;
      while (sib) {
        const n = sib.nextSibling;
        if (sib.remove) sib.remove();
        else sib.parentNode?.removeChild(sib);
        sib = n;
      }
    }

    // 4) 말미 잔여: 빈 줄 / 네이버 URL만 / oglink
    let guard = 0;
    while (root.lastElementChild && guard++ < 30) {
      const last = root.lastElementChild;
      const t = cleanText(last.textContent);
      const cls = String(last.className || '');
      const hasOglink =
        /oglink/i.test(cls) ||
        !!last.querySelector?.('.se-oglink, .se-module-oglink, [class*="oglink"]');
      const onlyNaverUrl =
        t.length > 0 &&
        t.length < 220 &&
        /^https?:\/\/(m\.)?blog\.naver\.com\//i.test(t) &&
        !/[가-힣]{8,}/.test(t);
      const emptyish = !t;
      if (hasOglink || onlyNaverUrl || (emptyish && root.children.length > 1) || isCitationText(t)) {
        last.remove();
        continue;
      }
      break;
    }
  }

  function stripNaverSourceFromPlain(text) {
    let s = String(text || '');
    if (!s.trim()) return s;
    // 블록 단위: [출처] … 작성자 xxx 통째 삭제 (여러 번)
    s = s.replace(
      /(?:\[\s*출처\s*\]|［\s*출처\s*］)[^\n]{0,20}(?:\r?\n|\s)*[^\n]{0,400}\|\s*작성자\s*[^\n]{1,60}/gi,
      ''
    );
    s = s.replace(/(?:\[\s*출처\s*\]|［\s*출처\s*］)[^\n]{0,500}/gi, '');
    s = s.replace(/(?:^|\n)[^\n]*\|\s*작성자\s+[^\n]{1,60}/gi, (line) => {
      // 출처 없는 일반 작성자 표기는 거의 없음 — 인용 줄로 보고 제거
      return /\[.+\]/.test(line) || /작성자/.test(line) ? '\n' : line;
    });
    return s.replace(/\n{3,}/g, '\n\n').trim();
  }

  function stripNaverSourceFromHtmlString(html) {
    let s = String(html || '');
    if (!s) return s;
    // 태그 사이 공백 포함한 [출처]…작성자 패턴
    s = s.replace(
      /(?:\[\s*출처\s*\]|［\s*출처\s*］)[\s\S]{0,700}?\|\s*작성자\s*[^<]{1,60}/gi,
      ''
    );
    // [출처]만 있는 태그 덩어리
    s = s.replace(
      /<(p|div|span|li|td)(\s[^>]*)?>\s*(?:\[\s*출처\s*\]|［\s*출처\s*］)\s*<\/\1>/gi,
      ''
    );
    return s;
  }

  function collapseRepeatedPasteHtml(html) {
    if (!html || typeof html !== 'string') return html;
    try {
      const root = parseRoot(html);
      if (!root) return html;
      const kids = [...root.children];
      if (kids.length < 4) return html;

      const fingerprint = (el) => {
        const t = cleanText(el.textContent || '');
        const img = el.querySelector?.('img[src]')?.getAttribute('src') || '';
        return `${el.tagName}|${img}|${t.slice(0, 80)}`;
      };

      for (const n of [3, 2]) {
        if (kids.length % n !== 0) continue;
        const size = kids.length / n;
        if (size < 2) continue;
        const first = kids.slice(0, size).map(fingerprint).join('||');
        if (!first.replace(/\|/g, '').trim()) continue;
        let same = true;
        for (let i = 1; i < n; i++) {
          const chunk = kids.slice(i * size, (i + 1) * size).map(fingerprint).join('||');
          if (chunk !== first) {
            same = false;
            break;
          }
        }
        if (same) {
          kids.slice(size).forEach((el) => el.remove());
          return root.innerHTML;
        }
      }
      return html;
    } catch {
      return html;
    }
  }

  function sanitizePastedHtml(html) {
    if (!html || typeof html !== 'string') return '';
    try {
      let source = stripNaverSourceFromHtmlString(html);
      const root = parseRoot(source);
      if (!root) return source;
      root.querySelectorAll('script, style, noscript, meta, link').forEach((el) => el.remove());
      stripNaverSourceCitation(root);
      // 한 번 더: DOM 정리 후에도 문자열 패턴 잔여 제거
      let out = stripNaverSourceFromHtmlString(root.innerHTML);
      const root2 = parseRoot(out);
      if (root2) {
        stripNaverSourceCitation(root2);
        out = root2.innerHTML;
      }
      return collapseRepeatedPasteHtml(out);
    } catch {
      return html;
    }
  }

  return {
    sanitizePastedHtml,
    stripNaverSourceCitation,
    stripNaverSourceFromPlain,
    stripNaverSourceFromHtmlString,
    collapseRepeatedPasteHtml,
    isCitationText,
  };
});
