/**
 * 네이버 포스트 본문에서 실제 썸네일 후보 추출
 */
const url =
  'https://blog.naver.com/PostView.naver?blogId=seoyoungene_&logNo=224388671886&redirect=Dlog&widgetTypeCall=true';

const res = await fetch(url, {
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    Accept: 'text/html',
  },
});
const html = await res.text();

const patterns = [
  ['og:image', /property=["']og:image["'][^>]*content=["']([^"']+)["']/gi],
  ['og:image2', /content=["']([^"']+)["'][^>]*property=["']og:image["']/gi],
  ['mainImg', /id=["']mainFrame["'][^>]*/i],
  ['thumbnail', /thumbnail["']?\s*[:=]\s*["']([^"']+)["']/gi],
  ['postThumbnail', /"thumbnail(?:Url|Path)?"\s*:\s*"([^"]+)"/gi],
  ['adddata', /ogImage\s*[:=]\s*["']([^"']+)["']/gi],
  ['blogfiles', /https?:\/\/blogfiles\.pstatic\.net\/[^"'\\\s>]+/gi],
  ['postfiles', /https?:\/\/postfiles\d*\.pstatic\.net\/[^"'\\\s>]+/gi],
  ['ssl-store', /https?:\/\/[^"'\\\s>]*pstatic\.net\/[^"'\\\s>]+\.(?:jpg|jpeg|png|webp)/gi],
];

for (const [name, re] of patterns) {
  const found = [];
  let m;
  const r = new RegExp(re.source, re.flags);
  while ((m = r.exec(html)) && found.length < 5) {
    found.push((m[1] || m[0]).replace(/\\\//g, '/').slice(0, 160));
  }
  if (found.length) {
    console.log('\n' + name + ':');
    found.forEach((f) => console.log(' ', f));
  }
}

// Kakao scrap opengraph proxy sometimes used
const scrapUrls = [
  `https://scrap.kakaocdn.net/dna/ogtag?url=${encodeURIComponent(
    'https://blog.naver.com/seoyoungene_/224388671886'
  )}`,
];
for (const s of scrapUrls) {
  try {
    const r = await fetch(s, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    console.log('\nkakao scrap', r.status, (await r.text()).slice(0, 300));
  } catch (e) {
    console.log('kakao scrap err', e.message);
  }
}

// Naver oembed?
try {
  const oe = await fetch(
    'https://blog.naver.com/openapi/oembed.json?url=' +
      encodeURIComponent('https://blog.naver.com/seoyoungene_/224388671886')
  );
  console.log('\noembed', oe.status, (await oe.text()).slice(0, 400));
} catch (e) {
  console.log('oembed', e.message);
}
