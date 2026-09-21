import { MOUNJARO_POPULAR } from './_seed-mounjaro.js';

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password, X-Member-Token',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    },
  });
}

export function options() {
  return json({ ok: true });
}

/** 단순 테이블 비밀번호 비교 (세션/JWT 없음, X-Admin-Password 헤더) */
export async function requireAdmin(request, env) {
  const password = request.headers.get('X-Admin-Password');

  if (!password) {
    return { ok: false, response: json({ error: '비밀번호가 필요합니다.' }, 401) };
  }

  const row = await env.DB.prepare(
    'SELECT id FROM admins WHERE password = ? LIMIT 1'
  )
    .bind(password)
    .first();

  if (!row) {
    return { ok: false, response: json({ error: '비밀번호가 올바르지 않습니다.' }, 401) };
  }

  return { ok: true, adminId: row.id };
}

export const AD_CATEGORY = '광고';
export const SITE_ORIGIN = 'https://tennis0915.com';

/** Asia/Seoul(UTC+9) 기준 YYYY-MM-DD */
export function kstDateString(d = new Date()) {
  const t = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return t.toISOString().slice(0, 10);
}

/** Asia/Seoul(UTC+9) 기준 YYYY.MM.DD HH:MM (24시간) — 댓글 표시용 */
export function kstDateTimeDisplay(d = new Date()) {
  const t = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = t.getUTCFullYear();
  const m = String(t.getUTCMonth() + 1).padStart(2, '0');
  const day = String(t.getUTCDate()).padStart(2, '0');
  const h = String(t.getUTCHours()).padStart(2, '0');
  const min = String(t.getUTCMinutes()).padStart(2, '0');
  return `${y}.${m}.${day} ${h}:${min}`;
}

/** 일별 조회수 테이블 보장 */
export async function ensureViewsTables(env) {
  await env.DB.batch([
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS post_daily_views (
        post_id INTEGER NOT NULL,
        view_date TEXT NOT NULL,
        views INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (post_id, view_date),
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
      )`),
    env.DB.prepare(
      'CREATE INDEX IF NOT EXISTS idx_post_daily_views_date ON post_daily_views(view_date)'
    ),
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS page_daily_views (
        page_key TEXT NOT NULL,
        view_date TEXT NOT NULL,
        views INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (page_key, view_date)
      )`),
    env.DB.prepare(
      'CREATE INDEX IF NOT EXISTS idx_page_daily_views_date ON page_daily_views(view_date)'
    ),
  ]);
}

export function randomSlug(len = 8) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < len; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

/** 광고 블로그용 — 식별이 어려운 암호화형 코드 */
export function encryptedSlug(byteLen = 18) {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  try {
    const arr = new Uint8Array(byteLen);
    crypto.getRandomValues(arr);
    let s = '';
    for (let i = 0; i < arr.length; i++) s += chars[arr[i] % chars.length];
    return s;
  } catch (_) {
    let s = '';
    for (let i = 0; i < byteLen; i++) {
      s += chars[Math.floor(Math.random() * chars.length)];
    }
    return s;
  }
}

/** 공개 URL (광고는 끝에 / 포함) */
export function publicPostUrl(slug, { ad = false, origin = SITE_ORIGIN } = {}) {
  const base = String(origin || SITE_ORIGIN).replace(/\/$/, '');
  const code = String(slug || '').replace(/^\/+|\/+$/g, '');
  if (!code) return `${base}/`;
  return ad ? `${base}/${code}/` : `${base}/${code}`;
}

export function randomToken(len = 32) {
  return randomSlug(len) + randomSlug(len);
}

/** 회원 토큰 인증 (X-Member-Token) */
export async function requireMember(request, env) {
  const token = request.headers.get('X-Member-Token');
  if (!token) {
    return { ok: false, response: json({ error: '로그인이 필요합니다.' }, 401) };
  }
  const row = await env.DB.prepare(
    'SELECT id, username, nickname, profile_image FROM members WHERE token = ? LIMIT 1'
  )
    .bind(token)
    .first();
  if (!row) {
    return { ok: false, response: json({ error: '로그인이 만료되었습니다.' }, 401) };
  }
  return { ok: true, member: row };
}

export async function getSettings(env) {
  const { results } = await env.DB.prepare('SELECT key, value FROM settings').all();
  const map = {};
  for (const r of results || []) map[r.key] = r.value;
  return map;
}

let schemaReady = false;

