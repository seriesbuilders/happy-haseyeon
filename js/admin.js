const PASS_KEY = 'adminPassword';
const DEFAULT_TABS = [
  { label: '홈', sort_order: 0 },
  { label: '전체글', sort_order: 1 },
  { label: '인기글', sort_order: 2 },
  { label: '자유게시판', sort_order: 3 },
  { label: '후기', sort_order: 4 },
  { label: '공지', sort_order: 5 },
];
const DEFAULT_TAGS = [
  { label: '건강', sort_order: 0 },
  { label: '다이어트', sort_order: 1 },
  { label: '운동', sort_order: 2 },
  { label: '맛집', sort_order: 3 },
  { label: '후기', sort_order: 4 },
  { label: '추천', sort_order: 5 },
  { label: '일상', sort_order: 6 },
  { label: '레시피', sort_order: 7 },
];

let suneditor = null;
let allPostsCache = [];
let allAdPostsCache = [];
let selectedCommentPostId = null;
let selectedAdCommentPostId = null;
let commentsCache = [];
let adCommentsCache = [];
let commentsMode = 'normal'; // 'normal' | 'ad'
let selectedAdStatsPostId = null;
let selectedMainStatsPostId = null;
let adStatsPostsCache = [];
let mainStatsPostsCache = [];

function getPassword() {
  return sessionStorage.getItem(PASS_KEY) || '';
}

function showLogin() {
  document.getElementById('loginView').style.display = '';
  document.getElementById('adminView').hidden = true;
}

function showAdmin() {
  document.getElementById('loginView').style.display = 'none';
  document.getElementById('adminView').hidden = false;
}

function requireLogin() {
  if (!getPassword()) {
    showLogin();
    return false;
  }
  showAdmin();
  return true;
}

function toast(text, ok = true) {
  if (ok) {
    showAlert({ title: '완료', message: text, variant: 'success' });
  } else {
    showAlert({ title: '안내', message: text, variant: 'error' });
  }
}

let uiModalResolver = null;
let uiModalMode = null;

function getUiModalEls() {
  return {
    root: document.getElementById('uiModal'),
    icon: document.getElementById('uiModalIcon'),
    title: document.getElementById('uiModalTitle'),
    message: document.getElementById('uiModalMessage'),
    detail: document.getElementById('uiModalDetail'),
    progress: document.getElementById('uiModalProgress'),
    actions: document.getElementById('uiModalActions'),
  };
}

function closeUiModal(result) {
  const { root } = getUiModalEls();
  if (!root || root.hidden) {
    if (uiModalResolver) {
      const resolve = uiModalResolver;
      uiModalResolver = null;
      resolve(result);
    }
    return;
  }
  root.hidden = true;
  document.body.style.overflow = '';
  uiModalMode = null;
  if (uiModalResolver) {
    const resolve = uiModalResolver;
    uiModalResolver = null;
    resolve(result);
  }
}

function openUiModal(opts) {
  const { root, icon, title, message, detail, progress, actions } = getUiModalEls();
  if (!root) return Promise.resolve(false);

  // 로딩 중 다른 모달이 오면 로딩만 교체
  if (uiModalResolver && uiModalMode !== 'loading') {
    closeUiModal(false);
  } else if (uiModalResolver && uiModalMode === 'loading' && opts.variant !== 'loading') {
    // 로딩 → 결과: resolver는 로딩용이므로 버림
    uiModalResolver = null;
  }

  const variant = opts.variant || 'info';
  uiModalMode = variant === 'loading' ? 'loading' : variant === 'confirm' ? 'confirm' : 'alert';

  icon.className = 'ui-modal-icon';
  if (variant === 'loading') {
    icon.classList.add('is-loading');
    icon.textContent = '';
  } else if (variant === 'success') {
    icon.classList.add('is-success');
    icon.textContent = '✓';
  } else if (variant === 'error') {
    icon.classList.add('is-error');
    icon.textContent = '!';
  } else if (variant === 'confirm') {
    icon.classList.add('is-confirm');
    icon.textContent = '?';
  } else {
    icon.classList.add('is-info');
    icon.textContent = 'i';
  }

  title.textContent = opts.title || '';
  message.textContent = opts.message || '';

  if (opts.detail) {
    detail.hidden = false;
    detail.textContent = opts.detail;
  } else {
    detail.hidden = true;
    detail.textContent = '';
  }

  progress.hidden = variant !== 'loading';
  actions.innerHTML = '';

  if (variant === 'loading') {
    // 버튼 없음
  } else if (variant === 'confirm') {
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-ghost';
    cancel.textContent = opts.cancelText || '취소';
    cancel.onclick = () => closeUiModal(false);

    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'btn btn-primary';
    ok.textContent = opts.okText || '확인';
    ok.onclick = () => closeUiModal(true);

    actions.append(cancel, ok);
  } else {
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'btn btn-primary';
    ok.textContent = opts.okText || '확인';
    ok.onclick = () => closeUiModal(true);
    actions.append(ok);
  }

  root.hidden = false;
  document.body.style.overflow = 'hidden';

  return new Promise((resolve) => {
    uiModalResolver = resolve;
  });
}

function showLoading(message = '처리 중입니다…', title = '잠시만요') {
  return openUiModal({ variant: 'loading', title, message });
}

function showAlert({ title = '알림', message = '', detail = '', variant = 'info', okText = '확인' } = {}) {
  return openUiModal({ variant, title, message, detail, okText });
}

function showConfirm({
  title = '확인',
  message = '',
  okText = '확인',
  cancelText = '취소',
} = {}) {
  return openUiModal({
    variant: 'confirm',
    title,
    message,
    okText,
    cancelText,
  });
}

function bindUiModal() {
  const { root } = getUiModalEls();
  if (!root || root.dataset.bound) return;
  root.dataset.bound = '1';
  root.addEventListener('click', (e) => {
    if (!e.target.closest('[data-ui-dismiss]')) return;
    // 로딩 중에는 배경 클릭으로 닫지 않음
    if (uiModalMode === 'loading') return;
    closeUiModal(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || root.hidden) return;
    if (uiModalMode === 'loading') return;
    // 미리보기 모달이 열려 있으면 그쪽 Escape 우선
    const preview = document.getElementById('previewModal');
    if (preview && !preview.hidden) return;
    closeUiModal(false);
  });
}

async function adminFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('X-Admin-Password', getPassword());
  if (options.json) {
    headers.set('Content-Type', 'application/json');
    options.body = JSON.stringify(options.json);
  }
  const res = await fetch(apiUrl(path), { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    sessionStorage.removeItem(PASS_KEY);
    showLogin();
    throw new Error('unauthorized');
  }
  if (!res.ok) {
    const err = new Error(data.error || '요청 실패');
    err.detail = data.detail || '';
    err.status = res.status;
    throw err;
  }
  return data;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** HTML 엔티티 디코드 (&#039; / &#39; / &amp; 등) — 링크카드 설명 깨짐 방지 */
function decodeHtmlEntities(s) {
  let out = String(s ?? '');
  // 반복 디코드(이중 인코딩 대비)
  for (let i = 0; i < 3; i++) {
    const prev = out;
    out = out
      .replace(/&nbsp;/gi, ' ')
      .replace(/&quot;/gi, '"')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&apos;/gi, "'")
      .replace(/&#0*39;/g, "'")
      .replace(/&#x0*27;/gi, "'")
      .replace(/&#(\d+);/g, (_, n) => {
        const code = Number(n);
        if (!code || code > 0x10ffff) return _;
        try {
          return String.fromCodePoint(code);
        } catch {
          return _;
        }
      })
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
        const code = parseInt(h, 16);
        if (!code || code > 0x10ffff) return _;
        try {
          return String.fromCodePoint(code);
        } catch {
          return _;
        }
      })
      .replace(/&amp;/gi, '&');
    if (out === prev) break;
  }
  return out;
}

function setLockedCategory(category) {
  const cat = category || '후기';
  document.getElementById('lockedCategory').value = cat;
  document.getElementById('categoryDisplay').value = cat;
  syncSlugUiForCategory(cat);
  syncPixelUiForCategory(cat);
  syncSeoUiForCategory(cat);
}

function syncSlugUiForCategory(category) {
  const normal = document.getElementById('slugRowNormal');
  if (normal) normal.hidden = category === AD_CATEGORY;
}

function syncPixelUiForCategory(category) {
  const box = document.getElementById('adPixelBox');
  if (box) box.hidden = category !== AD_CATEGORY;
}

function syncSeoUiForCategory(category) {
  const box = document.getElementById('seoBox');
  if (box) box.hidden = category === AD_CATEGORY;
}

const PIXEL_BADGE_GROUPS = {
  meta: ['meta_pixel_id', 'meta_events'],
  tiktok: ['tiktok_pixel_id', 'tiktok_events'],
  google: [
    'google_ga4_id',
    'google_ga4_events',
    'google_ads_id',
    'google_ads_label',
    'google_ads_label_lead',
    'google_ads_label_purchase',
    'google_gtm_id',
    'google_ads_remarketing',
  ],
  naver: ['naver_wcs_id', 'naver_cnv_type', 'naver_cnv_value'],
  kakao: ['kakao_pixel_id', 'kakao_events'],
};

function getAdPixelsFromForm() {
  const out = {};
  document.querySelectorAll('[data-pixel-field]').forEach((el) => {
    const key = el.dataset.pixelField;
    if (el.dataset.pixelBool === '1') {
      if (el.checked) out[key] = '1';
      return;
    }
    if (el.tagName === 'SELECT' || el.type === 'text' || el.tagName === 'TEXTAREA' || el.type === 'number') {
      const val = String(el.value || '').trim();
      if (val) out[key] = val;
    }
  });
  document.querySelectorAll('[data-pixel-events]').forEach((wrap) => {
    const key = wrap.dataset.pixelEvents;
    const selected = [...wrap.querySelectorAll('input[type="checkbox"]:checked')].map(
      (c) => c.value
    );
    if (selected.length) out[key] = selected.join(',');
  });
  return out;
}

