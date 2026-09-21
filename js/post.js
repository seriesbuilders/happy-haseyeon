function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function avatarColor(name) {
  const colors = ['#03c75a', '#5c6bc0', '#ef5350', '#26a69a', '#ab47bc', '#ffa726'];
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h + name.charCodeAt(i)) % colors.length;
  return colors[h];
}

function getSlug() {
  const path = location.pathname.replace(/^\//, '').replace(/\/$/, '');
  if (path && path !== 'post.html' && !path.endsWith('/post.html')) {
    return decodeURIComponent(path.split('/').pop());
  }
  return new URLSearchParams(location.search).get('slug') || '';
}

function mediaUrl(url) {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return apiUrl(url);
}

function ensurePostDrawerDom() {
  if (document.getElementById('navDrawer')) return;
  const root = document.createElement('div');
  root.className = 'mc-drawer-root';
  root.id = 'navDrawer';
  root.hidden = true;
  root.innerHTML = `
    <div class="mc-drawer-backdrop" data-close-drawer></div>
    <aside class="mc-drawer" role="dialog" aria-modal="true" aria-label="카페 메뉴">
      <div class="mc-drawer-head">
        <span class="mc-drawer-title">메뉴</span>
        <button type="button" class="mc-drawer-close" data-close-drawer aria-label="닫기">×</button>
      </div>
      <nav class="mc-drawer-nav" id="drawerNav"></nav>
      <div class="mc-drawer-tags">
        <div class="mc-drawer-tags-title">인기 태그</div>
        <div class="mc-tag-cloud" id="drawerTagCloud"></div>
      </div>
      <div class="mc-drawer-foot">
        <button type="button" class="mc-join-btn" id="drawerJoinBtn">카페 가입하기</button>
        <a href="/login" class="mc-login-link" id="drawerLoginLink">로그인</a>
      </div>
    </aside>`;
  document.body.appendChild(root);
}

(async function init() {
  const slug = getSlug();
  const app = document.getElementById('app');

  if (!slug) {
    app.innerHTML = '<div class="post-error">잘못된 주소입니다. <a href="/">홈</a></div>';
    return;
  }

  try {
    const [settingsRes, postRes] = await Promise.all([
      fetch(apiUrl('/api/settings')),
      fetch(apiUrl(`/api/posts?slug=${encodeURIComponent(slug)}`)),
    ]);

    if (!postRes.ok) {
      app.innerHTML = '<div class="post-error">글을 찾을 수 없습니다.</div>';
      return;
    }

    const { settings } = await settingsRes.json();
    const { post, comments } = await postRes.json();

    const blogName = settings.blog_name || '행복하서연';
    const profileName = settings.profile_name || '행복하서연';
    document.title = post.title || blogName;

    const profileImg = settings.profile_image
      ? `<img class="avatar" src="${escapeHtml(mediaUrl(settings.profile_image))}" alt="" />`
      : `<div class="avatar placeholder">${escapeHtml(profileName.charAt(0))}</div>`;

    function renderCommentNode(c, replies = [], isReply = false) {
      const initial = (c.author || '?').charAt(0);
      const avatar = c.profile_image
        ? `<img class="c-avatar c-avatar--img" src="${escapeHtml(mediaUrl(c.profile_image))}" alt="" />`
        : `<div class="c-avatar" style="background:${avatarColor(c.author)}">${escapeHtml(initial)}</div>`;
      const replyList = replies.length
        ? `<div class="comment-replies">${replies
            .map((r) => renderCommentNode(r, [], true))
            .join('')}</div>`
        : '<div class="comment-replies"></div>';
      return `
        <div class="comment${isReply ? ' comment--reply' : ''}" data-comment-id="${c.id}">
          ${avatar}
          <div class="c-body">
            <div>
              <span class="c-author">${escapeHtml(c.author)}</span>
              <span class="c-date">${escapeHtml(c.created_at)}</span>
            </div>
            <div class="c-text">${escapeHtml(c.content)}</div>
            <div class="c-react" aria-label="추천 비추천" data-comment-id="${c.id}">
              <button type="button" class="c-react__item c-react__item--up" data-vote="up" aria-label="추천">추천 <em>${Number(c.likes || 0).toLocaleString()}</em></button>
              <button type="button" class="c-react__item c-react__item--down" data-vote="down" aria-label="비추천">비추천 <em>${Number(c.dislikes || 0).toLocaleString()}</em></button>
            </div>
            ${isReply ? '' : replyList}
          </div>
        </div>`;
    }

    const list = comments || [];
    const roots = [];
    const childrenMap = new Map();
    for (const c of list) {
      const pid = Number(c.parent_id) || 0;
      if (!pid) roots.push(c);
      else {
        if (!childrenMap.has(pid)) childrenMap.set(pid, []);
        childrenMap.get(pid).push(c);
      }
    }
    for (const c of list) {
      const pid = Number(c.parent_id) || 0;
      if (pid && !list.some((x) => Number(x.id) === pid) && !roots.includes(c)) {
        roots.push(c);
      }
    }

    const commentHtml = roots
      .map((c) => renderCommentNode(c, childrenMap.get(Number(c.id)) || [], false))
      .join('');

    const commentDisplay =
      Number(post.comment_count_display) || Number(list.length) || 0;
    const commentActual = list.length;
    const isAd = post.category === '광고';
    const home = '/';
    const topIconsHtml = isAd
      ? ''
      : `<a class="blog-icon-btn" href="${home}" aria-label="홈" title="홈">⌂</a>
          <button type="button" class="blog-icon-btn" data-open-drawer aria-label="메뉴 열기" title="메뉴">≡</button>`;
    const neighborBtnHtml = isAd
      ? ''
      : `<button type="button" class="neighbor-btn">이웃추가</button>`;
    const blogTopHtml = isAd
      ? `<header class="blog-top blog-top--ad-spacer" aria-hidden="true"></header>`
      : `<header class="blog-top">
        <a class="back" href="${home}" aria-label="뒤로">←</a>
        <a class="blog-name" href="${home}">${escapeHtml(blogName)}</a>
        <div class="icons">
          ${topIconsHtml}
        </div>
      </header>`;

    app.innerHTML = `
      ${blogTopHtml}

      <div class="profile-row">
        ${profileImg}
        <div class="info">
          <div class="name">${escapeHtml(profileName)}</div>
          <div class="date">${escapeHtml(post.published_at)}</div>
        </div>
        ${neighborBtnHtml}
      </div>

      <h1 class="post-title">${escapeHtml(post.title)}</h1>
      <hr class="post-title-divider" />
      ${
        post.cover_image
          ? `<div class="post-cover"><img src="${escapeHtml(mediaUrl(post.cover_image))}" alt="" /></div>`
          : ''
      }
      <article class="post-body">${post.body || ''}</article>

      <div class="reaction" data-post-id="${post.id}">
        <button type="button" class="item" data-reaction="like" aria-label="좋아요">
          <span class="heart">❤</span> <span class="count">${Number(post.likes).toLocaleString()}</span>
        </button>
        <button type="button" class="item" data-reaction="comment" aria-label="댓글">
          💬 <span class="count">${Number(commentDisplay).toLocaleString()}</span>
        </button>
        <button type="button" class="item" data-reaction="share" aria-label="공유">공유 <span class="count">${Number(post.share_count_display || 0).toLocaleString()}</span></button>
      </div>

      <section class="comment-section"${post.category === '광고' ? ' data-ad="1"' : ''}>
        <div class="head">댓글 <em>${commentActual}</em></div>
        <div class="comment-compose" id="commentCompose" data-post-id="${post.id}" hidden></div>
        <div id="commentList">
          ${commentHtml || `<div class="post-error comment-empty" style="padding:24px 0">등록된 댓글이 없습니다.</div>`}
        </div>
      </section>

      <nav class="bottom-nav" id="cafeBottomNav" aria-label="하단 메뉴">
        <a class="bn-item active" href="/" data-bn="home"><span class="ico">⌂</span>홈</a>
        <button type="button" class="bn-item" data-bn="topics"><span class="ico">★</span>주제</button>
        <button type="button" class="bn-item" data-bn="comment"><span class="ico">💬</span>댓글</button>
        <button type="button" class="bn-item" data-bn="news"><span class="ico">♥</span>소식</button>
      </nav>
    `;

    ensurePostDrawerDom();
    if (typeof loadCafeTabs === 'function') {
      await loadCafeTabs('홈');
    } else if (typeof bindMobileNav === 'function') {
      bindMobileNav();
    }
    if (typeof bindCafeBottomNav === 'function') bindCafeBottomNav();
    if (typeof bindPostReactions === 'function') bindPostReactions(post.id);
    if (typeof bindPostComments === 'function') {
      bindPostComments(post.id, { ad: post.category === '광고' });
    }
    if (typeof trackPageView === 'function') {
      trackPageView({ post_id: post.id });
    }
    if (isAd) {
      const wrap = document.querySelector('.wrap');
      if (wrap) wrap.setAttribute('data-ad-landing', '1');
      const landingUrl = location.href.split('#')[0];
      try {
        history.pushState({ adLanding: 1 }, '', landingUrl);
      } catch (_) {
        /* ignore */
      }
      window.addEventListener('popstate', () => {
        try {
          history.pushState({ adLanding: 1 }, '', landingUrl);
        } catch (_) {
          /* ignore */
        }
        if (location.href.split('#')[0] !== landingUrl) {
          location.replace(landingUrl);
        }
      });
    }
  } catch (e) {
    console.error(e);
    app.innerHTML =
      '<div class="post-error">불러오기에 실패했습니다.<br>터미널에서 <code>npm run dev</code> 가 실행 중인지 확인하세요.</div>';
  }
})();
