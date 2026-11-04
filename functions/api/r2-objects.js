import { json, options, requireAdmin } from '../_utils.js';

export async function onRequestOptions() {
  return options();
}

/**
 * GET /api/r2-objects?prefix=uploads/  — 관리자 전용. R2 버킷의 파일 목록(이름·크기·올린 시각)을 돌려준다.
 * 읽기만 하며 아무것도 지우지 않는다. 안 쓰는 파일을 찾는 점검용.
 */
export async function onRequestGet(context) {
  const auth = await requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  const url = new URL(context.request.url);
  const prefix = url.searchParams.get('prefix') || '';
  const objects = [];
  let cursor;
  for (let page = 0; page < 50; page++) {
    const res = await context.env.IMAGES.list({ prefix, limit: 1000, cursor });
    for (const o of res.objects) objects.push({ key: o.key, size: o.size, uploaded: o.uploaded });
    if (!res.truncated) break;
    cursor = res.cursor;
  }
  return json({ ok: true, count: objects.length, objects });
}