function setAdPixelsToForm(raw) {
  let obj = {};
  if (raw && typeof raw === 'object') obj = raw;
  else if (typeof raw === 'string' && raw.trim()) {
    try {
      obj = JSON.parse(raw);
    } catch (_) {
      obj = {};
    }
  }

  document.querySelectorAll('[data-pixel-field]').forEach((el) => {
    const key = el.dataset.pixelField;
    if (el.dataset.pixelBool === '1') {
      el.checked = obj[key] === '1' || obj[key] === 'true';
      return;
    }
    el.value = obj[key] || (key === 'meta_purchase_currency' ? 'KRW' : '');
  });

  document.querySelectorAll('[data-pixel-events]').forEach((wrap) => {
    const key = wrap.dataset.pixelEvents;
    const selected = new Set(
      String(obj[key] || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    );
    wrap.querySelectorAll('input[type="checkbox"]').forEach((c) => {
      if (selected.size === 0 && (c.value === 'PageView' || c.value === 'pageView')) {
        c.checked = true;
      } else {
        c.checked = selected.has(c.value);
      }
    });
  });
  refreshPixelBadges();
}

function clearAdPixelsForm() {
  document.querySelectorAll('[data-pixel-field]').forEach((el) => {
    if (el.dataset.pixelBool === '1') {
      el.checked = false;
      return;
    }
    if (el.tagName === 'SELECT') el.value = '';
    else el.value = el.dataset.pixelField === 'meta_purchase_currency' ? 'KRW' : '';
  });
  document.querySelectorAll('[data-pixel-events] input[type="checkbox"]').forEach((c) => {
    c.checked = c.value === 'PageView' || c.value === 'pageView';
  });
  refreshPixelBadges();
}

function refreshPixelBadges() {
  const data = getAdPixelsFromForm();
  Object.entries(PIXEL_BADGE_GROUPS).forEach(([group, keys]) => {
    const badge = document.querySelector(`[data-pixel-badge="${group}"]`);
    if (!badge) return;
    const idKeys = keys.filter((k) => !k.endsWith('_events'));
    const filled = idKeys.some((k) => !!data[k]);
    badge.hidden = !filled;
  });
}

function bindPixelFieldListeners() {
  document.querySelectorAll('[data-pixel-field], [data-pixel-events] input').forEach((el) => {
    if (el.dataset.pixelBound) return;
    el.dataset.pixelBound = '1';
    el.addEventListener('input', refreshPixelBadges);
    el.addEventListener('change', refreshPixelBadges);
  });
}

function getSlugInputValue() {
  return (document.getElementById('slug')?.value || '')
    .trim()
    .replace(/^\/+|\/+$/g, '');
}

function setSlugInputValue(value) {
  const el = document.getElementById('slug');
  if (el) el.value = String(value || '').replace(/^\/+|\/+$/g, '');
}

function showPanel(name, category) {
  document.querySelectorAll('.admin-nav button[data-panel]').forEach((b) => {
    const match =
      b.dataset.panel === name &&
      (!category || !b.dataset.category || b.dataset.category === category);
    b.classList.toggle('active', match);
  });
  document.querySelectorAll('.panel').forEach((p) => {
    p.classList.toggle('active', p.id === 'panel-' + name);
  });

  // 활성 중메뉴가 속한 대메뉴는 자동으로 펼침
  const activeBtn = document.querySelector(
    '.admin-nav button[data-panel].active'
  );
  const section = activeBtn?.closest('.nav-section');
  if (section) setNavSectionOpen(section, true);

  const titles = {
    posts: '게시글',
    edit:
      (category || document.getElementById('lockedCategory').value) === AD_CATEGORY
        ? '광고 블로그 작성'
        : (category || document.getElementById('lockedCategory').value || '글') + ' 작성',
    comments: '댓글',
    'ad-posts': '광고 블로그 목록',
    'ad-comments': '광고 블로그 댓글',
    'ad-stats': '광고 조회수 리포트',
    'main-stats': '조회수 리포트',
    tabs: '카페 탭',
    tags: '인기 태그',
    notices: '공지 목록',
    settings: '프로필/설정',
    password: '비밀번호 변경',
    guide: '광고용 블로그 제작 사용방법',
  };
  const titleEl = document.getElementById('pageTitle');
  if (titleEl) titleEl.textContent = titles[name] || '';

  const shell = document.getElementById('adminView');
  shell.classList.toggle('editor-mode', name === 'edit');
  closeAdminNav();

  if (name === 'edit') {
    if (category) setLockedCategory(category);
    ensureEditor();
  }
  if (name === 'tabs') loadTabs();
  if (name === 'tags') loadTags();
  if (name === 'notices') loadNotices();
  if (name === 'settings') loadSettings();
  if (name === 'comments') {
    commentsMode = 'normal';
    renderCommentPostList();
    if (selectedCommentPostId) loadComments();
  }
  if (name === 'ad-posts') {
    loadAdPosts();
  }
  if (name === 'ad-comments') {
    commentsMode = 'ad';
    renderAdCommentPostList();
    if (selectedAdCommentPostId) loadAdComments();
  }
  if (name === 'ad-stats') {
    initStatsDateInputs('ad');
    loadAdStatsList();
  }
  if (name === 'main-stats') {
    initStatsDateInputs('main');
    initStatsDateInputs('home');
    loadHomeStats();
    loadMainStatsList();
  }
}

const NAV_SECTION_KEY = 'adminNavSections_v2';
const NAV_SECTION_DEFAULTS = { ad: true, main: false };

function setNavSectionOpen(section, open) {
  if (!section) return;
  section.classList.toggle('is-open', open);
  const toggle = section.querySelector('.nav-section-toggle');
  if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  persistNavSections();
}

function persistNavSections() {
  const state = {};
  document.querySelectorAll('.nav-section[data-nav-section]').forEach((sec) => {
    state[sec.dataset.navSection] = sec.classList.contains('is-open');
  });
  try {
    localStorage.setItem(NAV_SECTION_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function restoreNavSections() {
  let state = null;
  try {
    state = JSON.parse(localStorage.getItem(NAV_SECTION_KEY) || 'null');
  } catch {
    state = null;
  }
  document.querySelectorAll('.nav-section[data-nav-section]').forEach((sec) => {
    const key = sec.dataset.navSection;
    const open =
      state && typeof state[key] === 'boolean'
        ? state[key]
        : NAV_SECTION_DEFAULTS[key] !== undefined
          ? NAV_SECTION_DEFAULTS[key]
          : false;
    sec.classList.toggle('is-open', open);
    const toggle = sec.querySelector('.nav-section-toggle');
    if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  persistNavSections();
}

function bindNavSections() {
  const nav = document.getElementById('adminNav');
  if (!nav || nav.dataset.sectionsBound) return;
  nav.dataset.sectionsBound = '1';
  restoreNavSections();

  nav.querySelectorAll('.nav-section-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const section = btn.closest('.nav-section');
      if (!section) return;
      setNavSectionOpen(section, !section.classList.contains('is-open'));
    });
  });
}

function openAdminNav() {
  const shell = document.getElementById('adminView');
  const backdrop = document.getElementById('adminNavBackdrop');
  const btn = document.getElementById('btnOpenAdminNav');
  if (!shell) return;
  shell.classList.add('nav-open');
  if (backdrop) backdrop.hidden = false;
  document.body.classList.add('admin-nav-open');
  if (btn) btn.setAttribute('aria-expanded', 'true');
}

function closeAdminNav() {
  const shell = document.getElementById('adminView');
  const backdrop = document.getElementById('adminNavBackdrop');
  const btn = document.getElementById('btnOpenAdminNav');
  if (!shell) return;
  shell.classList.remove('nav-open');
  if (backdrop) backdrop.hidden = true;
  document.body.classList.remove('admin-nav-open');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

function bindAdminNav() {
  const shell = document.getElementById('adminView');
  if (!shell || shell.dataset.navBound) return;
  shell.dataset.navBound = '1';

  document.getElementById('btnOpenAdminNav')?.addEventListener('click', openAdminNav);
  document.getElementById('btnOpenAdminNavEditor')?.addEventListener('click', openAdminNav);
  document.getElementById('btnCloseAdminNav')?.addEventListener('click', closeAdminNav);
  document.getElementById('adminNavBackdrop')?.addEventListener('click', closeAdminNav);

  const goList = () => {
    const cat = document.getElementById('lockedCategory')?.value;
    if (cat === AD_CATEGORY) showPanel('ad-posts');
    else showPanel('posts');
  };
  document.getElementById('btnBackFromEditor')?.addEventListener('click', goList);
  document.getElementById('btnBackFromEditorBar')?.addEventListener('click', goList);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && shell.classList.contains('nav-open')) {
      closeAdminNav();
    }
  });
}

function ensureEditor() {
  if (suneditor || typeof SUNEDITOR === 'undefined') return;

  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  const buttonList = isMobile
    ? [
        ['undo', 'redo'],
        ['fontSize', 'formatBlock'],
        ['bold', 'underline', 'italic'],
        ['fontColor', 'hiliteColor'],
        ['align', 'list'],
        ['link', 'image'],
        ['fullScreen', 'codeView'],
        ['removeFormat'],
      ]
    : [
        ['undo', 'redo'],
        ['font', 'fontSize', 'formatBlock'],
        ['bold', 'underline', 'italic', 'strike'],
        ['fontColor', 'hiliteColor'],
        ['align', 'list', 'lineHeight', 'horizontalRule'],
        ['link', 'image', 'table'],
        ['fullScreen', 'codeView'],
        ['removeFormat'],
      ];

  suneditor = SUNEDITOR.create(document.getElementById('body'), {
    lang: SUNEDITOR_LANG.ko,
    width: '100%',
    height: 'auto',
    minHeight: isMobile ? '48vh' : '70vh',
    resizingBar: true,
    placeholder: '본문을 입력하세요. 저장 시 이미지는 자동으로 우리 서버(R2)에 복사됩니다.',
    buttonList,
    // 링크 카드(table/data-* / style) 보존
    strictMode: false,
    strictHTMLValidation: false,
    attributesWhitelist: {
      all: 'style|class|contenteditable|data-.+|target|rel|src|alt|href|width|height|cellpadding|cellspacing|border|role|colspan|rowspan',
      table: 'style|class|contenteditable|data-.+|cellpadding|cellspacing|border|width|height',
      td: 'style|class|colspan|rowspan|width|height',
      a: 'style|class|href|target|rel|data-.+',
      img: 'style|class|src|alt|width|height|loading',
    },
    imageFileInput: true,
    imageUrlInput: true,
    imageMultipleFile: true,
    imageAccept: '.jpg,.jpeg,.png,.gif,.webp,.bmp',
    imageUploadSizeLimit: 10 * 1024 * 1024,
    font: [
      'Pretendard',
      'Nanum Gothic',
      'NanumSquareNeo',
      'Arial',
      'Comic Sans MS',
      'Courier New',
      'Impact',
      'Georgia',
      'tahoma',
      'Trebuchet MS',
      'Verdana',
    ],
    imageUploadHandler: function (files, _info, uploadHandler) {
      uploadImagesViaHandler(files, uploadHandler);
    },
    onImageUpload: function (_targetImgElement, _index, state) {
      if (state === 'create') {
        setTimeout(() => ensureEditableGapAfterImages(), 30);
      }
    },
    onPaste: function (e, cleanData, _maxCharCount, core) {
      // 중첩 paste(캡처 훅 + SunEditor 기본 삽입)로 본문이 2~3회 중복되는 것 방지
      if (editorPasteLock) {
        try {
          e.preventDefault();
          e.stopPropagation?.();
          e.stopImmediatePropagation?.();
        } catch (_) {
          /* ignore */
        }
        return false;
      }

      const stopPasteEvent = () => {
        try {
          e.preventDefault();
          e.stopPropagation?.();
          e.stopImmediatePropagation?.();
        } catch (_) {
          /* ignore */
        }
      };

      const items = e?.clipboardData?.items;
      if (items) {
        const files = [];
        for (let i = 0; i < items.length; i++) {
          if (items[i].kind === 'file' && items[i].type.startsWith('image/')) {
            const f = items[i].getAsFile();
            if (f) files.push(f);
          }
        }
        // 이미지 파일만 있고 HTML 본문이 거의 없을 때만 파일 업로드 경로 사용
        // (네이버 글 복붙 시 clipboard에 썸네일 file이 섞여 본문이 누락·중복되는 경우 방지)
        const htmlProbe = e?.clipboardData?.getData('text/html') || '';
        const plainProbe =
          e?.clipboardData?.getData('text/plain') ||
          e?.clipboardData?.getData('text') ||
          '';
        const hasRichHtml =
          htmlProbe.length > 80 ||
          (typeof cleanData === 'string' && cleanData.length > 80) ||
          plainProbe.replace(/\s+/g, '').length > 40;
        if (files.length && !hasRichHtml) {
          stopPasteEvent();
          editorPasteLock = true;
          Promise.resolve(insertUploadedImages(files, core)).finally(() => {
            editorPasteLock = false;
          });
          return false;
        }
      }

      // URL만 붙여넣으면 링크 썸네일 카드로 삽입
      const plainRaw =
        e?.clipboardData?.getData('text/plain') ||
        e?.clipboardData?.getData('text') ||
        '';
      const htmlRaw = e?.clipboardData?.getData('text/html') || '';
      const fromClean =
        typeof cleanData === 'string'
          ? cleanData.replace(/<[^>]+>/g, ' ').trim()
          : '';
      const urlOnly =
        extractSingleUrl(plainRaw) ||
        extractSingleUrl(fromClean) ||
        extractSingleUrl(htmlRaw);
      if (urlOnly) {
        // 네이버 블로그 URL만 붙여넣어도 카카오톡과 같은 OG 카드로 삽입
        stopPasteEvent();
        editorPasteLock = true;
        setTimeout(() => {
          insertLinkCardFromUrl(urlOnly, { silent: true }).finally(() => {
            editorPasteLock = false;
          });
        }, 0);
        return false;
      }

      if (typeof cleanData === 'string' && /data:image\//i.test(cleanData)) {
        stopPasteEvent();
        editorPasteLock = true;
        showLoading('붙여넣은 이미지를 R2에 올리는 중…', '이미지 처리');
        replaceBase64ImagesInHtml(sanitizePastedHtml(cleanData))
          .then((html) => {
            closeUiModal(true);
            core.functions.insertHTML(html, true, false);
            setTimeout(() => ensureEditableGapAfterImages(), 30);
          })
          .catch(async (err) => {
            closeUiModal(false);
            await showAlert({
              title: '이미지 처리 실패',
              message: err.message || '붙여넣기 이미지 업로드에 실패했습니다.',
              variant: 'error',
            });
          })
          .finally(() => {
            editorPasteLock = false;
          });
        return false;
      }

      // 네이버 등 HTML 붙여넣기: 브라우저/SunEditor 기본 삽입을 막고 1회만 삽입
      if (htmlRaw && /<[a-z][\s\S]*>/i.test(htmlRaw)) {
        stopPasteEvent();
        editorPasteLock = true;
        const source =
          typeof cleanData === 'string' && cleanData.trim()
            ? cleanData
            : htmlRaw;
        const html = sanitizePastedHtml(source);
        try {
          if (core?.functions?.insertHTML) core.functions.insertHTML(html, true, false);
          else if (suneditor) suneditor.insertHTML(html);
        } catch (err) {
          console.warn('paste insertHTML failed', err);
        }
        setTimeout(() => {
          scrubNaverSourceInEditor();
          // 제품 URL 등 외부 링크를 OG 카드로 즉시 승격 (debounce 대기 없이)
          convertPlainLinksInEditor()
            .catch(() => {})
            .finally(() => {
              ensureEditableGapAfterImages();
              hardenLinkCardsInEditor();
              editorPasteLock = false;
            });
        }, 50);
        return false;
      }

      // plain 텍스트에 [출처]가 붙은 경우도 제거 후 삽입
      if (plainRaw && /\[\s*출처\s*\]|［\s*출처\s*］|(?:^|\n)\s*출처\s*[:：]/.test(plainRaw)) {
        stopPasteEvent();
        editorPasteLock = true;
        const stripped = stripNaverSourceFromPlain(plainRaw);
        const html = stripped
          .split(/\r?\n/)
          .map((line) => {
            const safe = escapeHtml(line);
            return `<p>${safe || '<br>'}</p>`;
          })
          .join('');
        try {
          if (core?.functions?.insertHTML) core.functions.insertHTML(html, true, false);
          else if (suneditor) suneditor.insertHTML(html);
        } catch (err) {
          console.warn('paste plain insertHTML failed', err);
        }
        setTimeout(() => {
          scrubNaverSourceInEditor();
          editorPasteLock = false;
        }, 50);
        return false;
      }

      return undefined;
    },
    onDrop: function (e, cleanData, _maxCharCount, core) {
      const dtFiles = e?.dataTransfer?.files;
      if (dtFiles?.length) {
        const images = [...dtFiles].filter((f) => f.type && f.type.startsWith('image/'));
        if (images.length) {
          e.preventDefault();
          e.stopPropagation();
          insertUploadedImages(images, core);
          return false;
        }
      }
      if (typeof cleanData === 'string' && /data:image\//i.test(cleanData)) {
        e.preventDefault();
        showLoading('드롭한 이미지를 R2에 올리는 중…', '이미지 처리');
        replaceBase64ImagesInHtml(cleanData)
          .then((html) => {
            closeUiModal(true);
            core.functions.insertHTML(html, true, false);
            setTimeout(() => ensureEditableGapAfterImages(), 30);
          })
          .catch(async (err) => {
            closeUiModal(false);
            await showAlert({
              title: '이미지 처리 실패',
              message: err.message || '드롭 이미지 업로드에 실패했습니다.',
              variant: 'error',
            });
          });
        return false;
      }
      return true;
    },
    onChange: function () {
      // 이미지로 본문이 끝나면 클릭할 빈 문단 유지
      debounceEnsureGap();
      debounceConvertLinks();
      updateSeoPreview();
    },
  });
}

let gapTimer = null;
function debounceEnsureGap() {
  clearTimeout(gapTimer);
  gapTimer = setTimeout(() => ensureEditableGapAfterImages(), 200);
}

let linkConvertTimer = null;
function debounceConvertLinks() {
  clearTimeout(linkConvertTimer);
  linkConvertTimer = setTimeout(() => {
    convertPlainLinksInEditor()
      .then(() => scrubNaverSourceInEditor())
      .finally(() => hardenLinkCardsInEditor());
  }, 200);
}

function ensureEditableGapAfterImages() {
  if (!suneditor) return;
  try {
    const wysiwyg = suneditor.core?.context?.element?.wysiwyg;
    if (!wysiwyg) return;
    const last = wysiwyg.lastElementChild;
    if (!last) {
      suneditor.insertHTML('<p><br></p>');
      return;
    }
    const isImgBlock =
      last.tagName === 'IMG' ||
      last.querySelector?.('img') ||
      (last.tagName === 'FIGURE' && last.querySelector('img'));
    const emptyP =
      last.tagName === 'P' &&
      (!last.textContent || !last.textContent.trim()) &&
      !last.querySelector('img');
    if (isImgBlock || (last.tagName === 'DIV' && last.querySelector('img') && !emptyP)) {
      const p = document.createElement('p');
      p.innerHTML = '<br>';
      wysiwyg.appendChild(p);
    }
  } catch {
    /* ignore */
  }
}

function insertParagraph(where) {
  ensureEditor();
  if (!suneditor) return;
  if (where === 'above') {
    suneditor.insertHTML('<p><br></p>', true, true);
  } else {
    suneditor.insertHTML('<p><br></p>');
    ensureEditableGapAfterImages();
  }
  try {
    suneditor.core.focus();
  } catch {
    /* ignore */
  }
}

/** 커서/선택 위치의 최상위 블록(문단·이미지 묶음) */
function getSelectedBlockElement() {
  if (!suneditor) return null;
  const wysiwyg = suneditor.core?.context?.element?.wysiwyg;
  if (!wysiwyg) return null;

  let node = null;
  try {
    const sel = suneditor.core.getSelection?.() || window.getSelection();
    node = sel?.anchorNode || null;
  } catch {
    node = null;
  }
  if (!node) return null;
  if (node.nodeType === 3) node = node.parentElement;
  if (!node || !wysiwyg.contains(node)) return null;

  const img = node.closest?.('img');
  if (img && wysiwyg.contains(img)) {
    const wrap = img.closest(
      'figure, .se-component, .se-image-container, div[class*="__se__"], p'
    );
    if (wrap && wysiwyg.contains(wrap)) {
      let top = wrap;
      while (top.parentElement && top.parentElement !== wysiwyg) {
        top = top.parentElement;
      }
      return top;
    }
  }

  let el = node.nodeType === 1 ? node : node.parentElement;
  while (el && el.parentElement && el.parentElement !== wysiwyg) {
    el = el.parentElement;
  }
  if (el && el.parentElement === wysiwyg) return el;
  return null;
}

function moveEditorBlock(direction) {
  ensureEditor();
  if (!suneditor) return;
  const block = getSelectedBlockElement();
  if (!block) {
    toast('이동할 문단이나 이미지를 클릭해 선택한 뒤 다시 눌러 주세요.', false);
    return;
  }
  const parent = block.parentElement;
  if (!parent) return;

  if (direction === 'up') {
    const prev = block.previousElementSibling;
    if (!prev) {
      toast('이미 맨 위입니다.', false);
      return;
    }
    parent.insertBefore(block, prev);
  } else {
    const next = block.nextElementSibling;
    if (!next) {
      toast('이미 맨 아래입니다.', false);
      return;
    }
    parent.insertBefore(next, block);
  }

  try {
    const range = document.createRange();
    range.selectNodeContents(block);
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    suneditor.core.focus();
    suneditor.core.history?.push?.(true);
  } catch {
    /* ignore */
  }
}

/** 공개 페이지용: SunEditor 정렬을 인라인 스타일로 고정 */
function normalizeBodyHtml(html) {
  if (!html) return html;
  try {
    const doc = new DOMParser().parseFromString(
      `<div id="__body_root__">${html}</div>`,
      'text/html'
    );
    const root = doc.getElementById('__body_root__');
    if (!root) return html;

    const detectAlign = (el) => {
      if (!el) return '';
      const data = (el.getAttribute?.('data-align') || '').toLowerCase();
      if (data === 'center' || data === 'left' || data === 'right') return data;
      const cls = el.className || '';
      if (/__se__float-center|float-center/i.test(cls)) return 'center';
      if (/__se__float-right|float-right/i.test(cls)) return 'right';
      if (/__se__float-left|float-left/i.test(cls)) return 'left';
      const st = el.getAttribute?.('style') || '';
      if (/text-align\s*:\s*center/i.test(st)) return 'center';
      if (/text-align\s*:\s*right/i.test(st)) return 'right';
      if (/text-align\s*:\s*left/i.test(st)) return 'left';
      if (/float\s*:\s*right/i.test(st)) return 'right';
      if (/float\s*:\s*left/i.test(st)) return 'left';
      return '';
    };

    const applyAlign = (img, align, container) => {
      if (!align) return;
      img.setAttribute('data-align', align);
      img.style.display = 'block';
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      img.style.float = 'none';
      if (align === 'center') {
        img.style.marginLeft = 'auto';
        img.style.marginRight = 'auto';
      } else if (align === 'right') {
        img.style.marginLeft = 'auto';
        img.style.marginRight = '0';
      } else {
        img.style.marginLeft = '0';
        img.style.marginRight = 'auto';
      }
      if (container && container !== img) {
        container.setAttribute('data-align', align);
        container.style.textAlign = align;
        container.style.float = 'none';
        if (align === 'center') {
          container.style.marginLeft = 'auto';
          container.style.marginRight = 'auto';
        } else if (align === 'right') {
          container.style.marginLeft = 'auto';
          container.style.marginRight = '0';
        }
      }
    };

    root.querySelectorAll('img').forEach((img) => {
      // 링크 카드 내부 이미지는 건드리지 않음 (정렬/분리 방지)
      if (img.closest('a.link-card, .link-card-thumb, .link-card-block, table.link-card')) return;
      const container =
        img.closest(
          '[data-align], .__se__float-center, .__se__float-left, .__se__float-right, .se-image-container, .se-component, figure, p, div'
        ) || img.parentElement;
      let align =
        detectAlign(img) ||
        detectAlign(container) ||
        detectAlign(container?.parentElement);
      // 정렬 정보가 없으면 가운데로 두지 않음 — 기존 인라인 margin:auto 만 유지
      if (!align) {
        const st = img.getAttribute('style') || '';
        if (/margin-left\s*:\s*auto/i.test(st) && /margin-right\s*:\s*auto/i.test(st)) {
          align = 'center';
        }
      }
      if (align) applyAlign(img, align, container);
    });

    return root.innerHTML;
  } catch (e) {
    console.error('normalizeBodyHtml', e);
    return html;
  }
}

function linkCardHtmlScore(html) {
  const s = String(html || '');
  const tables = (s.match(/<table\b[^>]*\blink-card\b/gi) || []).length;
  const titles = (s.match(/link-card-title/gi) || []).length;
  const media = (s.match(/link-card-media/gi) || []).length;
  const dataUrls = (s.match(/\bdata-url\s*=/gi) || []).length;
  // 속이 빈 table 껍질보다 실제 타이틀·미디어가 있는 DOM을 크게 가산
  return tables * 10 + titles * 80 + media * 40 + dataUrls * 15 + Math.min(s.length, 80000) / 800;
}

function getEditorHtml() {
  if (!suneditor) return document.getElementById('body').value || '';
  // SunEditor getContents()가 table.link-card 속을 비우면서도 table 개수는
  // 그대로 두는 경우가 있어, 카드가 있으면 화면(wysiwyg) DOM을 우선 사용
  try {
    const fromApi = suneditor.getContents() || '';
    const wysiwyg = suneditor.core?.context?.element?.wysiwyg;
    const fromDom = wysiwyg ? wysiwyg.innerHTML || '' : '';
    if (!fromDom) return fromApi;
    if (!/link-card/i.test(fromDom)) return fromApi || fromDom;
    const apiScore = linkCardHtmlScore(fromApi);
    const domScore = linkCardHtmlScore(fromDom);
    if (domScore >= apiScore) return fromDom;
    return fromApi || fromDom;
  } catch {
    try {
      const wysiwyg = suneditor.core?.context?.element?.wysiwyg;
      if (wysiwyg?.innerHTML) return wysiwyg.innerHTML;
    } catch {
      /* ignore */
    }
    return suneditor.getContents() || '';
  }
}

function setEditorHtml(html) {
  ensureEditor();
  let content = html || '<p><br></p>';
  if (suneditor) {
    suneditor.setContents(content);
    setTimeout(() => ensureEditableGapAfterImages(), 50);
  } else document.getElementById('body').value = content;
}

function renderPostsTable(posts) {
  const tbody = document.getElementById('postsBody');
  if (!posts?.length) {
    tbody.innerHTML = '<tr><td colspan="6">등록된 글이 없습니다.</td></tr>';
    return;
  }
  tbody.innerHTML = posts
    .map(
      (p) => `
      <tr>
        <td><button type="button" class="title-link" data-edit="${p.id}">${escapeHtml(p.title)}</button></td>
        <td><span class="cat-badge">${escapeHtml(p.category || '후기')}</span></td>
        <td><a class="slug" href="${postHref(p.slug)}" target="_blank">/${escapeHtml(p.slug)}</a></td>
        <td>${Number(p.likes).toLocaleString()}</td>
        <td>${escapeHtml(p.published_at)}</td>
        <td>
          <button type="button" class="btn btn-ghost btn-sm" data-edit="${p.id}">수정</button>
          <button type="button" class="btn btn-ghost btn-sm" data-copy="${p.id}" title="본문·댓글 복사 (새 주소)">복사</button>
        </td>
      </tr>`
    )
    .join('');
}

function renderAdPostsTable(posts) {
  const tbody = document.getElementById('adPostsBody');
  if (!tbody) return;
  if (!posts?.length) {
    tbody.innerHTML = '<tr><td colspan="5">등록된 광고 블로그가 없습니다.</td></tr>';
    return;
  }
  tbody.innerHTML = posts
    .map((p) => {
      const fullUrl = publicPostUrl(p.slug, { ad: true });
      const href = postHref(p.slug, { ad: true });
      return `
      <tr>
        <td><button type="button" class="title-link" data-edit-ad="${p.id}">${escapeHtml(p.title)}</button></td>
        <td><a class="slug ad-full-url" href="${href}" target="_blank" rel="noopener">${escapeHtml(fullUrl)}</a></td>
        <td>${Number(p.likes).toLocaleString()}</td>
        <td>${escapeHtml(p.published_at)}</td>
        <td>
          <button type="button" class="btn btn-ghost btn-sm" data-edit-ad="${p.id}">수정</button>
          <button type="button" class="btn btn-ghost btn-sm" data-copy-ad="${p.id}" title="본문·댓글 복사 (새 주소)">복사</button>
        </td>
      </tr>`;
    })
    .join('');
}

async function loadPosts() {
  const res = await fetch(apiUrl('/api/posts'));
  const { posts } = await res.json();
  allPostsCache = (posts || []).filter((p) => p.category !== AD_CATEGORY);

  const filter = document.getElementById('postsFilter')?.value || '';
  const filtered = filter
    ? allPostsCache.filter((p) => p.category === filter)
    : allPostsCache;
  renderPostsTable(filtered);
  renderCommentPostList();
}

async function loadAdPosts() {
  try {
    const data = await adminFetch(
      '/api/posts?category=' + encodeURIComponent(AD_CATEGORY)
    );
    allAdPostsCache = data.posts || [];
    renderAdPostsTable(allAdPostsCache);
    renderAdCommentPostList();
  } catch (e) {
    if (e.message !== 'unauthorized') {
      console.error(e);
      const tbody = document.getElementById('adPostsBody');
      if (tbody) {
        tbody.innerHTML =
          '<tr><td colspan="5">광고 목록을 불러오지 못했습니다.</td></tr>';
      }
    }
  }
}

function kstTodayInputValue() {
  const t = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return t.toISOString().slice(0, 10);
}

function kstDaysAgoInputValue(days) {
  const t = new Date(Date.now() + 9 * 60 * 60 * 1000);
  t.setUTCDate(t.getUTCDate() - days);
  return t.toISOString().slice(0, 10);
}

function initStatsDateInputs(kind) {
  const map = {
    ad: ['adStatsFrom', 'adStatsTo'],
    main: ['mainStatsFrom', 'mainStatsTo'],
    home: ['homeStatsFrom', 'homeStatsTo'],
  };
  const ids = map[kind];
  if (!ids) return;
  const fromEl = document.getElementById(ids[0]);
  const toEl = document.getElementById(ids[1]);
  if (fromEl && !fromEl.value) fromEl.value = kstDaysAgoInputValue(29);
  if (toEl && !toEl.value) toEl.value = kstTodayInputValue();
}

function statsRangeParams(fromId, toId) {
  const from = document.getElementById(fromId)?.value || kstDaysAgoInputValue(29);
  const to = document.getElementById(toId)?.value || kstTodayInputValue();
  return `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
}

function formatNum(n) {
  return Number(n || 0).toLocaleString();
}

function renderStatsDaysBody(tbodyId, days) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  if (!days?.length) {
    tbody.innerHTML = '<tr><td colspan="2">해당 기간 조회 기록이 없습니다.</td></tr>';
    return;
  }
  tbody.innerHTML = days
    .map(
      (d) => `
    <tr>
      <td>${escapeHtml(d.view_date)}</td>
      <td class="stats-num">${formatNum(d.views)}</td>
    </tr>`
    )
    .join('');
}

async function loadAdStatsList() {
  const box = document.getElementById('adStatsPostList');
  if (!box) return;
  const q = (document.getElementById('adStatsSearch')?.value || '').trim();
  try {
    const data = await adminFetch(
      `/api/stats?scope=ad&${statsRangeParams('adStatsFrom', 'adStatsTo')}${
        q ? '&q=' + encodeURIComponent(q) : ''
      }`
    );
    adStatsPostsCache = data.posts || [];
    if (!adStatsPostsCache.length) {
      box.innerHTML = '<p class="cm-empty">검색 결과가 없습니다.</p>';
      return;
    }
    box.innerHTML = adStatsPostsCache
      .map((p) => {
        const active =
          String(p.id) === String(selectedAdStatsPostId) ? ' active' : '';
        const url = publicPostUrl(p.slug, { ad: true });
        return `
        <button type="button" class="cm-post-item${active}" data-ad-stats-id="${p.id}">
          <span class="cm-post-cat">광고</span>
          <span class="cm-post-title">${escapeHtml(p.title || '(제목 없음)')}</span>
          <span class="cm-post-foot">
            <span class="cm-post-url">${escapeHtml(url)}</span>
            <span class="cm-post-count">기간 ${formatNum(p.range_views)}</span>
          </span>
        </button>`;
      })
      .join('');

    if (
      selectedAdStatsPostId &&
      adStatsPostsCache.some((p) => String(p.id) === String(selectedAdStatsPostId))
    ) {
      loadAdStatsDetail(selectedAdStatsPostId);
    }
  } catch (e) {
    if (e.message !== 'unauthorized') {
      console.error(e);
      box.innerHTML = '<p class="cm-empty">리포트를 불러오지 못했습니다.</p>';
    }
  }
}

async function loadAdStatsDetail(postId) {
  selectedAdStatsPostId = postId;
  document.querySelectorAll('#adStatsPostList .cm-post-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.adStatsId === String(postId));
  });
  try {
    const data = await adminFetch(
      `/api/stats?scope=ad&post_id=${encodeURIComponent(postId)}&${statsRangeParams(
        'adStatsFrom',
        'adStatsTo'
      )}`
    );
    const p = data.post || {};
    const titleEl = document.getElementById('adStatsSelectedTitle');
    const metaEl = document.getElementById('adStatsSelectedMeta');
    const todayEl = document.getElementById('adStatsToday');
    const rangeEl = document.getElementById('adStatsRange');
    if (titleEl) titleEl.textContent = p.title || '(제목 없음)';
    if (metaEl) metaEl.textContent = publicPostUrl(p.slug, { ad: true });
    const summary = document.getElementById('adStatsSummary');
    if (summary) summary.hidden = false;
    if (todayEl) todayEl.textContent = formatNum(data.today_views);
    if (rangeEl) rangeEl.textContent = formatNum(data.range_views);
    renderStatsDaysBody('adStatsDaysBody', data.days);
  } catch (e) {
    if (e.message !== 'unauthorized') {
      console.error(e);
      toast(
        [e.message, e.detail].filter(Boolean).join('\n') ||
          '일별 조회수를 불러오지 못했습니다.',
        false
      );
    }
  }
}

async function loadHomeStats() {
  try {
    const data = await adminFetch(
      `/api/stats?scope=home&${statsRangeParams('homeStatsFrom', 'homeStatsTo')}`
    );
    const todayEl = document.getElementById('homeStatsToday');
    const rangeEl = document.getElementById('homeStatsRange');
    if (todayEl) todayEl.textContent = formatNum(data.today_views);
    if (rangeEl) rangeEl.textContent = formatNum(data.total_views);
    renderStatsDaysBody('homeStatsDaysBody', data.days);
  } catch (e) {
    if (e.message !== 'unauthorized') {
      console.error(e);
      const tbody = document.getElementById('homeStatsDaysBody');
      if (tbody) {
        tbody.innerHTML =
          '<tr><td colspan="2">' +
          escapeHtml(e.message || '홈 통계를 불러오지 못했습니다.') +
          '</td></tr>';
      }
    }
  }
}

async function loadMainStatsList() {
  const box = document.getElementById('mainStatsPostList');
  if (!box) return;
  const q = (document.getElementById('mainStatsSearch')?.value || '').trim();
  const cat = document.getElementById('mainStatsCategory')?.value || '';
  try {
    const data = await adminFetch(
      `/api/stats?scope=main&${statsRangeParams('mainStatsFrom', 'mainStatsTo')}${
        q ? '&q=' + encodeURIComponent(q) : ''
      }`
    );
    let list = data.posts || [];
    if (cat) list = list.filter((p) => p.category === cat);
    mainStatsPostsCache = list;
    if (!list.length) {
      box.innerHTML = '<p class="cm-empty">검색 결과가 없습니다.</p>';
      return;
    }
    box.innerHTML = list
      .map((p) => {
        const active =
          String(p.id) === String(selectedMainStatsPostId) ? ' active' : '';
        return `
        <button type="button" class="cm-post-item${active}" data-main-stats-id="${p.id}">
          <span class="cm-post-cat">${escapeHtml(p.category || '')}</span>
          <span class="cm-post-title">${escapeHtml(p.title || '(제목 없음)')}</span>
          <span class="cm-post-foot">
            <span>/${escapeHtml(p.slug)}</span>
            <span class="cm-post-count">기간 ${formatNum(p.range_views)}</span>
          </span>
        </button>`;
      })
      .join('');

    if (
      selectedMainStatsPostId &&
      list.some((p) => String(p.id) === String(selectedMainStatsPostId))
    ) {
      loadMainStatsDetail(selectedMainStatsPostId);
    }
  } catch (e) {
    if (e.message !== 'unauthorized') {
      console.error(e);
      box.innerHTML = '<p class="cm-empty">리포트를 불러오지 못했습니다.</p>';
    }
  }
}

async function loadMainStatsDetail(postId) {
  selectedMainStatsPostId = postId;
  document.querySelectorAll('#mainStatsPostList .cm-post-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.mainStatsId === String(postId));
  });
  try {
    const data = await adminFetch(
      `/api/stats?scope=main&post_id=${encodeURIComponent(postId)}&${statsRangeParams(
        'mainStatsFrom',
        'mainStatsTo'
      )}`
    );
    const p = data.post || {};
    const titleEl = document.getElementById('mainStatsSelectedTitle');
    const metaEl = document.getElementById('mainStatsSelectedMeta');
    const todayEl = document.getElementById('mainStatsToday');
    const rangeEl = document.getElementById('mainStatsRange');
    if (titleEl) titleEl.textContent = p.title || '(제목 없음)';
    if (metaEl) {
      metaEl.textContent = `${p.category || ''} · /${p.slug || ''}`;
    }
    const summary = document.getElementById('mainStatsSummary');
    if (summary) summary.hidden = false;
    if (todayEl) todayEl.textContent = formatNum(data.today_views);
    if (rangeEl) rangeEl.textContent = formatNum(data.range_views);
    renderStatsDaysBody('mainStatsDaysBody', data.days);
  } catch (e) {
    if (e.message !== 'unauthorized') {
      console.error(e);
      toast(
        [e.message, e.detail].filter(Boolean).join('\n') ||
          '일별 조회수를 불러오지 못했습니다.',
        false
      );
    }
  }
}

function renderCommentPostList() {
  const box = document.getElementById('commentPostList');
  if (!box) return;

  const q = (document.getElementById('commentPostSearch')?.value || '')
    .trim()
    .toLowerCase();
  const list = allPostsCache.filter((p) => {
    if (p.category === AD_CATEGORY) return false;
    if (!q) return true;
    return (
      String(p.title || '').toLowerCase().includes(q) ||
      String(p.slug || '').toLowerCase().includes(q) ||
      String(p.category || '').toLowerCase().includes(q)
    );
  });

  if (!list.length) {
    box.innerHTML = '<p class="cm-empty">검색 결과가 없습니다.</p>';
    return;
  }

  box.innerHTML = list
    .map((p) => {
      const active = String(p.id) === String(selectedCommentPostId) ? ' active' : '';
      const count = Number(p.comment_count ?? p.comment_count_display) || 0;
      return `
      <button type="button" class="cm-post-item${active}" data-post-id="${p.id}">
        <span class="cm-post-cat">${escapeHtml(p.category || '')}</span>
        <span class="cm-post-title">${escapeHtml(p.title || '(제목 없음)')}</span>
        <span class="cm-post-foot">
          <span>/${escapeHtml(p.slug)}</span>
          <span class="cm-post-count">댓글 ${count}</span>
        </span>
      </button>`;
    })
    .join('');
}

function renderAdCommentPostList() {
  const box = document.getElementById('adCommentPostList');
  if (!box) return;

  const q = (document.getElementById('adCommentPostSearch')?.value || '')
    .trim()
    .toLowerCase();
  const list = allAdPostsCache.filter((p) => {
    if (!q) return true;
    return (
      String(p.title || '').toLowerCase().includes(q) ||
      String(p.slug || '').toLowerCase().includes(q)
    );
  });

  if (!list.length) {
    box.innerHTML = '<p class="cm-empty">검색 결과가 없습니다.</p>';
    return;
  }

  box.innerHTML = list
    .map((p) => {
      const active =
        String(p.id) === String(selectedAdCommentPostId) ? ' active' : '';
      const count = Number(p.comment_count ?? p.comment_count_display) || 0;
      const url = publicPostUrl(p.slug, { ad: true });
      return `
      <button type="button" class="cm-post-item${active}" data-ad-post-id="${p.id}">
        <span class="cm-post-cat">광고</span>
        <span class="cm-post-title">${escapeHtml(p.title || '(제목 없음)')}</span>
        <span class="cm-post-foot">
          <span class="cm-post-url">${escapeHtml(url)}</span>
          <span class="cm-post-count">댓글 ${count}</span>
        </span>
      </button>`;
    })
    .join('');
}

function selectCommentPost(id) {
  selectedCommentPostId = id;
  renderCommentPostList();

  const post = allPostsCache.find((p) => String(p.id) === String(id));
  const titleEl = document.getElementById('commentSelectedTitle');
  const metaEl = document.getElementById('commentSelectedMeta');
  const composer = document.getElementById('commentComposer');

  if (post) {
    titleEl.textContent = post.title || '(제목 없음)';
    metaEl.textContent = `[${post.category || ''}] /${post.slug}`;
    composer.hidden = false;
  } else {
    titleEl.textContent = '게시글을 선택하세요';
    metaEl.textContent = '왼쪽에서 글을 고르면 댓글이 표시됩니다';
    composer.hidden = true;
  }

  loadComments();
}

function selectAdCommentPost(id) {
  selectedAdCommentPostId = id;
  renderAdCommentPostList();

  const post = allAdPostsCache.find((p) => String(p.id) === String(id));
  const titleEl = document.getElementById('adCommentSelectedTitle');
  const metaEl = document.getElementById('adCommentSelectedMeta');
  const composer = document.getElementById('adCommentComposer');

  if (post) {
    titleEl.textContent = post.title || '(제목 없음)';
    metaEl.textContent = publicPostUrl(post.slug, { ad: true });
    composer.hidden = false;
  } else {
    titleEl.textContent = '광고 글을 선택하세요';
    metaEl.textContent = '왼쪽에서 글을 고르면 댓글이 표시됩니다';
    composer.hidden = true;
  }

  loadAdComments();
}

async function loadComments() {
  const box = document.getElementById('commentsList');
  const badge = document.getElementById('commentCountBadge');
  const postId = selectedCommentPostId;

  if (!postId) {
    box.innerHTML = '<p class="cm-empty">왼쪽 목록에서 게시글을 선택해 주세요.</p>';
    badge.hidden = true;
    commentsCache = [];
    return;
  }

  box.innerHTML = '<p class="cm-empty">불러오는 중…</p>';

  const data = await fetch(apiUrl(`/api/posts/${postId}`)).then((r) => r.json());
  commentsCache = data.comments || [];

  badge.hidden = false;
  badge.textContent = String(commentsCache.length);

  const nextOrder =
    commentsCache.reduce((max, c) => Math.max(max, Number(c.sort_order) || 0), 0) + 1;
  document.getElementById('cOrder').value = String(nextOrder);

  if (!commentsCache.length) {
    box.innerHTML = '<p class="cm-empty">아직 댓글이 없습니다. 아래에서 바로 추가하세요.</p>';
    return;
  }

  box.innerHTML = renderCommentItemsHtml(commentsCache);
}

async function loadAdComments() {
  const box = document.getElementById('adCommentsList');
  const badge = document.getElementById('adCommentCountBadge');
  const postId = selectedAdCommentPostId;

  if (!postId) {
    box.innerHTML =
      '<p class="cm-empty">왼쪽 목록에서 광고 블로그를 선택해 주세요.</p>';
    if (badge) badge.hidden = true;
    adCommentsCache = [];
    return;
  }

  box.innerHTML = '<p class="cm-empty">불러오는 중…</p>';

  const data = await fetch(apiUrl(`/api/posts/${postId}`)).then((r) => r.json());
  adCommentsCache = data.comments || [];

  if (badge) {
    badge.hidden = false;
    badge.textContent = String(adCommentsCache.length);
  }

  const nextOrder =
    adCommentsCache.reduce(
      (max, c) => Math.max(max, Number(c.sort_order) || 0),
      0
    ) + 1;
  const orderEl = document.getElementById('adCOrder');
  if (orderEl) orderEl.value = String(nextOrder);

  if (!adCommentsCache.length) {
    box.innerHTML =
      '<p class="cm-empty">아직 댓글이 없습니다. 아래에서 바로 추가하세요.</p>';
    return;
  }

  box.innerHTML = renderCommentItemsHtml(adCommentsCache, { ad: true });
}

function renderCommentItemsHtml(list, { ad = false } = {}) {
  const roots = [];
  const childrenMap = new Map();
  for (const c of list || []) {
    const pid = Number(c.parent_id) || 0;
    if (!pid) roots.push(c);
    else {
      if (!childrenMap.has(pid)) childrenMap.set(pid, []);
      childrenMap.get(pid).push(c);
    }
  }
  // parent가 목록에 없으면 루트로 취급
  for (const c of list || []) {
    const pid = Number(c.parent_id) || 0;
    if (pid && !list.some((x) => Number(x.id) === pid) && !roots.includes(c)) {
      roots.push(c);
    }
  }

  const renderOne = (c, isReply = false) => {
    const initial = escapeHtml((c.author || '?').charAt(0));
    const likes = Number(c.likes) || 0;
    const dislikes = Number(c.dislikes) || 0;
    const profile = c.profile_image || '';
    const avatarHtml = profile
      ? `<img class="cm-avatar cm-avatar--img" src="${escapeHtml(profile)}" alt="" />`
      : `<div class="cm-avatar">${initial}</div>`;
    const replies = childrenMap.get(Number(c.id)) || [];
    const replyBtn = isReply
      ? ''
      : `<button type="button" class="btn btn-ghost btn-sm" data-reply-c="${c.id}" data-reply-author="${escapeHtml(c.author || '')}">답글</button>`;
    return `
    <article class="cm-item${isReply ? ' cm-item--reply' : ''}" data-id="${c.id}" data-ad-comment="${ad ? '1' : '0'}" data-parent-id="${Number(c.parent_id) || ''}">
      <div class="cm-item-view">
        ${avatarHtml}
        <div class="cm-item-body">
          <div class="cm-item-meta">
            <strong>${escapeHtml(c.author)}</strong>
            <span>${escapeHtml(c.created_at || '')}</span>
            ${isReply ? '<span class="cm-reply-badge">답글</span>' : ''}
          </div>
          <p class="cm-item-text">${escapeHtml(c.content)}</p>
          <div class="c-react" aria-label="추천 비추천">
            <span class="c-react__item c-react__item--up">추천 <em>${likes.toLocaleString()}</em></span>
            <span class="c-react__item c-react__item--down">비추천 <em>${dislikes.toLocaleString()}</em></span>
          </div>
        </div>
        <div class="cm-item-actions">
          ${replyBtn}
          <button type="button" class="btn btn-ghost btn-sm" data-edit-c="${c.id}">수정</button>
          <button type="button" class="btn btn-danger btn-sm" data-del-c="${c.id}">삭제</button>
        </div>
      </div>
      <div class="cm-item-edit" hidden>
        <div class="cm-edit-grid">
          <div class="cm-field cm-field-avatar">
            <label>프로필 사진</label>
            <div class="cm-avatar-edit">
              <div class="cm-avatar-preview" data-preview-c="${c.id}">${
                profile ? `<img src="${escapeHtml(profile)}" alt="" />` : initial
              }</div>
              <div class="cm-avatar-controls">
                <input data-f="profile_image" value="${escapeHtml(profile)}" placeholder="이미지 URL (비우면 이니셜)" />
                <label class="btn btn-ghost btn-sm">사진
                  <input type="file" accept="image/*" data-upload-c="${c.id}" hidden />
                </label>
              </div>
            </div>
          </div>
          <div class="cm-field">
            <label>닉네임</label>
            <input data-f="author" value="${escapeHtml(c.author)}" placeholder="작성자 닉네임" />
          </div>
          <div class="cm-field">
            <label>날짜 표시</label>
            <input data-f="created_at" value="${escapeHtml(c.created_at || '')}" placeholder="예: 1일 전" />
          </div>
          <div class="cm-field cm-field-likes">
            <label>추천</label>
            <input type="number" data-f="likes" value="${likes}" placeholder="추천수 예: 12" min="0" title="추천수" />
          </div>
          <div class="cm-field cm-field-dislikes">
            <label>비추천</label>
            <input type="number" data-f="dislikes" value="${dislikes}" placeholder="비추천수 예: 1" min="0" title="비추천수" />
          </div>
        </div>
        <textarea data-f="content" rows="3">${escapeHtml(c.content)}</textarea>
        <div class="cm-item-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-cancel-c="${c.id}">취소</button>
          <button type="button" class="btn btn-primary btn-sm" data-save-c="${c.id}">저장</button>
        </div>
      </div>
      ${
        replies.length
          ? `<div class="cm-replies">${replies.map((r) => renderOne(r, true)).join('')}</div>`
          : ''
      }
    </article>`;
  };

  return roots.map((c) => renderOne(c, false)).join('');
}

function setReplyTarget(prefix, parentId, author) {
  const parentEl = document.getElementById(`${prefix}ParentId`);
  const box = document.getElementById(`${prefix}ReplyTarget`);
  const text = document.getElementById(`${prefix}ReplyTargetText`);
  if (parentEl) parentEl.value = parentId ? String(parentId) : '';
  if (box) box.hidden = !parentId;
  if (text) {
    text.textContent = parentId
      ? `↳ ${author || '댓글'}님에게 답글 작성 중`
      : '';
  }
  document.getElementById(`${prefix}Content`)?.focus();
}

function clearReplyTarget(prefix) {
  setReplyTarget(prefix, '', '');
}

let commentSubmitting = false;
let adCommentSubmitting = false;

function updateComposerAvatarPreview(prefix) {
  const authorEl = document.getElementById(`${prefix}Author`);
  const imgEl = document.getElementById(`${prefix}ProfileImage`);
  const preview = document.getElementById(`${prefix}AvatarPreview`);
  if (!preview) return;
  const url = (imgEl?.value || '').trim();
  const initial = (authorEl?.value || '?').trim().charAt(0) || '?';
  if (url) {
    preview.innerHTML = `<img src="${escapeHtml(url)}" alt="" />`;
  } else {
    preview.textContent = initial;
  }
}

function bindCommentAvatarComposer(prefix) {
  const authorEl = document.getElementById(`${prefix}Author`);
  const imgEl = document.getElementById(`${prefix}ProfileImage`);
  const fileEl = document.getElementById(`${prefix}ProfileFile`);
  authorEl?.addEventListener('input', () => updateComposerAvatarPreview(prefix));
  imgEl?.addEventListener('input', () => updateComposerAvatarPreview(prefix));
  fileEl?.addEventListener('change', async () => {
    const file = fileEl.files?.[0];
    if (!file) return;
    try {
      showLoading('프로필 사진을 올리는 중…', '업로드');
      const url = await uploadFile(file);
      if (imgEl) imgEl.value = url;
      updateComposerAvatarPreview(prefix);
      closeUiModal(true);
      toast('프로필 사진이 업로드되었습니다.');
    } catch (e) {
      closeUiModal(false);
      toast(e.message || '업로드 실패', false);
    } finally {
      fileEl.value = '';
    }
  });
  updateComposerAvatarPreview(prefix);
}

function clearCommentComposer(prefix) {
  const content = document.getElementById(`${prefix}Content`);
  if (content) content.value = '';
  const profile = document.getElementById(`${prefix}ProfileImage`);
  if (profile) profile.value = '';
  clearReplyTarget(prefix);
  updateComposerAvatarPreview(prefix);
  content?.focus();
}

async function addCommentQuick() {
  if (commentSubmitting) return;
  const post_id = Number(selectedCommentPostId);
  if (!post_id) return toast('게시글을 선택하세요.', false);

  const author = document.getElementById('cAuthor').value.trim();
  const content = document.getElementById('cContent').value.trim();
  if (!author) return toast('닉네임을 입력하세요.', false);
  if (!content) return toast('댓글 내용을 입력하세요.', false);

  commentSubmitting = true;
  const btn = document.getElementById('btnAddComment');
  if (btn) btn.disabled = true;
  try {
    const parent_id = Number(document.getElementById('cParentId')?.value) || null;
    await adminFetch('/api/comments', {
      method: 'POST',
      json: {
        post_id,
        author,
        content,
        likes: Number(document.getElementById('cLikes').value) || 0,
        dislikes: Number(document.getElementById('cDislikes').value) || 0,
        created_at: document.getElementById('cDate').value.trim() || '방금 전',
        sort_order: Number(document.getElementById('cOrder').value) || 0,
        profile_image: document.getElementById('cProfileImage')?.value.trim() || '',
        parent_id,
      },
    });
    clearCommentComposer('c');
    toast(parent_id ? '답글이 등록되었습니다.' : '댓글이 등록되었습니다.');
    await loadComments();
    const post = allPostsCache.find((p) => String(p.id) === String(post_id));
    if (post) {
      post.comment_count = commentsCache.length;
      renderCommentPostList();
    }
  } catch (e) {
    if (e.message !== 'unauthorized') toast(e.message, false);
  } finally {
    commentSubmitting = false;
    if (btn) btn.disabled = false;
  }
}

async function addAdCommentQuick() {
  if (adCommentSubmitting) return;
  const post_id = Number(selectedAdCommentPostId);
  if (!post_id) return toast('광고 글을 선택하세요.', false);

  const author = document.getElementById('adCAuthor').value.trim();
  const content = document.getElementById('adCContent').value.trim();
  if (!author) return toast('닉네임을 입력하세요.', false);
  if (!content) return toast('댓글 내용을 입력하세요.', false);

  adCommentSubmitting = true;
  const btn = document.getElementById('btnAddAdComment');
  if (btn) btn.disabled = true;
  try {
    const parent_id = Number(document.getElementById('adCParentId')?.value) || null;
    await adminFetch('/api/comments', {
      method: 'POST',
      json: {
        post_id,
        author,
        content,
        likes: Number(document.getElementById('adCLikes').value) || 0,
        dislikes: Number(document.getElementById('adCDislikes').value) || 0,
        created_at: document.getElementById('adCDate').value.trim() || '방금 전',
        sort_order: Number(document.getElementById('adCOrder').value) || 0,
        profile_image: document.getElementById('adCProfileImage')?.value.trim() || '',
        parent_id,
      },
    });
    clearCommentComposer('adC');
    toast(parent_id ? '답글이 등록되었습니다.' : '광고 댓글이 등록되었습니다.');
    await loadAdComments();
    const post = allAdPostsCache.find((p) => String(p.id) === String(post_id));
    if (post) {
      post.comment_count = adCommentsCache.length;
      renderAdCommentPostList();
    }
  } catch (e) {
    if (e.message !== 'unauthorized') toast(e.message, false);
  } finally {
    adCommentSubmitting = false;
    if (btn) btn.disabled = false;
  }
}

/** 붙여넣기 중복 삽입 방지 락 */
let editorPasteLock = false;

function getNaverPasteApi() {
  return (typeof globalThis !== 'undefined' && globalThis.NaverPasteSanitize) || {};
}

/** 붙여넣기/본문 텍스트가 단일 URL인지 판별 (utm 쿼리·&amp; 포함) */
function extractSingleUrl(text) {
  const stripped = String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
    .replace(/&amp;/gi, '&')
    .replace(/&#0*38;/g, '&')
    .trim();
  if (!stripped) return '';
  const compact = stripped.replace(/\s+/g, '');
  // 전체가 URL
  if (/^https?:\/\/[^\s<>"']+$/i.test(compact)) {
    return normalizeExternalUrl(compact);
  }
  // 본문에 URL이 딱 하나만 있으면 그것으로
  const found = stripped.match(/https?:\/\/[^\s<>"']+/gi) || [];
  const unique = [
    ...new Set(found.map((u) => normalizeExternalUrl(u)).filter(Boolean)),
  ];
  if (unique.length === 1) return unique[0];
  return '';
}

/** admin 페이지에서 상대경로로 깨진 URL 복구 + utm 쿼리 보존 */
function normalizeExternalUrl(raw) {
  let s = String(raw || '')
    .trim()
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '');
  if (!s) return '';
  // HTML 엔티티 (&amp;utm_…) 복원 — 안 하면 쿼리가 깨져 OG/카드 실패
  s = decodeHtmlEntities(s);
  const nested = s.match(/https?:\/\/[^\s]*?(https?:\/\/[^\s]+)/i);
  if (nested) s = nested[1];
  const lastHttps = Math.max(s.lastIndexOf('https://'), s.lastIndexOf('http://'));
  if (lastHttps > 0) s = s.slice(lastHttps);
  // 끝 구두점·닫는괄호
  s = s.replace(/[),.;:!?…》」』】]+$/u, '');
  try {
    const u = new URL(s);
    if (!/^https?:$/i.test(u.protocol)) return '';
    return u.toString();
  } catch {
    try {
      return new URL(`https://${s}`).toString();
    } catch {
      return '';
    }
  }
}

