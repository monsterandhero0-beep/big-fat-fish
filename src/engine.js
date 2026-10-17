/* 合成大肥鱼 · 物理与合成核心（不碰 DOM，可在 Node 里无头跑测试）
 *
 * 用法：
 *   const game = GameEngine.create({ Matter, config, shapes });
 *   game.aim(x); game.drop(); game.step(dtMs);
 *   game.on('merge' | 'coin' | 'over' | 'revive', fn);
 *
 * shapes：{ '00': [[x,y], ...], ... } 归一化凸包（见 tools/build-shapes.py）。
 * 有形状就用 Bodies.fromVertices() 按图片轮廓造刚体，没有就退回圆形。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GameEngine = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function create(opts) {
    const M = opts.Matter;
    const cfg = opts.config;
    const shapes = opts.shapes || null;
    const { Engine, Bodies, Body, Composite, Events } = M;

    const W = cfg.width;
    const H = cfg.height;
    const wt = cfg.wallThickness;
    const T = cfg.tiers;
    const PH = cfg.physics || {};
    const leftX = cfg.margin.left + wt / 2;
    const rightX = W - cfg.margin.right - wt / 2;
    const floorY = H - cfg.margin.bottom - wt / 2;
    const SHAPE_SCALE = cfg.shapeScale || 2.06;

    const engine = Engine.create();
    engine.gravity.x = 0;
    engine.gravity.y = cfg.gravity;
    engine.positionIterations = 8;
    engine.velocityIterations = 6;

    const listeners = Object.create(null);
    function on(evt, fn) {
      (listeners[evt] || (listeners[evt] = [])).push(fn);
      return function () {
        const arr = listeners[evt] || [];
        const i = arr.indexOf(fn);
        if (i >= 0) arr.splice(i, 1);
      };
    }
    function emit(evt, payload) {
      const arr = listeners[evt];
      if (arr) for (const fn of arr.slice()) fn(payload);
    }

    const state = {
      score: 0,
      over: false,
      merged: 0,
      maxTier: 0,
      dropped: 0,
      pendingX: W / 2,
      current: 0,
      next: 0,
      cooldown: 0,
      overStay: 0,
      reachedFinal: false,
      coins: 0,
      coinsEarned: 0,
      revives: 0,
    };

    let queue = [];

    function pickDropTier() {
      const arr = cfg.dropTiers;
      return arr[(Math.random() * arr.length) | 0];
    }

    function fishOptions(extra) {
      return Object.assign({
        label: 'fish',
        restitution: PH.restitution !== undefined ? PH.restitution : 0.55,
        friction: PH.friction !== undefined ? PH.friction : 0.09,
        frictionStatic: PH.frictionStatic !== undefined ? PH.frictionStatic : 0.12,
        frictionAir: PH.frictionAir !== undefined ? PH.frictionAir : 0.006,
        density: PH.density !== undefined ? PH.density : 0.0012,
        slop: PH.slop !== undefined ? PH.slop : 0.02,
      }, extra || {});
    }

    function fishBody(x, y, tier, extra) {
      const t = T[tier];
      const sets = shapes && shapes[t.key];
      let b = null;

      if (sets && sets.length >= 3) {
        const s = t.r * SHAPE_SCALE;
        const verts = sets.map(function (p) { return { x: p[0] * s, y: p[1] * s }; });
        try {
          b = Bodies.fromVertices(x, y, [verts], fishOptions(extra), true);
        } catch (e) {
          b = null;
        }
      }
      if (!b) b = Bodies.circle(x, y, t.r, fishOptions(extra));

      b.tier = tier;
      b.bornAt = Date.now();
      b.__dead = false;
      b.__sq = { t: 9999, nx: 0, ny: 1 };
      return b;
    }

    function buildWalls() {
      const o = {
        isStatic: true, label: 'wall',
        friction: PH.friction !== undefined ? PH.friction : 0.09,
        restitution: PH.wallRestitution !== undefined ? PH.wallRestitution : 0.32,
      };
      return [
        Bodies.rectangle(leftX - wt, (0 + floorY) / 2, wt * 2, H * 3, o),
        Bodies.rectangle(rightX + wt, (0 + floorY) / 2, wt * 2, H * 3, o),
        Bodies.rectangle(W / 2, floorY + wt, W * 3, wt * 2, o),
      ];
    }

    function reset() {
      Composite.clear(engine.world, false, true);
      Composite.add(engine.world, buildWalls());
      queue = [];
      state.score = 0;
      state.over = false;
      state.merged = 0;
      state.maxTier = 0;
      state.dropped = 0;
      state.overStay = 0;
      state.reachedFinal = false;
      state.cooldown = 0;
      state.pendingX = W / 2;
      state.coins = 0;
      state.coinsEarned = 0;
      state.revives = 0;
      state.current = pickDropTier();
      state.next = pickDropTier();
    }

    function clampAim(x) {
      const r = T[state.current].r;
      return Math.max(leftX + r, Math.min(rightX - r, x));
    }

    function aim(x) {
      state.pendingX = clampAim(Number(x) || 0);
      return state.pendingX;
    }

    function canDrop() {
      return !state.over && state.cooldown <= 0;
    }

    function drop() {
      if (!canDrop()) return null;
      const tier = state.current;
      const b = fishBody(state.pendingX, cfg.dropY, tier);
      Composite.add(engine.world, b);
      state.dropped++;
      state.cooldown = cfg.dropCooldownMs;
      state.current = state.next;
      state.next = pickDropTier();
      emit('drop', { tier: tier, x: state.pendingX });
      return b;
    }

    /* 加分 + 每满 coinEvery 分给一颗复活币 */
    function addScore(n) {
      state.score += n;
      const every = cfg.coinEvery || 2000;
      const earned = Math.floor(state.score / every);
      if (earned > state.coinsEarned) {
        const got = earned - state.coinsEarned;
        state.coinsEarned = earned;
        state.coins += got;
        emit('coin', { coins: state.coins, earned: earned, gain: got });
      }
    }

    /* 合成：同一帧里先记录，step 之后再统一处理，避免边遍历边改世界 */
    Events.on(engine, 'collisionStart', function (evt) {
      for (const pair of evt.pairs) {
        const a = pair.bodyA;
        const b = pair.bodyB;
        const n = pair.collision && pair.collision.normal;

        // 挤压动画：撞到东西就记一下方向和时刻
        if (n) {
          if (a.label === 'fish') a.__sq = { t: 0, nx: n.x, ny: n.y };
          if (b.label === 'fish') b.__sq = { t: 0, nx: -n.x, ny: -n.y };
        }

        if (a.label !== 'fish' || b.label !== 'fish') continue;
        if (a.__dead || b.__dead) continue;
        if (a.tier !== b.tier) continue;
        a.__dead = true;
        b.__dead = true;
        queue.push({ a: a, b: b, tier: a.tier });
      }
    });

    function applyMerges() {
      while (queue.length) {
        const item = queue.shift();
        const a = item.a;
        const b = item.b;
        const tier = item.tier;
        Composite.remove(engine.world, a);
        Composite.remove(engine.world, b);

        const x = (a.position.x + b.position.x) / 2;
        const y = (a.position.y + b.position.y) / 2;
        const next = tier + 1;
        const isFinal = next >= T.length;
        const gain = isFinal ? cfg.finalBonus : (cfg.score[next] || next * 2);

        addScore(gain);
        state.merged += 1;
        state.maxTier = Math.max(state.maxTier, Math.min(next, T.length - 1));

        let spawned = null;
        if (!isFinal) {
          spawned = fishBody(x, y, next, { velocity: { x: 0, y: -1.1 } });
          Composite.add(engine.world, spawned);
        } else if (!state.reachedFinal) {
          state.reachedFinal = true;
        }

        emit('merge', {
          tier: tier, next: Math.min(next, T.length - 1), x: x, y: y,
          gain: gain, spawned: spawned, isFinal: isFinal,
        });
      }
    }

    function topOf(b) {
      return b.bounds ? b.bounds.min.y : b.position.y - T[b.tier].r;
    }

    function checkOver(dt) {
      if (state.over) return;
      const now = Date.now();
      let danger = false;
      for (const b of Composite.allBodies(engine.world)) {
        if (b.label !== 'fish') continue;
        if (now - b.bornAt < cfg.spawnGraceMs) continue;
        if (topOf(b) >= cfg.dangerY) continue;              // 在线下方，不算
        const speed = Math.hypot(b.velocity.x, b.velocity.y);
        if (speed > (cfg.settleSpeed || 6)) continue;       // 正在下落/弹跳的不算
        danger = true;
        break;
      }
      state.overStay = danger ? state.overStay + dt : 0;
      if (state.overStay >= cfg.overStayMs) {
        state.over = true;
        emit('over', {
          score: state.score, maxTier: state.maxTier,
          merged: state.merged, coins: state.coins,
        });
      }
    }

    function step(dtMs) {
      const dt = Math.max(1, Math.min(34, dtMs || 1000 / 60));
      if (state.cooldown > 0) state.cooldown -= dt;
      Engine.update(engine, dt);
      applyMerges();
      for (const b of Composite.allBodies(engine.world)) {
        if (b.label === 'fish' && b.__sq && b.__sq.t < 400) b.__sq.t += dt;
      }
      checkOver(dt);
    }

    /* 用一颗复活币继续：清掉压在危险线附近的鱼，重新开局计时 */
    function revive() {
      if (!state.over || state.coins <= 0) return false;
      state.coins -= 1;
      state.revives += 1;
      const cut = cfg.dangerY + 70;
      for (const b of Composite.allBodies(engine.world)) {
        if (b.label !== 'fish') continue;
        if (topOf(b) < cut) Composite.remove(engine.world, b);
      }
      state.over = false;
      state.overStay = 0;
      state.cooldown = 0;
      emit('revive', { coins: state.coins, revives: state.revives });
      return true;
    }

    function bodies() {
      return Composite.allBodies(engine.world).filter(function (b) { return b.label === 'fish'; });
    }

    function geometry() {
      return { W: W, H: H, wt: wt, leftX: leftX, rightX: rightX, floorY: floorY, dropY: cfg.dropY, dangerY: cfg.dangerY };
    }

    reset();

    return {
      engine: engine,
      config: cfg,
      state: state,
      on: on,
      reset: reset,
      aim: aim,
      canDrop: canDrop,
      drop: drop,
      step: step,
      revive: revive,
      bodies: bodies,
      geometry: geometry,
      tiers: T,
      shapes: shapes,
    };
  }

  return { create: create };
});
