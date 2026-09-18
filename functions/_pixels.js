/**
 * 광고 블로그 픽셀 — 값이 있는 항목만 스크립트 생성
 * ID는 영문·숫자·하이픈·언더스코어만 허용 (XSS 방지)
 */

function cleanId(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return '';
  return s;
}

function cleanLabel(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return '';
  return s;
}

function cleanMoney(v) {
  const s = String(v || '').trim().replace(/,/g, '');
  if (!s) return '';
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return '';
  return s;
}

function parseEventList(v, allowed) {
  const set = new Set(
    String(v || '')
      .split(/[,|\s]+/)
      .map((x) => x.trim())
      .filter(Boolean)
  );
  return allowed.filter((e) => set.has(e));
}

const META_EVENTS = [
  'PageView',
  'Lead',
  'ViewContent',
  'Contact',
  'CompleteRegistration',
  'SubmitApplication',
  'Schedule',
  'Subscribe',
  'AddToCart',
  'InitiateCheckout',
  'Purchase',
];

const TIKTOK_EVENTS = [
  'PageView',
  'SubmitForm',
  'Contact',
  'CompleteRegistration',
  'ClickButton',
  'ViewContent',
  'AddToCart',
  'PlaceAnOrder',
  'CompletePayment',
  'Subscribe',
  'Download',
];

const GA4_EVENTS = [
  'generate_lead',
  'sign_up',
  'purchase',
  'contact',
  'submit_form',
  'begin_checkout',
  'add_to_cart',
];

const KAKAO_EVENTS = [
  'pageView',
  'participation',
  'signUp',
  'viewContent',
  'purchase',
  'search',
  'addToCart',
  'addToWishList',
];

/** 저장된 JSON 문자열/객체 → 정규화 객체 */
export function parseAdPixels(raw) {
  if (!raw) return {};
  let obj = raw;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return {};
    try {
      obj = JSON.parse(t);
    } catch {
      return {};
    }
  }
  if (!obj || typeof obj !== 'object') return {};
  return {
    meta_pixel_id: String(obj.meta_pixel_id || '').trim(),
    meta_events: String(obj.meta_events || '').trim(),
    meta_purchase_value: String(obj.meta_purchase_value || '').trim(),
    meta_purchase_currency: String(obj.meta_purchase_currency || '').trim(),

    tiktok_pixel_id: String(obj.tiktok_pixel_id || '').trim(),
    tiktok_events: String(obj.tiktok_events || '').trim(),
    tiktok_purchase_value: String(obj.tiktok_purchase_value || '').trim(),

    google_ga4_id: String(obj.google_ga4_id || '').trim(),
    google_ga4_events: String(obj.google_ga4_events || '').trim(),
    google_ads_id: String(obj.google_ads_id || '').trim(),
    google_ads_label: String(obj.google_ads_label || '').trim(),
    google_ads_label_lead: String(obj.google_ads_label_lead || '').trim(),
    google_ads_label_purchase: String(obj.google_ads_label_purchase || '').trim(),
    google_gtm_id: String(obj.google_gtm_id || '').trim(),
    google_ads_remarketing: String(obj.google_ads_remarketing || '').trim(),

    naver_wcs_id: String(obj.naver_wcs_id || '').trim(),
    naver_cnv_type: String(obj.naver_cnv_type || '').trim(),
    naver_cnv_value: String(obj.naver_cnv_value || '').trim(),

    kakao_pixel_id: String(obj.kakao_pixel_id || '').trim(),
    kakao_events: String(obj.kakao_events || '').trim(),
    kakao_purchase_value: String(obj.kakao_purchase_value || '').trim(),
  };
}

/** 입력값 정리 후 JSON 문자열 (전부 비면 '') */
export function serializeAdPixels(input) {
  const p = parseAdPixels(input);
  const out = {};
  for (const [k, v] of Object.entries(p)) {
    if (v) out[k] = v;
  }
  return Object.keys(out).length ? JSON.stringify(out) : '';
}

