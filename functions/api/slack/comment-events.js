const MAX_REQUEST_AGE_SECONDS = 300;

async function verifySlackRequest(request, signingSecret, rawBody) {
  const timestamp = request.headers.get('X-Slack-Request-Timestamp');
  const signature = request.headers.get('X-Slack-Signature');
  const seconds = Number(timestamp);

  if (
    !signingSecret ||
    !/^\d+$/.test(timestamp || '') ||
    Math.abs(Date.now() / 1000 - seconds) > MAX_REQUEST_AGE_SECONDS ||
    !/^v0=[a-f0-9]{64}$/.test(signature || '')
  ) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(signingSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const bytes = (signature.slice(3).match(/../g) || [])
    .map((part) => parseInt(part, 16));

  return crypto.subtle.verify(
    'HMAC',
    key,
    new Uint8Array(bytes),
    encoder.encode(`v0:${timestamp}:${rawBody}`)
  );
}

async function deleteReactedComment(env, event) {
  const userIds = new Set(
    String(env.slack_comments_delete_user_ids || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );

  if (
    !userIds.has(event.user) ||
    event.item?.type !== 'message' ||
    event.item.channel !== env.slack_comments_channel_id
  ) return;

  const channel = event.item.channel;
  const messageTs = event.item.ts;

  const mapping = await env.DB.prepare(
    'SELECT comment_id, post_id FROM slack_comment_messages WHERE channel = ? AND message_ts = ?'
  ).bind(channel, messageTs).first();

  if (!mapping) return;

  const comment = await env.DB.prepare(
    'SELECT id FROM comments WHERE id = ? AND post_id = ? AND is_admin = 0'
  ).bind(mapping.comment_id, mapping.post_id).first();

  if (!comment) return;

  await env.DB.batch([
    env.DB.prepare('DELETE FROM comments WHERE parent_id = ?')
      .bind(comment.id),
    env.DB.prepare(
      'DELETE FROM comments WHERE id = ? AND post_id = ? AND is_admin = 0'
    ).bind(comment.id, mapping.post_id),
    env.DB.prepare(
      'DELETE FROM slack_comment_messages WHERE channel = ? AND message_ts = ?'
    ).bind(channel, messageTs),
  ]);

  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.slack_comments_bot_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel,
      thread_ts: messageTs,
      text: `🗑️ 댓글 #${comment.id}을 DB에서 완전히 삭제했습니다.`,
    }),
  });

  const confirmation = await response.json();
  if (!response.ok || !confirmation.ok) {
    throw new Error(
      `Slack 삭제 확인 실패: ${confirmation.error || response.status}`
    );
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const rawBody = await request.text();

  if (!(await verifySlackRequest(
    request,
    env.slack_comments_signing_secret,
    rawBody
  ))) {
    return new Response('Unauthorized', { status: 401 });
  }

  const payload = JSON.parse(rawBody);

  if (payload.type === 'url_verification') {
    return Response.json({ challenge: payload.challenge });
  }

  const event = payload.event;

  if (
    payload.type === 'event_callback' &&
    event?.type === 'reaction_added' &&
    event.reaction === 'wastebasket'
  ) {
    context.waitUntil(
      deleteReactedComment(env, event)
        .catch((error) => console.error('슬랙 댓글 삭제 실패:', error))
    );
  }

  return new Response('ok');
}