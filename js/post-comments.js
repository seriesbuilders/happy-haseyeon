function avatarColor(name) {
  const colors = ['#03c75a', '#5c6bc0', '#ef5350', '#26a69a', '#ab47bc', '#ffa726'];
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h + name.charCodeAt(i)) % colors.length;
  return colors[h];
}

function authReturnPath() {
  try {
    return location.pathname + location.search;
  } catch {
    return '/';
  }
}

function commentGateHtml() {
  const next = encodeURIComponent(authReturnPath());
  return `
    <div class="comment-gate">
      <p class="comment-gate-title">댓글은 회원만 작성할 수 있어요</p>
      <p class="comment-gate-desc">카페 가입 또는 로그인 후 응원·후기·질문을 남겨 주세요.</p>
      <div class="comment-gate-actions">
        <a class="btn-comment-primary" href="/join?next=${next}">카페 가입하기</a>
        <a class="btn-comment-ghost" href="/login?next=${next}">로그인</a>
      </div>
    </div>`;
}

function memberCommentFormHtml(postId, member, { sheet = false } = {}) {
  const name = member.nickname || member.username || '회원';
  const formId = sheet ? 'sheetCommentForm' : 'pageCommentForm';
  const inputId = sheet ? 'sheetCommentInput' : 'pageCommentInput';
  const lenId = sheet ? 'sheetCommentLen' : 'pageCommentLen';
  const btnId = sheet ? 'sheetCommentSubmit' : 'pageCommentSubmit';
  const msgId = sheet ? 'sheetCommentMsg' : 'pageCommentMsg';
  const formClass = sheet ? 'cafe-sheet-comment-form' : 'comment-form';
  const avatarHtml = member.profile_image
    ? `<img class="comment-form-avatar comment-form-avatar--img" src="${escapeHtml(member.profile_image)}" alt="" />`
    : `<span class="comment-form-avatar">${escapeHtml(name.charAt(0))}</span>`;
  return `
    <form class="${formClass}" id="${formId}" data-post-id="${postId}">
      <div class="comment-form-user">
        ${avatarHtml}
        <strong>${escapeHtml(name)}</strong>
        <span>으로 작성</span>
      </div>
      <textarea id="${inputId}" rows="4" maxlength="2000" placeholder="응원·후기·질문을 남겨 주세요" required></textarea>
      <div class="${sheet ? 'cafe-sheet-comment-actions' : 'comment-form-actions'}">
        <span class="${sheet ? 'cafe-sheet-comment-count' : 'comment-form-count'}"><span id="${lenId}">0</span>/2000</span>
        <button type="submit" class="${sheet ? 'cafe-sheet-btn primary' : 'btn-comment-primary'}" id="${btnId}">등록</button>
      </div>
      <p class="${sheet ? 'cafe-sheet-comment-msg' : 'comment-form-msg'}" id="${msgId}" hidden></p>
    </form>`;
}

function commentItemHtml(c, { isReply = false } = {}) {
  const initial = (c.author || '?').charAt(0);
  const avatar = c.profile_image
    ? `<img class="c-avatar c-avatar--img" src="${escapeHtml(c.profile_image)}" alt="" />`
    : `<div class="c-avatar" style="background:${avatarColor(c.author)}">${escapeHtml(initial)}</div>`;
  const cid = Number(c.id) || 0;
  const mid = Number(c.member_id) || '';
  return `
    <div class="comment${isReply ? ' comment--reply' : ''}" data-comment-id="${cid || ''}" data-member-id="${mid}" data-is-admin="${Number(c.is_admin) ? 1 : 0}">
      ${avatar}
      <div class="c-body">
        <div>
          <span class="c-author">${escapeHtml(c.author)}</span>
          <span class="c-date">${escapeHtml(c.created_at || '')}</span>
        </div>
        <div class="c-text">${escapeHtml(c.content)}</div>
        <div class="c-owner-actions" hidden>
          <button type="button" class="c-owner-btn" data-edit-own="${cid}">수정</button>
          <button type="button" class="c-owner-btn c-owner-btn--danger" data-del-own="${cid}">삭제</button>
        </div>
        <div class="c-react" aria-label="추천 비추천" data-comment-id="${cid}">
          <button type="button" class="c-react__item c-react__item--up" data-vote="up" aria-label="추천">추천 <em>${Number(c.likes || 0).toLocaleString()}</em></button>
          <button type="button" class="c-react__item c-react__item--down" data-vote="down" aria-label="비추천">비추천 <em>${Number(c.dislikes || 0).toLocaleString()}</em></button>
        </div>
        ${isReply ? '' : '<div class="comment-replies"></div>'}
      </div>
    </div>`;
}

