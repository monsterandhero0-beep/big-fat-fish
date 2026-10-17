/* 合成大肥鱼 · 素材加载
 * 约定：图片放在 assets/fish/<两位编号>.png（00、01 … 10），背景放 assets/bg.png。
 * 有就用图，没有就回落到程序画的占位鱼 —— 所以你随时把图丢进去就能生效，不用改代码。
 */
window.GameAssets = (function () {
  'use strict';
  const images = Object.create(null);
  const missing = [];

  function loadOne(key, src) {
    return new Promise(function (resolve) {
      try {
        // 单文件版（打包成一个大 HTML）时，window.__INLINE_ASSETS 里是 data URI
        const inline = window.__INLINE_ASSETS && window.__INLINE_ASSETS[src];
        const img = new Image();
        img.onload = function () { images[key] = img; resolve(true); };
        img.onerror = function () { missing.push(key); resolve(false); };
        img.src = inline || src;
      } catch (e) { missing.push(key); resolve(false); }
    });
  }

  function load(config) {
    const jobs = config.tiers.map(function (t) {
      return loadOne('fish-' + t.key, config.assetDir + t.key + '.png');
    });
    jobs.push(loadOne('bg', config.assetBg));
    // 背景轮播用的立绘
    const bgCfg = config.bg || {};
    (bgCfg.files || []).forEach(function (f, i) {
      jobs.push(loadOne('bg-' + i, bgCfg.dir + f));
    });
    return Promise.all(jobs).then(function (rs) {
      const ok = rs.filter(Boolean).length;
      console.info('[合成大肥鱼] 素材载入：成功 ' + ok + ' / ' + rs.length +
        (missing.length ? '（缺的用占位图：' + missing.join(', ') + '）' : ''));
      return { ok: ok, total: rs.length, missing: missing.slice() };
    });
  }

  function get(key) { return images[key] || null; }

  return { load: load, get: get, images: images, missing: missing };
})();
