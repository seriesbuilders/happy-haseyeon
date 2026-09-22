import { json, options, randomToken, requireMember } from '../_utils.js';

export async function onRequestOptions() {
  return options();
}

function publicMember(row) {
  return {
    id: row.id,
    username: row.username,
    nickname: row.nickname,
    profile_image: row.profile_image || '',
  };
}

/** POST actions: signup | login | find_username | reset_password */
export async function onRequestPost(context) {
  const body = await context.request.json().catch(() => ({}));
  const action = body.action || 'login';

  if (action === 'find_username') {
    const nickname = String(body.nickname || '').trim();
    if (!nickname) {
      return json({ error: '닉네임을 입력하세요.' }, 400);
    }
    const row = await context.env.DB.prepare(
      'SELECT username FROM members WHERE nickname = ? LIMIT 1'
    )
      .bind(nickname)
      .first();
    if (!row) {
      return json({ error: '해당 닉네임의 회원을 찾을 수 없습니다.' }, 404);
    }
    return json({ ok: true, username: row.username, nickname });
  }

  if (action === 'reset_password') {
    const username = String(body.username || '').trim();
    const nickname = String(body.nickname || '').trim();
    const newPassword = String(body.new_password || body.password || '');
    if (!username || !nickname) {
      return json({ error: '아이디와 닉네임을 모두 입력하세요.' }, 400);
    }
    if (newPassword.length < 4) {
      return json({ error: '새 비밀번호는 4자 이상이어야 합니다.' }, 400);
    }
    const row = await context.env.DB.prepare(
      'SELECT id FROM members WHERE username = ? AND nickname = ? LIMIT 1'
    )
      .bind(username, nickname)
      .first();
    if (!row) {
      return json(
        { error: '아이디와 닉네임이 일치하는 회원을 찾을 수 없습니다.' },
        404
      );
    }
    const token = randomToken();
    await context.env.DB.prepare(
      'UPDATE members SET password = ?, token = ? WHERE id = ?'
    )
      .bind(newPassword, token, row.id)
      .run();
    return json({ ok: true, message: '비밀번호가 변경되었습니다. 로그인해 주세요.' });
  }

  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const nickname = String(body.nickname || '').trim();

  if (!username || !password) {
    return json({ error: '아이디와 비밀번호를 입력하세요.' }, 400);
  }
  if (username.length < 3 || username.length > 32) {
    return json({ error: '아이디는 3~32자여야 합니다.' }, 400);
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return json({ error: '아이디는 영문·숫자·밑줄만 가능합니다.' }, 400);
  }
  if (password.length < 4) {
    return json({ error: '비밀번호는 4자 이상이어야 합니다.' }, 400);
  }

  if (action === 'signup') {
    if (!nickname) {
      return json({ error: '닉네임을 입력하세요.' }, 400);
    }
    const exists = await context.env.DB.prepare(
      'SELECT id FROM members WHERE username = ? LIMIT 1'
    )
      .bind(username)
      .first();
    if (exists) {
      return json({ error: '이미 사용 중인 아이디입니다.' }, 409);
    }
    const token = randomToken();
    const result = await context.env.DB.prepare(
      `INSERT INTO members (username, password, nickname, profile_image, token)
       VALUES (?, ?, ?, '', ?)`
    )
      .bind(username, password, nickname, token)
      .run();

    return json({
      ok: true,
      token,
      member: {
        id: result.meta.last_row_id,
        username,
        nickname,
        profile_image: '',
      },
    });
  }

  // login
  const row = await context.env.DB.prepare(
    'SELECT * FROM members WHERE username = ? AND password = ? LIMIT 1'
  )
    .bind(username, password)
    .first();

  if (!row) {
    return json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, 401);
  }

  const token = randomToken();
  await context.env.DB.prepare('UPDATE members SET token = ? WHERE id = ?')
    .bind(token, row.id)
    .run();

  return json({
    ok: true,
    token,
    member: publicMember({ ...row, token }),
  });
}

/** GET — 내 정보 */
export async function onRequestGet(context) {
  const auth = await requireMember(context.request, context.env);
  if (!auth.ok) return auth.response;
  return json({ member: publicMember(auth.member) });
}

/** PUT { nickname?, profile_image?, password? } */
export async function onRequestPut(context) {
  const auth = await requireMember(context.request, context.env);
  if (!auth.ok) return auth.response;

  const body = await context.request.json().catch(() => ({}));
  const nickname =
    body.nickname !== undefined
      ? String(body.nickname).trim()
      : auth.member.nickname;
  const profile_image =
    body.profile_image !== undefined
      ? String(body.profile_image)
      : auth.member.profile_image;

  if (!nickname) {
    return json({ error: '닉네임을 입력하세요.' }, 400);
  }

  if (body.password) {
    const pw = String(body.password);
    if (pw.length < 4) {
      return json({ error: '비밀번호는 4자 이상이어야 합니다.' }, 400);
    }
    await context.env.DB.prepare(
      'UPDATE members SET nickname = ?, profile_image = ?, password = ? WHERE id = ?'
    )
      .bind(nickname, profile_image, pw, auth.member.id)
      .run();
  } else {
    await context.env.DB.prepare(
      'UPDATE members SET nickname = ?, profile_image = ? WHERE id = ?'
    )
      .bind(nickname, profile_image, auth.member.id)
      .run();
  }

  return json({
    ok: true,
    member: {
      id: auth.member.id,
      username: auth.member.username,
      nickname,
      profile_image,
    },
  });
}
