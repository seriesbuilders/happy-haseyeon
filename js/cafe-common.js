/** 카페 공통 — 탭 링크 / 회원 세션 */
const FALLBACK_TABS = ['홈', '전체글', '인기글', '자유게시판', '후기', '공지'];
const MEMBER_TOKEN_KEY = 'memberToken';
const MEMBER_INFO_KEY = 'memberInfo';

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function boardHref(category) {
  // index.html 은 Functions 제외 경로라 404가 안 남 (/?c=…)
  if (!category || category === '홈') return '/';
  if (category === '전체글' || category === 'all') return '/?c=all';
  return '/?c=' + encodeURIComponent(category);
}

function tabHref(label) {
  return boardHref(label);
}

function renderCafeTabs(container, tabs, activeLabel) {
  const labels = tabs?.length ? tabs.map((t) => t.label) : FALLBACK_TABS;
  const active = activeLabel || '홈';
  const html = labels
    .map((label) => {
      const isActive = label === active || (active === 'all' && label === '전체글');
      const href = tabHref(label);
      return `<a class="mc-tab${isActive ? ' active' : ''}" href="${href}">${escapeHtml(label)}</a>`;
    })
    .join('');

  if (container) container.innerHTML = html;

  const drawer = document.getElementById('drawerNav');
  if (drawer) {
    drawer.innerHTML = labels
      .map((label) => {
        const isActive = label === active || (active === 'all' && label === '전체글');
        const href = tabHref(label);
        return `<a class="mc-drawer-link${isActive ? ' active' : ''}" href="${href}">${escapeHtml(label)}</a>`;
      })
      .join('');
  }
}

function openNavDrawer() {
  const root = document.getElementById('navDrawer');
  if (!root) return;
  root.hidden = false;
  requestAnimationFrame(() => root.classList.add('open'));
  document.body.classList.add('drawer-open');
  document.querySelectorAll('[data-open-drawer]').forEach((btn) => {
    btn.setAttribute('aria-expanded', 'true');
  });
}

function closeNavDrawer() {
  const root = document.getElementById('navDrawer');
  if (!root) return;
  root.classList.remove('open');
  document.body.classList.remove('drawer-open');
  document.querySelectorAll('[data-open-drawer]').forEach((btn) => {
    btn.setAttribute('aria-expanded', 'false');
  });
  setTimeout(() => {
    if (!root.classList.contains('open')) root.hidden = true;
  }, 280);
}

function bindMobileNav() {
  const root = document.getElementById('navDrawer');
  if (!root) return;
  if (root.dataset.bound === '1') {
    // 나중에 추가된 버튼도 연결
    document.querySelectorAll('[data-open-drawer]').forEach((btn) => {
      if (btn.dataset.drawerBound === '1') return;
      btn.dataset.drawerBound = '1';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openNavDrawer();
      });
    });
    return;
  }
  root.dataset.bound = '1';

  document.querySelectorAll('[data-open-drawer]').forEach((btn) => {
    btn.dataset.drawerBound = '1';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openNavDrawer();
    });
  });
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-close-drawer]')) closeNavDrawer();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeNavDrawer();
  });
}

function syncDrawerAuthUi() {
  updateJoinButton(document.getElementById('drawerJoinBtn'));
  const link = document.getElementById('drawerLoginLink');
  if (!link) return;
  if (getMemberInfo()) {
    link.textContent = '로그아웃';
    link.href = '#';
    link.onclick = (e) => {
      e.preventDefault();
      clearMemberSession();
      syncDrawerAuthUi();
      if (typeof syncAuthUi === 'function') syncAuthUi();
    };
  } else {
    link.textContent = '로그인';
    link.href = '/login';
    link.onclick = null;
  }
}

async function loadCafeTabs(activeLabel) {
  bindMobileNav();
  try {
    const res = await fetch(apiUrl('/api/tabs'));
    const data = await res.json();
    renderCafeTabs(document.getElementById('tabBarInner'), data.tabs, activeLabel);
  } catch {
    renderCafeTabs(document.getElementById('tabBarInner'), null, activeLabel);
  }
  bindMobileNav();
  syncDrawerAuthUi();
  loadPopularTags(document.getElementById('drawerTagCloud'));
  bindCafeBottomNav();
}