/** 네이버 등 외부 HTML 붙여넣기 정리 */
function sanitizePastedHtml(html) {
  const api = getNaverPasteApi();
  if (typeof api.sanitizePastedHtml === 'function') {
    return api.sanitizePastedHtml(html);
  }
  return html || '';
}

function stripNaverSourceCitation(root) {
  const api = getNaverPasteApi();
  if (typeof api.stripNaverSourceCitation === 'function') {
    api.stripNaverSourceCitation(root);
  }
}

function stripNaverSourceFromPlain(text) {
  const api = getNaverPasteApi();
  if (typeof api.stripNaverSourceFromPlain === 'function') {
    return api.stripNaverSourceFromPlain(text);
  }
  return text || '';
}

function collapseRepeatedPasteHtml(html) {
  const api = getNaverPasteApi();
  if (typeof api.collapseRepeatedPasteHtml === 'function') {
    return api.collapseRepeatedPasteHtml(html);
  }
  return html;
}

/** 에디터 DOM에서 출처·네이버블로그 임베드 재스캔 제거 */
function scrubNaverSourceInEditor() {
  if (!suneditor) return;
  try {
    const wysiwyg = suneditor.core?.context?.element?.wysiwyg;
    if (!wysiwyg) return;
    const api = getNaverPasteApi();
    // innerHTML 전체 재작성은 제품 링크카드를 깨뜨리므로 DOM API만 사용
    if (typeof api.stripNaverSourceCitation === 'function') {
      api.stripNaverSourceCitation(wysiwyg);
    }
    if (typeof api.stripNaverBlogEmbeds === 'function') {
      api.stripNaverBlogEmbeds(wysiwyg);
    }
  } catch (e) {
    console.warn('scrubNaverSourceInEditor', e);
  }
}

