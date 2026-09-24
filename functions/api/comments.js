import {
  json,
  options,
  requireAdmin,
  requireMember,
  ensureCommentsColumns,
  kstDateTimeDisplay,
  maskSecretComments,
  sortCommentsForDisplay,
  publicPostUrl,
} from '../_utils.js';

export async function onRequestOptions() {
  return options();
}

/** 공개·카운트용: 삭제되지 않은 댓글만 */
export function activeCommentWhere(alias = '') {
  const col = alias ? `${alias}.status` : 'status';
  return `(${col} IS NULL OR ${col} = '' OR ${col} = 'active')`;
}

async function syncCommentCount(env, postId) {
  if (!postId) return 0;
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM comments WHERE post_id = ? AND ${activeCommentWhere()}`
  )
    .bind(postId)
    .first();
  return Number(row?.c) || 0;
}

async function resolveParentId(env, postId, rawParentId) {
  const parentId = Number(rawParentId) || 0;
  if (!parentId) return null;
  const parent = await env.DB.prepare(
    `SELECT id, parent_id, post_id, status FROM comments WHERE id = ? LIMIT 1`
  )
    .bind(parentId)
    .first();
  if (
    !parent ||
    Number(parent.post_id) !== Number(postId) ||
    (parent.status && parent.status !== 'active')
  ) {
    return { error: '답글 대상 댓글을 찾을 수 없습니다.' };
  }
  const rootId = Number(parent.parent_id) || Number(parent.id);
  return { parent_id: rootId };
}

async function insertComment(env, row) {
  const attempts = [
    {
      sql: `INSERT INTO comments (
        post_id, author, content, likes, dislikes, created_at, sort_order, profile_image, parent_id, is_pinned, is_admin, member_id, status, is_secret
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      binds: [
        row.postId,
        row.author,
        row.content,
        row.likes,
        row.dislikes,
        row.created_at,
        row.sort_order,
        row.profile_image,
        row.parent_id,
        row.is_pinned || 0,
        row.is_admin || 0,
        row.member_id ?? null,
        row.status || 'active',
        row.is_secret || 0,
      ],
    },
    {
      sql: `INSERT INTO comments (
        post_id, author, content, likes, dislikes, created_at, sort_order, profile_image, parent_id, is_pinned, is_admin, member_id, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      binds: [
        row.postId,
        row.author,
        row.content,
        row.likes,
        row.dislikes,
        row.created_at,
        row.sort_order,
        row.profile_image,
        row.parent_id,
        row.is_pinned || 0,
        row.is_admin || 0,
        row.member_id ?? null,
        row.status || 'active',
      ],
    },
    {
      sql: `INSERT INTO comments (
        post_id, author, content, likes, dislikes, created_at, sort_order, profile_image, parent_id, is_pinned, is_admin
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      binds: [
        row.postId,
        row.author,
        row.content,
        row.likes,
        row.dislikes,
        row.created_at,
        row.sort_order,
        row.profile_image,
        row.parent_id,
        row.is_pinned || 0,
        row.is_admin || 0,
      ],
    },
    {
      sql: `INSERT INTO comments (
        post_id, author, content, likes, dislikes, created_at, sort_order, profile_image, parent_id, is_pinned
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      binds: [
        row.postId,
        row.author,
        row.content,
        row.likes,
        row.dislikes,
        row.created_at,
        row.sort_order,
        row.profile_image,
        row.parent_id,
        row.is_pinned || 0,
      ],
    },
    {
      sql: `INSERT INTO comments (
        post_id, author, content, likes, dislikes, created_at, sort_order, profile_image, parent_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      binds: [
        row.postId,
        row.author,
        row.content,
        row.likes,
        row.dislikes,
        row.created_at,
        row.sort_order,
        row.profile_image,
        row.parent_id,
      ],
    },
    {
      sql: `INSERT INTO comments (
        post_id, author, content, likes, dislikes, created_at, sort_order, profile_image
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      binds: [
        row.postId,
        row.author,
        row.content,
        row.likes,
        row.dislikes,
        row.created_at,
        row.sort_order,
        row.profile_image,
      ],
    },
  ];

  let lastErr;
  for (const attempt of attempts) {
    try {
      return await env.DB.prepare(attempt.sql).bind(...attempt.binds).run();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

export async function onRequestPost(context) {
  try {
    await ensureCommentsColumns(context.env);
  } catch (_) {
    /* ignore */
  }

//slack 용 추가
async function sendSlackCommentNotice(env, { postId, postSlug, commentId, content, is_secret }) {
  const message =
    `새 댓글이 등록됐어요.\n` +
    `게시글 번호: ${postId}\n` +
    `게시글 URL: ${publicPostUrl(postSlug)}\n` +
    `댓글 번호: ${commentId}\n` +
    (is_secret
      ? '비밀댓글입니다. 내용은 관리자 페이지에서 확인해 주세요.'
      : `내용: ${content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}`);

  const botReady =
    env.slack_comments_bot_token &&
    env.slack_comments_channel_id &&
    env.slack_comments_signing_secret;

  if (botReady) {
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.slack_comments_bot_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: env.slack_comments_channel_id,
        text: message + '\n🗑️ 이 반응을 누르면 댓글이 영구 삭제됩니다.',
      }),
    });

    const sent = await response.json();
    if (!response.ok || !sent.ok || !sent.ts || !sent.channel) {
      throw new Error(`Slack 메시지 전송 실패: ${sent.error || response.status}`);
    }

    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS slack_comment_messages (
      channel TEXT NOT NULL,
      message_ts TEXT NOT NULL,
      comment_id INTEGER NOT NULL,
      post_id INTEGER NOT NULL,
      PRIMARY KEY (channel, message_ts)
    )`).run();

    await env.DB.prepare(
      'INSERT INTO slack_comment_messages (channel, message_ts, comment_id, post_id) VALUES (?, ?, ?, ?)'
    ).bind(sent.channel, sent.ts, commentId, postId).run();
     
    //슬랙 반응 추가
    const reactionResponse = await fetch('https://slack.com/api/reactions.add', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.slack_comments_bot_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: sent.channel,
        timestamp: sent.ts,
        name: 'wastebasket',
      }),
    });

    const reaction = await reactionResponse.json();
    if (!reactionResponse.ok || !reaction.ok) {
      throw new Error(
        `Slack 휴지통 반응 추가 실패: ${reaction.error || reactionResponse.status}`
      );
    }

    return;
  }

  if (!env.slack_comments_webhook_url) return;

  const response = await fetch(env.slack_comments_webhook_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: message }),
  });

  if (!response.ok) {
    throw new Error(`Slack 웹훅 응답: ${response.status}`);
  }
}

  const admin = await requireAdmin(context.request, context.env);
  const body = await context.request.json().catch(() => ({}));
  const postId = Number(body.post_id);
  if (!postId) return json({ error: 'post_id가 필요합니다.' }, 400);

  const content = String(body.content || '').trim();
  if (!content) return json({ error: '댓글 내용을 입력하세요.' }, 400);
  if (content.length > 2000) {
    return json({ error: '댓글은 2000자 이하로 작성해 주세요.' }, 400);
  }

  const post = await context.env.DB.prepare(
    'SELECT id, slug FROM posts WHERE id = ? LIMIT 1'
  )
    .bind(postId)
    .first();
  if (!post) return json({ error: '글을 찾을 수 없습니다.' }, 404);

  let author;
  let created_at;
  let likes;
  let dislikes;
  let sort_order;
  let profile_image;
  let parent_id = null;
  let is_pinned = 0;
  let is_admin = 0;
  let member_id = null;
  let is_secret = Number(body.is_secret) ? 1 : 0;

  if (admin.ok) {
    const parentResolved = await resolveParentId(
      context.env,
      postId,
      body.parent_id
    );
    if (parentResolved?.error) {
      return json({ error: parentResolved.error }, 400);
    }
    parent_id = parentResolved?.parent_id ?? null;
    author = String(body.author || '').trim() || '관리자';
    created_at = String(body.created_at || '').trim() || kstDateTimeDisplay();
    likes = Number(body.likes) || 0;
    dislikes = Number(body.dislikes) || 0;
    sort_order = Number(body.sort_order) || 0;
    profile_image = String(body.profile_image || '').trim();
    is_pinned = parent_id ? 0 : Number(body.is_pinned) ? 1 : 0;
    is_admin = 1;
    member_id = null;
  } else {
    const memberAuth = await requireMember(context.request, context.env);
    if (!memberAuth.ok) {
      return json(
        {
          error: '댓글 작성은 회원 로그인이 필요합니다.',
          needAuth: true,
        },
        401
      );
    }
    const m = memberAuth.member;
    author = String(m.nickname || m.username || '').trim() || '회원';
    created_at = kstDateTimeDisplay();
    likes = 0;
    dislikes = 0;
    sort_order = 0;
    profile_image = String(m.profile_image || '').trim();
    is_pinned = 0;
    is_admin = 0;
    member_id = Number(m.id) || null;
  }

  const result = await insertComment(context.env, {
    postId,
    author,
    content,
    likes,
    dislikes,
    created_at,
    sort_order,
    profile_image,
    parent_id,
    is_pinned,
    is_admin,
    member_id,
    status: 'active',
    is_secret,
  });

  const comment_count = await syncCommentCount(context.env, postId);
  // 일반 회원이 쓴 댓글만 슬랙으로 알림
  if (is_admin === 0) {
    context.waitUntil(
      sendSlackCommentNotice(context.env, {
        postId,
        postSlug: post.slug,
        commentId: result.meta.last_row_id,
        content,
        is_secret,
      }).catch((error) => console.error('댓글 슬랙 알림 실패:', error))
    );
  }
  return json({
    ok: true,
    id: result.meta.last_row_id,
    comment_count,
    comment: {
      id: result.meta.last_row_id,
      post_id: postId,
      author,
      content,
      likes,
      dislikes,
      created_at,
      sort_order,
      profile_image,
      parent_id,
      is_pinned,
      is_admin,
      member_id,
      status: 'active',
      is_secret,
      content_hidden: false,
    },
  });
}

