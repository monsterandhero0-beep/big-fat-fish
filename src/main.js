/* 合成大肥鱼 · 启动与循环 */
(function () {
  'use strict';

  const cfg = window.GAME_CONFIG;
  const BEST_KEY = 'merge-big-fat-fish.best';
  const $ = function (id) { return document.getElementById(id); };

  const gameCanvas = $('game');
  const nextCanvas = $('next');
  const scoreEl = $('score');
  const bestEl = $('best');
  const coinsEl = $('coins');
  const overEl = $('over');
  const overScoreEl = $('overScore');
  const overTipEl = $('overTip');
  const overCoinsEl = $('overCoins');
  const reviveBtn = $('revive');
  const musicBtn = $('musicToggle');
  const sfxBtn = $('sfxToggle');
  const musicVolEl = $('musicVol');
  const sfxVolEl = $('sfxVol');

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  gameCanvas.width = Math.round(cfg.width * dpr);
  gameCanvas.height = Math.round(cfg.height * dpr);
  const ctx = gameCanvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  nextCanvas.width = Math.round(96 * dpr);
  nextCanvas.height = Math.round(96 * dpr);

  const game = window.GameEngine.create({
    Matter: window.Matter,
    config: cfg,
    shapes: window.FISH_SHAPES || null,
  });
  const geo = game.geometry();
  const renderer = window.GameRender.create({
    ctx: ctx,
    config: cfg,
    assets: window.GameAssets,
    shapes: window.FISH_SHAPES || null,
  });

  /* ── 音频 ───────────────────────────────────────────── */
  const audio = window.GameAudio;
  let audioState = audio.init(cfg);

  function unlockAudio() {
    audio.unlock();
    syncAudioButtons();
  }
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);

  function syncAudioButtons() {
    audioState = audio.state();
    musicBtn.textContent = audioState.music ? '🎵 音乐开' : '🔇 音乐关';
    musicBtn.classList.toggle('off', !audioState.music);
    sfxBtn.textContent = audioState.sfx ? '🔊 音效开' : '🔈 音效关';
    sfxBtn.classList.toggle('off', !audioState.sfx);
    musicVolEl.value = String(Math.round(audioState.musicVol * 100));
    sfxVolEl.value = String(Math.round(audioState.sfxVol * 100));
  }

  musicVolEl.addEventListener('input', function () {
    audio.setMusicVolume(Number(this.value) / 100);
  });
  sfxVolEl.addEventListener('input', function () {
    audio.setSfxVolume(Number(this.value) / 100);
  });

  musicBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    audio.toggleMusic();
    syncAudioButtons();
  });
  sfxBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    audio.toggleSfx();
    syncAudioButtons();
  });

  /* ── 合成表（图例）─────────────────────────────────── */
  function buildLegend() {
    const list = $('legendList');
    cfg.tiers.forEach(function (t, i) {
      const li = document.createElement('li');
      li.className = 'tier-row';
      li.style.setProperty('--ring', t.ring);

      const no = document.createElement('span');
      no.className = 'tier-no';
      no.textContent = String(i > 9 ? i : '0' + i);

      const img = document.createElement('img');
      img.className = 'tier-img';
      img.alt = t.name;
      img.src = cfg.assetDir + t.key + '.png';
      img.onerror = function () { img.style.visibility = 'hidden'; };

      const name = document.createElement('span');
      name.className = 'tier-name';
      name.textContent = t.name;

      const dia = document.createElement('span');
      dia.className = 'tier-dia';
      dia.textContent = Math.round(t.r * 2) + 'px';

      li.appendChild(no);
      li.appendChild(img);
      li.appendChild(name);
      li.appendChild(dia);
      // 缩略图按真实半径缩放（14px→15px，119px→40px），一眼看出大小阶梯
      li.style.setProperty('--thumb', Math.round(12 + t.r * 0.24) + 'px');
      if (cfg.dropTiers.indexOf(i) >= 0) {
        const tag = document.createElement('span');
        tag.className = 'tier-tag';
        tag.textContent = '掉落';
        li.appendChild(tag);
      }
      list.appendChild(li);
    });
  }

  /* ── HUD ────────────────────────────────────────────── */
  let effects = [];
  let best = Number(localStorage.getItem(BEST_KEY) || 0) || 0;
  let lastScore = -1;
  let lastCoins = -1;
  let lastNext = -1;
  let paused = false;

  function syncHud() {
    const st = game.state;
    if (st.score !== lastScore) {
      lastScore = st.score;
      scoreEl.textContent = String(lastScore);
    }
    if (st.coins !== lastCoins) {
      lastCoins = st.coins;
      coinsEl.textContent = '×' + lastCoins;
    }
    bestEl.textContent = '最高 ' + best;
    if (st.next !== lastNext) {
      lastNext = st.next;
      renderer.drawPreview(nextCanvas, lastNext, performance.now());
    }
  }

  function showOver(p) {
    if (p.score > best) {
      best = p.score;
      try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) { /* ignore */ }
    }
    overScoreEl.textContent = String(p.score);
    const top = cfg.tiers[p.maxTier] ? cfg.tiers[p.maxTier].name : '鱼子';
    overTipEl.textContent = p.maxTier >= cfg.tiers.length - 2
      ? '都合成到「' + top + '」了，本鱼很满意！'
      : '最大合成到「' + top + '」，还能再来？';
    overCoinsEl.textContent = '×' + p.coins;
    reviveBtn.disabled = p.coins <= 0;
    reviveBtn.textContent = p.coins > 0 ? '用一颗复活币继续' : '没有复活币了';
    overEl.hidden = false;
  }

  function restart() {
    game.reset();
    effects = [];
    lastScore = -1;
    lastCoins = -1;
    lastNext = -1;
    overEl.hidden = true;
    syncHud();
  }

  game.on('merge', function (p) {
    audio.pop(p.tier, p.isFinal);
    effects.push({
      x: p.x, y: p.y,
      r: cfg.tiers[p.tier].r,
      life: 0,
      dur: p.isFinal ? 1000 : 430,
      text: '+' + p.gain,
      isFinal: p.isFinal,
    });
    if (p.isFinal) {
      for (let i = 0; i < 3; i++) {
        effects.push({
          x: p.x, y: p.y,
          r: cfg.tiers[cfg.tiers.length - 1].r * (0.7 + i * 0.5),
          life: -i * 90, dur: 1100, text: '', isFinal: true,
        });
      }
    }
  });

  game.on('coin', function (p) {
    audio.coin();
    effects.push({
      x: cfg.width / 2, y: geo.dropY + 40,
      r: 26, life: 0, dur: 900,
      text: '🪙 复活币 ×' + p.coins, isFinal: true,
    });
  });

  game.on('revive', function () {
    overEl.hidden = true;
    lastScore = -1;
    lastCoins = -1;
    syncHud();
  });

  game.on('over', showOver);

  /* ── 输入 ───────────────────────────────────────────── */
  function pointerX(ev) {
    const r = gameCanvas.getBoundingClientRect();
    return ((ev.clientX - r.left) / r.width) * cfg.width;
  }

  gameCanvas.addEventListener('pointermove', function (ev) {
    game.aim(pointerX(ev));
  });

  gameCanvas.addEventListener('pointerdown', function (ev) {
    ev.preventDefault();
    game.aim(pointerX(ev));
    game.drop();
  });

  window.addEventListener('keydown', function (ev) {
    if (ev.code === 'Space') {
      ev.preventDefault();
      game.drop();
    } else if (ev.code === 'ArrowLeft') {
      game.aim(game.state.pendingX - 18);
    } else if (ev.code === 'ArrowRight') {
      game.aim(game.state.pendingX + 18);
    } else if (ev.code === 'KeyR') {
      restart();
    } else if (ev.code === 'KeyM') {
      audio.toggleMusic();
      syncAudioButtons();
    }
  });

  $('restart').addEventListener('click', restart);
  $('again').addEventListener('click', restart);
  reviveBtn.addEventListener('click', function () {
    if (!game.revive()) overEl.hidden = false;
  });

  document.addEventListener('visibilitychange', function () {
    paused = document.hidden;
  });

  /* ── 主循环 ─────────────────────────────────────────── */
  let last = performance.now();
  function frame(now) {
    const dt = Math.max(1, Math.min(34, now - last));
    last = now;

    if (!paused) {
      game.step(dt);
      for (const fx of effects) fx.life += dt;
      if (effects.some(function (f) { return f.life >= f.dur; })) {
        effects = effects.filter(function (f) { return f.life < f.dur; });
      }
    }

    let danger = false;
    for (const b of game.bodies()) {
      const top = b.bounds ? b.bounds.min.y : b.position.y - cfg.tiers[b.tier].r;
      if (top < geo.dangerY && Math.hypot(b.velocity.x, b.velocity.y) <= (cfg.settleSpeed || 6)) {
        danger = true;
        break;
      }
    }

    renderer.draw({ game: game, effects: effects, time: now, geo: geo, danger: danger });
    syncHud();
    requestAnimationFrame(frame);
  }

  buildLegend();
  syncAudioButtons();
  // ⚠️ 开局这里必须重画一次：素材加载完成前 syncHud 已经画过一版（占位鱼），
  //    而「下一个」只在等级变化时才重画 —— 不强制刷新的话，开局那几只都是占位图。
  window.GameAssets.load(cfg).then(function () {
    lastScore = -1;
    lastCoins = -1;
    lastNext = -1;
    syncHud();
  });
  syncHud();
  requestAnimationFrame(frame);
})();
