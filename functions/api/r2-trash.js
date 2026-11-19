import { json, options, requireAdmin } from '../_utils.js';
import { ensureTrashTables, collectUsedKeys, keysInText, TRASH_DAYS } from '../_r2-trash.js';

/**
 * 관리자 「사진 정리」
 *   GET  ?view=trash   휴지통(글 삭제로 대기 중인 사진) — 글별로 묶음, 다른 글이 쓰는지 표시
 *   GET  ?view=unused  R2 에 있지만 어디서도 안 쓰는 사진 — 올라간 날짜별로 묶음 (보기 전용)
 *   POST {action:'restore', post_id | keys}   휴지통에서 빼기 (파일은 원래 그대로라 아무것도 안 바뀜)
 *   POST {action:'purge'}                     7일 지난 대기 사진 중 지금도 아무도 안 쓰는 것만 R2 에서 영구 삭제
 *   POST {action:'protect', keys, source}     랜딩발행기 스냅샷 등 DB 밖에서 쓰는 사진 → 절대 안 지움
 */

const PREFIXES = ['uploads/', 'members/', 'videos/'];

export async function onRequestOptions() {
  return options();
}

async function listR2(env) {
  const objects = [];
  for (const prefix of PREFIXES) {
    let cursor;
    for (let page = 0; page < 50; page++) {
      const res = await env.IMAGES.list({ prefix, limit: 1000, cursor });
      for (const o of res.objects) objects.push({ key: o.key, size: o.size, uploaded: o.uploaded });
      if (!res.truncated) break;
      cursor = res.cursor;
    }
  }
  return objects;
}

const publicUrl = (env, key) => {
  const base = (env.R2_PUBLIC_URL || '').replace(/\/$/, '');
  return base ? `${base}/${key}` : `/api/upload?key=${encodeURIComponent(key)}`;
};

const kstDay = (d) => new Date(new Date(d).getTime() + 9 * 3600000).toISOString().slice(0, 10);

export async function onRequestGet(context) {
  const auth = await requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;
  const { env } = context;
  await ensureTrashTables(env);
  const view = new URL(context.request.url).searchParams.get('view') || 'trash';

  const [used, r2] = await Promise.all([collectUsedKeys(env), listR2(env)]);
  const r2map = new Map(r2.map((o) => [o.key, o]));

  if (view === 'unused') {
    const { results: waiting } = await env.DB.prepare("SELECT key FROM r2_trash WHERE status = 'waiting'").all();
    const inTrash = new Set((waiting || []).map((r) => r.key));
    const groups = new Map();
    let total = 0;
    let bytes = 0;
    for (const o of r2) {
      if (used.has(o.key) || inTrash.has(o.key)) continue;
      const day = kstDay(o.uploaded);
      if (!groups.has(day)) groups.set(day, []);
      groups.get(day).push({ key: o.key, url: publicUrl(env, o.key), size: o.size });
      total += 1;
      bytes += o.size;
    }
    return json({
      ok: true,
      total,
      bytes,
      r2Total: r2.length,
      groups: [...groups.entries()]
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([day, files]) => ({ day, count: files.length, bytes: files.reduce((s, f) => s + f.size, 0), files })),
    });
  }

  const { results: rows } = await env.DB.prepare(
    "SELECT * FROM r2_trash WHERE status = 'waiting' ORDER BY trashed_at DESC"
  ).all();
  const now = Date.now();
  const posts = new Map();
  for (const r of rows || []) {
    const g = posts.get(r.post_id) || {
      post_id: r.post_id,
      title: r.post_title,
      slug: r.post_slug,
      trashed_at: r.trashed_at,
      purge_after: r.purge_after,
      daysLeft: Math.max(0, Math.ceil((Date.parse(r.purge_after) - now) / 86400000)),
      files: [],
    };
    const obj = r2map.get(r.key);
    g.files.push({
      key: r.key,
      url: publicUrl(env, r.key),
      size: obj?.size || 0,
      exists: !!obj,
      usedElsewhere: used.has(r.key),
    });
    posts.set(r.post_id, g);
  }
  const list = [...posts.values()];
  return json({
    ok: true,
    days: TRASH_DAYS,
    posts: list,
    total: list.reduce((s, p) => s + p.files.length, 0),
    willDelete: list.reduce((s, p) => s + p.files.filter((f) => f.exists && !f.usedElsewhere).length, 0),
  });
}

export async function onRequestPost(context) {
  const auth = await requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;
  const { env } = context;
  await ensureTrashTables(env);
  const body = await context.request.json().catch(() => ({}));
  const action = body.action;

  if (action === 'restore') {
    if (body.post_id != null) {
      const r = await env.DB.prepare("DELETE FROM r2_trash WHERE status = 'waiting' AND post_id = ?")
        .bind(Number(body.post_id))
        .run();
      return json({ ok: true, restored: r.meta?.changes || 0 });
    }
    const keys = (Array.isArray(body.keys) ? body.keys : []).filter((k) => keysInText(k)[0] === k);
    let restored = 0;
    for (const k of keys) {
      const r = await env.DB.prepare("DELETE FROM r2_trash WHERE status = 'waiting' AND key = ?").bind(k).run();
      restored += r.meta?.changes || 0;
    }
    return json({ ok: true, restored });
  }

  if (action === 'protect') {
    const keys = [...new Set((Array.isArray(body.keys) ? body.keys : []).filter((k) => keysInText(k)[0] === k))];
    const now = new Date().toISOString();
    const source = String(body.source || '').slice(0, 100);
    const stmts = keys.map((k) =>
      env.DB.prepare('INSERT OR IGNORE INTO r2_protected (key, source, added_at) VALUES (?, ?, ?)').bind(k, source, now)
    );
    for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
    // 보호 목록에 들어간 파일은 휴지통에서도 뺀다
    for (const k of keys) await env.DB.prepare("DELETE FROM r2_trash WHERE status = 'waiting' AND key = ?").bind(k).run();
    const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM r2_protected').first();
    return json({ ok: true, added: keys.length, protectedTotal: n });
  }

  if (action === 'purge') {
    const nowIso = new Date().toISOString();
    const { results: due } = await env.DB.prepare(
      "SELECT key, post_id, post_title FROM r2_trash WHERE status = 'waiting' AND purge_after <= ?"
    )
      .bind(nowIso)
      .all();
    if (!due?.length) return json({ ok: true, deleted: 0, kept: 0, message: '기간이 지난 사진이 없습니다.' });

    // 지우기 직전에 DB 전체를 다시 훑는다 (그 사이 다른 글이 같은 사진을 쓰기 시작했을 수 있음)
    const used = await collectUsedKeys(env);
    const toDelete = due.filter((r) => !used.has(r.key)).map((r) => r.key);
    const toKeep = due.filter((r) => used.has(r.key)).map((r) => r.key);

    for (let i = 0; i < toDelete.length; i += 500) {
      await env.IMAGES.delete(toDelete.slice(i, i + 500));
    }
    const mark = (keys, status) =>
      keys.map((k) => env.DB.prepare('UPDATE r2_trash SET status = ?, done_at = ? WHERE key = ?').bind(status, nowIso, k));
    const stmts = [...mark(toDelete, 'deleted'), ...mark(toKeep, 'kept')];
    for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
    return json({ ok: true, deleted: toDelete.length, kept: toKeep.length });
  }

  return json({ error: '알 수 없는 요청입니다.' }, 400);
}
