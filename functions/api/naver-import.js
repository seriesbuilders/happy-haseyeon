import { json, options, requireAdmin } from '../_utils.js';
import { fetchNaverPost } from '../_naver-import.js';

/**
 * 관리자 「네이버 주소로 가져오기」
 * POST { url } → 네이버 공개 글을 읽어 사이트 본문 HTML 로 바꿔 돌려준다. 아무것도 저장하지 않는다.
 * 사진은 네이버 주소 그대로 돌려주고, 관리자 화면이 받자마자 기존 흐름(upload-from-url)으로 R2 에 복사한다.
 */
export async function onRequestOptions() {
  return options();
}

export async function onRequestPost(context) {
  const auth = await requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  const body = await context.request.json().catch(() => ({}));
  const url = String(body.url || '').trim();
  if (!url) return json({ error: '네이버 블로그 주소를 넣어 주세요.' }, 400);

  try {
    const post = await fetchNaverPost(url);
    return json({
      ok: true,
      title: post.title,
      body: post.body,
      description: post.description,
      images: post.images.length,
      links: post.links,
      skipped: post.skipped,
    });
  } catch (e) {
    return json({ error: e?.message || '네이버 글을 가져오지 못했습니다.' }, 400);
  }
}
