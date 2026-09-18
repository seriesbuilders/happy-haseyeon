function avatarColor(name) {
  const colors = ['#03c75a', '#5c6bc0', '#ef5350', '#26a69a', '#ab47bc', '#ffa726'];
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h + name.charCodeAt(i)) % colors.length;
  return colors[h];
}

function commentItemHtml(c, { isReply = false } = {}) {
  const initial = (c.author || '?').charAt(0);
  const avatar = c.profile_image
    ? `<img class="c-avatar c-avatar--img" src="${escapeHtml(c.profile_image)}" alt="" />`
    : `<div class="c-avatar" style="background:${avatarColor(c.author)}">${escapeHtml(initial)}</div>`;
  return `
    <div class="comment${isReply ? ' comment--reply' : ''}" data-comment-id="${c.id || ''}">
      ${avatar}
      <div class="c-body">
        <div>
          <span class="c-author">${escapeHtml(c.author)}</span>
          <span class="c-date">${escapeHtml(c.created_at || '')}</span>
        </div>
        <div class="c-text">${escapeHtml(c.content)}</div>
        <div class="c-react" aria-label="추천 비추천">
          <span class="c-react__item c-react__item--up">추천 <em>${Number(c.likes || 0).toLocaleString()}</em></span>
          <span class="c-react__item c-react__item--down">비추천 <em>${Number(c.dislikes || 0).toLocaleString()}</em></span>
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

const GUEST_NICK_KEY = 'guest-comment-nick';

function getGuestNickname() {
  try {
    return localStorage.getItem(GUEST_NICK_KEY) || '';
  } catch {
    return '';
  }
}

function setGuestNickname(name) {
  try {
    if (name) localStorage.setItem(GUEST_NICK_KEY, name);
  } catch {
    /* ignore */
  }
}

function guestCommentFormHtml(postId, { sheet = false } = {}) {
  const nick = getGuestNickname();
  const formId = sheet ? 'sheetCommentForm' : 'pageCommentForm';
  const nickId = sheet ? 'sheetCommentNick' : 'pageCommentNick';
  const inputId = sheet ? 'sheetCommentInput' : 'pageCommentInput';
  const lenId = sheet ? 'sheetCommentLen' : 'pageCommentLen';
  const btnId = sheet ? 'sheetCommentSubmit' : 'pageCommentSubmit';
  const msgId = sheet ? 'sheetCommentMsg' : 'pageCommentMsg';
  const formClass = sheet ? 'cafe-sheet-comment-form' : 'comment-form';
  return `
    <form class="${formClass}" id="${formId}" data-post-id="${postId}">
      <input type="text" id="${nickId}" class="comment-form-nick" maxlength="40" placeholder="닉네임" value="${escapeHtml(nick)}" required autocomplete="nickname" />
      <textarea id="${inputId}" rows="4" maxlength="2000" placeholder="응원·후기·질문을 남겨 주세요" required></textarea>
      <div class="${sheet ? 'cafe-sheet-comment-actions' : 'comment-form-actions'}">
        <span class="${sheet ? 'cafe-sheet-comment-count' : 'comment-form-count'}"><span id="${lenId}">0</span>/2000</span>
        <button type="submit" class="${sheet ? 'cafe-sheet-btn primary' : 'btn-comment-primary'}" id="${btnId}">등록</button>
      </div>
      <p class="${sheet ? 'cafe-sheet-comment-msg' : 'comment-form-msg'}" id="${msgId}" hidden></p>
    </form>`;
}

function appendCommentToList(data) {
  if (!data?.comment || typeof commentItemHtml !== 'function') return;
  const list = document.getElementById('commentList');
  if (!list) return;
  list.querySelector('.post-error, .comment-empty')?.remove();
  list.insertAdjacentHTML('beforeend', commentItemHtml(data.comment));
  if (data.comment_count != null) updateCommentCounts(data.comment_count);
}

function bindGuestCommentForm(form) {
  if (!form || form.dataset.bound === '1') return;
  form.dataset.bound = '1';

  const postId = Number(form.dataset.postId);
  const isSheet = form.id === 'sheetCommentForm';
  const nickEl = document.getElementById(isSheet ? 'sheetCommentNick' : 'pageCommentNick');
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
    const author = (nickEl?.value || '').trim();
    const content = (input?.value || '').trim();
    if (!author || !content || !postId) return;

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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId, author, content }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (msg) {
          msg.hidden = false;
          msg.textContent = data.error || '등록에 실패했습니다.';
          msg.className = isSheet ? 'cafe-sheet-comment-msg err' : 'comment-form-msg err';
        }
        return;
      }

      setGuestNickname(author);
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

/** 공개 페이지: 닉네임 + 내용으로 바로 댓글 작성 */
function bindPostComments(postId, opts = {}) {
  const box = document.getElementById('commentCompose');
  if (!box) return;
  const id = Number(postId) || Number(box.dataset.postId) || 0;
  box.hidden = false;
  box.dataset.postId = String(id);
  box.innerHTML = guestCommentFormHtml(id, { sheet: false });
  bindGuestCommentForm(document.getElementById('pageCommentForm'));
  document.querySelectorAll('.c-reply-btn').forEach((el) => el.remove());
}

if (typeof window !== 'undefined') {
  window.bindPostComments = bindPostComments;
  window.commentItemHtml = commentItemHtml;
  window.updateCommentCounts = updateCommentCounts;
  window.guestCommentFormHtml = guestCommentFormHtml;
  window.bindGuestCommentForm = bindGuestCommentForm;
  window.getGuestNickname = getGuestNickname;
}