function isNaverBlogUrl(url) {
  const api = getNaverPasteApi();
  if (typeof api.isNaverBlogUrl === 'function') return api.isNaverBlogUrl(url);
  return /blog\.naver\.com/i.test(String(url || ''));
}

/**
 * 링크 카드 HTML
 */

function buildLinkCardHtml({ url, title, description, image, domain }, opts = {}) {
  // OG 카드만 표시 (원본 URL 텍스트 줄은 넣지 않음)
  const align = opts.align === 'left' ? 'left' : 'center';
  const safeUrl = escapeHtml(decodeHtmlEntities(url || ''));
  const safeTitle = escapeHtml(decodeHtmlEntities(title || domain || url || ''));
  const safeDesc = escapeHtml(decodeHtmlEntities(description || ''));
  const safeImage = escapeHtml(decodeHtmlEntities(image || ''));
  const safeDomain = escapeHtml(decodeHtmlEntities(domain || ''));
  const tableMargin = align === 'left' ? 'margin:0 auto 0 0;' : 'margin:0 auto;';

  const mediaTd = image
    ? `<td class="link-card-media" style="padding:0;margin:0;line-height:0;font-size:0;background-color:#f3f4f6;background-image:url('${safeImage}');background-repeat:no-repeat;background-position:center center;background-size:cover;">` +
      `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="display:block;text-decoration:none;line-height:0;">` +
      `<span class="link-card-media-spacer" style="display:block;width:100%;padding-top:56%;height:0;overflow:hidden;font-size:0;line-height:0;">&nbsp;</span>` +
      `</a></td>`
    : `<td class="link-card-media link-card-thumb--empty" style="padding:0;margin:0;background:#f0f2f5;">` +
      `<span class="link-card-media-spacer" style="display:block;width:100%;padding-top:56%;height:0;">&nbsp;</span></td>`;

  const descRow = description
    ? `<a class="link-card-desc" href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="display:block;margin-top:6px;font-size:13px;line-height:1.45;color:#666666;text-decoration:none;">${safeDesc}</a>`
    : '';

  const table =
    `<table class="link-card" data-lc="1" data-align="${align}" data-url="${safeUrl}" data-title="${safeTitle}" data-desc="${safeDesc}" data-image="${safeImage}" data-domain="${safeDomain}" cellpadding="0" cellspacing="0" border="0" contenteditable="false" style="display:table;width:400px;max-width:100%;${tableMargin}border:1px solid #e5e8eb;border-radius:10px;border-collapse:separate;border-spacing:0;overflow:hidden;background:#ffffff;text-align:left;table-layout:fixed;">` +
    `<tbody>` +
    `<tr>${mediaTd}</tr>` +
    `<tr><td class="link-card-body" style="padding:14px 16px 16px;margin:0;background:#ffffff;text-align:left;vertical-align:top;">` +
    `<a class="link-card-title" href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="display:block;font-size:16px;font-weight:700;line-height:1.4;color:#222222;text-decoration:none;">${safeTitle}</a>` +
    descRow +
    `<a class="link-card-domain" href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="display:block;margin-top:6px;font-size:12px;line-height:1.4;color:#2e9e4d;text-decoration:none;">${safeDomain}</a>` +
    `</td></tr>` +
    `</tbody></table>`;

  // link-card-block 은 div 필수: <p><table> 은 무효 HTML이라 저장 시 카드가 비워짐
  // data-* 를 래퍼에도 넣어 테이블이 비워져도 공개 페이지에서 복구 가능
  // 제품/외부 링크: URL 주소 텍스트는 노출하지 않고 OG 카드만
  return (
    `<p><br></p>` +
    `<div class="link-card-block" data-lc="1" data-lc-part="card" data-align="${align}" data-url="${safeUrl}" data-title="${safeTitle}" data-desc="${safeDesc}" data-image="${safeImage}" data-domain="${safeDomain}" style="text-align:${align};margin:0 0 16px;">` +
    table +
    `</div>` +
    `<p><br></p>`
  );
}

/** 에디터 안 링크 카드: 가운데 정렬 + 이미지 래퍼 제거 + 배경 이미지 고정 */
function hardenLinkCardsInEditor() {
  if (!suneditor) return;
  const wysiwyg = suneditor.core?.context?.element?.wysiwyg;
  if (!wysiwyg) return;

  stripLinkCardUrlLines(wysiwyg);

  wysiwyg.querySelectorAll('table.link-card').forEach((table) => {
    const align =
      (table.getAttribute('data-align') ||
        table.closest('.link-card-block')?.getAttribute('data-align') ||
        'center') === 'left'
        ? 'left'
        : 'center';

    table.style.display = 'table';
    table.style.width = '400px';
    table.style.maxWidth = '100%';
    table.style.float = 'none';
    table.style.marginLeft = align === 'left' ? '0' : 'auto';
    table.style.marginRight = 'auto';
    table.setAttribute('contenteditable', 'false');

    const block = table.closest('.link-card-block');
    if (block) {
      block.style.textAlign = align;
      block.setAttribute('data-align', align);
      block.setAttribute('data-lc', '1');
      block.setAttribute('data-lc-part', 'card');
      for (const key of ['url', 'title', 'desc', 'image', 'domain']) {
        const v = table.getAttribute(`data-${key}`);
        if (v) block.setAttribute(`data-${key}`, v);
      }
    }
    // URL 주소 줄은 제거 (카드·OG만 유지)
    const prevUrl = block?.previousElementSibling;
    if (prevUrl?.classList?.contains('link-card-url-line')) prevUrl.remove();

    table.querySelectorAll('.se-component, .se-image-container, figure').forEach((wrap) => {
      const img = wrap.querySelector('img');
      if (img) wrap.replaceWith(img);
      else wrap.remove();
    });

    const media = table.querySelector('td.link-card-media');
    const img = table.querySelector('img');
    const dataImage = (table.getAttribute('data-image') || img?.getAttribute('src') || '').trim();
    if (media && dataImage) {
      media.style.backgroundImage = 'url("' + dataImage + '")';
      media.style.backgroundSize = 'cover';
      media.style.backgroundPosition = 'center center';
      media.style.backgroundRepeat = 'no-repeat';
      if (img) img.remove();
      if (!media.querySelector('.link-card-media-spacer')) {
        const anchor = media.querySelector('a');
        const spacer = document.createElement('span');
        spacer.className = 'link-card-media-spacer';
        spacer.style.cssText =
          'display:block;width:100%;padding-top:56%;height:0;overflow:hidden;font-size:0;line-height:0;';
        spacer.innerHTML = '&nbsp;';
        if (anchor) {
          anchor.innerHTML = '';
          anchor.appendChild(spacer);
        } else {
          media.appendChild(spacer);
        }
      }
    }
  });
}

function isHollowLinkCardTable(table) {
  if (!table) return true;
  if (table.querySelector?.('.link-card-title, .link-card-desc, .link-card-domain')) {
    return false;
  }
  const text = String(table.textContent || '')
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length < 2;
}

function rebuildLinkCardBlockFromEl(doc, empty) {
  const prev = empty.previousElementSibling;
  const table = empty.querySelector?.('table.link-card');
  const href =
    empty.getAttribute('data-url') ||
    table?.getAttribute('data-url') ||
    (prev?.classList?.contains('link-card-url-line') &&
      prev.querySelector('a[href]')?.getAttribute('href')) ||
    table?.querySelector?.('a[href]')?.getAttribute('href') ||
    '';
  if (!href) return null;
  let domain =
    decodeHtmlEntities(
      empty.getAttribute('data-domain') || table?.getAttribute('data-domain') || ''
    ) || '';
  try {
    if (!domain) domain = new URL(href).hostname.replace(/^www\./, '');
  } catch {
    domain = domain || href;
  }
  const align =
    (
      empty.getAttribute('data-align') ||
      table?.getAttribute('data-align') ||
      'center'
    ).toLowerCase() === 'left'
      ? 'left'
      : 'center';
  const title =
    decodeHtmlEntities(
      empty.getAttribute('data-title') || table?.getAttribute('data-title') || ''
    ) || domain;
  const description = decodeHtmlEntities(
    empty.getAttribute('data-desc') || table?.getAttribute('data-desc') || ''
  );
  const image =
    decodeHtmlEntities(
      empty.getAttribute('data-image') || table?.getAttribute('data-image') || ''
    ) ||
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
  const wrap = doc.createElement('div');
  wrap.innerHTML = buildLinkCardHtml(
    { url: href, title, description, image, domain },
    { align }
  );
  return wrap.querySelector('.link-card-block');
}