/** posts 테이블에 필요한 컬럼이 있는지 확인하고 없으면 추가 */
export async function ensurePostsColumns(env) {
  let cols = [];
  try {
    const info = await env.DB.prepare('PRAGMA table_info(posts)').all();
    cols = (info.results || []).map((c) => c.name);
  } catch (e) {
    console.error('PRAGMA table_info(posts)', e);
    // PRAGMA 실패 시에도 ALTER 시도 (이미 있으면 무시)
    cols = [];
  }

  const addIfMissing = async (name, ddl) => {
    if (cols.length && cols.includes(name)) return;
    try {
      await env.DB.prepare(ddl).run();
    } catch (e) {
      const msg = String(e?.message || e);
      // duplicate column name 등은 정상
      if (!/duplicate column/i.test(msg)) {
        console.error(`ALTER ADD ${name}`, e);
      }
    }
  };

  await addIfMissing(
    'category',
    "ALTER TABLE posts ADD COLUMN category TEXT DEFAULT '후기'"
  );
  await addIfMissing(
    'cover_image',
    "ALTER TABLE posts ADD COLUMN cover_image TEXT DEFAULT ''"
  );
  await addIfMissing(
    'seo_title',
    "ALTER TABLE posts ADD COLUMN seo_title TEXT DEFAULT ''"
  );
  await addIfMissing(
    'seo_description',
    "ALTER TABLE posts ADD COLUMN seo_description TEXT DEFAULT ''"
  );
  await addIfMissing(
    'ad_pixels',
    "ALTER TABLE posts ADD COLUMN ad_pixels TEXT DEFAULT ''"
  );
  await addIfMissing(
    'share_count_display',
    'ALTER TABLE posts ADD COLUMN share_count_display INTEGER NOT NULL DEFAULT 0'
  );
}

/** comments 테이블 컬럼 보강 */
export async function ensureCommentsColumns(env) {
  let cols = [];
  try {
    const info = await env.DB.prepare('PRAGMA table_info(comments)').all();
    cols = (info.results || []).map((c) => c.name);
  } catch (e) {
    console.error('PRAGMA table_info(comments)', e);
    cols = [];
  }

  const addIfMissing = async (name, ddl) => {
    if (cols.length && cols.includes(name)) return;
    try {
      await env.DB.prepare(ddl).run();
    } catch (e) {
      const msg = String(e?.message || e);
      if (!/duplicate column/i.test(msg)) {
        console.error(`ALTER ADD comments.${name}`, e);
      }
    }
  };

  await addIfMissing(
    'dislikes',
    'ALTER TABLE comments ADD COLUMN dislikes INTEGER NOT NULL DEFAULT 0'
  );
  await addIfMissing(
    'profile_image',
    "ALTER TABLE comments ADD COLUMN profile_image TEXT NOT NULL DEFAULT ''"
  );
  await addIfMissing(
    'parent_id',
    'ALTER TABLE comments ADD COLUMN parent_id INTEGER'
  );
  await addIfMissing(
    'is_pinned',
    'ALTER TABLE comments ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0'
  );
}

/** 댓글 표시 정렬: 고정 → 추천수 → 최신(id) */
export function sortCommentsForDisplay(list) {
  return [...(list || [])].sort((a, b) => {
    const pinDiff = (Number(b.is_pinned) || 0) - (Number(a.is_pinned) || 0);
    if (pinDiff) return pinDiff;
    const likeDiff = (Number(b.likes) || 0) - (Number(a.likes) || 0);
    if (likeDiff) return likeDiff;
    return (Number(b.id) || 0) - (Number(a.id) || 0);
  });
}