/** GET ?post_id= — 비밀댓글 열람용 (회원/관리자 권한 반영) */
export async function onRequestGet(context) {
  try {
    await ensureCommentsColumns(context.env);
  } catch (_) {
    /* ignore */
  }

  const url = new URL(context.request.url);
  const postId = Number(url.searchParams.get('post_id'));
  if (!postId) return json({ error: 'post_id가 필요합니다.' }, 400);

  const { results } = await context.env.DB.prepare(
    `SELECT * FROM comments WHERE post_id = ?
       AND (status IS NULL OR status = '' OR status = 'active')`
  )
    .bind(postId)
    .all();

  const admin = await requireAdmin(context.request, context.env);
  let viewerMemberId = null;
  if (!admin.ok) {
    const memberAuth = await requireMember(context.request, context.env);
    if (memberAuth.ok) viewerMemberId = memberAuth.member.id;
  }

  const comments = maskSecretComments(sortCommentsForDisplay(results || []), {
    viewerMemberId,
    isAdmin: !!admin.ok,
  });

  return json({ comments });
}

export async function onRequestPut(context) {
  try {
    await ensureCommentsColumns(context.env);
  } catch (_) {
    /* ignore */
  }

  const admin = await requireAdmin(context.request, context.env);
  const body = await context.request.json().catch(() => ({}));
  const id = Number(body.id);
  if (!id) return json({ error: 'id가 필요합니다.' }, 400);

  const row = await context.env.DB.prepare(
    'SELECT * FROM comments WHERE id = ? LIMIT 1'
  )
    .bind(id)
    .first();
  if (!row) return json({ error: '댓글을 찾을 수 없습니다.' }, 404);
  if (row.status && row.status !== 'active') {
    return json({ error: '삭제된 댓글입니다.' }, 404);
  }

  if (admin.ok) {
    try {
      await context.env.DB.prepare(
        `UPDATE comments SET
          author = COALESCE(?, author),
          content = COALESCE(?, content),
          likes = COALESCE(?, likes),
          dislikes = COALESCE(?, dislikes),
          created_at = COALESCE(?, created_at),
          sort_order = COALESCE(?, sort_order),
          profile_image = COALESCE(?, profile_image),
          is_pinned = COALESCE(?, is_pinned)
         WHERE id = ?`
      )
        .bind(
          body.author ?? null,
          body.content ?? null,
          body.likes !== undefined ? Number(body.likes) : null,
          body.dislikes !== undefined ? Number(body.dislikes) : null,
          body.created_at ?? null,
          body.sort_order !== undefined ? Number(body.sort_order) : null,
          body.profile_image !== undefined ? String(body.profile_image) : null,
          body.is_pinned !== undefined ? (Number(body.is_pinned) ? 1 : 0) : null,
          id
        )
        .run();
    } catch (e) {
      const msg = String(e?.message || e);
      if (/no such column:\s*is_pinned/i.test(msg)) {
        await context.env.DB.prepare(
          `UPDATE comments SET
            author = COALESCE(?, author),
            content = COALESCE(?, content),
            likes = COALESCE(?, likes),
            dislikes = COALESCE(?, dislikes),
            created_at = COALESCE(?, created_at),
            sort_order = COALESCE(?, sort_order),
            profile_image = COALESCE(?, profile_image)
           WHERE id = ?`
        )
          .bind(
            body.author ?? null,
            body.content ?? null,
            body.likes !== undefined ? Number(body.likes) : null,
            body.dislikes !== undefined ? Number(body.dislikes) : null,
            body.created_at ?? null,
            body.sort_order !== undefined ? Number(body.sort_order) : null,
            body.profile_image !== undefined ? String(body.profile_image) : null,
            id
          )
          .run();
      } else {
        throw e;
      }
    }
    return json({ ok: true });
  }

  const memberAuth = await requireMember(context.request, context.env);
  if (!memberAuth.ok) return memberAuth.response;
  if (Number(row.member_id) !== Number(memberAuth.member.id)) {
    return json({ error: '본인 댓글만 수정할 수 있습니다.' }, 403);
  }

  const content = String(body.content || '').trim();
  if (!content) return json({ error: '댓글 내용을 입력하세요.' }, 400);
  if (content.length > 2000) {
    return json({ error: '댓글은 2000자 이하로 작성해 주세요.' }, 400);
  }

  await context.env.DB.prepare(
    'UPDATE comments SET content = ? WHERE id = ?'
  )
    .bind(content, id)
    .run();

  return json({
    ok: true,
    comment: {
      id,
      content,
      author: row.author,
      member_id: row.member_id,
      is_admin: row.is_admin,
      status: row.status || 'active',
    },
  });
}