/** 미리보기/저장 직전: 링크 카드 HTML을 정상 구조로 복구 */
function prepareLinkCardsHtml(html) {
  if (!html) return html;
  try {
    const doc = new DOMParser().parseFromString(
      `<div id="__lc_root__">${html}</div>`,
      'text/html'
    );
    const root = doc.getElementById('__lc_root__');
    if (!root) return html;

    // 빈/속이 빈 link-card-block → 래퍼·table data-* 또는 직전 URL 줄로 카드 재생성
    for (const empty of [...root.querySelectorAll('.link-card-block')]) {
      const table = empty.querySelector('table.link-card');
      const anchor = empty.querySelector('a.link-card');
      if (anchor) continue;
      if (table && !isHollowLinkCardTable(table)) continue;
      const prev = empty.previousElementSibling;
      const newBlock = rebuildLinkCardBlockFromEl(doc, empty);
      if (!newBlock) continue;
      if (prev?.classList?.contains('link-card-url-line')) prev.remove();
      empty.replaceWith(newBlock);
    }

    // 구버전 a.link-card / background-image 썸네일도 수집
    const nodes = [
      ...root.querySelectorAll('table.link-card[data-lc], a.link-card, .link-card-block[data-lc="1"]'),
    ];
    const seen = new Set();

    for (const el of nodes) {
      const table = el.matches?.('table.link-card')
        ? el
        : el.querySelector?.('table.link-card');
      const block = el.classList?.contains('link-card-block')
        ? el
        : el.closest?.('.link-card-block') || (table ? table.closest('.link-card-block') : null) || el.parentElement;
      const key = table || el;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      if (block) seen.add(block);

      const srcEl = table || el;
      const url =
        srcEl.getAttribute?.('data-url') ||
        block?.getAttribute?.('data-url') ||
        srcEl.querySelector?.('a[href]')?.getAttribute('href') ||
        el.getAttribute?.('href') ||
        '';
      if (!url) continue;

      let title =
        srcEl.getAttribute?.('data-title') ||
        block?.getAttribute?.('data-title') ||
        srcEl.querySelector?.('.link-card-title')?.textContent ||
        '';
      let description =
        srcEl.getAttribute?.('data-desc') ||
        block?.getAttribute?.('data-desc') ||
        srcEl.querySelector?.('.link-card-desc')?.textContent ||
        '';
      let image =
        srcEl.getAttribute?.('data-image') ||
        block?.getAttribute?.('data-image') ||
        srcEl.querySelector?.('img')?.getAttribute('src') ||
        '';
      // 구 background-image / 미디어 셀 배경
      if (!image) {
        const media = srcEl.querySelector?.('td.link-card-media');
        const st =
          (media?.getAttribute('style') || '') +
          (srcEl.querySelector?.('.link-card-thumb[style*="background-image"]')?.getAttribute(
            'style'
          ) || '');
        const m = st.match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/i);
        if (m?.[1]) image = m[1].replace(/&amp;/g, '&').trim();
      }
      let domain =
        srcEl.getAttribute?.('data-domain') ||
        block?.getAttribute?.('data-domain') ||
        srcEl.querySelector?.('.link-card-domain')?.textContent ||
        '';
      title = decodeHtmlEntities(title);
      description = decodeHtmlEntities(description);
      image = decodeHtmlEntities(image);
      domain = decodeHtmlEntities(domain);
      const align =
        (srcEl.getAttribute?.('data-align') ||
          block?.getAttribute?.('data-align') ||
          '').toLowerCase() === 'left'
          ? 'left'
          : 'center';

      if (!domain) {
        try {
          domain = new URL(url).hostname.replace(/^www\./, '');
        } catch {
          domain = url;
        }
      }
      if (!title) title = domain;

      const rebuilt = doc.createElement('div');
      rebuilt.innerHTML = buildLinkCardHtml(
        { url, title, description, image, domain },
        { align }
      );
      const newBlock = rebuilt.querySelector('.link-card-block');

      // 기존 URL 주소 줄 제거 + 카드만 교체
      let urlLine = block?.previousElementSibling;
      if (urlLine?.classList?.contains('link-card-url-line')) {
        urlLine.remove();
      }
      if (block && newBlock) {
        block.replaceWith(newBlock);
      } else if (table && newBlock) {
        const parent = table.parentNode;
        const prev = table.previousElementSibling;
        if (prev?.classList?.contains('link-card-url-line')) prev.remove();
        table.replaceWith(newBlock.querySelector('table.link-card') || newBlock);
      }
    }

    // 남아 있는 URL 주소 줄 전부 제거
    root.querySelectorAll('.link-card-url-line, [data-lc-part="url"]').forEach((el) => el.remove());

    // 링크 카드 옆/아래 [출처] …|작성자 잔여 제거 (미리보기·저장 공통)
    stripNaverSourceCitation(root);
    stripCitationSiblingsNearLinkCards(root);

    return root.innerHTML;
  } catch (e) {
    console.error('prepareLinkCardsHtml', e);
    return html;
  }
}

/** 링크 카드 바로 다음 형제의 네이버 [출처] 문단 제거 */
function stripCitationSiblingsNearLinkCards(root) {
  if (!root) return;
  const api = getNaverPasteApi();
  const isCite =
    typeof api.isCitationText === 'function'
      ? (t) => api.isCitationText(t)
      : (t) => /\[\s*출처\s*\]|［\s*출처\s*］/.test(t) || /[|｜]\s*작성자/.test(t);

  for (const block of [...root.querySelectorAll('.link-card-block, table.link-card')]) {
    const host = block.classList?.contains('link-card-block')
      ? block
      : block.closest?.('.link-card-block') || block;
    let sib = host.nextElementSibling;
    let guard = 0;
    while (sib && guard++ < 8) {
      const next = sib.nextElementSibling;
      const t = String(sib.textContent || '')
        .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!t) {
        // 빈 <p><br></p> 는 카드 직후 한두 개까지 허용, 출처 뒤에 남은 빈칸도 정리
        sib = next;
        continue;
      }
      if (
        isCite(t) ||
        /(?:\[\s*출처\s*\]|［\s*출처\s*］)/.test(t) ||
        (/[|｜]\s*작성자/.test(t) && t.length <= 800)
      ) {
        try {
          sib.remove();
        } catch {
          /* ignore */
        }
        sib = next;
        continue;
      }
      break;
    }
  }
}

function linkCardPlaceholder(url) {
  let domain = '';
  try {
    domain = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    domain = url;
  }
  return buildLinkCardHtml({
    url,
    title: '링크 정보를 불러오는 중…',
    description: '',
    image: '',
    domain,
  });
}

async function fetchLinkPreview(url) {
  const original = normalizeExternalUrl(url) || url;
  const tryFetch = async (target) =>
    adminFetch(`/api/link-preview?url=${encodeURIComponent(target)}`);

  let data;
  try {
    data = await tryFetch(original);
  } catch (e) {
    // utm 등 트래킹 파라미터가 붙은 채 OG 차단되면 경로만으로 재시도
    const bare = stripTrackingParams(original);
    if (bare && bare !== original) {
      data = await tryFetch(bare);
    } else {
      throw e;
    }
  }
  return {
    // 클릭 URL은 원본(utm 유지), OG 메타만 사용
    url: original,
    title: data.title || '',
    description: data.description || '',
    image: data.image || '',
    domain: data.domain || '',
  };
}

/** utm_/fbclid 등 트래킹 파라미터만 제거 (OG 폴백용) */
function stripTrackingParams(raw) {
  try {
    const u = new URL(String(raw || ''));
    const drop = [];
    for (const key of [...u.searchParams.keys()]) {
      if (
        /^utm_/i.test(key) ||
        /^(fbclid|gclid|gbraid|wbraid|mc_[a-z]+|ref|referrer)$/i.test(key)
      ) {
        drop.push(key);
      }
    }
    drop.forEach((k) => u.searchParams.delete(k));
    return u.toString();
  } catch {
    return String(raw || '');
  }
}

function insertHtmlIntoEditor(html) {
  ensureEditor();
  if (!suneditor) {
    const ta = document.getElementById('body');
    if (ta) ta.value = (ta.value || '') + html;
    return !!ta;
  }
  const wysiwyg = suneditor.core?.context?.element?.wysiwyg;
  const beforeCards = wysiwyg
    ? wysiwyg.querySelectorAll('table.link-card, a.link-card, .link-card-block').length
    : 0;
  const marker = `ins-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  // 링크카드는 table/div 에 마커를 달아 실제 카드 삽입 여부를 확인한다
  let marked = String(html || '');
  if (/class="link-card"|class='link-card'|link-card-block/i.test(marked)) {
    marked = marked.replace(
      /<(table|div)(\s[^>]*class="[^"]*link-card)/i,
      `<$1 data-editor-ins="${marker}"$2`
    );
    if (!marked.includes(`data-editor-ins="${marker}"`)) {
      marked = marked.replace(
        /<(table|div)(\s)/i,
        `<$1 data-editor-ins="${marker}"$2`
      );
    }
  } else {
    marked = marked.replace(
      /<(table|div|p|a)(\s)/i,
      `<$1 data-editor-ins="${marker}"$2`
    );
  }
  try {
    suneditor.insertHTML(marked, true, true);
  } catch (e) {
    console.warn('insertHTML failed, fallback append', e);
    try {
      const cur = suneditor.getContents() || '';
      suneditor.setContents(cur + html);
    } catch (e2) {
      console.error(e2);
      return false;
    }
  }
  // 링크카드면 카드 노드 증가/마커로 확인, 실패 시 강제 append
  try {
    const afterCards = wysiwyg
      ? wysiwyg.querySelectorAll('table.link-card, a.link-card, .link-card-block').length
      : 0;
    const inserted = wysiwyg?.querySelector?.(`[data-editor-ins="${marker}"]`);
    const cardInserted =
      /link-card/i.test(html) ? afterCards > beforeCards : !!inserted;
    if (!cardInserted) {
      const cur = suneditor.getContents() || '';
      suneditor.setContents(cur + html);
    } else if (inserted) {
      inserted.removeAttribute('data-editor-ins');
    }
    wysiwyg
      ?.querySelectorAll?.(`[data-editor-ins="${marker}"]`)
      .forEach((el) => el.removeAttribute('data-editor-ins'));
  } catch (_) {
    /* ignore */
  }
  try {
    suneditor.core?.focus?.();
    hardenLinkCardsInEditor();
    suneditor.core?.history?.push?.(true);
  } catch (_) {
    /* ignore */
  }
  return true;
}

async function insertLinkCardFromUrl(rawUrl, { silent = false } = {}) {
  ensureEditor();
  const url = normalizeExternalUrl(rawUrl);
  if (!url) {
    if (!silent) toast('올바른 URL을 입력해 주세요.', false);
    return;
  }

  let data = {
    url,
    title: '',
    description: '',
    image: '',
    domain: '',
  };
  try {
    data.domain = new URL(url).hostname.replace(/^www\./, '');
    data.title = data.domain;
  } catch {
    data.title = url;
  }

  try {
    if (!silent) showLoading('링크 정보를 가져오는 중…', '링크 썸네일');
    data = { ...data, ...(await fetchLinkPreview(url)) };
  } catch (e) {
    if (e.message === 'unauthorized') {
      if (!silent) closeUiModal(false);
      return;
    }
    // 미리보기 실패해도 카드는 넣음
    console.warn('link-preview failed', e);
  }

  const html = buildLinkCardHtml(data, { align: 'center' });
  const ok = insertHtmlIntoEditor(html);
  if (!silent) closeUiModal(true);

  if (!ok) {
    if (!silent) {
      await showAlert({
        title: '링크 썸네일 실패',
        message: '에디터에 카드를 넣지 못했습니다. 본문을 클릭한 뒤 다시 시도해 주세요.',
        variant: 'error',
      });
    }
    return;
  }

  if (!silent) {
    toast(
      data.image
        ? '링크 썸네일이 삽입되었습니다.'
        : '링크 카드가 삽입되었습니다. (미리보기 이미지 없음)'
    );
  } else {
    toast('링크 썸네일이 삽입되었습니다.');
  }
}

async function insertLinkCard() {
  ensureEditor();
  if (!suneditor) {
    await showAlert({
      title: '에디터 준비 중',
      message: '본문 에디터가 아직 준비되지 않았습니다. 글 작성 화면으로 들어간 뒤 다시 눌러 주세요.',
      variant: 'error',
    });
    return;
  }
  const url = window.prompt(
    '링크 URL을 입력하세요\n예: https://www.naver.com',
    'https://'
  );
  if (!url || !url.trim() || url.trim() === 'https://') return;
  await insertLinkCardFromUrl(url.trim());
}

/** 링크 카드 위 원본 URL 텍스트 줄 제거 (카드·OG만 남김) */
function stripLinkCardUrlLines(wysiwyg) {
  if (!wysiwyg) return;
  wysiwyg.querySelectorAll('.link-card-url-line, [data-lc-part="url"]').forEach((el) => {
    try {
      el.remove();
    } catch (_) {
      /* ignore */
    }
  });
}

/** @deprecated URL 줄은 더 이상 추가하지 않음 */
function ensureLinkCardUrlLines(wysiwyg) {
  stripLinkCardUrlLines(wysiwyg);
}

/** 본문에 있는 일반 링크·URL 텍스트를 썸네일 카드로 변환 */
async function convertPlainLinksInEditor() {
  if (!suneditor) return;
  const wysiwyg = suneditor.core?.context?.element?.wysiwyg;
  if (!wysiwyg) return;
  if (wysiwyg.dataset.linkConverting === '1') return;
  wysiwyg.dataset.linkConverting = '1';

  try {
    // 변환 전에 네이버 블로그 URL/카드부터 제거 (중간 삽입 방지)
    scrubNaverSourceInEditor();
    ensureLinkCardUrlLines(wysiwyg);

    // 1) 문단 전체가 URL인 경우 → <a> (이후 카드로 승격, 네이버 포함)
    const blocks = [...wysiwyg.querySelectorAll('p, div, li')];
    for (const el of blocks) {
      if (el.closest('a, .link-card, .link-card-block, .link-card-url-line, .link-card-wrap, table.link-card')) continue;
      if (el.querySelector('a, img, .link-card, .link-card-block, .link-card-url-line, table.link-card')) continue;
      const url = extractSingleUrl(el.textContent || '');
      if (!url) continue;
      const a = document.createElement('a');
      a.href = url;
      a.textContent = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      el.innerHTML = '';
      el.appendChild(a);
    }

    const urlTextRe = /^https?:\/\/[^\s<>"']+$/i;
    const textNodes = [];
    const walker = document.createTreeWalker(wysiwyg, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node?.textContent) continue;
      if (node.parentElement?.closest('a, script, style, .link-card, .link-card-block, .link-card-url-line, .link-card-wrap, table.link-card')) {
        continue;
      }
      const trimmed = node.textContent.trim().replace(/[\u200b\u200c\u200d\ufeff]/g, '');
      if (urlTextRe.test(trimmed) && extractSingleUrl(trimmed)) {
        textNodes.push(node);
      }
    }
    for (const node of textNodes) {
      const url = extractSingleUrl(node.textContent);
      if (!url) continue;
      const a = document.createElement('a');
      a.href = url;
      a.textContent = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      try {
        node.parentNode.replaceChild(a, node);
      } catch {
        /* ignore */
      }
    }

    // 2) 일반 <a> → 링크 카드 (네이버 블로그도 카카오톡형 OG 카드)
    const anchors = [
      ...wysiwyg.querySelectorAll(
        'a[href]:not(.link-card):not(.link-card-url):not(.link-card-title):not(.link-card-desc):not(.link-card-domain):not([data-link-converting])'
      ),
    ];
    if (!anchors.length) {
      scrubNaverSourceInEditor();
      return;
    }

    for (const a of anchors) {
      if (a.closest('.link-card, .link-card-url, .link-card-block, .link-card-url-line, .link-card-wrap, table.link-card')) continue;
      const rawHref = a.getAttribute('href') || a.textContent || '';
      const url = extractSingleUrl(rawHref) || normalizeExternalUrl(rawHref);
      if (!url || !/^https?:\/\//i.test(url)) continue;

      a.setAttribute('data-link-converting', '1');
      let align = 'center';
      const parentP = a.closest('p, div');
      if (parentP) {
        const st = parentP.getAttribute('style') || '';
        const da = (parentP.getAttribute('data-align') || '').toLowerCase();
        if (da === 'left' || /text-align\s*:\s*left/i.test(st)) align = 'left';
      }

      let domain = url;
      try {
        domain = new URL(url).hostname.replace(/^www\./, '');
      } catch {
        /* ignore */
      }

      const wrap = document.createElement('div');
      wrap.innerHTML = buildLinkCardHtml(
        {
          url,
          title: domain,
          description: '',
          image: '',
          domain,
        },
        { align }
      );
      const block =
        wrap.querySelector('.link-card-block') ||
        wrap.querySelector('table.link-card') ||
        wrap.querySelector('a.link-card');
      if (!block) {
        a.removeAttribute('data-link-converting');
        continue;
      }

      const frag = document.createDocumentFragment();
      frag.appendChild(block);

      try {
        const host = a.closest('p') || a;
        host.replaceWith(frag);
      } catch {
        try {
          a.replaceWith(frag);
        } catch {
          a.removeAttribute('data-link-converting');
          continue;
        }
      }

      try {
        const data = await fetchLinkPreview(url);
        const done = document.createElement('div');
        done.innerHTML = buildLinkCardHtml(data, { align });
        const finalBlock =
          done.querySelector('.link-card-block') ||
          done.querySelector('table.link-card') ||
          done.querySelector('a.link-card');
        if (finalBlock && block.isConnected) {
          block.replaceWith(finalBlock);
        }
        suneditor.core?.history?.push?.(true);
      } catch {
        suneditor.core?.history?.push?.(true);
      }
    }
  } finally {
    delete wysiwyg.dataset.linkConverting;
    scrubNaverSourceInEditor();
    stripLinkCardUrlLines(wysiwyg);
    hardenLinkCardsInEditor();
  }
}
function alignLinkCards(align = 'center') {
  ensureEditor();
  if (!suneditor) return toast('에디터를 먼저 열어 주세요.', false);
  const wysiwyg = suneditor.core?.context?.element?.wysiwyg;
  if (!wysiwyg) return;

  const mode = align === 'left' ? 'left' : 'center';
  let targets = [];

  try {
    const sel = suneditor.core.getSelection?.() || window.getSelection();
    const node = sel?.anchorNode;
    const el = node?.nodeType === 1 ? node : node?.parentElement;
    const hit = el?.closest?.(
      '.link-card-block, .link-card-url-line, table.link-card, a.link-card'
    );
    if (hit) {
      const block = hit.classList?.contains('link-card-block')
        ? hit
        : hit.classList?.contains('link-card-url-line')
          ? hit.nextElementSibling?.classList?.contains('link-card-block')
            ? hit.nextElementSibling
            : hit
          : hit.closest('.link-card-block') || hit.parentElement;
      if (block) targets = [block];
    }
  } catch {
    /* ignore */
  }

  if (!targets.length) {
    targets = [
      ...wysiwyg.querySelectorAll('.link-card-block, table.link-card, a.link-card'),
    ].slice(-1);
  }
  if (!targets.length) {
    return toast('정렬할 링크 썸네일이 없습니다. 먼저 링크를 넣어 주세요.', false);
  }

  for (const t of targets) {
    let block = t;
    if (t.tagName === 'A' && t.classList.contains('link-card')) {
      if (t.parentElement?.classList?.contains('link-card-block')) {
        block = t.parentElement;
      } else {
        const p = document.createElement('div');
        p.className = 'link-card-block';
        t.replaceWith(p);
        p.appendChild(t);
        block = p;
      }
    }
    block.classList.add('link-card-block');
    block.setAttribute('data-align', mode);
    block.style.textAlign = mode;
    const urlLine = block.previousElementSibling;
    if (urlLine?.classList?.contains('link-card-url-line')) {
      urlLine.style.textAlign = mode;
    }
    const table = block.querySelector('table.link-card') || (block.matches?.('table.link-card') ? block : null);
    if (table) table.setAttribute('data-align', mode);
  }
  hardenLinkCardsInEditor();
  suneditor.core?.history?.push?.(true);
  toast(mode === 'center' ? '링크 썸네일을 가운데 정렬했습니다.' : '링크 썸네일을 왼쪽 정렬했습니다.');
}

async function copyPost(id, { ad = false } = {}) {
  if (!id) return;
  const ok = await showConfirm({
    title: '게시글 복사',
    message:
      '본문·댓글·추천수·댓글수를 그대로 복사하고 새 상세 주소로 만듭니다.\n랜딩 차별화용으로 사용하세요.',
    okText: '복사',
    cancelText: '취소',
  });
  if (!ok) return;

  showLoading('게시글과 댓글을 복사하는 중…', '복사');
  try {
    const data = await adminFetch(`/api/posts/${id}/copy`, {
      method: 'POST',
      json: {},
    });
    closeUiModal(true);
    await loadPosts();
    if (ad) await loadAdPosts();
    await showAlert({
      title: '복사 완료',
      message: ad
        ? `광고 블로그가 복사되었습니다.\n${publicPostUrl(data.slug, { ad: true })}\n댓글 ${data.comment_copied || 0}개 복사됨`
        : `게시글이 복사되었습니다.\n주소: /${data.slug}\n댓글 ${data.comment_copied || 0}개 복사됨`,
      variant: 'success',
    });
  } catch (e) {
    closeUiModal(false);
    if (e.message === 'unauthorized') return;
    await showAlert({
      title: '복사 실패',
      message: e.message || '복사에 실패했습니다.',
      detail: e.detail || '',
      variant: 'error',
    });
  }
}

function clearEditForm(category) {
  document.getElementById('postId').value = '';
  setLockedCategory(category || '후기');
  setSlugInputValue('');
  document.getElementById('title').value = '';
  document.getElementById('likes').value = '0';
  document.getElementById('comment_count_display').value = '0';
  document.getElementById('published_at').value = '';
  document.getElementById('cover_image').value = '';
  const seoTitleEl = document.getElementById('seo_title');
  const seoDescEl = document.getElementById('seo_description');
  if (seoTitleEl) seoTitleEl.value = '';
  if (seoDescEl) seoDescEl.value = '';
  clearAdPixelsForm();
  updateSeoPreview();
  const coverPrev = document.getElementById('coverPreview');
  coverPrev.removeAttribute('src');
  coverPrev.hidden = true;
  const coverEmpty = document.getElementById('coverPreviewEmpty');
  if (coverEmpty) coverEmpty.hidden = false;
  setCoverStatus('');
  updateCoverFileLabel(null);
  const coverFile = document.getElementById('coverFile');
  if (coverFile) coverFile.value = '';
  setEditorHtml('<p><br></p>');
  const cat = document.getElementById('lockedCategory').value;
  document.getElementById('editTitle').textContent =
    cat === AD_CATEGORY ? '광고 블로그 작성' : cat + ' 게시글 작성';
  document.getElementById('btnDeletePost').style.display = 'none';
}

function openWrite(category) {
  clearEditForm(category);
  showPanel('edit', category);
}

function stripHtmlForSeo(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function updateSeoPreview() {
  const titleEl = document.getElementById('seoPreviewTitle');
  const descEl = document.getElementById('seoPreviewDesc');
  const urlEl = document.getElementById('seoPreviewUrl');
  const countT = document.getElementById('seoTitleCount');
  const countD = document.getElementById('seoDescCount');
  if (!titleEl) return;

  const pageTitle = document.getElementById('title')?.value.trim() || '';
  const seoTitle = document.getElementById('seo_title')?.value.trim() || '';
  const seoDesc = document.getElementById('seo_description')?.value.trim() || '';
  const isAd = document.getElementById('lockedCategory')?.value === AD_CATEGORY;
  const slug = getSlugInputValue() || '글주소';
  const autoDesc = stripHtmlForSeo(getEditorHtml()).slice(0, 150);
  const showTitle = seoTitle || pageTitle || '(제목)';
  let showDesc = seoDesc || autoDesc || '(본문 앞부분이 설명으로 사용됩니다)';
  if (showDesc.length > 160) showDesc = showDesc.slice(0, 159) + '…';

  titleEl.textContent = showTitle;
  descEl.textContent = showDesc;
  urlEl.textContent = isAd
    ? publicPostUrl(slug === '글주소' ? '글주소' : slug, { ad: true })
    : `https://tennis0915.com/${slug}`;
  if (countT) countT.textContent = String((document.getElementById('seo_title')?.value || '').length);
  if (countD) countD.textContent = String((document.getElementById('seo_description')?.value || '').length);
}

