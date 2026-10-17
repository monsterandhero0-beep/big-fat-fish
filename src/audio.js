/* 合成大肥鱼 · 音频
 * 合成音是 WebAudio 现场合成的（不搬别人的音频文件）：一声短促的"泡泡/马林巴"，
 * 音高随等级往上走；合成出终级时变成一串上行琶音。
 * 背景音乐读 assets/music/bgm.mp3，循环播放，首次交互后才开始（浏览器自动播放策略）。
 * 音乐/音效各有独立音量（0~1），会记在 localStorage 里。
 */
window.GameAudio = (function () {
  'use strict';

  var cfg = { bgm: '', bgmVolume: 0.38, sfxVolume: 0.55 };
  var ac = null;
  var master = null;
  var bgm = null;
  var bgmOn = true;
  var sfxOn = true;
  var musicVol = 0.38;
  var sfxVol = 0.55;
  var LS_MUSIC = 'merge-big-fat-fish.music';
  var LS_SFX = 'merge-big-fat-fish.sfx';
  var LS_MUSIC_VOL = 'merge-big-fat-fish.musicVol';
  var LS_SFX_VOL = 'merge-big-fat-fish.sfxVol';
  var fadeTimer = null;

  function clamp01(v) {
    var n = Number(v);
    if (!isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
  }

  /* 单文件版里 BGM 是 data URI；缓存戳只能加在普通 URL 上 */
  function inlineSrc(p) {
    var map = window.__INLINE_ASSETS;
    return (map && map[p]) || p;
  }

  function withCacheBust(src) {
    if (!src || src.indexOf('data:') === 0) return src;
    return src + (src.indexOf('?') >= 0 ? '&' : '?') + 'r=' + Date.now();
  }

  function save() {
    try {
      localStorage.setItem(LS_MUSIC, bgmOn ? '1' : '0');
      localStorage.setItem(LS_SFX, sfxOn ? '1' : '0');
      localStorage.setItem(LS_MUSIC_VOL, String(musicVol));
      localStorage.setItem(LS_SFX_VOL, String(sfxVol));
    } catch (e) { /* 隐私模式忽略 */ }
  }

  function init(config) {
    cfg = Object.assign({}, cfg, config && config.audio ? config.audio : {});
    musicVol = clamp01(cfg.bgmVolume);
    sfxVol = clamp01(cfg.sfxVolume);
    try {
      bgmOn = localStorage.getItem(LS_MUSIC) !== '0';
      sfxOn = localStorage.getItem(LS_SFX) !== '0';
      var mv = localStorage.getItem(LS_MUSIC_VOL);
      var sv = localStorage.getItem(LS_SFX_VOL);
      if (mv !== null) musicVol = clamp01(mv);
      if (sv !== null) sfxVol = clamp01(sv);
    } catch (e) { /* ignore */ }

    if (cfg.bgm) {
      bgm = new Audio();
      bgm.src = inlineSrc(cfg.bgm);
      bgm.loop = true;
      // 一开始不下载：2MB 的音频会和贴图抢带宽，让首屏慢
      bgm.preload = 'none';
      bgm.volume = 0;
      bgm.addEventListener('error', onBgmError);
    }
    return state();
  }

  function ensureCtx() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ac) {
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 1;
      master.connect(ac.destination);
    }
    if (ac.state === 'suspended') {
      var p = ac.resume();
      if (p && p.catch) p.catch(function () {});
    }
    return ac;
  }

  function fadeTo(target, ms) {
    if (!bgm) return;
    if (fadeTimer) clearInterval(fadeTimer);
    var from = bgm.volume;
    var steps = Math.max(1, Math.round((ms || 600) / 50));
    var i = 0;
    fadeTimer = setInterval(function () {
      i++;
      bgm.volume = Math.max(0, Math.min(1, from + (target - from) * (i / steps)));
      if (i >= steps) { clearInterval(fadeTimer); fadeTimer = null; }
    }, 50);
  }

  function playBgm() {
    if (!bgm) return;
    bgm.volume = 0;
    var p = bgm.play();
    if (p && p.catch) p.catch(function () { /* 等下一次交互再试 */ });
    fadeTo(musicVol, 1200);
  }

  /* 公网隧道上大文件偶尔会断流：出错就地重建、带缓存戳、从原位置续播（最多 3 次） */
  var bgmRetry = 0;

  function rebuildBgm(at) {
    if (!cfg.bgm || bgmRetry >= 2) return;
    bgmRetry++;
    var src = withCacheBust(inlineSrc(cfg.bgm));
    var old = bgm;
    bgm = new Audio();
    bgm.src = src;
    bgm.loop = true;
    bgm.preload = 'auto';
    bgm.volume = 0;
    bgm.addEventListener('error', onBgmError);
    bgm.addEventListener('playing', function () { bgmRetry = 0; });
    bgm.addEventListener('loadedmetadata', function () {
      // 元数据不对 或 时长明显短得离谱（公共隧道把 mp3 截断了）→ 当作失败，别再硬播
      if (!isFinite(bgm.duration) || bgm.duration <= 0) { onBgmError(); return; }
      if (bgm.duration < (cfg.bgmMinSeconds || 25)) { onBgmError(); return; }
      try { if (at > 0 && at < bgm.duration) bgm.currentTime = at; } catch (e) { /* ignore */ }
      if (bgmOn) playBgm();
    }, { once: true });
    if (old) { try { old.pause(); old.src = ''; } catch (e) { /* ignore */ } }
  }

  function onBgmError() {
    if (!bgmOn) return;
    var at = 0;
    try { at = bgm ? bgm.currentTime || 0 : 0; } catch (e) { at = 0; }
    rebuildBgm(at);
  }

  function pauseBgm() {
    if (!bgm) return;
    fadeTo(0, 300);
    setTimeout(function () { if (!bgmOn && bgm) bgm.pause(); }, 320);
  }

  /* 首次交互调用：解锁 WebAudio + 开 BGM */
  function unlock() {
    ensureCtx();
    if (bgmOn && bgm && bgm.paused) playBgm();
  }

  /* 贴图都下完之后再预热音乐：不抢首屏带宽，等玩家点的时候又已经准备好了 */
  function preheat() {
    if (!bgm || !bgmOn) return;
    if (bgm.preload === 'none') {
      bgm.preload = 'auto';
      try { bgm.load(); } catch (e) { /* ignore */ }
    }
  }

  function toggleMusic() {
    bgmOn = !bgmOn;
    if (bgmOn) playBgm(); else pauseBgm();
    save();
    return bgmOn;
  }

  function toggleSfx() {
    sfxOn = !sfxOn;
    save();
    return sfxOn;
  }

  /* 音乐音量（0~1）*/
  function setMusicVolume(v) {
    musicVol = clamp01(v);
    if (bgm) {
      if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = null; }
      bgm.volume = bgmOn ? musicVol : 0;
    }
    save();
    return musicVol;
  }

  /* 音效音量（0~1）*/
  function setSfxVolume(v) {
    sfxVol = clamp01(v);
    save();
    return sfxVol;
  }

  function state() {
    return { music: bgmOn, sfx: sfxOn, musicVol: musicVol, sfxVol: sfxVol };
  }

  /* 一声"啵" —— tier 越高音越高；isFinal 时是上行琶音 */
  function pop(tier, isFinal) {
    if (!sfxOn) return;
    var c = ensureCtx();
    if (!c) return;
    if (sfxVol <= 0.001) return;
    var t0 = c.currentTime;
    var base = 300 * Math.pow(2, (tier || 0) / 7.5);
    var notes = isFinal ? [1, 1.25, 1.5, 2] : [1];
    var vol = sfxVol;

    for (var i = 0; i < notes.length; i++) {
      var f = base * notes[i];
      var t = t0 + i * 0.07;
      var dur = isFinal ? 0.5 : 0.22;
      var amp = vol * (i ? 0.3 : 0.42) / (1 + i * 0.15);

      var osc = c.createOscillator();
      var gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.exponentialRampToValueAtTime(f * 1.55, t + 0.07);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp), t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t);
      osc.stop(t + dur + 0.05);

      // 叠一层三角波，加"木头/马林巴"的质感
      var osc2 = c.createOscillator();
      var gain2 = c.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(f * 2, t);
      gain2.gain.setValueAtTime(0.0001, t);
      gain2.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp * 0.22), t + 0.006);
      gain2.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.6);
      osc2.connect(gain2);
      gain2.connect(master);
      osc2.start(t);
      osc2.stop(t + dur);
    }
  }

  /* 拿到复活币：两个上行小音符 */
  function coin() {
    if (!sfxOn) return;
    if (sfxVol <= 0.001) return;
    var c = ensureCtx();
    if (!c) return;
    var vol = sfxVol;
    [988, 1319].forEach(function (f, i) {
      var t = c.currentTime + i * 0.09;
      var osc = c.createOscillator();
      var g = c.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * 0.3), t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(g);
      g.connect(master);
      osc.start(t);
      osc.stop(t + 0.22);
    });
  }

  return {
    init: init,
    unlock: unlock,
    preheat: preheat,
    toggleMusic: toggleMusic,
    toggleSfx: toggleSfx,
    setMusicVolume: setMusicVolume,
    setSfxVolume: setSfxVolume,
    state: state,
    pop: pop,
    coin: coin,
  };
})();