// DOM 준비 즉시 메뉴 바인딩 (API 대기 없이)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindMobileNav);
} else {
  bindMobileNav();
}

function myPageOrLoginHref() {
  return getMemberInfo() ? '/mypage' : '/login';
}

function ensureCafeSheetRoot() {
  let root = document.getElementById('cafeSheetRoot');
  if (root) return root;
  root = document.createElement('div');
  root.id = 'cafeSheetRoot';
  root.className = 'cafe-sheet-root';
  root.hidden = true;
  root.innerHTML = `
    <div class="cafe-sheet-backdrop" data-close-sheet></div>
    <div class="cafe-sheet-panel" role="dialog" aria-modal="true" aria-labelledby="cafeSheetTitle">
      <div class="cafe-sheet-grab" aria-hidden="true"></div>
      <header class="cafe-sheet-head">
        <h2 id="cafeSheetTitle" class="cafe-sheet-title"></h2>
        <button type="button" class="cafe-sheet-close" data-close-sheet aria-label="닫기">×</button>
      </header>
      <p class="cafe-sheet-desc" id="cafeSheetDesc"></p>
      <div class="cafe-sheet-body" id="cafeSheetBody"></div>
    </div>`;
  document.body.appendChild(root);
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-close-sheet]')) closeCafeSheet();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeCafeSheet();
  });
  return root;
}

function openCafeSheet({ title, desc, bodyHtml }) {
  const root = ensureCafeSheetRoot();
  document.getElementById('cafeSheetTitle').textContent = title || '';
  const descEl = document.getElementById('cafeSheetDesc');
  descEl.textContent = desc || '';
  descEl.hidden = !desc;
  document.getElementById('cafeSheetBody').innerHTML = bodyHtml || '';
  root.hidden = false;
  requestAnimationFrame(() => root.classList.add('open'));
  document.body.classList.add('sheet-open');
}

function closeCafeSheet() {
  const root = document.getElementById('cafeSheetRoot');
  if (!root) return;
  root.classList.remove('open');
  document.body.classList.remove('sheet-open');
  setTimeout(() => {
    if (!root.classList.contains('open')) root.hidden = true;
  }, 260);
}

function openTopicsSheet() {
  openCafeSheet({
    title: '주제 보기',
    desc: '관심 있는 게시판으로 바로 이동하세요.',
    bodyHtml: `
      <a class="cafe-sheet-link" href="${boardHref('전체글')}">전체글</a>
      <a class="cafe-sheet-link" href="${boardHref('인기글')}">인기글</a>
      <a class="cafe-sheet-link" href="${boardHref('자유게시판')}">자유게시판</a>
      <a class="cafe-sheet-link" href="${boardHref('후기')}">후기</a>
      <a class="cafe-sheet-link" href="${boardHref('공지')}">공지</a>`,
  });
}

function openNewsSheet() {
  openCafeSheet({
    title: '소식',
    desc: '공지와 인기글을 빠르게 확인하세요.',
    bodyHtml: `
      <a class="cafe-sheet-link" href="${boardHref('공지')}">공지사항</a>
      <a class="cafe-sheet-link" href="${boardHref('인기글')}">인기글</a>
      <a class="cafe-sheet-link" href="${boardHref('후기')}">최신 후기</a>
      <a class="cafe-sheet-link" href="${boardHref('전체글')}">전체글</a>`,
  });
}

function currentPostIdForComment() {
  const compose = document.getElementById('commentCompose');
  const fromDom = Number(compose?.dataset?.postId || 0);
  if (fromDom) return fromDom;
  const fromList = Number(
    document.querySelector('.comment-section')?.dataset?.postId || 0
  );
  return fromList || 0;
}

function currentPostTitleForComment() {
  const h1 = document.querySelector('.post-title');
  return (h1?.textContent || '').trim();
}

