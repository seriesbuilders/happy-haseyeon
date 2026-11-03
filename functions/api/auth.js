import { json, options, requireAdmin, forgetAdminAuth } from '../_utils.js';

export async function onRequestOptions() {
  return options();
}

/** POST { password } → 단순 비밀번호 비교 */
export async function onRequestPost(context) {
  const body = await context.request.json().catch(() => ({}));
  const password = body.password;

  if (!password) {
    return json({ ok: false, error: '비밀번호를 입력하세요.' }, 400);
  }

  const row = await context.env.DB.prepare(
    'SELECT id FROM admins WHERE password = ? LIMIT 1'
  )
    .bind(password)
    .first();

  if (!row) {
    return json({ ok: false, error: '비밀번호가 올바르지 않습니다.' }, 401);
  }

  return json({ ok: true });
}

/** PUT { password, newPassword } → 비밀번호 변경 */
export async function onRequestPut(context) {
  const auth = await requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  const body = await context.request.json().catch(() => ({}));
  const currentPassword = body.password || body.currentPassword;
  const newPassword = body.newPassword;

  if (!currentPassword) {
    return json({ error: '현재 비밀번호를 입력하세요.' }, 400);
  }

  const row = await context.env.DB.prepare(
    'SELECT id FROM admins WHERE id = ? AND password = ? LIMIT 1'
  )
    .bind(auth.adminId, String(currentPassword))
    .first();

  if (!row) {
    return json({ error: '현재 비밀번호가 올바르지 않습니다.' }, 400);
  }

  if (!newPassword || String(newPassword).length < 4) {
    return json({ error: '새 비밀번호는 4자 이상이어야 합니다.' }, 400);
  }

  if (String(newPassword) === String(currentPassword)) {
    return json({ error: '새 비밀번호는 현재 비밀번호와 달라야 합니다.' }, 400);
  }

  await context.env.DB.prepare('UPDATE admins SET password = ? WHERE id = ?')
    .bind(String(newPassword), auth.adminId)
    .run();
  forgetAdminAuth();

  return json({ ok: true });
}