function updateCommentCounts(n) {
  const head = document.querySelector('.comment-section .head em');
  if (head) head.textContent = String(n);
  const reactionCount = document.querySelector('.reaction [data-reaction="comment"] .count');
  if (reactionCount) reactionCount.textContent = Number(n).toLocaleString();
}

const COMMENT_PER_PAGE = 20;
let commentPage = 1;

function getRootComments(list) {
  if (!list) return [];
  return [...list.children].filter(
    (el) =>
      el.nodeType === 1 &&
      el.classList.contains('comment') &&
      !el.classList.contains('comment--reply')
  );
}

function appendCommentToList(data) {
  if (!data?.comment || typeof commentItemHtml !== 'function') return;
  const list = document.getElementById('commentList');
  if (!list) return;
  list.querySelector('.post-error, .comment-empty')?.remove();
  list.insertAdjacentHTML('beforeend', commentItemHtml(data.comment));
  if (data.comment_count != null) updateCommentCounts(data.comment_count);
  bindCommentReactions(list);
  revealOwnCommentActions(list);
  const roots = getRootComments(list);
  commentPage = Math.max(1, Math.ceil(roots.length / COMMENT_PER_PAGE));
  applyCommentPagination();
}

function buildCommentPagerHtml(page, totalPages) {
  if (totalPages <= 1) return '';
  const maxButtons = 10;
  let start = Math.max(1, page - Math.floor(maxButtons / 2));
  let end = Math.min(totalPages, start + maxButtons - 1);
  start = Math.max(1, end - maxButtons + 1);
  const buttons = [];
  for (let i = start; i <= end; i++) {
    buttons.push(
      `<button type="button" class="comment-pager__btn${i === page ? ' is-active' : ''}" data-cpage="${i}">${i}</button>`
    );
  }
  const prev =
    page > 1
      ? `<button type="button" class="comment-pager__btn" data-cpage="${page - 1}">‹</button>`
      : '';
  const next =
    page < totalPages
      ? `<button type="button" class="comment-pager__btn" data-cpage="${page + 1}">다음 ›</button>`
      : '';
  return `${prev}${buttons.join('')}${next}`;
}

function applyCommentPagination() {
  const list = document.getElementById('commentList');
  const pager = document.getElementById('commentPager');
  if (!list) return;
  const roots = getRootComments(list);
  const totalPages = Math.max(1, Math.ceil(roots.length / COMMENT_PER_PAGE) || 1);
  if (commentPage > totalPages) commentPage = totalPages;
  if (commentPage < 1) commentPage = 1;
  const start = (commentPage - 1) * COMMENT_PER_PAGE;
  const end = start + COMMENT_PER_PAGE;
  roots.forEach((el, idx) => {
    const hide = idx < start || idx >= end;
    el.classList.toggle('is-page-hidden', hide);
    el.hidden = hide;
  });
  if (!pager) return;
  if (roots.length <= COMMENT_PER_PAGE) {
    pager.hidden = true;
    pager.innerHTML = '';
    return;
  }
  pager.hidden = false;
  pager.innerHTML = buildCommentPagerHtml(commentPage, totalPages);
}

function bindCommentPagination() {
  const pager = document.getElementById('commentPager');
  if (pager && pager.dataset.bound !== '1') {
    pager.dataset.bound = '1';
    pager.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cpage]');
      if (!btn) return;
      const page = Number(btn.dataset.cpage) || 1;
      if (page === commentPage) return;
      commentPage = page;
      applyCommentPagination();
      document.querySelector('.comment-section')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }
  commentPage = 1;
  applyCommentPagination();
}

function getCommentVote(commentId) {
  try {
    return localStorage.getItem(`comment-vote:${commentId}`) || '';
  } catch {
    return '';
  }
}