function commentGateHtml() {
  return `
    <div class="cafe-sheet-gate">
      <p class="cafe-sheet-gate-title">댓글은 회원만 작성할 수 있어요</p>
      <p class="cafe-sheet-gate-desc">카페에 가입하면 응원·후기·질문을 바로 남길 수 있습니다.</p>
      <div class="cafe-sheet-gate-actions">
        <a class="cafe-sheet-btn primary" href="/join">카페 가입하기</a>
        <a class="cafe-sheet-btn ghost" href="/login">로그인</a>
      </div>
    </div>`;
}

function commentFormHtml(postId, postTitle, member) {
  const name = member.nickname || member.username || '회원';
  const titleLine = postTitle
    ? `<p class="cafe-sheet-target">대상 글: <strong>${escapeHtml(postTitle)}</strong></p>`
    : '';
  const avatarHtml = member.profile_image
    ? `<img class="cafe-sheet-comment-avatar cafe-sheet-comment-avatar--img" src="${escapeHtml(member.profile_image)}" alt="" />`
    : `<span class="cafe-sheet-comment-avatar">${escapeHtml(name.charAt(0))}</span>`;
  return `
    ${titleLine}
    <form class="cafe-sheet-comment-form" id="sheetCommentForm" data-post-id="${postId}">
      <div class="cafe-sheet-comment-user">
        ${avatarHtml}
        <strong>${escapeHtml(name)}</strong>
        <span>님으로 작성</span>
      </div>
      <textarea id="sheetCommentInput" rows="4" maxlength="2000" placeholder="응원·후기·질문을 남겨 주세요" required></textarea>
      <div class="cafe-sheet-comment-actions">
        <span class="cafe-sheet-comment-count"><span id="sheetCommentLen">0</span>/2000</span>
        <button type="submit" class="cafe-sheet-btn primary" id="sheetCommentSubmit">등록</button>
      </div>
      <p class="cafe-sheet-comment-msg" id="sheetCommentMsg" hidden></p>
    </form>`;
}

function bindSheetCommentForm() {
  const form = document.getElementById('sheetCommentForm');
  if (!form) return;
  const input = document.getElementById('sheetCommentInput');
  const len = document.getElementById('sheetCommentLen');
  const msg = document.getElementById('sheetCommentMsg');
  const btn = document.getElementById('sheetCommentSubmit');
  const postId = Number(form.dataset.postId);
  let submitting = false;

  input?.addEventListener('input', () => {
    if (len) len.textContent = String(input.value.length);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitting) return;
    const content = (input?.value || '').trim();
    if (!content || !postId) return;

    if (msg) {
      msg.hidden = true;
    }
    submitting = true;
    if (btn) {
      btn.disabled = true;
      btn.textContent = '등록 중…';
    }

    try {
      const res = await fetch(apiUrl('/api/comments'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Member-Token': getMemberToken(),
        },
        body: JSON.stringify({ post_id: postId, content }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        clearMemberSession();
        openCommentSheet();
        return;
      }
      if (!res.ok) {
        if (msg) {
          msg.hidden = false;
          msg.textContent = data.error || '등록에 실패했습니다.';
          msg.className = 'cafe-sheet-comment-msg err';
        }
        return;
      }

      if (input) input.value = '';
      if (len) len.textContent = '0';

      // 현재 글 상세라면 목록에도 바로 반영
      if (
        typeof commentItemHtml === 'function' &&
        document.getElementById('commentList') &&
        data.comment
      ) {
        const list = document.getElementById('commentList');
        list.querySelector('.post-error, .comment-empty')?.remove();
        list.insertAdjacentHTML('beforeend', commentItemHtml(data.comment));
        const head = document.querySelector('.comment-section .head em');
        if (head && data.comment_count != null) head.textContent = String(data.comment_count);
      }

      if (msg) {
        msg.hidden = false;
        msg.textContent = '댓글이 등록되었습니다.';
        msg.className = 'cafe-sheet-comment-msg ok';
      }
      setTimeout(() => closeCafeSheet(), 900);
    } catch {
      if (msg) {
        msg.hidden = false;
        msg.textContent = '서버 연결에 실패했습니다.';
        msg.className = 'cafe-sheet-comment-msg err';
      }
    } finally {
      submitting = false;
      if (btn) {
        btn.disabled = false;
        btn.textContent = '등록';
      }
    }
  });
}

