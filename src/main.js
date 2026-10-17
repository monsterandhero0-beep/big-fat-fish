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
  const hapticBtn = $('hapticToggle');
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

  /* ── 震动（手机）─────────────────────────────────────── */
  const haptics = window.GameHaptics;
  haptics.init(cfg);

  function syncHapticBtn() {
    const on = haptics.isEnabled();
    hapticBtn.textContent = on ? '📳 震动开' : '📴 震动关';
    hapticBtn.classList.toggle('off', !on);
  }

  if (!haptics.supported()) {
    hapticBtn.style.display = 'none';        // iOS Safari 没有 Vibrate API，直接不显示
  } else {
    hapticBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      haptics.setEnabled(!haptics.isEnabled());
      syncHapticBtn();
    });
  }
  syncHapticBtn();

  /* ── 排行榜 ─────────────────────────────────────────── */
  const leaderboard = window.GameLeaderboard;
  const boardEl = $('board');
  const boardListEl = $('boardList');
  const boardStatsEl = $('myStats');
  const playerNameEl = $('playerName');
  let myEntry = null;          // 本局上榜的那条（复活时撤销）

  playerNameEl.value = leaderboard.name();

  function renderBoard() {
    const list = leaderboard.getList();
    boardListEl.innerHTML = '';
    if (!list.length) {
      const li = document.createElement('li');
      li.className = 'board-empty';
      li.textContent = '还没有记录 —— 先打一局吧';
      boardListEl.appendChild(li);
    } else {
      list.forEach(function (it, i) {
        const li = document.createElement('li');
        li.className = 'board-row' + (myEntry && it.id === myEntry.id ? ' me' : '');
        const rk = document.createElement('span');
        rk.className = 'rk';
        rk.textContent = String(i + 1);
        const nm = document.createElement('span');
        nm.className = 'nm';
        nm.textContent = it.name || '匿名玩家';
        const sc = document.createElement('span');
        sc.className = 'sc';
        sc.textContent = String(it.score);
        const dt = document.createElement('span');
        dt.className = 'dt';
        dt.textContent = (it.date || '').slice(5);
        li.appendChild(rk);
        li.appendChild(nm);
        li.appendChild(sc);
        li.appendChild(dt);
        boardListEl.appendChild(li);
      });
    }
    const st = leaderboard.stats();
    boardStatsEl.textContent = '你的最好成绩：' + st.best +
      ' · 玩过 ' + st.games + ' 局 · 上榜 ' + st.count + ' 次' +
      (st.count ? ' · 榜上平均 ' + st.avg : '');
  }

  $('boardBtn').addEventListener('click', function (e) {
    e.stopPropagation();
    renderBoard();
    boardEl.hidden = false;
  });
  $('closeBoard').addEventListener('click', function () { boardEl.hidden = true; });
  $('clearBoard').addEventListener('click', function () {
    if (window.confirm('确定清空本机的排行榜记录吗？')) {
      leaderboard.clear();
      myEntry = null;
      renderBoard();
    }
  });
  boardEl.addEventListener('click', function (e) {
    if (e.target === boardEl) boardEl.hidden = true;
  });
  playerNameEl.addEventListener('input', function () {
    leaderboard.setName(playerNameEl.value.trim());
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
      img.src = cfg.assetDir + t.key + (cfg.assetExt || '.png');
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

    // 记进本机排行榜
    leaderboard.bumpGames();
    const res = leaderboard.add({
      name: leaderboard.name() || '匿名玩家',
      score: p.score,
      maxTier: p.maxTier,
    });
    myEntry = res.rank > 0 ? res.list[res.rank - 1] : null;

    let tip = p.maxTier >= cfg.tiers.length - 2
      ? '都合成到「' + top + '」了，本鱼很满意！'
      : '最大合成到「' + top + '」，还能再来？';
    if (res.rank > 0) tip += ' 🎉 上榜第 ' + res.rank + ' 名';
    overTipEl.textContent = tip;
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
    haptics.merge(p.tier, p.isFinal);
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
    haptics.coin();
    effects.push({
      x: cfg.width / 2, y: geo.dropY + 40,
      r: 26, life: 0, dur: 900,
      text: '🪙 复活币 ×' + p.coins, isFinal: true,
    });
  });

  game.on('revive', function () {
    haptics.revive();
    // 复活了这局还没结束，先把刚才那条从榜上撤掉
    if (myEntry) { leaderboard.remove(myEntry); myEntry = null; }
    overEl.hidden = true;
    lastScore = -1;
    lastCoins = -1;
    syncHud();
  });

  game.on('over', showOver);

  /* ── 输入：长按拖动瞄准，松手投下 ───────────────────── */
  let dragId = null;

  function pointerX(ev) {
    const r = gameCanvas.getBoundingClientRect();
    return ((ev.clientX - r.left) / r.width) * cfg.width;
  }

  gameCanvas.addEventListener('pointerdown', function (ev) {
    ev.preventDefault();
    if (dragId !== null) return;                 // 只跟第一根手指
    dragId = ev.pointerId;
    try { gameCanvas.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
    game.aim(pointerX(ev));                      // 按下只瞄准，不投
  });

  gameCanvas.addEventListener('pointermove', function (ev) {
    if (dragId === null || ev.pointerId !== dragId) return;
    ev.preventDefault();
    game.aim(pointerX(ev));
  });

  gameCanvas.addEventListener('pointerup', function (ev) {
    if (dragId === null || ev.pointerId !== dragId) return;
    dragId = null;
    try { gameCanvas.releasePointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
    game.drop();                                 // 松手才放鱼
  });

  // 手势被打断（来电、切后台）→ 不放鱼，避免误投
  gameCanvas.addEventListener('pointercancel', function (ev) {
    if (dragId === null || ev.pointerId !== dragId) return;
    dragId = null;
    try { gameCanvas.releasePointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
  });

  // 松手在画布外也算（有些浏览器不派发到画布上）
  window.addEventListener('pointerup', function (ev) {
    if (dragId === null || ev.pointerId !== dragId) return;
    dragId = null;
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
    // 贴图下完了，再预热 BGM（不抢首屏带宽，点下去就能听到）
    audio.preheat();
  });
  syncHud();
  requestAnimationFrame(frame);
})();