function setCommentVote(commentId, vote) {
  try {
    const key = `comment-vote:${commentId}`;
    if (vote) localStorage.setItem(key, vote);
    else localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function applyCommentVoteUi(box, vote) {
  const up = box.querySelector('[data-vote="up"]');
  const down = box.querySelector('[data-vote="down"]');
  up?.classList.toggle('is-active', vote === 'up');
  down?.classList.toggle('is-active', vote === 'down');
  up?.setAttribute('aria-pressed', vote === 'up' ? 'true' : 'false');
  down?.setAttribute('aria-pressed', vote === 'down' ? 'true' : 'false');
}

function setReactCount(btn, n) {
  const em = btn?.querySelector('em');
  if (em) em.textContent = Math.max(0, Number(n) || 0).toLocaleString();
}

function readReactCount(btn) {
  return parseInt(String(btn?.querySelector('em')?.textContent || '0').replace(/,/g, ''), 10) || 0;
}

function bindCommentReactions(root) {
  const scope = root || document;
  scope.querySelectorAll('.c-react[data-comment-id]').forEach((box) => {
    if (box.dataset.bound === '1') return;
    const commentId = Number(box.dataset.commentId) || 0;
    if (!commentId) return;
    box.dataset.bound = '1';

    const current = getCommentVote(commentId);
    if (current === 'up' || current === 'down') applyCommentVoteUi(box, current);

    box.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-vote]');
      if (!btn || box.dataset.busy === '1') return;
      e.preventDefault();

      const next = btn.dataset.vote;
      const prev = getCommentVote(commentId) || null;
      const to = prev === next ? null : next;

      const upBtn = box.querySelector('[data-vote="up"]');
      const downBtn = box.querySelector('[data-vote="down"]');
      const prevLikes = readReactCount(upBtn);
      const prevDislikes = readReactCount(downBtn);

      let likes = prevLikes;
      let dislikes = prevDislikes;
      if (prev === 'up') likes = Math.max(0, likes - 1);
      if (prev === 'down') dislikes = Math.max(0, dislikes - 1);
      if (to === 'up') likes += 1;
      if (to === 'down') dislikes += 1;

      applyCommentVoteUi(box, to);
      setCommentVote(commentId, to);
      setReactCount(upBtn, likes);
      setReactCount(downBtn, dislikes);

      box.dataset.busy = '1';
      try {
        const api =
          typeof apiUrl === 'function'
            ? apiUrl(`/api/comments/${commentId}/react`)
            : `/api/comments/${commentId}/react`;
        const res = await fetch(api, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: prev, to }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'react failed');
        if (data.likes != null) setReactCount(upBtn, data.likes);
        if (data.dislikes != null) setReactCount(downBtn, data.dislikes);
      } catch {
        applyCommentVoteUi(box, prev);
        setCommentVote(commentId, prev);
        setReactCount(upBtn, prevLikes);
        setReactCount(downBtn, prevDislikes);
      } finally {
        box.dataset.busy = '0';
      }
    });
  });
}

function revealOwnCommentActions(root) {
  const member =
    typeof getMemberInfo === 'function' ? getMemberInfo() : null;
  const myId = Number(member?.id) || 0;
  const scope = root || document;
  scope.querySelectorAll('.comment[data-comment-id]').forEach((el) => {
    const actions = el.querySelector(':scope > .c-body > .c-owner-actions');
    if (!actions) return;
    const mid = Number(el.dataset.memberId) || 0;
    actions.hidden = !(myId && mid && myId === mid);
  });
}