async function openCommentSheet() {
  // 공개 페이지에서는 댓글 작성 불가 — 목록으로만 이동 (관리자 화면에서만 작성)
  document.getElementById('commentList')?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  });
}

function cafeBottomNavHtml(active = '') {
  const myHref = myPageOrLoginHref();
  const item = (key, href, icon, label, isBtn) => {
    const on = active === key ? ' active' : '';
    if (isBtn) {
      return `<button type="button" class="bn-item${on}" data-bn="${key}"><span class="ico">${icon}</span>${label}</button>`;
    }
    return `<a class="bn-item${on}" href="${href}" data-bn="${key}"><span class="ico">${icon}</span>${label}</a>`;
  };
  return `
    <nav class="bottom-nav" id="cafeBottomNav" aria-label="하단 메뉴">
      ${item('home', '/', '⌂', '홈', false)}
      ${item('topics', '#', '★', '주제', true)}
      ${item('comment', '#', '💬', '댓글', true)}
      ${item('news', '#', '♥', '소식', true)}
      ${item('my', myHref, '👤', 'MY', false)}
    </nav>`;
}

function bindCafeBottomNav() {
  const nav = document.getElementById('cafeBottomNav') || document.querySelector('.bottom-nav');
  if (!nav) return;

  const my = nav.querySelector('[data-bn="my"]');
  if (my && my.tagName === 'A') my.setAttribute('href', myPageOrLoginHref());

  // 구버전 글쓰기 버튼을 댓글로 교체
  const writeBtn = nav.querySelector('[data-bn="write"]');
  if (writeBtn) {
    writeBtn.dataset.bn = 'comment';
    writeBtn.innerHTML = '<span class="ico">💬</span>댓글';
  }

  if (nav.dataset.bnBound === '1') return;
  nav.dataset.bnBound = '1';

  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-bn]');
    if (!btn) return;
    const key = btn.dataset.bn;
    if (key === 'topics') {
      e.preventDefault();
      openTopicsSheet();
    } else if (key === 'comment' || key === 'write') {
      e.preventDefault();
      openCommentSheet();
    } else if (key === 'news') {
      e.preventDefault();
      openNewsSheet();
    }
  });
}

/** 본문 하단 ❤ / 댓글 / 공유 — 광고 심사 대응용 실제 클릭 동작 */
function bindPostReactions(postId) {
  const box = document.querySelector('.reaction');
  if (!box || box.dataset.bound === '1') return;
  box.dataset.bound = '1';

  const id = Number(postId) || Number(box.dataset.postId) || 0;
  const likeKey = id ? `post-liked:${id}` : '';
  const likeBtn = box.querySelector('[data-reaction="like"]');
  const commentBtn = box.querySelector('[data-reaction="comment"]');
  const shareBtn = box.querySelector('[data-reaction="share"]');
  const likeCountEl = likeBtn?.querySelector('.count');
  let likeBusy = false;

  const isLiked = () => {
    if (!likeKey) return false;
    try {
      return localStorage.getItem(likeKey) === '1';
    } catch {
      return false;
    }
  };
  const setLiked = (on) => {
    if (!likeKey) return;
    try {
      if (on) localStorage.setItem(likeKey, '1');
      else localStorage.removeItem(likeKey);
    } catch {
      /* ignore */
    }
  };
  const setCount = (n) => {
    if (!likeCountEl) return;
    likeCountEl.textContent = Math.max(0, Number(n) || 0).toLocaleString();
  };

  if (likeBtn) {
    if (isLiked()) likeBtn.classList.add('is-active');
    likeBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!id || likeBusy) return;
      const on = !likeBtn.classList.contains('is-active');
      const prevCount =
        parseInt(String(likeCountEl?.textContent || '0').replace(/,/g, ''), 10) || 0;

      likeBusy = true;
      likeBtn.classList.toggle('is-active', on);
      setLiked(on);
      setCount(prevCount + (on ? 1 : -1));

      try {
        const res = await fetch(`/api/posts/${id}/like`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: on ? 'like' : 'unlike' }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'like failed');
        if (data.likes != null) setCount(data.likes);
      } catch {
        likeBtn.classList.toggle('is-active', !on);
        setLiked(!on);
        setCount(prevCount);
      } finally {
        likeBusy = false;
      }
    });
  }

  if (commentBtn) {
    commentBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof openCommentSheet === 'function') openCommentSheet();
      else {
        document.querySelector('.comment-section')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }
    });
  }

  if (shareBtn) {
    shareBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const url = location.href.split('#')[0];
      const title = (document.querySelector('.post-title')?.textContent || '').trim() || document.title;
      try {
        if (navigator.share) {
          await navigator.share({ title, url });
          return;
        }
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(url);
          shareBtn.classList.add('is-copied');
          const prev = shareBtn.textContent;
          shareBtn.textContent = '복사됨';
          setTimeout(() => {
            shareBtn.textContent = prev || '공유';
            shareBtn.classList.remove('is-copied');
          }, 1600);
          return;
        }
      } catch {
        /* fallback below */
      }
      window.prompt('아래 주소를 복사하세요', url);
    });
  }
}

