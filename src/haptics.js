/* 合成大肥鱼 · 震动反馈（手机）
 * 用 navigator.vibrate。安卓 Chrome/Firefox 支持；iOS Safari 没有这个 API（要原生 App 才行），
 * 所以：能力检测 + 单独开关（存 localStorage），不支持时界面上那个按钮直接不显示。
 * 合成会连锁触发，所以带最小间隔，避免一串抖动。
 */
window.GameHaptics = (function () {
  'use strict';

  var cfg = { enabled: true, mergeMs: 14, minGapMs: 45, finalPattern: [22, 40, 70] };
  var enabled = true;
  var lastAt = 0;
  var LS = 'merge-big-fat-fish.haptics';

  function supported() {
    return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  }

  function save() {
    try { localStorage.setItem(LS, enabled ? '1' : '0'); } catch (e) { /* ignore */ }
  }

  function init(config) {
    cfg = Object.assign({}, cfg, (config && config.haptics) || {});
    enabled = !!cfg.enabled;
    try {
      var v = localStorage.getItem(LS);
      if (v !== null) enabled = v !== '0';
    } catch (e) { /* ignore */ }
    return { supported: supported(), enabled: enabled && supported() };
  }

  function setEnabled(v) {
    enabled = !!v;
    if (!enabled && supported()) {
      try { navigator.vibrate(0); } catch (e) { /* 立刻停掉正在抖的 */ }
    }
    save();
    return enabled;
  }

  function isEnabled() { return enabled; }

  function buzz(pattern) {
    if (!enabled || !supported()) return false;
    var now = Date.now();
    if (now - lastAt < cfg.minGapMs) return false;   // 连锁合成只抖一下
    lastAt = now;
    try { navigator.vibrate(pattern); } catch (e) { /* ignore */ }
    return true;
  }

  /* 合成：等级越高抖得越久一点；终级是"三连" */
  function merge(tier, isFinal) {
    if (isFinal) return buzz(cfg.finalPattern);
    var ms = Math.round(cfg.mergeMs + Math.min(10, (tier || 0) * 1.2));
    return buzz(ms);
  }

  function coin() { return buzz([12, 35, 12]); }
  function revive() { return buzz([30, 50, 30]); }

  return {
    init: init,
    supported: supported,
    setEnabled: setEnabled,
    isEnabled: isEnabled,
    merge: merge,
    coin: coin,
    revive: revive,
  };
})();