function bindOwnCommentActions(root) {
  const scope = root || document;
  const list = scope.querySelector?.('#commentList') || document.getElementById('commentList') || scope;
  if (!list || list.dataset.ownerBound === '1') {
    revealOwnCommentActions(list);
    return;
  }
  list.dataset.ownerBound = '1';

  list.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('[data-edit-own]');
    const delBtn = e.target.closest('[data-del-own]');
    const saveBtn = e.target.closest('[data-save-own]');
    const cancelBtn = e.target.closest('[data-cancel-own]');

    if (editBtn) {
      const id = Number(editBtn.dataset.editOwn);
      const item = list.querySelector(`.comment[data-comment-id="${id}"]`);
      const textEl = item?.querySelector('.c-text');
      if (!item || !textEl || item.dataset.editing === '1') return;
      item.dataset.editing = '1';
      const prev = textEl.textContent || '';
      item.dataset.prevText = prev;
      textEl.outerHTML = `
        <div class="c-edit-box">
          <textarea class="c-edit-input" maxlength="2000" rows="3">${escapeHtml(prev)}</textarea>
          <div class="c-edit-actions">
            <button type="button" class="c-owner-btn" data-cancel-own="${id}">취소</button>
            <button type="button" class="c-owner-btn c-owner-btn--primary" data-save-own="${id}">저장</button>
          </div>
        </div>`;
      return;
    }

    if (cancelBtn) {
      const id = Number(cancelBtn.dataset.cancelOwn);
      const item = list.querySelector(`.comment[data-comment-id="${id}"]`);
      const box = item?.querySelector('.c-edit-box');
      if (!item || !box) return;
      const prev = item.dataset.prevText || '';
      box.outerHTML = `<div class="c-text">${escapeHtml(prev)}</div>`;
      item.dataset.editing = '0';
      return;
    }

    if (saveBtn) {
      const id = Number(saveBtn.dataset.saveOwn);
      const item = list.querySelector(`.comment[data-comment-id="${id}"]`);
      const input = item?.querySelector('.c-edit-input');
      const content = (input?.value || '').trim();
      if (!content) return;
      const token = typeof getMemberToken === 'function' ? getMemberToken() : '';
      if (!token) {
        alert('로그인이 필요합니다.');
        return;
      }
      saveBtn.disabled = true;
      try {
        const api = typeof apiUrl === 'function' ? apiUrl('/api/comments') : '/api/comments';
        const res = await fetch(api, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-Member-Token': token,
          },
          body: JSON.stringify({ id, content }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          if (typeof clearMemberSession === 'function') clearMemberSession();
          alert('로그인이 만료되었습니다. 다시 로그인해 주세요.');
          return;
        }
        if (!res.ok) {
          alert(data.error || '수정에 실패했습니다.');
          return;
        }
        const box = item.querySelector('.c-edit-box');
        if (box) {
          box.outerHTML = `<div class="c-text">${escapeHtml(content)}</div>`;
        }
        item.dataset.editing = '0';
      } catch {
        alert('서버 연결에 실패했습니다.');
      } finally {
        saveBtn.disabled = false;
      }
      return;
    }

    if (delBtn) {
      const id = Number(delBtn.dataset.delOwn);
      if (!id || !confirm('이 댓글을 삭제할까요?')) return;
      const token = typeof getMemberToken === 'function' ? getMemberToken() : '';
      if (!token) {
        alert('로그인이 필요합니다.');
        return;
      }
      try {
        const api =
          typeof apiUrl === 'function'
            ? apiUrl(`/api/comments?id=${id}`)
            : `/api/comments?id=${id}`;
        const res = await fetch(api, {
          method: 'DELETE',
          headers: { 'X-Member-Token': token },
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          if (typeof clearMemberSession === 'function') clearMemberSession();
          alert('로그인이 만료되었습니다. 다시 로그인해 주세요.');
          return;
        }
        if (!res.ok) {
          alert(data.error || '삭제에 실패했습니다.');
          return;
        }
        const item = list.querySelector(`.comment[data-comment-id="${id}"]`);
        item?.remove();
        if (data.comment_count != null) updateCommentCounts(data.comment_count);
        if (!list.querySelector('.comment')) {
          list.innerHTML =
            '<div class="post-error comment-empty" style="padding:24px 0">등록된 댓글이 없습니다.</div>';
        }
        applyCommentPagination();
      } catch {
        alert('서버 연결에 실패했습니다.');
      }
    }
  });

  revealOwnCommentActions(list);
}

