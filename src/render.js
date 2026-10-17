/* 合成大肥鱼 · 渲染层
 * 只负责画：背景 / 罐子 / 鱼 / 出手预览 / 合成特效。
 * 鱼有图就贴图，没图就画一只占位小鱼（圆身 + 眼睛 + 尾巴 + 名字）。
 */
window.GameRender = (function () {
  'use strict';

  let cfg, ctx, assets, shapes;
  let bgIdx = 0, bgFade = null, bgLastTime = 0;

  function roundRect(c, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
  }

  /* 按「本级轮廓」画色环 —— 不依赖刚体，所以待放/预览的鱼也能有 */
  function paintRing(pts, tierIndex) {
    const t = cfg.tiers[tierIndex];
    const w = Math.min(8, Math.max(2.6, t.r * 0.085));
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.lineJoin = 'round';

    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(3, 10, 20, 0.9)';
    ctx.lineWidth = w + 2.5;
    ctx.stroke();

    ctx.strokeStyle = t.ring;
    ctx.lineWidth = w;
    ctx.stroke();

    ctx.globalAlpha = 0.2;
    ctx.fillStyle = t.ring;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /* 某级在「以自身中心为原点」时的轮廓点 */
  function hullPointsFor(tierIndex) {
    const t = cfg.tiers[tierIndex];
    const sets = shapes && shapes[t.key];
    if (!sets || sets.length < 3) return null;
    const s = t.r * (cfg.shapeScale || 2.06);
    return sets.map(function (p) { return { x: p[0] * s, y: p[1] * s }; });
  }

  function create(opts) {
    ctx = opts.ctx;
    cfg = opts.config;
    assets = opts.assets;
    shapes = opts.shapes || null;

    function drawBackground(g) {
      const bg = assets.get('bg');
      if (bg) {
        const scale = Math.max(cfg.width / bg.width, cfg.height / bg.height);
        const w = bg.width * scale, h = bg.height * scale;
        ctx.drawImage(bg, (cfg.width - w) / 2, (cfg.height - h) / 2, w, h);
      } else {
        const grad = ctx.createLinearGradient(0, 0, 0, cfg.height);
        grad.addColorStop(0, '#0a2540');
        grad.addColorStop(0.55, '#08203a');
        grad.addColorStop(1, '#04101f');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, cfg.width, cfg.height);

        ctx.save();
        ctx.globalAlpha = 0.06;
        ctx.fillStyle = '#bfe8ff';
        for (let i = 0; i < 5; i++) {
          const x = 60 + i * 95 + Math.sin(g.time / 2600 + i) * 18;
          ctx.beginPath();
          ctx.moveTo(x - 26, 0);
          ctx.lineTo(x + 26, 0);
          ctx.lineTo(x + 78, cfg.height);
          ctx.lineTo(x - 24, cfg.height);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }

      drawBgGirls(g);
    }

    /* ── 背景立绘：每 intervalMs 换一张，1.4s 交叉淡入 ── */
    function bgKeys() {
      const out = [];
      const b = cfg.bg || {};
      (b.files || []).forEach(function (f, i) {
        if (assets.get('bg-' + i)) out.push('bg-' + i);
      });
      return out;
    }

    function drawGirl(key, alpha) {
      const img = assets.get(key);
      if (!img || alpha <= 0.01) return;
      const b = cfg.bg || {};
      const op = b.opacity === undefined ? 0.46 : b.opacity;
      const targetH = cfg.height * 0.92;
      const scale = targetH / img.height;
      const w = img.width * scale;
      const h = targetH;
      const x = cfg.width - w * 0.72;
      const y = cfg.height - h + 26;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, op * alpha));
      ctx.drawImage(img, x, y, w, h);
      ctx.restore();
    }

    function drawBgGirls(g) {
      const keys = bgKeys();
      if (!keys.length) return;
      if (keys.length === 1) { drawGirl(keys[0], 1); return; }

      const now = g.time || 0;
      const interval = (cfg.bg && cfg.bg.intervalMs) || 30000;
      const fadeMs = (cfg.bg && cfg.bg.fadeMs) || 1400;

      if (!bgLastTime) bgLastTime = now;
      if (now - bgLastTime >= interval) {
        bgLastTime = now;
        bgFade = { from: bgIdx % keys.length, t0: now };
        bgIdx = (bgIdx + 1) % keys.length;
      }

      if (bgFade) {
        const k = Math.min(1, (now - bgFade.t0) / fadeMs);
        drawGirl(keys[bgFade.from], 1 - k);
        drawGirl(keys[bgIdx % keys.length], k);
        if (k >= 1) bgFade = null;
      } else {
        drawGirl(keys[bgIdx % keys.length], 1);
      }
    }

    function drawJar(g) {
      const geo = g.geo;
      ctx.save();
      ctx.strokeStyle = 'rgba(150, 210, 255, .35)';
      ctx.lineWidth = geo.wt;
      ctx.lineJoin = 'round';
      roundRect(ctx, geo.leftX - geo.wt / 2, 40, geo.rightX - geo.leftX + geo.wt, geo.floorY + geo.wt - 40, 22);
      ctx.stroke();

      // 危险线（有鱼在线上方时闪烁）
      if (g.danger) {
        ctx.setLineDash([8, 8]);
        ctx.strokeStyle = 'rgba(255, 120, 120, ' + (0.35 + 0.35 * Math.sin(g.time / 140)) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(geo.leftX, geo.dangerY);
        ctx.lineTo(geo.rightX, geo.dangerY);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    }

    /* 占位小鱼：没素材时也能看出是鱼、也能看出大小 */
    function drawPlaceholderFish(x, y, r, tierIndex, time) {
      const t = cfg.tiers[tierIndex];
      ctx.save();
      ctx.translate(x, y);

      // 尾巴
      ctx.beginPath();
      ctx.moveTo(-r * 0.72, 0);
      ctx.lineTo(-r * 1.32, -r * 0.52);
      ctx.lineTo(-r * 1.16, 0);
      ctx.lineTo(-r * 1.32, r * 0.52);
      ctx.closePath();
      ctx.fillStyle = t.color;
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;

      // 身子
      const grad = ctx.createRadialGradient(-r * 0.32, -r * 0.38, r * 0.12, 0, 0, r * 1.06);
      grad.addColorStop(0, '#eaf6ff');
      grad.addColorStop(0.32, t.color);
      grad.addColorStop(1, t.color);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // 肚皮
      ctx.beginPath();
      ctx.ellipse(r * 0.08, r * 0.34, r * 0.62, r * 0.4, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,.22)';
      ctx.fill();

      // 鳍
      ctx.beginPath();
      ctx.ellipse(r * 0.1, -r * 0.02, r * 0.3, r * 0.72, -0.5 + Math.sin(time / 420) * 0.05, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,.16)';
      ctx.fill();

      // 眼睛
      const eye = Math.max(2.2, r * 0.13);
      ctx.fillStyle = '#0d2b45';
      ctx.beginPath(); ctx.arc(r * 0.42, -r * 0.16, eye, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(-r * 0.16, -r * 0.2, eye * 0.9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.beginPath(); ctx.arc(r * 0.46, -r * 0.22, eye * 0.38, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(-r * 0.12, -r * 0.26, eye * 0.34, 0, Math.PI * 2); ctx.fill();

      // 名字（够大才写）
      if (r >= 30) {
        ctx.fillStyle = 'rgba(255,255,255,.92)';
        ctx.font = '600 ' + Math.round(Math.max(11, r * 0.3)) + 'px "Microsoft YaHei", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(t.name, 0, r * 0.66);
      }
      ctx.restore();
    }

    function drawFish(x, y, r, tierIndex, time, angle, sq) {
      const t = cfg.tiers[tierIndex];
      const img = assets.get('fish-' + t.key);
      ctx.save();
      ctx.translate(x, y);
      if (angle) ctx.rotate(angle);

      // Q 弹挤压：沿碰撞法线压扁、垂直方向拉长，220ms 内衰减
      if (sq && sq.t < 220) {
        const k = 1 - sq.t / 220;
        const a = 0.20 * k * k;
        const ang = Math.atan2(sq.ny || 0, sq.nx || 0);
        ctx.rotate(ang);
        ctx.scale(Math.max(0.55, 1 - a), Math.min(1.45, 1 + a));
        ctx.rotate(-ang);
      }

      if (img) {
        const s = r * 2.06;
        ctx.drawImage(img, -s / 2, -s / 2, s, s);
      } else {
        drawPlaceholderFish(0, 0, r, tierIndex, time);
      }
      ctx.restore();
    }

    function drawPendingFish(g) {
      const st = g.game.state;
      if (st.over) return;
      const geo = g.geo;
      const r = cfg.tiers[st.current].r;
      const x = st.pendingX;

      ctx.save();
      ctx.setLineDash([5, 7]);
      ctx.strokeStyle = 'rgba(180, 225, 255, .3)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, 46);
      ctx.lineTo(x, geo.dangerY - 8);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = st.cooldown > 0 ? 0.42 : 1;
      // 还没落下时就先带上本级色环（用轮廓数据画，不依赖刚体）
      const pts = hullPointsFor(st.current);
      if (pts) {
        ctx.save();
        ctx.translate(x, geo.dropY);
        paintRing(pts, st.current);
        ctx.restore();
      }
      drawFish(x, geo.dropY, r, st.current, g.time, 0);
      ctx.restore();
    }

    function drawEffects(g) {
      for (const fx of g.effects) {
        const k = fx.life / fx.dur;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - k);
        ctx.strokeStyle = fx.isFinal ? 'rgba(255, 224, 130, .95)' : 'rgba(160, 225, 255, .9)';
        ctx.lineWidth = Math.max(2, 5 * (1 - k));
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, fx.r * (0.6 + k * 1.9), 0, Math.PI * 2);
        ctx.stroke();

        if (fx.text) {
          ctx.globalAlpha = Math.max(0, 1 - k * 1.15);
          ctx.fillStyle = fx.isFinal ? '#ffe082' : '#d9f1ff';
          ctx.font = '700 ' + (fx.isFinal ? 22 : 17) + 'px "Microsoft YaHei", system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(fx.text, fx.x, fx.y - 26 - k * 34);
        }
        ctx.restore();
      }
    }

    /* 已落地的鱼：用刚体的真实顶点画色环（和碰撞形状完全一致） */
    function drawHull(b, tierIndex) {
      const v = b.vertices;
      if (!v || v.length < 3) return;
      ctx.save();
      paintRing(v, tierIndex);
      ctx.restore();
    }

    function draw(g) {
      ctx.clearRect(0, 0, cfg.width, cfg.height);
      drawBackground(g);
      drawJar(g);

      for (const b of g.game.bodies()) {
        drawHull(b, b.tier);
        drawFish(b.position.x, b.position.y, cfg.tiers[b.tier].r, b.tier, g.time, b.angle, b.__sq);
      }

      drawPendingFish(g);
      drawEffects(g);
    }

    /* 右侧「下一个」小预览（按设备像素直接画，避免和 CSS 尺寸打架） */
    function drawPreview(previewCanvas, tierIndex, time) {
      const pctx = previewCanvas.getContext('2d');
      const W = previewCanvas.width;
      const H = previewCanvas.height;
      pctx.setTransform(1, 0, 0, 1, 0, 0);
      pctx.clearRect(0, 0, W, H);
      const r = cfg.tiers[tierIndex].r;
      const scale = Math.min(1, (Math.min(W, H) * 0.42) / r);
      pctx.save();
      pctx.translate(W / 2, H / 2);
      pctx.scale(scale, scale);
      const saved = ctx;
      ctx = pctx;               // 复用同一套画鱼代码
      try {
        const t = cfg.tiers[tierIndex];
        const img = assets.get('fish-' + t.key);
        const pts = hullPointsFor(tierIndex);
        if (pts) paintRing(pts, tierIndex);
        if (img) {
          pctx.beginPath(); pctx.arc(0, 0, r, 0, Math.PI * 2); pctx.clip();
          pctx.drawImage(img, -r, -r, r * 2, r * 2);
        } else {
          drawPlaceholderFish(0, 0, r, tierIndex, time);
        }
      } finally {
        ctx = saved;            // 就算画错了也要把 ctx 还回去
      }
      pctx.restore();
    }

    return { draw: draw, drawPreview: drawPreview };
  }

  return { create: create };
})();
