import { ensureSchema, getSettings } from './_utils.js';
import { postHeadTags } from './_seo.js';
import { buildPixelHeadHtml, buildPixelBodyStartHtml } from './_pixels.js';
import { sanitizePostBodyHtml, enrichLinkCardPreviews } from './_body.js';

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

const RESERVED = new Set([
  'api',
  'admin',
  'admin.html',
  'board',
  'board.html',
  'join',
  'join.html',
  'login',
  'login.html',
  'mypage',
  'mypage.html',
  'css',
  'js',
  'images',
  'favicon.ico',
  'sitemap.xml',
  'robots.txt',
]);

const BOARD_LABELS = new Set(['홈', '전체글', '인기글', '자유게시판', '후기', '공지', 'all']);

export async function onRequestGet(context) {
  const slug = context.params.slug;
  const raw = String(slug || '');

  // 탭 이름이 경로로 들어온 경우 → 게시판으로 리다이렉트
  if (BOARD_LABELS.has(raw) || BOARD_LABELS.has(decodeURIComponent(raw))) {
    const label = BOARD_LABELS.has(raw) ? raw : decodeURIComponent(raw);
    const dest = new URL('/', context.request.url);
    if (label === '홈') {
      return Response.redirect(dest.toString(), 302);
    }
    dest.searchParams.set('c', label === '전체글' ? 'all' : label);
    return Response.redirect(dest.toString(), 302);
  }

  // .html 정적 페이지가 Functions로 들어온 경우 정리
  const htmlRedirect = {
    'join.html': '/join',
    'login.html': '/login',
    'mypage.html': '/mypage',
    'admin.html': '/admin',
    'board.html': '/?c=all',
  };
  if (htmlRedirect[raw]) {
    return Response.redirect(new URL(htmlRedirect[raw], context.request.url).toString(), 302);
  }

  if (!slug || RESERVED.has(slug) || raw.includes('.')) {
    return new Response('Not Found', { status: 404 });
  }

  try {
    await ensureSchema(context.env);
  } catch (e) {
    console.error(e);
  }

  const post = await context.env.DB.prepare(
    'SELECT * FROM posts WHERE slug = ? LIMIT 1'
  )
    .bind(slug)
    .first();

  if (!post) {
    return new Response(notFoundHtml(), {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  const settings = await getSettings(context.env);
  const { results: comments } = await context.env.DB.prepare(
    'SELECT * FROM comments WHERE post_id = ? ORDER BY sort_order ASC, id ASC'
  )
    .bind(post.id)
    .all();

  let bodyHtml = sanitizePostBodyHtml(post.body || '');
  try {
    bodyHtml = await enrichLinkCardPreviews(bodyHtml, { limit: 12, timeoutMs: 3500 });
  } catch (e) {
    console.error('enrichLinkCardPreviews', e);
  }
  const postForRender = { ...post, body: bodyHtml };

  const html = renderPost(postForRender, comments || [], settings, new URL(context.request.url).origin);
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
}

function notFoundHtml() {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <base href="/" />
  <title>글 없음</title>
  <link rel="stylesheet" href="/css/common.css" />
  <link rel="stylesheet" href="/css/blog.css?v=20260723-ogcard2" />
</head>
<body>
  <div class="wrap">
    <div class="post-error">글을 찾을 수 없습니다.<br><a href="/">홈으로</a></div>
  </div>
</body>
</html>`;
}

function renderPost(post, comments, settings, origin = 'https://tennis0915.com') {
  const blogName = settings.blog_name || '행복하서연';
  const profileName = settings.profile_name || '행복하서연';
  const { headHtml } = postHeadTags(post, settings, origin);
  const pixelHead = buildPixelHeadHtml(post.ad_pixels);
  const pixelBody = buildPixelBodyStartHtml(post.ad_pixels);
  const isAd = post.category === '광고';
  const profileImg = settings.profile_image
    ? `<img class="avatar" src="${escapeHtml(settings.profile_image)}" alt="" />`
    : `<div class="avatar placeholder">${escapeHtml(profileName.charAt(0))}</div>`;

  const topIconsHtml = isAd
    ? ''
    : `<a class="blog-icon-btn" href="/" aria-label="홈" title="홈">⌂</a>
        <button type="button" class="blog-icon-btn" data-open-drawer aria-label="메뉴 열기" title="메뉴">≡</button>`;
  const neighborBtnHtml = isAd
    ? ''
    : `<button type="button" class="neighbor-btn">이웃추가</button>`;
  const blogTopHtml = isAd
    ? `<header class="blog-top blog-top--ad-spacer" aria-hidden="true"></header>`
    : `<header class="blog-top">
      <a class="back" href="/" aria-label="뒤로">←</a>
      <a class="blog-name" href="/">${escapeHtml(blogName)}</a>
      <div class="icons">
        ${topIconsHtml}
      </div>
    </header>`;
  const adLockScript = isAd
    ? `
  <script>
    (function () {
      var landingUrl = location.href.split('#')[0];
      try { history.pushState({ adLanding: 1 }, '', landingUrl); } catch (e) {}
      window.addEventListener('popstate', function () {
        try { history.pushState({ adLanding: 1 }, '', landingUrl); } catch (e) {}
        if (location.href.split('#')[0] !== landingUrl) {
          location.replace(landingUrl);
        }
      });
    })();
  </script>`
    : '';

  function renderCommentNode(c, replies = [], isReply = false) {
    const initial = (c.author || '?').charAt(0);
    const avatar = c.profile_image
      ? `<img class="c-avatar c-avatar--img" src="${escapeHtml(c.profile_image)}" alt="" />`
      : `<div class="c-avatar" style="background:${avatarColor(c.author)}">${escapeHtml(initial)}</div>`;
    const replyList = isReply
      ? ''
      : `<div class="comment-replies">${replies
          .map((r) => renderCommentNode(r, [], true))
          .join('')}</div>`;
    return `
      <div class="comment${isReply ? ' comment--reply' : ''}" data-comment-id="${c.id}">
        ${avatar}
        <div class="c-body">
          <div>
            <span class="c-author">${escapeHtml(c.author)}</span>
            <span class="c-date">${escapeHtml(c.created_at)}</span>
          </div>
          <div class="c-text">${escapeHtml(c.content)}</div>
          <div class="c-react" aria-label="추천 비추천">
            <span class="c-react__item c-react__item--up">추천 <em>${Number(c.likes || 0).toLocaleString()}</em></span>
            <span class="c-react__item c-react__item--down">비추천 <em>${Number(c.dislikes || 0).toLocaleString()}</em></span>
          </div>
          ${replyList}
        </div>
      </div>`;
  }

  const roots = [];
  const childrenMap = new Map();
  for (const c of comments) {
    const pid = Number(c.parent_id) || 0;
    if (!pid) roots.push(c);
    else {
      if (!childrenMap.has(pid)) childrenMap.set(pid, []);
      childrenMap.get(pid).push(c);
    }
  }
  for (const c of comments) {
    const pid = Number(c.parent_id) || 0;
    if (pid && !comments.some((x) => Number(x.id) === pid) && !roots.includes(c)) {
      roots.push(c);
    }
  }

  const commentHtml = roots
    .map((c) => renderCommentNode(c, childrenMap.get(Number(c.id)) || [], false))
    .join('');

  const commentDisplay =
    Number(post.comment_count_display) || Number(comments.length) || 0;
  const commentActual = comments.length;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <base href="/" />
  ${headHtml}
  ${pixelHead}
  <link rel="stylesheet" href="/css/common.css" />
  <link rel="stylesheet" href="/css/main.css" />
  <link rel="stylesheet" href="/css/blog.css?v=20260918-react1" />
</head>
<body>
  ${pixelBody}
  <div class="wrap"${isAd ? ' data-ad-landing="1"' : ''}>
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
        ? `<div class="post-cover"><img src="${escapeHtml(post.cover_image)}" alt="" /></div>`
        : ''
    }
    <article class="post-body">${post.body || ''}</article>

    <div class="reaction" data-post-id="${Number(post.id)}">
      <button type="button" class="item" data-reaction="like" aria-label="좋아요">
        <span class="heart">❤</span> <span class="count">${Number(post.likes).toLocaleString()}</span>
      </button>
      <button type="button" class="item" data-reaction="comment" aria-label="댓글">
        💬 <span class="count">${Number(commentDisplay).toLocaleString()}</span>
      </button>
      <button type="button" class="item" data-reaction="share" aria-label="공유">공유</button>
    </div>

    <section class="comment-section"${post.category === '광고' ? ' data-ad="1"' : ''}>
      <div class="head">댓글 <em>${commentActual}</em></div>
      <div class="comment-compose" id="commentCompose" data-post-id="${post.id}" hidden></div>
      <div id="commentList">
        ${commentHtml || `<div class="post-error comment-empty" style="padding:24px 0">등록된 댓글이 없습니다.</div>`}
      </div>
    </section>

    <nav class="bottom-nav" id="cafeBottomNav" aria-label="하단 메뉴">
      <a class="bn-item" href="/" data-bn="home"><span class="ico">⌂</span>홈</a>
      <button type="button" class="bn-item" data-bn="topics"><span class="ico">★</span>주제</button>
      <button type="button" class="bn-item" data-bn="comment"><span class="ico">💬</span>댓글</button>
      <button type="button" class="bn-item" data-bn="news"><span class="ico">♥</span>소식</button>
      <a class="bn-item" href="/login" data-bn="my"><span class="ico">👤</span>MY</a>
    </nav>
  </div>

  <div class="mc-drawer-root" id="navDrawer" hidden>
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
    </aside>
  </div>

  <script src="/js/config.js"></script>
  <script src="/js/cafe-common.js?v=20260918-like1"></script>
  <script src="/js/track-view.js"></script>
  <script src="/js/post-comments.js"></script>
  <script>
    loadCafeTabs('홈');
    bindCafeBottomNav();
    bindPostReactions(${Number(post.id)});
    bindPostComments(${Number(post.id)}${isAd ? ', { ad: true }' : ''});
    trackPageView({ post_id: ${Number(post.id)} });
  </script>
  ${adLockScript}
</body>
</html>`;
}