function bindMemberCommentForm(form) {
  if (!form || form.dataset.bound === '1') return;
  form.dataset.bound = '1';

  const postId = Number(form.dataset.postId);
  const isSheet = form.id === 'sheetCommentForm';
  const input = document.getElementById(isSheet ? 'sheetCommentInput' : 'pageCommentInput');
  const len = document.getElementById(isSheet ? 'sheetCommentLen' : 'pageCommentLen');
  const msg = document.getElementById(isSheet ? 'sheetCommentMsg' : 'pageCommentMsg');
  const btn = document.getElementById(isSheet ? 'sheetCommentSubmit' : 'pageCommentSubmit');
  let submitting = false;

  input?.addEventListener('input', () => {
    if (len) len.textContent = String(input.value.length);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitting) return;
    const content = (input?.value || '').trim();
    if (!content || !postId) return;
    const token = typeof getMemberToken === 'function' ? getMemberToken() : '';
    if (!token) {
      renderComposeForAuth(postId);
      return;
    }

    if (msg) msg.hidden = true;
    submitting = true;
    if (btn) {
      btn.disabled = true;
      btn.textContent = '등록 중…';
    }

    try {
      const api = typeof apiUrl === 'function' ? apiUrl('/api/comments') : '/api/comments';
      const res = await fetch(api, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Member-Token': token,
        },
        body: JSON.stringify({ post_id: postId, content }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        if (typeof clearMemberSession === 'function') clearMemberSession();
        renderComposeForAuth(postId);
        return;
      }
      if (!res.ok) {
        if (msg) {
          msg.hidden = false;
          msg.textContent = data.error || '등록에 실패했습니다.';
          msg.className = isSheet ? 'cafe-sheet-comment-msg err' : 'comment-form-msg err';
        }
        return;
      }

      if (input) input.value = '';
      if (len) len.textContent = '0';
      appendCommentToList(data);

      if (msg) {
        msg.hidden = false;
        msg.textContent = '댓글이 등록되었습니다.';
        msg.className = isSheet ? 'cafe-sheet-comment-msg ok' : 'comment-form-msg ok';
      }
      if (isSheet && typeof closeCafeSheet === 'function') {
        setTimeout(() => closeCafeSheet(), 900);
      }
    } catch {
      if (msg) {
        msg.hidden = false;
        msg.textContent = '서버 연결에 실패했습니다.';
        msg.className = isSheet ? 'cafe-sheet-comment-msg err' : 'comment-form-msg err';
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

function renderComposeForAuth(postId, { show = false } = {}) {
  const box = document.getElementById('commentCompose');
  if (!box) return;
  const id = Number(postId) || Number(box.dataset.postId) || 0;
  box.dataset.postId = String(id);
  const member =
    typeof getMemberInfo === 'function' && typeof getMemberToken === 'function' && getMemberToken()
      ? getMemberInfo()
      : null;

  if (member) {
    box.innerHTML = memberCommentFormHtml(id, member, { sheet: false });
    bindMemberCommentForm(document.getElementById('pageCommentForm'));
  } else {
    box.innerHTML = commentGateHtml();
  }
  if (show) box.hidden = false;
}

/** 공개 페이지: 회원 로그인 시 작성, 아니면 가입/로그인 유도 */
function bindPostComments(postId) {
  const box = document.getElementById('commentCompose');
  if (!box) return;
  const id = Number(postId) || Number(box.dataset.postId) || 0;
  box.hidden = true;
  renderComposeForAuth(id);
  document.querySelectorAll('.c-reply-btn').forEach((el) => el.remove());
  bindCommentReactions(document.getElementById('commentList') || document);
  bindOwnCommentActions(document.getElementById('commentList') || document);
  bindCommentPagination();
}

function showCommentCompose() {
  const box = document.getElementById('commentCompose');
  if (!box) {
    document.querySelector('.comment-section')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
    return;
  }
  const id = Number(box.dataset.postId) || 0;
  renderComposeForAuth(id, { show: true });
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  requestAnimationFrame(() => {
    document.getElementById('pageCommentInput')?.focus();
  });
}

if (typeof window !== 'undefined') {
  window.bindPostComments = bindPostComments;
  window.showCommentCompose = showCommentCompose;
  window.commentItemHtml = commentItemHtml;
  window.updateCommentCounts = updateCommentCounts;
  window.commentGateHtml = commentGateHtml;
  window.memberCommentFormHtml = memberCommentFormHtml;
  window.bindMemberCommentForm = bindMemberCommentForm;
  window.bindCommentReactions = bindCommentReactions;
  window.revealOwnCommentActions = revealOwnCommentActions;
  window.renderComposeForAuth = renderComposeForAuth;
}