/** 픽셀/태그 적용 기록 (관리자 공용 메모) */
export async function ensurePixelMemory(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS pixel_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope TEXT NOT NULL DEFAULT 'global',
      channel TEXT NOT NULL DEFAULT '',
      identifier TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      post_id INTEGER,
      post_title TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now','+9 hours'))
    )
  `).run();

  try {
    const { AD_COMMON_GTM_ID } = await import('./_pixels.js');
    const exists = await env.DB.prepare(
      `SELECT id FROM pixel_memory
       WHERE scope = 'global' AND channel = 'GTM' AND identifier = ?
       LIMIT 1`
    )
      .bind(AD_COMMON_GTM_ID)
      .first();
    if (!exists) {
      await env.DB.prepare(
        `INSERT INTO pixel_memory (scope, channel, identifier, note, post_title)
         VALUES ('global', 'GTM', ?, ?, '')`
      )
        .bind(
          AD_COMMON_GTM_ID,
          '광고 블로그 랜딩 전체 공통 적용. Google Ads(AW) 전환 태그와 별도 운영. head + body noscript 자동 삽입.'
        )
        .run();
    }
  } catch (e) {
    console.error('seed pixel_memory GTM', e);
  }
}

/** 로컬/배포 공통 — 테이블 없으면 생성 + 기본 시드 */
export async function ensureSchema(env) {
  if (schemaReady) {
    try {
      await ensurePostsColumns(env);
      await ensureCommentsColumns(env);
      await ensureViewsTables(env);
      await ensurePixelMemory(env);
    } catch (e) {
      console.error('ensurePostsColumns', e);
    }
    return;
  }

  await env.DB.batch([
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        password TEXT NOT NULL
      )`),
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL DEFAULT ''
      )`),
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT '후기',
        cover_image TEXT NOT NULL DEFAULT '',
        seo_title TEXT NOT NULL DEFAULT '',
        seo_description TEXT NOT NULL DEFAULT '',
        likes INTEGER NOT NULL DEFAULT 0,
        comment_count_display INTEGER NOT NULL DEFAULT 0,
        published_at TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`),
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL,
        author TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        likes INTEGER NOT NULL DEFAULT 0,
        dislikes INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        profile_image TEXT NOT NULL DEFAULT '',
        parent_id INTEGER,
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
      )`),
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS cafe_tabs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0
      )`),
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS notices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL DEFAULT '',
        published_at TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0
      )`),
    env.DB.prepare(
      'CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts(slug)'
    ),
    env.DB.prepare(
      'CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id)'
    ),
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS popular_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0
      )`),
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        nickname TEXT NOT NULL DEFAULT '',
        profile_image TEXT NOT NULL DEFAULT '',
        token TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`),
    env.DB.prepare(
      'CREATE INDEX IF NOT EXISTS idx_members_username ON members(username)'
    ),
    env.DB.prepare(
      'CREATE INDEX IF NOT EXISTS idx_members_token ON members(token)'
    ),
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS post_daily_views (
        post_id INTEGER NOT NULL,
        view_date TEXT NOT NULL,
        views INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (post_id, view_date),
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
      )`),
    env.DB.prepare(
      'CREATE INDEX IF NOT EXISTS idx_post_daily_views_date ON post_daily_views(view_date)'
    ),
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS page_daily_views (
        page_key TEXT NOT NULL,
        view_date TEXT NOT NULL,
        views INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (page_key, view_date)
      )`),
    env.DB.prepare(
      'CREATE INDEX IF NOT EXISTS idx_page_daily_views_date ON page_daily_views(view_date)'
    ),
  ]);

  try {
    await ensurePostsColumns(env);
    await ensureCommentsColumns(env);
    await ensureViewsTables(env);
    await ensurePixelMemory(env);
  } catch (e) {
    console.error('posts migrate', e);
  }

  const tagCount = await env.DB.prepare(
    'SELECT COUNT(*) AS c FROM popular_tags'
  ).first();
  if (!tagCount || Number(tagCount.c) === 0) {
    const tags = ['건강', '다이어트', '운동', '맛집', '후기', '추천', '일상', '레시피'];
    for (let i = 0; i < tags.length; i++) {
      await env.DB.prepare(
        'INSERT INTO popular_tags (label, sort_order) VALUES (?, ?)'
      )
        .bind(tags[i], i)
        .run();
    }
  }

  const tabCount = await env.DB.prepare(
    'SELECT COUNT(*) AS c FROM cafe_tabs'
  ).first();
  if (!tabCount || Number(tabCount.c) === 0) {
    const defaults = ['홈', '전체글', '인기글', '자유게시판', '후기', '공지'];
    for (let i = 0; i < defaults.length; i++) {
      await env.DB.prepare(
        'INSERT INTO cafe_tabs (label, sort_order) VALUES (?, ?)'
      )
        .bind(defaults[i], i)
        .run();
    }
  }

  // 타이틀-only 기본 공지 시드는 하지 않음 (상세는 posts category=공지 사용)

  const admin = await env.DB.prepare('SELECT id FROM admins LIMIT 1').first();
  if (!admin) {
    await env.DB.prepare('INSERT INTO admins (password) VALUES (?)')
      .bind('admin1234')
      .run();
  }

  const blogName = await env.DB.prepare(
    "SELECT value FROM settings WHERE key = 'blog_name'"
  ).first();
  if (!blogName) {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO settings (key, value) VALUES ('blog_name', '행복하서연')"
      ),
      env.DB.prepare(
        "INSERT INTO settings (key, value) VALUES ('blog_subtitle', '다이어트는 정말 쉽다. 솔직한 일상과 후기를 기록합니다')"
      ),
      env.DB.prepare(
        "INSERT INTO settings (key, value) VALUES ('profile_name', '행복하서연')"
      ),
      env.DB.prepare(
        "INSERT INTO settings (key, value) VALUES ('profile_image', '')"
      ),
      env.DB.prepare(
        "INSERT INTO settings (key, value) VALUES ('profile_desc', '행복하서연의 다이어트 · 일상 기록')"
      ),
      env.DB.prepare(
        "INSERT INTO settings (key, value) VALUES ('cafe_title', '행복하서연')"
      ),
      env.DB.prepare(
        "INSERT INTO settings (key, value) VALUES ('cafe_desc', '다이어트는 정말 쉽다. 솔직한 일상과 후기를 기록합니다')"
      ),
      env.DB.prepare(
        "INSERT INTO settings (key, value) VALUES ('hero_image', '/images/hero-diet.jpg')"
      ),
      env.DB.prepare(
        "INSERT INTO settings (key, value) VALUES ('hero_video', '')"
      ),
    ]);
  }

  // 기존 DB에 히어로 설정 없으면 기본값 추가
  const heroImg = await env.DB.prepare(
    "SELECT value FROM settings WHERE key = 'hero_image'"
  ).first();
  if (!heroImg) {
    await env.DB.prepare(
      "INSERT INTO settings (key, value) VALUES ('hero_image', '/images/hero-diet.jpg')"
    ).run();
  }
  const heroVid = await env.DB.prepare(
    "SELECT value FROM settings WHERE key = 'hero_video'"
  ).first();
  if (!heroVid) {
    await env.DB.prepare(
      "INSERT INTO settings (key, value) VALUES ('hero_video', '')"
    ).run();
  }

  const post = await env.DB.prepare('SELECT id FROM posts LIMIT 1').first();
  if (!post) {
    const result = await env.DB.prepare(
      `INSERT INTO posts (slug, title, body, category, likes, comment_count_display, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        'fv75tanm',
        '마운자로 효과없던나.. 약없이 2달에 -27kg한 프랑스 다이어트 방법',
        `<p>※무단 도용 절대금지!!※</p>
<p>이 글은 샘플 본문입니다.<br>관리자에서 자유롭게 수정하세요.</p>
<p><strong>약 X</strong> · <strong>굶기 X</strong> · <strong>운동 X</strong></p>
<p>75kg → 48.1kg<br>2달만에 총 27kg 감량...</p>`,
        '후기',
        3987,
        157,
        '2026년 6월 28일'
      )
      .run();

    const postId = result.meta.last_row_id;
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO comments (post_id, author, content, likes, created_at, sort_order)
         VALUES (?, '한솔맘', '한 번만 먹어보자 하고 시작했는데요, 효과 보고 완전 놀랐어요 ㅠㅠ', 357, '1일 전', 1)`
      ).bind(postId),
      env.DB.prepare(
        `INSERT INTO comments (post_id, author, content, likes, created_at, sort_order)
         VALUES (?, '은빛쭈니', '마운자로 3개월 했는데 -7kg 밖에 안 빠졌어요. 이 글 보고 시작했습니다!!', 203, '1일 전', 2)`
      ).bind(postId),
      env.DB.prepare(
        `INSERT INTO comments (post_id, author, content, likes, created_at, sort_order)
         VALUES (?, '메이지뽕이''s', '3달째 먹고 있는데 9.4kg감량 했습니다.', 199, '2일 전', 3)`
      ).bind(postId),
    ]);
  }

  // 인기글 더미 (마운자로) — 없으면 추가 (실패해도 스키마 준비는 완료)
  try {
    const popularDummy = await env.DB.prepare(
      'SELECT id FROM posts WHERE slug = ? LIMIT 1'
    )
      .bind(MOUNJARO_POPULAR.slug)
      .first();
    if (!popularDummy) {
      await env.DB.prepare(
        `INSERT INTO posts (slug, title, body, category, cover_image, likes, comment_count_display, published_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      )
        .bind(
          MOUNJARO_POPULAR.slug,
          MOUNJARO_POPULAR.title,
          MOUNJARO_POPULAR.body,
          MOUNJARO_POPULAR.category,
          MOUNJARO_POPULAR.cover_image,
          MOUNJARO_POPULAR.likes,
          MOUNJARO_POPULAR.comment_count_display,
          MOUNJARO_POPULAR.published_at
        )
        .run();
    }
  } catch (e) {
    console.error('mounjaro seed', e);
  }

  schemaReady = true;
}