export function hasAnyPixel(raw) {
  const p = parseAdPixels(raw);
  return Object.values(p).some((v) => !!v);
}

/**
 * <head> 에 넣을 픽셀 HTML
 * — 비어 있으면 '' (자동 삽입 안 함)
 */
export function buildPixelHeadHtml(raw, opts = {}) {
  const p = parseAdPixels(raw);
  const parts = [];

  // —— Meta ——
  const metaId = cleanId(p.meta_pixel_id);
  if (metaId) {
    let events = parseEventList(p.meta_events, META_EVENTS);
    if (!events.length) events = ['PageView'];
    if (!events.includes('PageView')) events = ['PageView', ...events];

    const tracks = events
      .map((ev) => {
        if (ev === 'Purchase') {
          const val = cleanMoney(p.meta_purchase_value) || '0';
          const cur = cleanId(p.meta_purchase_currency) || 'KRW';
          return `fbq('track','Purchase',{value:${val},currency:'${cur}'});`;
        }
        return `fbq('track','${ev}');`;
      })
      .join('\n');

    parts.push(`<!-- Meta Pixel -->
<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${metaId}');
${tracks}
</script>
<noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${metaId}&ev=PageView&noscript=1" alt="" /></noscript>`);
  }

  // —— TikTok ——
  const ttId = cleanId(p.tiktok_pixel_id);
  if (ttId) {
    let events = parseEventList(p.tiktok_events, TIKTOK_EVENTS);
    if (!events.length) events = ['PageView'];

    const ttTracks = events
      .map((ev) => {
        if (ev === 'PageView') return `ttq.page();`;
        if (ev === 'CompletePayment' || ev === 'PlaceAnOrder') {
          const val = cleanMoney(p.tiktok_purchase_value);
          return val
            ? `ttq.track('${ev}',{value:${val},currency:'KRW'});`
            : `ttq.track('${ev}');`;
        }
        return `ttq.track('${ev}');`;
      })
      .join('\n');

    parts.push(`<!-- TikTok Pixel -->
<script>
!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=document.createElement("script");n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
ttq.load('${ttId}');
${ttTracks}
}(window,document,'ttq');
</script>`);
  }

  // —— Google GTM ——
  const gtmId = cleanId(p.google_gtm_id);
  const skipGtm = cleanId(opts.skipGtmId || '');
  if (gtmId && gtmId !== skipGtm) {
    parts.push(`<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtmId}');</script>`);
  }

  // —— Google GA4 / Ads ——
  const ga4 = cleanId(p.google_ga4_id);
  const adsId = cleanId(p.google_ads_id);
  const adsLabel = cleanLabel(p.google_ads_label);
  const adsLabelLead = cleanLabel(p.google_ads_label_lead);
  const adsLabelPurchase = cleanLabel(p.google_ads_label_purchase);
  const remarketing = p.google_ads_remarketing === '1' || p.google_ads_remarketing === 'true';
  const ga4Events = parseEventList(p.google_ga4_events, GA4_EVENTS);

  if (ga4 || adsId) {
    const eventLines = [];
    for (const ev of ga4Events) {
      if (ev === 'purchase') {
        eventLines.push(`gtag('event','purchase',{currency:'KRW',value:1});`);
      } else {
        eventLines.push(`gtag('event','${ev}');`);
      }
    }
    if (adsId && adsLabel) {
      eventLines.push(
        `gtag('event','conversion',{'send_to':'${adsId}/${adsLabel}'});`
      );
    }
    if (adsId && adsLabelLead) {
      eventLines.push(
        `gtag('event','conversion',{'send_to':'${adsId}/${adsLabelLead}'});`
      );
    }
    if (adsId && adsLabelPurchase) {
      eventLines.push(
        `gtag('event','conversion',{'send_to':'${adsId}/${adsLabelPurchase}'});`
      );
    }

    parts.push(`<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${ga4 || adsId}"></script>
<script>
window.dataLayer=window.dataLayer||[];
function gtag(){dataLayer.push(arguments);}
gtag('js',new Date());
${ga4 ? `gtag('config','${ga4}');` : ''}
${adsId ? `gtag('config','${adsId}'${remarketing ? ",{'allow_enhanced_conversions':true}" : ''});` : ''}
${eventLines.join('\n')}
</script>`);
  }

  // —— Naver ——
  const naverWcs = cleanId(p.naver_wcs_id);
  const naverType = cleanId(p.naver_cnv_type);
  const naverVal = cleanMoney(p.naver_cnv_value) || '1';
  if (naverWcs) {
    const doCnv = naverType && /^[1-5]$/.test(naverType);
    parts.push(`<!-- Naver Analytics / Search Ads -->
<script type="text/javascript" src="//wcs.naver.net/wcslog.js"></script>
<script type="text/javascript">
if(!window.wcs_add) window.wcs_add={};
wcs_add["wa"]="${naverWcs}";
if(window.wcs){
  wcs.inflow();
  ${
    doCnv
      ? `var _nasa={}; if(typeof wcs.cnv==="function"){ _nasa["cnv"]=wcs.cnv("${naverType}","${naverVal}"); } wcs_do(_nasa);`
      : 'wcs_do();'
  }
}
</script>`);
  }

  // —— Kakao ——
  const kakaoId = cleanId(p.kakao_pixel_id);
  if (kakaoId) {
    let events = parseEventList(p.kakao_events, KAKAO_EVENTS);
    if (!events.length) events = ['pageView'];
    if (!events.includes('pageView')) events = ['pageView', ...events];

    const kk = events
      .map((ev) => {
        if (ev === 'purchase') {
          const val = cleanMoney(p.kakao_purchase_value) || '1';
          return `kakaoPixel('${kakaoId}').purchase({total_quantity:'1',total_price:'${val}',currency:'KRW'});`;
        }
        if (ev === 'participation') {
          return `kakaoPixel('${kakaoId}').participation();`;
        }
        if (ev === 'signUp') return `kakaoPixel('${kakaoId}').signUp();`;
        if (ev === 'viewContent') return `kakaoPixel('${kakaoId}').viewContent();`;
        if (ev === 'search') return `kakaoPixel('${kakaoId}').search();`;
        if (ev === 'addToCart') return `kakaoPixel('${kakaoId}').addToCart();`;
        if (ev === 'addToWishList') return `kakaoPixel('${kakaoId}').addToWishList();`;
        return `kakaoPixel('${kakaoId}').pageView();`;
      })
      .join('\n');

    parts.push(`<!-- Kakao Pixel -->
<script type="text/javascript" charset="UTF-8" src="//t1.daumcdn.net/adfit/static/kp.js"></script>
<script type="text/javascript">
if(window.kakaoPixel){
${kk}
}
</script>`);
  }

  if (!parts.length) return '';
  return '\n' + parts.join('\n') + '\n';
}

/** GTM noscript 는 body 직후용 */
export function buildPixelBodyStartHtml(raw, opts = {}) {
  const p = parseAdPixels(raw);
  const gtmId = cleanId(p.google_gtm_id);
  const skip = cleanId(opts.skipGtmId || '');
  if (!gtmId || (skip && gtmId === skip)) return '';
  return buildGtmBodyHtml(gtmId);
}

/** 광고 랜딩 전체에 공통 적용하는 GTM (글별 Ads 태그와 별도) */
export const AD_COMMON_GTM_ID = 'GTM-KMVZK8RW';

export function buildGtmHeadHtml(gtmId) {
  const id = cleanId(gtmId);
  if (!id) return '';
  return `<!-- Google Tag Manager (common) -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${id}');</script>
<!-- End Google Tag Manager -->
`;
}

export function buildGtmBodyHtml(gtmId) {
  const id = cleanId(gtmId);
  if (!id) return '';
  return `<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${id}"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->
`;
}