function bindSeoPreview() {
  ['title', 'slug', 'seo_title', 'seo_description'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', updateSeoPreview);
  });
  updateSeoPreview();
}

function setCoverStatus(text, kind = '') {
  const el = document.getElementById('coverStatus');
  if (!el) return;
  if (!text) {
    el.hidden = true;
    el.textContent = '';
    el.className = 'cover-status';
    return;
  }
  el.hidden = false;
  el.textContent = text;
  el.className = 'cover-status' + (kind ? ' is-' + kind : '');
}

let coverObjectUrl = null;

function setCoverPreview(url) {
  const prev = document.getElementById('coverPreview');
  const empty = document.getElementById('coverPreviewEmpty');
  if (!prev) return;
  if (!url) {
    if (coverObjectUrl) {
      URL.revokeObjectURL(coverObjectUrl);
      coverObjectUrl = null;
    }
    prev.removeAttribute('src');
    prev.hidden = true;
    if (empty) empty.hidden = false;
    return;
  }
  prev.src =
    url.startsWith('http') || url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('/')
      ? url
      : apiUrl(url);
  prev.hidden = false;
  if (empty) empty.hidden = true;
}

function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + 'KB';
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
}

function updateCoverFileLabel(file) {
  const label = document.getElementById('coverFileLabel');
  if (!label) return;
  const textNode = [...label.childNodes].find((n) => n.nodeType === Node.TEXT_NODE);
  const name = file
    ? file.name.length > 28
      ? file.name.slice(0, 25) + '…'
      : file.name
    : '이미지 선택';
  if (textNode) textNode.textContent = name + ' ';
  else label.insertBefore(document.createTextNode(name + ' '), label.firstChild);
}

async function uploadCoverFile(file) {
  if (!file) {
    await showAlert({
      title: '이미지 필요',
      message: '먼저 대표 이미지를 선택해 주세요.',
      variant: 'error',
    });
    return;
  }

  if (coverObjectUrl) {
    URL.revokeObjectURL(coverObjectUrl);
    coverObjectUrl = null;
  }
  coverObjectUrl = URL.createObjectURL(file);
  setCoverPreview(coverObjectUrl);
  updateCoverFileLabel(file);
  setCoverStatus(
    `선택됨: ${file.name} (${formatFileSize(file.size)}) · R2 업로드 중…`,
    'pending'
  );

  const btn = document.getElementById('btnUploadCover');
  if (btn) btn.disabled = true;

  try {
    const url = await uploadFile(file);
    document.getElementById('cover_image').value = url;
    if (coverObjectUrl) {
      URL.revokeObjectURL(coverObjectUrl);
      coverObjectUrl = null;
    }
    setCoverPreview(url);
    setCoverStatus('업로드 완료 · 아래 「저장」을 누르면 게시글에 반영됩니다', 'ok');
  } catch (e) {
    setCoverStatus('업로드 실패: ' + (e.message || '다시 시도해 주세요'), 'err');
    await showAlert({
      title: '대표 이미지 업로드 실패',
      message: e.message || '업로드에 실패했습니다.',
      variant: 'error',
    });
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function editPost(id) {
  const data = await fetch(apiUrl(`/api/posts/${id}`)).then((r) => r.json());
  const p = data.post;
  document.getElementById('postId').value = p.id;
  setLockedCategory(p.category || '후기');
  setSlugInputValue(p.slug, p.category || '후기');
  document.getElementById('title').value = p.title;
  document.getElementById('likes').value = p.likes;
  document.getElementById('comment_count_display').value =
    p.comment_count_display != null ? p.comment_count_display : 0;
  document.getElementById('published_at').value = p.published_at;
  document.getElementById('cover_image').value = p.cover_image || '';
  const seoTitleEl = document.getElementById('seo_title');
  const seoDescEl = document.getElementById('seo_description');
  if (seoTitleEl) seoTitleEl.value = p.seo_title || '';
  if (seoDescEl) seoDescEl.value = p.seo_description || '';
  setAdPixelsToForm(p.ad_pixels || '');
  setCoverPreview(p.cover_image || '');
  setCoverStatus(p.cover_image ? '등록된 대표 이미지입니다' : '', p.cover_image ? 'ok' : '');
  updateCoverFileLabel(null);
  updateSeoPreview();
  showPanel('edit', p.category || '후기');
  setEditorHtml(p.body || '');
  document.getElementById('editTitle').textContent =
    p.category === AD_CATEGORY ? '광고 블로그 수정' : '글 수정';
  document.getElementById('btnDeletePost').style.display = 'inline-flex';
}

async function savePost() {
  const id = document.getElementById('postId').value;
  const title = document.getElementById('title').value.trim();
  if (!title) {
    await showAlert({
      title: '제목 필요',
      message: '게시글 제목을 입력해 주세요.',
      variant: 'error',
    });
    return;
  }

  showLoading('이미지를 확인하고 게시글을 저장합니다…', '저장 중');

  try {
    // 저장 직전 일반 링크 → 썸네일 카드 변환 완료 대기
    await convertPlainLinksInEditor();
    hardenLinkCardsInEditor();
    scrubNaverSourceInEditor();
    // 저장 시 sanitizePastedHtml 을 다시 돌리면 [출처] 절단·임베드 정리가
    // 이미 편집된 본문/제품 카드를 통째로 날릴 수 있음 → 카드 복구만 수행
    let bodyHtml = normalizeBodyHtml(
      prepareLinkCardsHtml(getEditorHtml() || '')
    );
    if (/data:image\//i.test(bodyHtml)) {
      showLoading('본문 base64 이미지를 R2로 올리는 중…', '이미지 업로드');
      bodyHtml = normalizeBodyHtml(
        prepareLinkCardsHtml(await replaceBase64ImagesInHtml(bodyHtml))
      );
      if (suneditor) {
        suneditor.setContents(bodyHtml);
        hardenLinkCardsInEditor();
      }
    }

    let mirrorFailed = 0;
    let mirrorOk = 0;
    const externalUrls = collectExternalImageUrls(bodyHtml);
    if (externalUrls.length) {
      showLoading(
        `외부 이미지 ${externalUrls.length}장을 우리 서버로 복사하는 중…`,
        '이미지 저장'
      );
      const mirrored = await replaceExternalImagesInHtml(bodyHtml);
      bodyHtml = normalizeBodyHtml(prepareLinkCardsHtml(mirrored.html));
      mirrorFailed += mirrored.failedCount;
      mirrorOk += mirrored.mirroredCount;
      if (suneditor) {
        suneditor.setContents(bodyHtml);
        hardenLinkCardsInEditor();
      }
    }

    let coverImage = document.getElementById('cover_image').value.trim();
    if (isExternalImageUrl(coverImage)) {
      showLoading('대표 이미지를 우리 서버로 복사하는 중…', '이미지 저장');
      const coverResult = await mirrorExternalImageUrl(coverImage);
      coverImage = coverResult.url;
      if (coverResult.failed) mirrorFailed += 1;
      else mirrorOk += 1;
      document.getElementById('cover_image').value = coverImage;
      const coverPrev = document.getElementById('coverPreview');
      if (coverPrev) {
        coverPrev.src = coverImage;
        coverPrev.hidden = false;
      }
      const coverEmpty = document.getElementById('coverPreviewEmpty');
      if (coverEmpty) coverEmpty.hidden = true;
    }

    const category = document.getElementById('lockedCategory').value || '후기';
    const isAd = category === AD_CATEGORY;
    // 광고는 신규 시 slug 비움 → 서버에서 암호화 코드 자동 생성
    const slug = getSlugInputValue();

    const payload = {
      slug,
      title,
      body: bodyHtml,
      category,
      cover_image: coverImage,
      likes: Number(document.getElementById('likes').value) || 0,
      comment_count_display:
        Number(document.getElementById('comment_count_display').value) || 0,
      published_at: document.getElementById('published_at').value,
      seo_title: document.getElementById('seo_title')?.value.trim() || '',
      seo_description: document.getElementById('seo_description')?.value.trim() || '',
      ad_pixels: getAdPixelsFromForm(),
    };

    showLoading(id ? '게시글을 수정하고 있습니다…' : '게시글을 저장하고 있습니다…', '저장 중');

    const mirrorNote =
      mirrorFailed > 0
        ? `\n\n참고: 외부(카카오 등) 이미지 ${mirrorFailed}장은 만료·차단되어 자동 복사에 실패해 본문에서 제거했습니다. 필요하면 PC 파일로 다시 업로드해 주세요.`
        : '';

    if (id) {
      await adminFetch(`/api/posts/${id}`, { method: 'PUT', json: payload });
      closeUiModal(true);
      await showAlert({
        title: '수정 완료',
        message: (isAd
          ? `광고 블로그가 수정되었습니다.\n${publicPostUrl(slug || getSlugInputValue(), { ad: true })}`
          : '게시글이 성공적으로 수정되었습니다.') + mirrorNote,
        variant: 'success',
      });
    } else {
      const data = await adminFetch('/api/posts', { method: 'POST', json: payload });
      document.getElementById('postId').value = data.id;
      setSlugInputValue(data.slug, category);
      document.getElementById('editTitle').textContent = isAd
        ? '광고 블로그 수정'
        : '글 수정';
      document.getElementById('btnDeletePost').style.display = 'inline-flex';
      closeUiModal(true);
      await showAlert({
        title: '저장 완료',
        message: (isAd
          ? `광고 블로그가 등록되었습니다.\n${publicPostUrl(data.slug, { ad: true })}`
          : `게시글이 등록되었습니다.\n주소: /${data.slug}`) + mirrorNote,
        variant: 'success',
      });
    }
    await loadPosts();
    if (isAd) {
      await loadAdPosts();
      showPanel('ad-posts');
    }
    loadNotices();
  } catch (e) {
    if (e.message === 'unauthorized') {
      closeUiModal(false);
      return;
    }
    closeUiModal(false);
    const tooBig = /TOOBIG|too big|너무 큽니다/i.test(String(e.message || '') + String(e.detail || ''));
    await showAlert({
      title: '저장 실패',
      message: tooBig
        ? '본문이 너무 큽니다. 이미지는 툴바 이미지 버튼으로 올려 주세요. (붙여넣기 이미지도 자동으로 R2 업로드됩니다)'
        : e.message || '글 저장에 실패했습니다.',
      detail: e.detail || '',
      variant: 'error',
    });
  }
}

function renderTabsList(tabs) {
  const box = document.getElementById('tabsList');
  if (!box) return;
  const list = tabs?.length ? tabs : DEFAULT_TABS;
  // 삭제 버튼 없음 — 탭 삭제 시 게시판 연결이 깨질 수 있음
  box.innerHTML = list
    .map(
      (t, i) => `
    <div class="tab-row">
      <input type="text" class="tab-label" value="${escapeHtml(t.label)}" placeholder="탭 이름" />
      <input type="number" class="tab-order" value="${Number(t.sort_order) || i}" title="정렬" />
    </div>`
    )
    .join('');
}

async function loadTabs() {
  try {
    const { tabs } = await fetch(apiUrl('/api/tabs')).then((r) => r.json());
    renderTabsList(tabs);
  } catch {
    renderTabsList(DEFAULT_TABS);
  }
}

function collectTabsFromDom() {
  return [...document.querySelectorAll('#tabsList .tab-row')]
    .map((row, i) => ({
      label: row.querySelector('.tab-label').value.trim(),
      sort_order: Number(row.querySelector('.tab-order').value) || i,
    }))
    .filter((t) => t.label);
}

function renderTagsList(tags) {
  const box = document.getElementById('tagsList');
  const list = tags?.length ? tags : DEFAULT_TAGS;
  box.innerHTML = list
    .map(
      (t, i) => `
    <div class="tab-row">
      <input type="text" class="tag-label" value="${escapeHtml(t.label)}" placeholder="태그 키워드" />
      <input type="number" class="tag-order" value="${Number(t.sort_order) || i}" title="정렬" />
      <button type="button" class="btn btn-danger btn-sm" data-remove-tag>삭제</button>
    </div>`
    )
    .join('');
}

async function loadTags() {
  try {
    const { tags } = await fetch(apiUrl('/api/tags')).then((r) => r.json());
    renderTagsList(tags);
  } catch {
    renderTagsList(DEFAULT_TAGS);
  }
}

function collectTagsFromDom() {
  return [...document.querySelectorAll('#tagsList .tab-row')]
    .map((row, i) => ({
      label: row.querySelector('.tag-label').value.trim(),
      sort_order: Number(row.querySelector('.tag-order').value) || i,
    }))
    .filter((t) => t.label);
}

async function loadNotices() {
  const box = document.getElementById('noticesAdminList');
  if (!box) return;

  if (!allPostsCache.length) {
    try {
      const res = await fetch(apiUrl('/api/posts'));
      const { posts } = await res.json();
      allPostsCache = posts || [];
    } catch {
      box.innerHTML =
        '<p style="color:#999;font-size:13px">공지 목록을 불러오지 못했습니다.</p>';
      return;
    }
  }

  const notices = allPostsCache.filter((p) => p.category === '공지');

  if (!notices.length) {
    box.innerHTML =
      '<p style="color:#999;font-size:13px">등록된 공지가 없습니다. 「공지 작성」으로 올려 주세요.</p>';
    return;
  }

  box.innerHTML = notices
    .map(
      (n) => `
    <div class="notice-admin-card" data-id="${n.id}">
      <div class="notice-head">
        <span class="notice-title">${escapeHtml(n.title || '(제목 없음)')}</span>
        <span class="notice-meta">공지</span>
      </div>
      <div class="notice-meta">
        ${escapeHtml(n.published_at || '')}
        · <a class="slug" href="${postHref(n.slug)}" target="_blank">/${escapeHtml(n.slug)}</a>
      </div>
      <div class="notice-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-edit-notice="${n.id}">수정</button>
        <button type="button" class="btn btn-danger btn-sm" data-del-notice="${n.id}">삭제</button>
      </div>
    </div>`
    )
    .join('');
}

async function loadSettings() {
  const { settings } = await fetch(apiUrl('/api/settings')).then((r) => r.json());
  ['blog_name', 'profile_name', 'profile_image', 'cafe_title', 'cafe_desc', 'hero_image', 'hero_video'].forEach(
    (k) => {
      const el = document.getElementById(k);
      if (el) el.value = settings[k] || '';
    }
  );
  refreshSettingsAvatarPreview();
  const heroPrev = document.getElementById('heroImagePreview');
  const heroSrc = settings.hero_image || '/images/hero-diet.jpg';
  heroPrev.src = heroSrc.startsWith('http') || heroSrc.startsWith('/') ? heroSrc : apiUrl(heroSrc);
  heroPrev.style.display = 'block';
}

function resolveSettingsMediaUrl(src) {
  const s = String(src || '').trim();
  if (!s) return '';
  if (s.startsWith('http') || s.startsWith('data:') || s.startsWith('blob:') || s.startsWith('/')) {
    return s;
  }
  return apiUrl(s);
}

function refreshSettingsAvatarPreview() {
  const img = document.getElementById('profilePreview');
  const initial = document.getElementById('settingsAvatarInitial');
  const name = document.getElementById('profile_name')?.value.trim() || '행복하서연';
  const src = resolveSettingsMediaUrl(document.getElementById('profile_image')?.value || '');
  if (initial) initial.textContent = name.charAt(0) || '행';
  if (!img) return;
  if (src) {
    img.src = src;
    img.hidden = false;
    if (initial) initial.hidden = true;
  } else {
    img.removeAttribute('src');
    img.hidden = true;
    if (initial) initial.hidden = false;
  }
}

/** R2 없을 때 프로필용 작은 data URL 생성 */
function fileToAvatarDataUrl(file, maxSize = 320, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      try {
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const w = Math.max(1, Math.round(image.width * scale));
        const h = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        URL.revokeObjectURL(url);
        resolve(dataUrl);
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('이미지를 읽을 수 없습니다.'));
    };
    image.src = url;
  });
}

