/**
 * 네이버 블로그 OG 소스 비교 (카카오톡과 맞추기용)
 */
const BLOG = 'https://blog.naver.com/seoyoungene_/224388671886';

function pickMeta(html, prop) {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`,
      'i'
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`,
      'i'
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return '';
}

async function probe(label, url, headers = {}) {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        ...headers,
      },
    });
    const html = await res.text();
    console.log('\n===', label, '===');
    console.log('status', res.status, 'final', res.url);
    console.log('og:title', pickMeta(html, 'og:title'));
    console.log('og:desc', pickMeta(html, 'og:description').slice(0, 80));
    console.log('og:image', pickMeta(html, 'og:image').slice(0, 140));
    console.log('twitter:title', pickMeta(html, 'twitter:title'));
    console.log('twitter:image', pickMeta(html, 'twitter:image').slice(0, 140));
    const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '';
    console.log('title', title.slice(0, 100));
    // naver specific
    const add = html.match(/og:image["'][^>]+content=["']([^"']+)/i);
    const thumb = html.match(/property=["']og:image["']\s+content=["']([^"']+)["']/i);
    const article = html.match(/"thumbnailUrl"\s*:\s*"([^"]+)"/);
    const addTitle = html.match(/"headline"\s*:\s*"([^"]+)"/);
    if (article) console.log('jsonld thumb', article[1].slice(0, 140));
    if (addTitle) console.log('jsonld headline', addTitle[1]);
  } catch (e) {
    console.log(label, 'ERR', e.message);
  }
}

function toPostView(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
    // /blogId/logNo
    if (parts.length >= 2 && /^\d+$/.test(parts[parts.length - 1])) {
      const logNo = parts[parts.length - 1];
      const blogId = parts[parts.length - 2];
      return `https://blog.naver.com/PostView.naver?blogId=${encodeURIComponent(blogId)}&logNo=${encodeURIComponent(logNo)}&redirect=Dlog&widgetTypeCall=true`;
    }
  } catch {
    /* ignore */
  }
  return '';
}

const postView = toPostView(BLOG);
await probe('desktop', BLOG);
await probe('mobile', 'https://m.blog.naver.com/seoyoungene_/224388671886');
if (postView) await probe('PostView', postView);
await probe(
  'kakao-bot',
  BLOG,
  {
    'User-Agent':
      'Mozilla/5.0 (compatible; KakaoTalk-Scrap/1.0; +https://devtalk.kakao.com/)',
  }
);
await probe(
  'facebook-bot',
  BLOG,
  {
    'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  }
);
await probe(
  'mobile+bot',
  'https://m.blog.naver.com/seoyoungene_/224388671886',
  {
    'User-Agent': 'facebookexternalhit/1.1',
  }
);
