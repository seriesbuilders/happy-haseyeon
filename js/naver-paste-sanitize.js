/**
 * 네이버 블로그 복붙 정리
 * - [출처] / ［출처］ 인용 블록 제거
 * - blog.naver.com URL / OG링크 / 링크카드 제거 (중간 삽입 포함)
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
  const NAVER_BLOG_HOST_RE =
    /^(?:www\.)?(?:m\.)?blog\.naver\.com$/i;
  const NAVER_BLOG_URL_RE =
    /https?:\/\/(?:www\.)?(?:m\.)?blog\.naver\.com\/[^\s<>"')\]]+/gi;

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

  function isNaverBlogUrl(url) {
    const raw = String(url || '').trim();
    if (!raw) return false;
    try {
      const u = new URL(raw);
      const host = u.hostname.replace(/^www\./i, '').toLowerCase();
      if (NAVER_BLOG_HOST_RE.test(host)) return true;
      if (host === 'naver.me') return false;
      return false;
    } catch {
      return /(?:^|\/\/)(?:www\.)?(?:m\.)?blog\.naver\.com\//i.test(raw);
    }
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
    if (SOURCE_LABEL_RE.test(text) && text.length <= 500) {
      const after = text.replace(SOURCE_LABEL_RE, '').trim();
      if (!after || after.length < 360) return true;
    }
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

  function removeEl(el) {
    try {
      el?.remove?.();
    } catch (_) {
      /* ignore */
    }
  }

  /** 네이버 블로그 URL / OG임베드 / 링크카드 제거 */
  function stripNaverBlogEmbeds(root) {
    if (!root) return;

    // 1) 스마트에디터 OG 링크 모듈
    for (const el of [
      ...root.querySelectorAll(
        '.se-oglink, .se-module-oglink, [class*="se-oglink"], [class*="oglink"]'
      ),
    ]) {
      const wrap =
        el.closest?.('.se-component, .se-section, .se-module, figure, p, div') || el;
      if (wrap && wrap !== root) removeEl(wrap);
      else removeEl(el);
    }

    // 2) 우리 에디터 링크카드 중 blog.naver.com
    for (const table of [...root.querySelectorAll('table.link-card, a.link-card')]) {
      const url =
        table.getAttribute('data-url') ||
        table.querySelector?.('a[href]')?.getAttribute('href') ||
        table.getAttribute('href') ||
        '';
      const domain = table.getAttribute('data-domain') || '';
      const blob = `${url}\n${domain}\n${table.outerHTML || ''}`;
      if (!isNaverBlogUrl(url) && !/blog\.naver\.com/i.test(blob)) continue;
      const block =
        table.closest?.('.link-card-block, .link-card-wrap') || table.parentElement;
      const prev = (block || table).previousElementSibling;
      if (prev?.classList?.contains('link-card-url-line')) removeEl(prev);
      if (block && block !== root) removeEl(block);
      else removeEl(table);
    }
    for (const line of [...root.querySelectorAll('.link-card-url-line')]) {
      const href =
        line.querySelector('a[href]')?.getAttribute('href') || cleanText(line.textContent);
      const looksNaver =
        isNaverBlogUrl(href) || /blog\.naver\.com/i.test(line.innerHTML || '');
      // 제품 링크(url-line)는 절대 지우지 않음 — 네이버만 제거
      if (looksNaver) removeEl(line);
    }
    // 빈 link-card-block 잔여 제거
    for (const block of [...root.querySelectorAll('.link-card-block')]) {
      const url = block.querySelector?.('[data-url]')?.getAttribute('data-url') || '';
      const domain =
        block.querySelector?.('[data-domain]')?.getAttribute('data-domain') || '';
      if (
        /blog\.naver\.com/i.test(`${url} ${domain} ${block.innerHTML || ''}`) ||
        !block.querySelector('table.link-card, a.link-card')
      ) {
        if (/blog\.naver\.com/i.test(`${url} ${domain} ${block.innerHTML || ''}`)) {
          removeEl(block);
        }
      }
    }

    // 3) <a href="blog.naver.com...">
    for (const a of [...root.querySelectorAll('a[href]')]) {
      const href = a.getAttribute('href') || '';
      if (!isNaverBlogUrl(href)) continue;
      const host = a.closest('p, div, li, td, span') || a;
      const hostText = cleanText(host.textContent);
      const onlyLink =
        hostText.length <= 400 &&
        (!hostText || isNaverBlogUrl(hostText) || hostText === cleanText(a.textContent));
      // 문단이 URL·짧은 제목 링크면 통째 삭제
      if (onlyLink || hostText.length < 120) {
        removeEl(host === root ? a : host);
      } else {
        // 본문 문장 속 인라인 링크는 링크만 해제(텍스트는 유지하되 URL 텍스트면 삭제)
        const label = cleanText(a.textContent);
        if (isNaverBlogUrl(label) || label.length < 4) removeEl(a);
        else {
          const span = a.ownerDocument.createTextNode(a.textContent || '');
          a.replaceWith(span);
        }
      }
    }

    // 4) 문단 전체가 네이버 블로그 URL
    for (const el of [...root.querySelectorAll('p, div, li, span')]) {
      if (!el.isConnected) continue;
      if (el.querySelector?.('img, table, .link-card, .link-card-block')) continue;
      const t = cleanText(el.textContent);
      if (!t) continue;
      if (isNaverBlogUrl(t) || (/^https?:\/\/\S+$/i.test(t) && isNaverBlogUrl(t))) {
        removeEl(el);
      }
    }

    // 5) 텍스트 노드 안 단독 URL 제거
    const textNodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    for (const node of textNodes) {
      if (!node.isConnected) continue;
      const val = node.nodeValue || '';
      if (!/blog\.naver\.com/i.test(val)) continue;
      const next = val.replace(NAVER_BLOG_URL_RE, '').replace(/[ \t]{2,}/g, ' ');
      if (!next.trim()) {
        const parent = node.parentElement;
        node.nodeValue = '';
        if (parent && !cleanText(parent.textContent) && !parent.querySelector?.('img,table')) {
          removeEl(parent);
        }
      } else {
        node.nodeValue = next;
      }
    }
  }

  function stripNaverSourceCitation(root) {
    if (!root) return;

    // 0) [출처]/출처원문 이 나오는 지점부터 문서 끝까지 삭제
    //    (본문 + 출처원문이 한 번에 붙어 들어오는 케이스)
    const kids = [...root.children];
    let cutAt = -1;
    for (let i = 0; i < kids.length; i++) {
      const t = cleanText(kids[i].textContent);
      if (
        SOURCE_LABEL_RE.test(t) ||
        SOURCE_START_RE.test(t) ||
        (/출처\s*원문|원문\s*보기|퍼가기/i.test(t) && t.length < 80)
      ) {
        cutAt = i;
        break;
      }
      // 자식 안에 [출처] 라벨이 있으면 그 블록부터 절단
      for (const p of kids[i].querySelectorAll?.('p, div, span, li') || []) {
        const pt = cleanText(p.textContent);
        if (SOURCE_LABEL_RE.test(pt) || SOURCE_START_RE.test(pt)) {
          cutAt = i;
          break;
        }
      }
      if (cutAt >= 0) break;
    }
    if (cutAt >= 0) {
      kids.slice(cutAt).forEach((el) => removeEl(el));
    }

    const victims = new Set();

    const consider = (el) => {
      if (!el || el === root || !el.isConnected) return;
      const t = cleanText(el.textContent);
      if (!isCitationText(t)) return;
      victims.add(pickCitationTarget(el, root));
    };

    for (const el of [...root.querySelectorAll('p, div, span, li, td, th, a, table, blockquote, section, article')]) {
      if (!el.isConnected) continue;
      const t = cleanText(el.textContent);
      if (!SOURCE_LABEL_RE.test(t) && !AUTHOR_RE.test(t)) continue;
      if (isCitationText(t)) consider(el);
    }

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

    for (const el of victims) removeEl(el);

    const textNodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    for (const node of textNodes) {
      if (!node.isConnected) continue;
      const val = node.nodeValue || '';
      const idx = val.search(SOURCE_LABEL_RE);
      if (idx < 0) continue;
      const after = val.slice(idx);
      if (!(AUTHOR_RE.test(after) || after.length <= 500 || /원문/.test(after))) continue;
      node.nodeValue = val.slice(0, idx);
      // 같은 블록 이후 형제 + 루트 이후 형제 제거
      let block = node.parentElement;
      while (block && block.parentElement && block.parentElement !== root) {
        block = block.parentElement;
      }
      if (block && block.parentElement === root) {
        let sib = block.nextElementSibling;
        while (sib) {
          const n = sib.nextElementSibling;
          removeEl(sib);
          sib = n;
        }
      }
      let sib = node.nextSibling;
      while (sib) {
        const n = sib.nextSibling;
        if (sib.remove) sib.remove();
        else sib.parentNode?.removeChild(sib);
        sib = n;
      }
      break;
    }

    // 출처 제거 후 네이버 임베드도 정리
    stripNaverBlogEmbeds(root);

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
        t.length < 500 &&
        isNaverBlogUrl(t) &&
        !/[가-힣]{12,}/.test(t);
      const emptyish = !t;
      if (hasOglink || onlyNaverUrl || (emptyish && root.children.length > 1) || isCitationText(t)) {
        removeEl(last);
        continue;
      }
      break;
    }
  }

  function stripNaverSourceFromPlain(text) {
    let s = String(text || '');
    if (!s.trim()) return s;
    s = s.replace(
      /(?:\[\s*출처\s*\]|［\s*출처\s*］)[^\n]{0,20}(?:\r?\n|\s)*[^\n]{0,400}\|\s*작성자\s*[^\n]{1,60}/gi,
      ''
    );
    s = s.replace(/(?:\[\s*출처\s*\]|［\s*출처\s*］)[^\n]{0,500}/gi, '');
    s = s.replace(/(?:^|\n)[^\n]*\|\s*작성자\s+[^\n]{1,60}/gi, (line) => {
      return /\[.+\]/.test(line) || /작성자/.test(line) ? '\n' : line;
    });
    // 네이버 블로그 URL 줄 제거
    s = s.replace(/(?:^|\n)\s*https?:\/\/(?:www\.)?(?:m\.)?blog\.naver\.com\/[^\s\n]+/gi, '\n');
    s = s.replace(NAVER_BLOG_URL_RE, '');
    return s.replace(/\n{3,}/g, '\n\n').trim();
  }

  function stripNaverSourceFromHtmlString(html) {
    let s = String(html || '');
    if (!s) return s;
    s = s.replace(
      /(?:\[\s*출처\s*\]|［\s*출처\s*］)[\s\S]{0,700}?\|\s*작성자\s*[^<]{1,60}/gi,
      ''
    );
    s = s.replace(
      /<(p|div|span|li|td)(\s[^>]*)?>\s*(?:\[\s*출처\s*\]|［\s*출처\s*］)\s*<\/\1>/gi,
      ''
    );
    // href / 텍스트의 blog.naver.com URL
    s = s.replace(
      /<a\b[^>]*href=["'][^"']*blog\.naver\.com[^"']*["'][^>]*>[\s\S]*?<\/a>/gi,
      ''
    );
    s = s.replace(NAVER_BLOG_URL_RE, '');
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
      // DOM 먼저: URL이 살아 있을 때 카드/OG/앵커 식별
      const root = parseRoot(html);
      if (!root) return stripNaverSourceFromHtmlString(html);
      root.querySelectorAll('script, style, noscript, meta, link').forEach((el) => el.remove());
      stripNaverSourceCitation(root);
      stripNaverBlogEmbeds(root);
      let out = root.innerHTML;
      out = stripNaverSourceFromHtmlString(out);
      const root2 = parseRoot(out);
      if (root2) {
        stripNaverBlogEmbeds(root2);
        stripNaverSourceCitation(root2);
        // 빈 문단 정리
        for (const el of [...root2.querySelectorAll('p, div')]) {
          if (!cleanText(el.textContent) && !el.querySelector?.('img,table,br,hr')) {
            // keep <p><br></p> style empties used by editor — only remove totally empty
            if (!(el.innerHTML || '').includes('br') && !(el.innerHTML || '').trim()) {
              removeEl(el);
            }
          }
        }
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
    stripNaverBlogEmbeds,
    stripNaverSourceFromPlain,
    stripNaverSourceFromHtmlString,
    collapseRepeatedPasteHtml,
    isCitationText,
    isNaverBlogUrl,
  };
});