const MAX_UPLOAD_IMAGE = 10 * 1024 * 1024;
const MAX_UPLOAD_VIDEO = 95 * 1024 * 1024;

function formatMb(bytes) {
  return (Number(bytes) / (1024 * 1024)).toFixed(1);
}

async function uploadFile(file) {
  const type = file?.type || '';
  const isVideo = type.startsWith('video/');
  const isImage = type.startsWith('image/');
  const max = isVideo ? MAX_UPLOAD_VIDEO : MAX_UPLOAD_IMAGE;
  if ((isVideo || isImage) && file.size > max) {
    throw new Error(
      isVideo
        ? `영상 "${file.name}"이(가) ${formatMb(file.size)}MB라서 올릴 수 없습니다. 95MB 이하로 압축해 주세요.`
        : `이미지 "${file.name}"이(가) ${formatMb(file.size)}MB라서 올릴 수 없습니다. 10MB 이하로 줄여 주세요.`
    );
  }

  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(apiUrl('/api/upload'), {
    method: 'POST',
    headers: { 'X-Admin-Password': getPassword() },
    body: fd,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '업로드 실패');
  const url = data.url || '';
  if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('blob:')) return url;
  if (url.startsWith('/')) return location.origin + url;
  return apiUrl(url);
}

function dataUrlToFile(dataUrl, filename) {
  const m = /^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/i.exec(dataUrl);
  if (!m) throw new Error('잘못된 이미지 데이터입니다.');
  const mime = m[1];
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ext = (mime.split('/')[1] || 'png').replace('jpeg', 'jpg');
  const name = filename || `paste-${Date.now()}.${ext}`;
  return new File([bytes], name, { type: mime });
}

const R2_PUBLIC_HOST = 'pub-0d79669bad084bcd94df5093066b951f.r2.dev';

