function showMsg(el, text, ok = false) {
  if (!el) return;
  el.textContent = text || '';
  el.classList.remove('show', 'ok', 'err');
  if (!text) return;
  el.classList.add('show', ok ? 'ok' : 'err');
}

function openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.hidden = false;
  document.body.style.overflow = 'hidden';
  const focusEl = el.querySelector('input:not([type="hidden"]), button.btn-primary');
  if (focusEl) setTimeout(() => focusEl.focus(), 30);
}

function closeModal(el) {
  const modal = el?.closest?.('.member-modal') || el;
  if (!modal) return;
  modal.hidden = true;
  if (![...document.querySelectorAll('.member-modal')].some((m) => !m.hidden)) {
    document.body.style.overflow = '';
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const open = [...document.querySelectorAll('.member-modal')].find((m) => !m.hidden);
  if (open) closeModal(open);
});

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('msg');
  showMsg(msg, '');
  try {
    const res = await fetch(apiUrl('/api/members'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'login',
        username: document.getElementById('username').value.trim(),
        password: document.getElementById('password').value,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      showMsg(msg, data.error || '로그인 실패');
      return;
    }
    setMemberSession(data.token, data.member);
    const next = new URLSearchParams(location.search).get('next') || '/';
    location.href = next.startsWith('/') ? next : '/';
  } catch {
    showMsg(msg, '서버 연결에 실패했습니다.');
  }
});

document.getElementById('btnOpenFindId')?.addEventListener('click', () => {
  showMsg(document.getElementById('findIdMsg'), '');
  const result = document.getElementById('findIdResult');
  if (result) {
    result.hidden = true;
    result.textContent = '';
  }
  openModal('findIdModal');
});

document.getElementById('btnOpenResetPw')?.addEventListener('click', () => {
  showMsg(document.getElementById('resetPwMsg'), '');
  openModal('resetPwModal');
});

document.querySelectorAll('[data-close-modal]').forEach((el) => {
  el.addEventListener('click', () => closeModal(el));
});

document.getElementById('findIdForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('findIdMsg');
  const result = document.getElementById('findIdResult');
  showMsg(msg, '');
  if (result) result.hidden = true;
  try {
    const res = await fetch(apiUrl('/api/members'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'find_username',
        nickname: document.getElementById('findNickname').value.trim(),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      showMsg(msg, data.error || '찾기 실패');
      return;
    }
    if (result) {
      result.hidden = false;
      result.innerHTML = `가입 아이디: <strong>${escapeHtml(data.username)}</strong>`;
    }
    showMsg(msg, '아이디를 찾았습니다.', true);
  } catch {
    showMsg(msg, '서버 연결에 실패했습니다.');
  }
});

document.getElementById('resetPwForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('resetPwMsg');
  showMsg(msg, '');
  try {
    const res = await fetch(apiUrl('/api/members'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'reset_password',
        username: document.getElementById('resetUsername').value.trim(),
        nickname: document.getElementById('resetNickname').value.trim(),
        new_password: document.getElementById('resetNewPassword').value,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      showMsg(msg, data.error || '변경 실패');
      return;
    }
    showMsg(msg, data.message || '비밀번호가 변경되었습니다.', true);
    setTimeout(() => {
      closeModal(document.getElementById('resetPwModal'));
      document.getElementById('username').value =
        document.getElementById('resetUsername').value.trim();
      document.getElementById('password').focus();
    }, 800);
  } catch {
    showMsg(msg, '서버 연결에 실패했습니다.');
  }
});