export async function onRequestDelete(context) {
  try {
    await ensureCommentsColumns(context.env);
  } catch (_) {
    /* ignore */
  }

  const admin = await requireAdmin(context.request, context.env);
  const url = new URL(context.request.url);
  const id = Number(url.searchParams.get('id'));
  if (!id) return json({ error: 'id가 필요합니다.' }, 400);

  const row = await context.env.DB.prepare(
    'SELECT * FROM comments WHERE id = ? LIMIT 1'
  )
    .bind(id)
    .first();
  if (!row) return json({ error: '댓글을 찾을 수 없습니다.' }, 404);

  if (admin.ok) {
    try {
      await context.env.DB.prepare(
        'DELETE FROM comments WHERE parent_id = ?'
      )
        .bind(id)
        .run();
    } catch (_) {
      /* ignore */
    }
    await context.env.DB.prepare('DELETE FROM comments WHERE id = ?')
      .bind(id)
      .run();
  } else {
    const memberAuth = await requireMember(context.request, context.env);
    if (!memberAuth.ok) return memberAuth.response;
    if (Number(row.member_id) !== Number(memberAuth.member.id)) {
      return json({ error: '본인 댓글만 삭제할 수 있습니다.' }, 403);
    }
    try {
      await context.env.DB.prepare(
        `UPDATE comments SET status = 'deleted' WHERE id = ? OR parent_id = ?`
      )
        .bind(id, id)
        .run();
    } catch (e) {
      const msg = String(e?.message || e);
      if (/no such column:\s*status/i.test(msg)) {
        await context.env.DB.prepare('DELETE FROM comments WHERE id = ?')
          .bind(id)
          .run();
      } else {
        throw e;
      }
    }
  }

  const comment_count = await syncCommentCount(context.env, row.post_id);
  return json({ ok: true, comment_count });
}