function getMemberToken() {
  return localStorage.getItem(MEMBER_TOKEN_KEY) || '';
}

function getMemberInfo() {
  try {
    return JSON.parse(localStorage.getItem(MEMBER_INFO_KEY) || 'null');
  } catch {
    return null;
  }
}

function setMemberSession(token, member) {
  localStorage.setItem(MEMBER_TOKEN_KEY, token);
  localStorage.setItem(MEMBER_INFO_KEY, JSON.stringify(member));
}

function clearMemberSession() {
  localStorage.removeItem(MEMBER_TOKEN_KEY);
  localStorage.removeItem(MEMBER_INFO_KEY);
}

function updateJoinButton(btn) {
  if (!btn) return;
  const member = getMemberInfo();
  if (member) {
    btn.textContent = '마이페이지';
    btn.onclick = () => {
      location.href = '/mypage';
    };
  } else {
    btn.textContent = '카페 가입하기';
    btn.onclick = () => {
      location.href = '/join';
    };
  }
}

async function loadPopularTags(cloudEl) {
  if (!cloudEl) return;
  try {
    const res = await fetch(apiUrl('/api/tags'));
    const { tags } = await res.json();
    if (!tags?.length) {
      cloudEl.innerHTML = '<span class="mc-tag muted">태그 없음</span>';
      return;
    }
    cloudEl.innerHTML = tags
      .map((t) => `<span class="mc-tag">${escapeHtml(t.label)}</span>`)
      .join('');
  } catch {
    cloudEl.innerHTML = '';
  }
}

const DEFAULT_HERO_IMAGE = '/images/hero-diet.jpg';

function mediaUrl(path) {
  if (!path) return '';
  if (path.startsWith('http') || path.startsWith('data:') || path.startsWith('/')) return path;
  return apiUrl(path);
}

function coverThumbHtml(post, fallbackText) {
  const cover = (post?.cover_image || '').trim();
  if (cover) {
    return `<img src="${escapeHtml(mediaUrl(cover))}" alt="" loading="lazy" />`;
  }
  return `<span>${escapeHtml(fallbackText || post?.category || '')}</span>`;
}

/** 메인/게시판 히어로: 영상 우선, 없으면 이미지, 없으면 기본 이미지 */
function applyHeroBanner(settings) {
  const mediaEl = document.getElementById('bannerMedia');
  if (!mediaEl) return;

  const video = (settings?.hero_video || '').trim();
  const image = (settings?.hero_image || '').trim() || DEFAULT_HERO_IMAGE;

  if (video) {
    const src = mediaUrl(video);
    mediaEl.innerHTML = `<video src="${escapeHtml(src)}" autoplay muted loop playsinline poster="${escapeHtml(mediaUrl(image))}"></video>`;
    return;
  }

  mediaEl.innerHTML = `<img src="${escapeHtml(mediaUrl(image))}" alt="" />`;
}