function decodeHtmlEntitiesInUrl(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** 우리 R2·사이트 정적 이미지면 true */
function isOwnedImageUrl(url) {
  const u = decodeHtmlEntitiesInUrl(url).trim();
  if (!u || /^data:/i.test(u) || /^blob:/i.test(u)) return true;
  if (u.includes(R2_PUBLIC_HOST)) return true;
  if (/^\/images\//i.test(u)) return true;
  if (/tennis0915\.com\/images\//i.test(u)) return true;
  if (/happy-haseyeon\.pages\.dev\/images\//i.test(u)) return true;
  return false;
}

function isExternalImageUrl(url) {
  const u = decodeHtmlEntitiesInUrl(url).trim();
  return /^https?:\/\//i.test(u) && !isOwnedImageUrl(u);
}

/** HTML 본문·링크카드에서 외부 이미지 URL 수집 */
function collectExternalImageUrls(html) {
  if (!html) return [];
  const found = new Set();

  const add = (raw) => {
    const u = decodeHtmlEntitiesInUrl(raw).trim();
    if (isExternalImageUrl(u)) found.add(u);
  };

  let m;
  const srcRe = /\bsrc\s*=\s*(["'])(https?:\/\/[^"']+)\1/gi;
  while ((m = srcRe.exec(html)) !== null) add(m[2]);

  const dataImgRe = /\bdata-image\s*=\s*(["'])(https?:\/\/[^"']+)\1/gi;
  while ((m = dataImgRe.exec(html)) !== null) add(m[2]);

  const bgRe = /background-image\s*:\s*url\s*\(\s*(["']?)(https?:\/\/[^"')]+)\1\s*\)/gi;
  while ((m = bgRe.exec(html)) !== null) add(m[2]);

  const srcsetRe = /\bsrcset\s*=\s*(["'])([^"']+)\1/gi;
  while ((m = srcsetRe.exec(html)) !== null) {
    m[2].split(',').forEach((part) => {
      const url = part.trim().split(/\s+/)[0];
      add(url);
    });
  }

  return [...found];
}

function replaceUrlInHtml(html, fromUrl, toUrl) {
  if (!fromUrl || fromUrl === toUrl) return html;
  let out = html.split(fromUrl).join(toUrl);
  const encoded = fromUrl.replace(/&/g, '&amp;');
  if (encoded !== fromUrl) out = out.split(encoded).join(toUrl);
  return out;
}

/** 가져오기 실패한 외부 이미지 URL을 본문에서 제거 (안 보이는 링크카드·배경까지) */
function stripImageUrlFromHtml(html, url) {
  if (!html || !url) return html;
  let out = html;
  const variants = [url, url.replace(/&/g, '&amp;')];
  for (const u of [...new Set(variants)]) {
    const esc = u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`<img\\b[^>]*\\bsrc\\s*=\\s*(["'])${esc}\\1[^>]*>`, 'gi'), '');
    out = out.replace(new RegExp(`\\bdata-image\\s*=\\s*(["'])${esc}\\1`, 'gi'), 'data-image=""');
    out = out.replace(
      new RegExp(`background-image\\s*:\\s*url\\s*\\(\\s*(["']?)${esc}\\1\\s*\\)`, 'gi'),
      'background-image:none'
    );
    // 평문 split/join 은 data-url·마크업을 깨뜨리므로 속성만 정리
  }
  return out;
}

/**
 * 외부 이미지 URL을 서버에서 받아 R2에 저장하고 HTML URL 교체 (80개 초과 시 배치).
 * 일부 실패해도 성공분만 교체하고, 실패 URL은 본문에서 제거해 저장을 막지 않음.
 * @returns {{ html: string, failedCount: number, mirroredCount: number, strippedCount: number }}
 */
async function replaceExternalImagesInHtml(html) {
  const urls = collectExternalImageUrls(html);
  if (!urls.length) {
    return { html, failedCount: 0, mirroredCount: 0, strippedCount: 0 };
  }

  // 서버 한도(80)보다 작게 나눠 Worker 타임아웃·한도 오류를 피함
  const BATCH = 40;
  const allResults = [];
  const allFailed = [];

  for (let i = 0; i < urls.length; i += BATCH) {
    const chunk = urls.slice(i, i + BATCH);
    const done = Math.min(i + chunk.length, urls.length);
    showLoading(
      `외부 이미지 ${done}/${urls.length}장을 우리 서버로 복사하는 중…`,
      '이미지 저장'
    );
    const data = await adminFetch('/api/upload-from-url', {
      method: 'POST',
      json: { urls: chunk },
    });
    allResults.push(...(data.results || []));
    allFailed.push(...(data.failed || []).filter(Boolean));
  }

  let out = html;
  let mirroredCount = 0;
  for (const row of allResults) {
    if (row.ok && row.mirrorUrl && row.url && !row.skipped) {
      out = replaceUrlInHtml(out, row.url, row.mirrorUrl);
      mirroredCount += 1;
    }
  }

  // 만료·차단된 카카오 등 URL은 본문에 남겨두면 다음에 또 실패함 → 제거
  let strippedCount = 0;
  for (const f of allFailed) {
    if (!f?.url) continue;
    const before = out;
    out = stripImageUrlFromHtml(out, f.url);
    if (out !== before) strippedCount += 1;
  }

  return {
    html: out,
    failedCount: allFailed.length,
    mirroredCount,
    strippedCount,
  };
}

async function mirrorExternalImageUrl(url) {
  if (!isExternalImageUrl(url)) return { url, failed: false };
  const data = await adminFetch('/api/upload-from-url', {
    method: 'POST',
    json: { url },
  });
  const row = data.results?.[0];
  if (!row?.ok || !row.mirrorUrl) {
    return { url, failed: true, error: row?.error || '대표 이미지를 가져오지 못함' };
  }
  return { url: row.mirrorUrl, failed: false };
}

/** 본문 속 base64 이미지를 R2에 올리고 URL로 교체 */
async function replaceBase64ImagesInHtml(html) {
  if (!html || !/data:image\//i.test(html)) return html;

  const re = /src\s*=\s*(["'])(data:image\/[a-zA-Z0-9+.-]+;base64,[^"']+)\1/gi;
  const found = [];
  let match;
  while ((match = re.exec(html)) !== null) {
    found.push(match[2]);
  }
  const unique = [...new Set(found)];
  if (!unique.length) return html;

  let out = html;
  for (let i = 0; i < unique.length; i++) {
    const dataUrl = unique[i];
    // 대략 7MB 넘는 base64는 거부 (R2 한도 안에서도 비현실적)
    if (dataUrl.length > 10 * 1024 * 1024) {
      throw new Error(
        `이미지가 너무 큽니다 (${i + 1}/${unique.length}). 이미지 버튼으로 파일을 업로드해 주세요.`
      );
    }
    const file = dataUrlToFile(dataUrl, `editor-${Date.now()}-${i}.png`);
    const url = await uploadFile(file);
    out = out.split(dataUrl).join(url);
  }
  return out;
}

function uploadImagesViaHandler(files, uploadHandler) {
  const list = [...(files || [])].filter((f) => f && f.type && f.type.startsWith('image/'));
  if (!list.length) {
    uploadHandler('이미지 파일이 없습니다.');
    return;
  }

  Promise.all(list.map((file) => uploadFile(file).then((url) => ({ url, name: file.name, size: file.size }))))
    .then((result) => uploadHandler({ result }))
    .catch((err) => uploadHandler(err.message || String(err)));
}

async function insertUploadedImages(files, core) {
  const list = [...(files || [])].filter((f) => f && f.type && f.type.startsWith('image/'));
  if (!list.length) return;
  showLoading(`이미지 ${list.length}장을 R2에 업로드 중…`, '이미지 업로드');
  try {
    for (const file of list) {
      const url = await uploadFile(file);
      const html = `<img src="${escapeHtml(url)}" alt="" />`;
      if (core?.functions?.insertHTML) core.functions.insertHTML(html, true, false);
      else if (suneditor) suneditor.insertHTML(html);
    }
    closeUiModal(true);
    setTimeout(() => ensureEditableGapAfterImages(), 30);
  } catch (e) {
    closeUiModal(false);
    await showAlert({
      title: '이미지 업로드 실패',
      message: e.message || 'R2 업로드에 실패했습니다.',
      variant: 'error',
    });
  }
}

const THEME_KEY = 'adminTheme';

function applyAdminTheme(theme) {
  const mode = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-admin-theme', mode);
  document.body.setAttribute('data-admin-theme', mode);
  localStorage.setItem(THEME_KEY, mode);
  document.querySelectorAll('[data-theme-set]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.themeSet === mode);
  });
  document.querySelectorAll('.theme-toggle').forEach((el) => {
    el.classList.toggle('is-dark', mode === 'dark');
  });
}

// 로그인 화면부터 테마 적용
applyAdminTheme(localStorage.getItem(THEME_KEY) || 'light');

let previewSettingsCache = null;
let previewDevice = 'mobile';

function resolvePreviewUrl(url) {
  if (!url) return '';
  if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('blob:')) return url;
  if (url.startsWith('/')) return location.origin + url;
  return apiUrl(url).startsWith('http') ? apiUrl(url) : location.origin + apiUrl(url);
}

function buildPreviewHtml(settings) {
  const blogName = settings.blog_name || '행복하서연';
  const profileName = settings.profile_name || '행복하서연';
  const title = document.getElementById('title').value || '(제목 없음)';
  const published = document.getElementById('published_at').value || '미리보기';
  const likes = Number(document.getElementById('likes').value) || 0;
  const comments = Number(document.getElementById('comment_count_display').value) || 0;
  const cover = document.getElementById('cover_image').value.trim();
  const body = prepareLinkCardsHtml(getEditorHtml() || '<p></p>');
  const cssBase = location.origin;
  const isAd =
    (document.getElementById('lockedCategory')?.value || '') === AD_CATEGORY;
  const profileImg = settings.profile_image
    ? `<img class="avatar" src="${escapeHtml(resolvePreviewUrl(settings.profile_image))}" alt="" />`
    : `<div class="avatar placeholder">${escapeHtml(profileName.charAt(0))}</div>`;
  const coverHtml = cover
    ? `<div class="post-cover"><img src="${escapeHtml(resolvePreviewUrl(cover))}" alt="" /></div>`
    : '';
  const blogTopHtml = isAd
    ? `<header class="blog-top blog-top--ad-spacer" aria-hidden="true"></header>`
    : `<header class="blog-top">
      <a class="back" href="/" aria-label="뒤로">←</a>
      <div class="blog-name">${escapeHtml(blogName)}</div>
      <div class="icons"><span>⌂</span><span>≡</span></div>
    </header>`;
  const neighborBtnHtml = isAd
    ? ''
    : `<button type="button" class="neighbor-btn">이웃추가</button>`;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <base href="${cssBase}/" />
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="${cssBase}/css/common.css?v=20260723-ogcard2" />
  <link rel="stylesheet" href="${cssBase}/css/blog.css?v=20260918-ad-ui2" />
  <style>
    body { margin: 0; background: #fff; }
    .preview-badge {
      position: sticky; top: 0; z-index: 20;
      background: #03c75a; color: #fff; font-size: 12px; font-weight: 700;
      text-align: center; padding: 6px 8px;
    }
    .post-body .link-card-url-line,
    .post-body .link-card-block {
      display: block !important;
      width: 100% !important;
      text-align: center !important;
    }
    .post-body .link-card-url-line { margin: 0 0 8px !important; }
    .post-body .link-card-block { margin: 0 0 16px !important; }
    .post-body a.link-card-url {
      color: #0068c3 !important;
      text-decoration: underline !important;
      word-break: break-all !important;
    }
    .post-body table.link-card {
      display: table !important;
      width: 400px !important;
      max-width: 100% !important;
      margin: 0 auto !important;
      float: none !important;
      border: 1px solid #e5e8eb !important;
      border-radius: 10px !important;
      border-collapse: separate !important;
      border-spacing: 0 !important;
      overflow: hidden !important;
      background: #fff !important;
      text-align: left !important;
      table-layout: fixed !important;
    }
    .post-body table.link-card td { border: 0 !important; }
    .post-body table.link-card td.link-card-media {
      background-size: cover !important;
      background-position: center center !important;
      background-repeat: no-repeat !important;
    }
    .post-body table.link-card img {
      display: block !important;
      width: 100% !important;
      height: auto !important;
      margin: 0 !important;
      border: 0 !important;
    }
    .post-body a.link-card-title {
      display: block !important;
      color: #222 !important;
      font-weight: 700 !important;
      text-decoration: none !important;
    }
    .post-body a.link-card-desc {
      display: block !important;
      color: #666 !important;
      text-decoration: none !important;
    }
    .post-body a.link-card-domain {
      display: block !important;
      color: #2e9e4d !important;
      text-decoration: none !important;
    }
  </style>
</head>
<body>
  <div class="preview-badge">미리보기 · 실제 발행 화면 예상</div>
  <div class="wrap"${isAd ? ' data-ad-landing="1"' : ''}>
    ${blogTopHtml}
    <div class="profile-row">
      ${profileImg}
      <div class="info">
        <div class="name">${escapeHtml(profileName)}</div>
        <div class="date">${escapeHtml(published)}</div>
      </div>
      ${neighborBtnHtml}
    </div>
    <h1 class="post-title">${escapeHtml(title)}</h1>
    <hr class="post-title-divider" />
    ${coverHtml}
    <article class="post-body">${body}</article>
    <div class="reaction">
      <div class="item"><span class="heart">❤</span> <span class="count">${likes.toLocaleString()}</span></div>
      <div class="item">💬 <span class="count">${comments.toLocaleString()}</span></div>
      <div class="item">공유</div>
    </div>
    <section class="comment-section">
      <div class="head">댓글 <em>0</em></div>
      <div class="post-error" style="padding:24px 0">실제 댓글은 댓글 관리에 등록된 개수로 표시됩니다.</div>
    </section>
  </div>
</body>
</html>`;
}

async function openPreviewModal() {
  const modal = document.getElementById('previewModal');
  const iframe = document.getElementById('previewIframe');
  if (!modal || !iframe) return;

  try {
    if (!previewSettingsCache) {
      const data = await fetch(apiUrl('/api/settings')).then((r) => r.json());
      previewSettingsCache = data.settings || {};
    }
  } catch {
    previewSettingsCache = {};
  }

  // 저장과 동일: 평문 URL → OG 카드 변환 후 미리보기
  // (미리보기만 prepare하면 URL 텍스트로만 보임)
  try {
    showLoading('링크 카드를 준비하고 미리보는 중…', '미리보기');
    await convertPlainLinksInEditor();
    hardenLinkCardsInEditor();
    scrubNaverSourceInEditor();
  } catch (e) {
    console.warn('preview link convert', e);
  } finally {
    closeUiModal(true);
  }

  // 좁은 화면에서는 기본 모바일 풀모달
  if (window.matchMedia('(max-width: 768px)').matches) {
    previewDevice = 'mobile';
  }

  setPreviewDevice(previewDevice);
  iframe.srcdoc = buildPreviewHtml(previewSettingsCache);
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closePreviewModal() {
  const modal = document.getElementById('previewModal');
  const iframe = document.getElementById('previewIframe');
  if (modal) modal.hidden = true;
  if (iframe) iframe.srcdoc = '';
  document.body.style.overflow = '';
}

function setPreviewDevice(device) {
  previewDevice = device === 'desktop' ? 'desktop' : 'mobile';
  document.querySelectorAll('.preview-device').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.device === previewDevice);
  });
  const wrap = document.querySelector('[data-preview-frame]');
  if (wrap) wrap.dataset.previewFrame = previewDevice;
}

function bindPreviewModal() {
  const modal = document.getElementById('previewModal');
  if (!modal || modal.dataset.bound) return;
  modal.dataset.bound = '1';

  modal.addEventListener('click', (e) => {
    if (e.target.closest('[data-close-preview]')) closePreviewModal();
  });

  document.querySelectorAll('.preview-device').forEach((btn) => {
    btn.onclick = () => setPreviewDevice(btn.dataset.device);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closePreviewModal();
  });
}

function bindAdminUI() {
  bindUiModal();
  bindAdminNav();
  bindNavSections();
  bindSeoPreview();
  applyAdminTheme(localStorage.getItem('adminTheme') || 'light');

  document.querySelectorAll('[data-theme-set]').forEach((btn) => {
    btn.onclick = () => applyAdminTheme(btn.dataset.themeSet);
  });

  document.getElementById('btnLogout').onclick = () => {
    sessionStorage.removeItem(PASS_KEY);
    showLogin();
  };

  document.getElementById('btnInsertParaAbove').onclick = () => insertParagraph('above');
  document.getElementById('btnInsertParaBelow').onclick = () => insertParagraph('below');
  document.getElementById('btnMoveBlockUp')?.addEventListener('click', () => moveEditorBlock('up'));
  document.getElementById('btnMoveBlockDown')?.addEventListener('click', () =>
    moveEditorBlock('down')
  );

  document.querySelectorAll('.admin-nav button[data-panel]').forEach((btn) => {
    btn.onclick = () => {
      if (btn.dataset.panel === 'edit') {
        openWrite(btn.dataset.category || '후기');
      } else {
        showPanel(btn.dataset.panel);
      }
    };
  });

  document.querySelectorAll('[data-guide-go]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const panel = btn.dataset.guideGo;
      const category = btn.dataset.guideCategory;
      if (panel === 'edit') openWrite(category || AD_CATEGORY);
      else showPanel(panel);
    });
  });

  document.querySelectorAll('.guide-toc a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href')?.slice(1);
      const el = id && document.getElementById(id);
      if (!el) return;
      e.preventDefault();
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  document.getElementById('btnRefreshPosts').onclick = () => loadPosts();
  document.getElementById('postsFilter').onchange = () => {
    const filter = document.getElementById('postsFilter').value;
    const filtered = filter
      ? allPostsCache.filter((p) => p.category === filter)
      : allPostsCache;
    renderPostsTable(filtered);
  };

  document.getElementById('btnRefreshAdPosts')?.addEventListener('click', () => loadAdPosts());
  document.getElementById('btnNewAdPost')?.addEventListener('click', () => openWrite(AD_CATEGORY));

  document.getElementById('btnAdStatsSearch')?.addEventListener('click', () => {
    loadAdStatsList();
    if (selectedAdStatsPostId) loadAdStatsDetail(selectedAdStatsPostId);
  });
  document.getElementById('btnAdStatsRefresh')?.addEventListener('click', () => {
    loadAdStatsList();
    if (selectedAdStatsPostId) loadAdStatsDetail(selectedAdStatsPostId);
  });
  document.getElementById('adStatsSearch')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      loadAdStatsList();
    }
  });
  document.getElementById('adStatsPostList')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ad-stats-id]');
    if (!btn) return;
    loadAdStatsDetail(btn.dataset.adStatsId);
  });

  document.getElementById('btnHomeStatsSearch')?.addEventListener('click', () =>
    loadHomeStats()
  );
  document.getElementById('btnMainStatsSearch')?.addEventListener('click', () => {
    loadMainStatsList();
    if (selectedMainStatsPostId) loadMainStatsDetail(selectedMainStatsPostId);
  });
  document.getElementById('btnMainStatsRefresh')?.addEventListener('click', () => {
    loadHomeStats();
    loadMainStatsList();
    if (selectedMainStatsPostId) loadMainStatsDetail(selectedMainStatsPostId);
  });
  document.getElementById('mainStatsSearch')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      loadMainStatsList();
    }
  });
  document.getElementById('mainStatsCategory')?.addEventListener('change', () =>
    loadMainStatsList()
  );
  document.getElementById('mainStatsPostList')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-main-stats-id]');
    if (!btn) return;
    loadMainStatsDetail(btn.dataset.mainStatsId);
  });

  document.getElementById('adPostsBody')?.addEventListener('click', async (e) => {
    const copyEl = e.target.closest('[data-copy-ad]');
    if (copyEl) {
      e.preventDefault();
      e.stopPropagation();
      await copyPost(copyEl.dataset.copyAd, { ad: true });
      return;
    }
    const editEl = e.target.closest('[data-edit-ad]');
    if (!editEl) return;
    e.preventDefault();
    e.stopPropagation();
    const id = editEl.dataset.editAd;
    if (id) editPost(id);
  });

  document.getElementById('btnSavePost').onclick = () => savePost();
  document.getElementById('btnPreview').onclick = () => openPreviewModal();
  bindPreviewModal();
  bindPixelFieldListeners();
  refreshPixelBadges();
  document.getElementById('btnDeletePost').onclick = async () => {
    const id = document.getElementById('postId').value;
    if (!id) return;
    const ok = await showConfirm({
      title: '게시글 삭제',
      message: '이 글을 삭제할까요?\n삭제 후에는 되돌릴 수 없습니다.',
      okText: '삭제',
      cancelText: '취소',
    });
    if (!ok) return;
    showLoading('게시글을 삭제하고 있습니다…', '삭제 중');
    try {
      await adminFetch(`/api/posts/${id}`, { method: 'DELETE' });
      closeUiModal(true);
      clearEditForm(document.getElementById('lockedCategory').value);
      const cat = document.getElementById('lockedCategory').value;
      showPanel(cat === AD_CATEGORY ? 'ad-posts' : 'posts');
      loadPosts();
      if (cat === AD_CATEGORY) loadAdPosts();
      await showAlert({
        title: '삭제 완료',
        message: '게시글이 삭제되었습니다.',
        variant: 'success',
      });
    } catch (e) {
      if (e.message === 'unauthorized') {
        closeUiModal(false);
        return;
      }
      closeUiModal(false);
      await showAlert({
        title: '삭제 실패',
        message: e.message || '삭제에 실패했습니다.',
        detail: e.detail || '',
        variant: 'error',
      });
    }
  };

  document.getElementById('postsBody').addEventListener('click', async (e) => {
    const copyEl = e.target.closest('[data-copy]');
    if (copyEl) {
      e.preventDefault();
      e.stopPropagation();
      await copyPost(copyEl.dataset.copy);
      return;
    }
    const editEl = e.target.closest('[data-edit]');
    if (!editEl) return;
    e.preventDefault();
    e.stopPropagation();
    const id = editEl.dataset.edit;
    if (id) editPost(id);
  });

  document.getElementById('commentPostList').addEventListener('click', (e) => {
    const id = e.target.closest('[data-post-id]')?.dataset.postId;
    if (id) selectCommentPost(id);
  });

  document.getElementById('commentPostSearch').addEventListener('input', () => {
    renderCommentPostList();
  });

  document.getElementById('btnAddComment').onclick = () => addCommentQuick();

  document.getElementById('cContent').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      addCommentQuick();
    }
  });

  document.getElementById('adCommentPostList')?.addEventListener('click', (e) => {
    const id = e.target.closest('[data-ad-post-id]')?.dataset.adPostId;
    if (id) selectAdCommentPost(id);
  });

  document.getElementById('adCommentPostSearch')?.addEventListener('input', () => {
    renderAdCommentPostList();
  });

  document.getElementById('btnAddAdComment')?.addEventListener('click', () => addAdCommentQuick());

  document.getElementById('adCContent')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      addAdCommentQuick();
    }
  });

  bindCommentAvatarComposer('c');
  bindCommentAvatarComposer('adC');

  document.getElementById('btnInsertLinkCard')?.addEventListener('click', () =>
    insertLinkCard()
  );
  document.getElementById('btnCenterLinkCard')?.addEventListener('click', () =>
    alignLinkCards('center')
  );
  document.getElementById('btnCancelReply')?.addEventListener('click', () =>
    clearReplyTarget('c')
  );
  document.getElementById('btnCancelAdReply')?.addEventListener('click', () =>
    clearReplyTarget('adC')
  );

  async function handleCommentListClick(e, { ad = false } = {}) {
    const replyEl = e.target.closest('[data-reply-c]');
    if (replyEl) {
      e.preventDefault();
      const prefix = ad ? 'adC' : 'c';
      setReplyTarget(prefix, replyEl.dataset.replyC, replyEl.dataset.replyAuthor || '');
      document
        .getElementById(ad ? 'adCommentComposer' : 'commentComposer')
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }

    const item = e.target.closest('.cm-item');
    if (!item) return;

    const editId = e.target.closest('[data-edit-c]')?.dataset.editC;
    const cancelId = e.target.closest('[data-cancel-c]')?.dataset.cancelC;
    const saveId = e.target.closest('[data-save-c]')?.dataset.saveC;
    const delId = e.target.closest('[data-del-c]')?.dataset.delC;

    if (editId) {
      // 중첩 구조에서 해당 아이템의 view/edit만 토글
      const target = e.target.closest('.cm-item');
      target.querySelector(':scope > .cm-item-view').hidden = true;
      target.querySelector(':scope > .cm-item-edit').hidden = false;
      const profileInput = target.querySelector('[data-f="profile_image"]');
      const preview = target.querySelector(`[data-preview-c="${editId}"]`);
      const authorInput = target.querySelector('[data-f="author"]');
      const syncPreview = () => {
        if (!preview) return;
        const url = (profileInput?.value || '').trim();
        const initial = (authorInput?.value || '?').trim().charAt(0) || '?';
        preview.innerHTML = url
          ? `<img src="${escapeHtml(url)}" alt="" />`
          : escapeHtml(initial);
      };
      profileInput?.addEventListener('input', syncPreview);
      authorInput?.addEventListener('input', syncPreview);
      return;
    }

    if (cancelId) {
      const target = e.target.closest('.cm-item');
      target.querySelector(':scope > .cm-item-view').hidden = false;
      target.querySelector(':scope > .cm-item-edit').hidden = true;
      return;
    }

    if (saveId) {
      try {
        await adminFetch('/api/comments', {
          method: 'PUT',
          json: {
            id: Number(saveId),
            author: item.querySelector('[data-f="author"]').value,
            content: item.querySelector('[data-f="content"]').value,
            created_at: item.querySelector('[data-f="created_at"]').value,
            likes: Number(item.querySelector('[data-f="likes"]').value) || 0,
            dislikes: Number(item.querySelector('[data-f="dislikes"]')?.value) || 0,
            profile_image:
              item.querySelector('[data-f="profile_image"]')?.value.trim() || '',
          },
        });
        toast('댓글이 수정되었습니다.');
        if (ad) loadAdComments();
        else loadComments();
      } catch (err) {
        if (err.message !== 'unauthorized') toast(err.message, false);
      }
      return;
    }

    if (delId) {
      const ok = await showConfirm({
        title: '댓글 삭제',
        message: '이 댓글을 삭제할까요?',
        okText: '삭제',
        cancelText: '취소',
      });
      if (!ok) return;
      try {
        await adminFetch(`/api/comments?id=${delId}`, { method: 'DELETE' });
        toast('삭제되었습니다.');
        if (ad) {
          await loadAdComments();
          const post = allAdPostsCache.find(
            (p) => String(p.id) === String(selectedAdCommentPostId)
          );
          if (post) {
            post.comment_count = adCommentsCache.length;
            renderAdCommentPostList();
          }
        } else {
          await loadComments();
          const post = allPostsCache.find(
            (p) => String(p.id) === String(selectedCommentPostId)
          );
          if (post) {
            post.comment_count = commentsCache.length;
            renderCommentPostList();
          }
        }
      } catch (err) {
        if (err.message !== 'unauthorized') toast(err.message, false);
      }
    }
  }

  async function handleCommentProfileUpload(e) {
    const input = e.target.closest('[data-upload-c]');
    if (!input || input.tagName !== 'INPUT') return;
    const file = input.files?.[0];
    if (!file) return;
    const item = input.closest('.cm-item');
    const id = input.dataset.uploadC;
    try {
      showLoading('프로필 사진을 올리는 중…', '업로드');
      const url = await uploadFile(file);
      const urlInput = item?.querySelector('[data-f="profile_image"]');
      if (urlInput) urlInput.value = url;
      const preview = item?.querySelector(`[data-preview-c="${id}"]`);
      if (preview) preview.innerHTML = `<img src="${escapeHtml(url)}" alt="" />`;
      closeUiModal(true);
      toast('프로필 사진이 업로드되었습니다.');
    } catch (err) {
      closeUiModal(false);
      toast(err.message || '업로드 실패', false);
    } finally {
      input.value = '';
    }
  }

  document.getElementById('commentsList').addEventListener('click', (e) =>
    handleCommentListClick(e, { ad: false })
  );
  document.getElementById('commentsList').addEventListener('change', (e) =>
    handleCommentProfileUpload(e)
  );

  document.getElementById('adCommentsList')?.addEventListener('click', (e) =>
    handleCommentListClick(e, { ad: true })
  );
  document.getElementById('adCommentsList')?.addEventListener('change', (e) =>
    handleCommentProfileUpload(e)
  );

  document.getElementById('btnAddTab').onclick = () => {
    const box = document.getElementById('tabsList');
    const i = box.querySelectorAll('.tab-row').length;
    const row = document.createElement('div');
    row.className = 'tab-row';
    row.innerHTML = `
      <input type="text" class="tab-label" value="" placeholder="탭 이름" />
      <input type="number" class="tab-order" value="${i}" title="정렬" />
      <button type="button" class="btn btn-danger btn-sm" data-remove-tab>삭제</button>`;
    box.appendChild(row);
  };

  document.getElementById('tabsList').addEventListener('click', (e) => {
    if (e.target.closest('[data-remove-tab]')) {
      e.target.closest('.tab-row')?.remove();
    }
  });

  document.getElementById('btnSaveTabs').onclick = async () => {
    try {
      const tabs = collectTabsFromDom();
      if (!tabs.length) return toast('탭을 하나 이상 입력하세요.', false);
      await adminFetch('/api/tabs', { method: 'PUT', json: { tabs } });
      toast('탭이 저장되었습니다.');
      loadTabs();
    } catch (e) {
      if (e.message !== 'unauthorized') toast(e.message, false);
    }
  };

  document.getElementById('btnAddTag').onclick = () => {
    const box = document.getElementById('tagsList');
    const i = box.querySelectorAll('.tab-row').length;
    const row = document.createElement('div');
    row.className = 'tab-row';
    row.innerHTML = `
      <input type="text" class="tag-label" value="" placeholder="태그 키워드" />
      <input type="number" class="tag-order" value="${i}" title="정렬" />
      <button type="button" class="btn btn-danger btn-sm" data-remove-tag>삭제</button>`;
    box.appendChild(row);
  };

  document.getElementById('tagsList').addEventListener('click', (e) => {
    if (e.target.closest('[data-remove-tag]')) {
      e.target.closest('.tab-row')?.remove();
    }
  });

  document.getElementById('btnSaveTags').onclick = async () => {
    try {
      const tags = collectTagsFromDom();
      await adminFetch('/api/tags', { method: 'PUT', json: { tags } });
      toast('태그가 저장되었습니다.');
      loadTags();
    } catch (e) {
      if (e.message !== 'unauthorized') toast(e.message, false);
    }
  };

  document.getElementById('btnNewNoticePost')?.addEventListener('click', () => {
    openWrite('공지');
  });

  document.getElementById('btnRefreshNotices')?.addEventListener('click', async () => {
    allPostsCache = [];
    await loadPosts();
    loadNotices();
  });

  document.getElementById('noticesAdminList').addEventListener('click', async (e) => {
    const editId = e.target.closest('[data-edit-notice]')?.dataset.editNotice;
    const delId = e.target.closest('[data-del-notice]')?.dataset.delNotice;

    if (editId) {
      editPost(editId);
      return;
    }

    if (delId) {
      const ok = await showConfirm({
        title: '공지 삭제',
        message: '이 공지 글을 삭제할까요?\n삭제 후에는 되돌릴 수 없습니다.',
        okText: '삭제',
        cancelText: '취소',
      });
      if (!ok) return;
      try {
        await adminFetch(`/api/posts/${delId}`, { method: 'DELETE' });
        toast('삭제되었습니다.');
        allPostsCache = allPostsCache.filter((p) => String(p.id) !== String(delId));
        loadNotices();
        loadPosts();
      } catch (err) {
        if (err.message !== 'unauthorized') toast(err.message, false);
      }
    }
  });

  document.getElementById('btnSaveSettings').onclick = async () => {
    try {
      await adminFetch('/api/settings', {
        method: 'PUT',
        json: {
          settings: {
            blog_name: document.getElementById('blog_name').value,
            profile_name: document.getElementById('profile_name').value,
            profile_image: document.getElementById('profile_image').value,
            cafe_title: document.getElementById('cafe_title').value,
            cafe_desc: document.getElementById('cafe_desc').value,
            hero_image: document.getElementById('hero_image').value,
            hero_video: document.getElementById('hero_video').value,
          },
        },
      });
      toast('설정이 저장되었습니다.');
      previewSettingsCache = null;
    } catch (e) {
      if (e.message !== 'unauthorized') toast(e.message, false);
    }
  };

  document.getElementById('profile_name')?.addEventListener('input', refreshSettingsAvatarPreview);
  document.getElementById('profile_image')?.addEventListener('input', refreshSettingsAvatarPreview);

  document.getElementById('btnPickProfile')?.addEventListener('click', () => {
    document.getElementById('profileFile')?.click();
  });

  document.getElementById('profileFile')?.addEventListener('change', () => {
    // 파일 선택 직후 바로 업로드 시도
    document.getElementById('btnUploadProfile')?.click();
  });

  document.getElementById('btnClearProfile')?.addEventListener('click', () => {
    const input = document.getElementById('profile_image');
    if (input) input.value = '';
    const file = document.getElementById('profileFile');
    if (file) file.value = '';
    refreshSettingsAvatarPreview();
    toast('이미지를 지웠습니다. 설정 저장을 눌러주세요.');
  });

  document.getElementById('btnUploadProfile').onclick = async () => {
    const file = document.getElementById('profileFile').files[0];
    if (!file) return toast('파일을 선택하세요.', false);
    try {
      let url = '';
      try {
        url = await uploadFile(file);
      } catch (_) {
        // R2 미연결 시 작은 data URL로 저장
        url = await fileToAvatarDataUrl(file);
      }
      document.getElementById('profile_image').value = url;
      refreshSettingsAvatarPreview();
      toast('업로드 완료. 설정 저장을 눌러주세요.');
    } catch (e) {
      toast(e.message, false);
    }
  };

  document.getElementById('btnUploadCover').onclick = async () => {
    const file = document.getElementById('coverFile').files[0];
    await uploadCoverFile(file);
  };

  document.getElementById('coverFile').addEventListener('change', async () => {
    const file = document.getElementById('coverFile').files[0];
    if (!file) return;
    await uploadCoverFile(file);
  });

  document.getElementById('cover_image').addEventListener('change', () => {
    const url = document.getElementById('cover_image').value.trim();
    setCoverPreview(url);
    setCoverStatus(url ? 'URL이 적용되었습니다 · 저장을 눌러 반영하세요' : '', url ? 'ok' : '');
  });

  document.getElementById('btnUploadHeroImage').onclick = async () => {
    const file = document.getElementById('heroImageFile').files[0];
    if (!file) return toast('이미지 파일을 선택하세요.', false);
    try {
      const url = await uploadFile(file);
      document.getElementById('hero_image').value = url;
      const prev = document.getElementById('heroImagePreview');
      prev.src = url.startsWith('http') || url.startsWith('data:') ? url : apiUrl(url);
      prev.style.display = 'block';
      toast('히어로 이미지 업로드 완료. 설정 저장을 눌러주세요.');
    } catch (e) {
      toast(e.message, false);
    }
  };

  document.getElementById('btnUploadHeroVideo').onclick = async () => {
    const file = document.getElementById('heroVideoFile').files[0];
    if (!file) return toast('영상 파일을 선택하세요.', false);
    try {
      const url = await uploadFile(file);
      document.getElementById('hero_video').value = url;
      toast('히어로 영상 업로드 완료. 설정 저장을 눌러주세요.');
    } catch (e) {
      toast(e.message, false);
    }
  };

  document.getElementById('btnChangePw').onclick = async () => {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const newPasswordConfirm = document.getElementById('newPasswordConfirm').value;

    if (!currentPassword) {
      toast('현재 비밀번호를 입력하세요.', false);
      return;
    }
    if (!newPassword || newPassword.length < 4) {
      toast('새 비밀번호는 4자 이상이어야 합니다.', false);
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      toast('새 비밀번호 확인이 일치하지 않습니다.', false);
      return;
    }

    try {
      await adminFetch('/api/auth', {
        method: 'PUT',
        json: { password: currentPassword, newPassword },
      });
      sessionStorage.setItem(PASS_KEY, newPassword);
      document.getElementById('currentPassword').value = '';
      document.getElementById('newPassword').value = '';
      document.getElementById('newPasswordConfirm').value = '';
      toast('비밀번호가 변경되었습니다.');
    } catch (e) {
      if (e.message !== 'unauthorized') toast(e.message, false);
    }
  };
}

if (!requireLogin()) {
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('loginMsg');
    msg.classList.remove('show');
    const password = document.getElementById('password').value;
    try {
      const res = await fetch(apiUrl('/api/auth'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        msg.textContent = data.error || '로그인 실패';
        msg.classList.add('show');
        return;
      }
      sessionStorage.setItem(PASS_KEY, password);
      showAdmin();
      bindAdminUI();
      loadPosts();
      showPanel('ad-posts');
      loadSettings();
    } catch {
      msg.textContent = '서버 연결에 실패했습니다.';
      msg.classList.add('show');
    }
  });
} else {
  bindAdminUI();
  loadPosts();
  showPanel('ad-posts');
  loadSettings();
}
