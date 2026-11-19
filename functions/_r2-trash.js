/**
 * R2 사진 휴지통
 *
 * - 글을 지우면 그 글(본문·대표이미지·SEO·댓글 프로필 등)에 들어 있던 R2 파일 이름을 r2_trash 에 "대기"로 적는다.
 *   파일은 그대로 두므로 7일 안에는 언제든 되돌릴 수 있다.
 * - 7일이 지난 뒤 관리자 「사진 정리」에서 [기간 지난 사진 비우기]를 누르면,
 *   그 순간 DB 전체(모든 표의 글자 칸)를 다시 훑어 아직 아무도 안 쓰는 파일만 R2 에서 지운다.
 *   (같은 사진을 다른 글이 같이 쓰거나, 그 사이 같은 네이버 글을 다시 가져와 재사용하면 지우지 않는다)
 * - r2_protected: 랜딩발행기 스냅샷처럼 DB 밖에서 쓰는 파일. 절대 지우지 않는다.
 */

export const TRASH_DAYS = 7;

/** R2 파일 이름 모양 (uploads/… · members/… · videos/…). 안 쓰는 파일 찾기 스크립트와 같은 규칙 */
const KEY_RE = /(?:uploads|members|videos)\/[A-Za-z0-9._-]+/g;

export function keysInText(text) {
  const s = String(text || '').replace(/%2F/gi, '/');
  return s.match(KEY_RE) || [];
}

export async function ensureTrashTables(env) {
  await env.DB.batch([
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS r2_trash (
        key TEXT PRIMARY KEY,
        post_id INTEGER,
        post_title TEXT,
        post_slug TEXT,
        trashed_at TEXT NOT NULL,
        purge_after TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'waiting',
        done_at TEXT
      )`
    ),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS r2_protected (
        key TEXT PRIMARY KEY,
        source TEXT,
        added_at TEXT NOT NULL
      )`
    ),
  ]);
}

const SKIP_TABLES = new Set(['r2_trash', 'r2_protected']);

/** DB 안의 모든 표에서 글자 칸 목록 */
async function textColumnsByTable(env) {
  const { results: tables } = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%'"
  ).all();
  const out = [];
  for (const { name } of tables || []) {
    if (SKIP_TABLES.has(name)) continue;
    const { results: cols } = await env.DB.prepare(`PRAGMA table_info("${name.replace(/"/g, '""')}")`).all();
    const textCols = (cols || [])
      .filter((c) => !c.type || /CHAR|CLOB|TEXT/i.test(c.type))
      .map((c) => c.name);
    if (textCols.length) out.push({ table: name, cols: textCols });
  }
  return out;
}

/**
 * DB 전체에서 지금 쓰이고 있는 R2 파일 이름 모음 (+ 보호 목록).
 * 큰 글(본문 수백 KB)이 많아 한 번에 다 읽지 않고 몇 줄씩 나눠 읽는다.
 */
export async function collectUsedKeys(env) {
  const used = new Set();
  for (const { table, cols } of await textColumnsByTable(env)) {
    const q = (n) => `"${n.replace(/"/g, '""')}"`;
    // 사진 주소가 들어 있을 수 있는 칸만 이어 붙여 읽는다
    const concat = cols.map((c) => `COALESCE(${q(c)}, '')`).join(` || ' ' || `);
    const hasKey = cols
      .map((c) => `(instr(${q(c)}, 'uploads') > 0 OR instr(${q(c)}, 'members') > 0 OR instr(${q(c)}, 'videos') > 0)`)
      .join(' OR ');
    let last = -1;
    for (let page = 0; page < 10000; page++) {
      const { results } = await env.DB.prepare(
        `SELECT rowid AS _rid, ${concat} AS _txt FROM ${q(table)} WHERE rowid > ? AND (${hasKey}) ORDER BY rowid LIMIT 8`
      )
        .bind(last)
        .all();
      if (!results?.length) break;
      for (const row of results) {
        for (const k of keysInText(row._txt)) used.add(k);
        last = row._rid;
      }
      if (results.length < 8) break;
    }
  }
  const { results: prot } = await env.DB.prepare('SELECT key FROM r2_protected').all();
  for (const r of prot || []) used.add(r.key);
  return used;
}

/** 지울 글(과 그 댓글)에 들어 있는 R2 파일 이름 */
export async function keysOfPost(env, postId) {
  const keys = new Set();
  const post = await env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(postId).first();
  if (!post) return { post: null, keys: [] };
  for (const v of Object.values(post)) if (typeof v === 'string') keysInText(v).forEach((k) => keys.add(k));
  const { results: comments } = await env.DB.prepare('SELECT * FROM comments WHERE post_id = ?').bind(postId).all();
  for (const c of comments || []) {
    for (const v of Object.values(c)) if (typeof v === 'string') keysInText(v).forEach((k) => keys.add(k));
  }
  return { post, keys: [...keys] };
}

/** 글 삭제 직전에 부른다: 그 글의 파일을 휴지통(대기)에 적는다. 파일은 아직 안 지운다. */
export async function trashKeysOfPost(env, postId) {
  await ensureTrashTables(env);
  const { post, keys } = await keysOfPost(env, postId);
  if (!post || !keys.length) return 0;
  const now = new Date();
  const after = new Date(now.getTime() + TRASH_DAYS * 86400000);
  const stmts = keys.map((k) =>
    env.DB.prepare(
      `INSERT INTO r2_trash (key, post_id, post_title, post_slug, trashed_at, purge_after, status)
       VALUES (?, ?, ?, ?, ?, ?, 'waiting')
       ON CONFLICT(key) DO UPDATE SET post_id = excluded.post_id, post_title = excluded.post_title,
         post_slug = excluded.post_slug, trashed_at = excluded.trashed_at, purge_after = excluded.purge_after,
         status = 'waiting', done_at = NULL`
    ).bind(k, post.id, post.title || '', post.slug || '', now.toISOString(), after.toISOString())
  );
  for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
  return keys.length;
}
