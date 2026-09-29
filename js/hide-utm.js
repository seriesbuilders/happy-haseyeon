/** 광고 랜딩: GA4·픽셀이 주소를 읽은 뒤 주소창에서 utm_ 값만 지운다 (새로고침 없음) */
(function () {
  if (!/[?&]utm_/i.test(location.search)) return;
  var WAIT_MS = 2000; // 페이지가 다 열린 뒤 기다리는 시간

  function strip() {
    try {
      var u = new URL(location.href);
      var keys = [];
      u.searchParams.forEach(function (_, k) {
        if (/^utm_/i.test(k)) keys.push(k);
      });
      if (!keys.length) return;
      keys.forEach(function (k) {
        u.searchParams.delete(k);
      });
      history.replaceState(history.state, '', u.pathname + u.search + u.hash);
    } catch (e) {
      /* 실패하면 주소는 그대로 둔다 */
    }
  }

  function start() {
    setTimeout(strip, WAIT_MS);
  }
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start);
})();