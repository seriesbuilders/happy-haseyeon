document.getElementById('joinForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('msg');
  msg.classList.remove('show', 'ok');
  msg.classList.add('err');
  try {
    const res = await fetch(apiUrl('/api/members'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'signup',
        username: document.getElementById('username').value.trim(),
        password: document.getElementById('password').value,
        nickname: document.getElementById('nickname').value.trim(),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      msg.textContent = data.error || '가입 실패';
      msg.classList.add('show');
      return;
    }
    setMemberSession(data.token, data.member);
    const next = new URLSearchParams(location.search).get('next') || '/';
    location.href = next.startsWith('/') ? next : '/';
  } catch {
    msg.textContent = '서버 연결에 실패했습니다.';
    msg.classList.add('show');
  }
});
