/* 合成大肥鱼 · 无头自测（不需要浏览器）
 * 跑法： node test/sim.mjs
 *
 * 覆盖：形状刚体（按图片轮廓，不再是圆）· 合成 · 加分 · 终级彩蛋 ·
 *       稳定性 · 超线判负 · Q 弹材质 · 复活币（每 2000 分一颗 + 复活）
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const Matter = require(join(root, 'vendor', 'matter.min.js'));

const sandbox = { console, Math, Date, Matter };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of ['src/config.js', 'src/engine.js', 'src/render.js', 'src/audio.js', 'src/haptics.js', 'src/leaderboard.js', 'assets/shapes.js']) {
  vm.runInContext(readFileSync(join(root, f), 'utf8'), sandbox, { filename: f });
}

const cfg = sandbox.GAME_CONFIG;
const GameEngine = sandbox.GameEngine;
const shapes = sandbox.FISH_SHAPES;

let fails = 0;
function check(name, cond, extra) {
  const ok = !!cond;
  if (!ok) fails++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra === undefined ? '' : '  → ' + extra));
}

if (!cfg || !GameEngine) {
  console.error('加载失败：GAME_CONFIG / GameEngine 没挂上');
  process.exit(1);
}
console.log('配置：' + cfg.tiers.length + ' 级，画布 ' + cfg.width + 'x' + cfg.height);

const STEP = 1000 / 60;
const run = (g, n) => { for (let i = 0; i < n; i++) g.step(STEP); };

/* ── 1. 初始化 + 形状刚体 ───────────────────────────── */
console.log('\n[1] 初始化与形状刚体');
const game = GameEngine.create({ Matter, config: cfg, shapes });
check('初始没有鱼', game.bodies().length === 0);
check('轮廓数据载入', !!shapes && Object.keys(shapes).length === cfg.tiers.length,
  '组数=' + (shapes ? Object.keys(shapes).length : 0));
if (shapes) {
  const a = shapes['00'] || [];
  const b = shapes['03'] || [];
  check('轮廓点数合理（>=6）', a.length >= 6 && b.length >= 6, '00=' + a.length + ' 03=' + b.length);
  check('不同等级形状不同', JSON.stringify(a) !== JSON.stringify(b));
}
game.state.current = 2;
const probe = game.drop();
check('刚体不是圆（circleRadius 为 0）', probe && !probe.circleRadius,
  'circleRadius=' + (probe ? probe.circleRadius : 'null'));
check('刚体顶点数 >= 5', probe && probe.vertices && probe.vertices.length >= 5,
  'vertices=' + (probe && probe.vertices ? probe.vertices.length : 0));
check('材质够 Q 弹（restitution >= 0.5）', probe && probe.restitution >= 0.5,
  'restitution=' + (probe ? probe.restitution : '-'));

/* ── 2. 两条同级鱼相撞 → 合成 ──────────────────────── */
console.log('\n[2] 两条「鱼子」相撞应合成「小鱼苗」');
game.reset();
const cx = cfg.width / 2;
game.state.current = 0; game.state.next = 0;
game.aim(cx); game.drop();
run(game, 55);
game.state.cooldown = 0; game.state.current = 0;
game.aim(cx); game.drop();
run(game, 170);
const after = game.bodies();
check('加分了', game.state.score > 0, 'score=' + game.state.score);
check('合成次数 >= 1', game.state.merged >= 1, 'merged=' + game.state.merged);
check('场上出现更高一级', after.some((b) => b.tier >= 1) || game.state.maxTier >= 1,
  'tiers=' + after.map((b) => b.tier).join(','));

/* ── 3. 终级相撞 = 彩蛋分 ─────────────────────────── */
console.log('\n[3] 两条「' + cfg.tiers[cfg.tiers.length - 1].name + '」相撞');
game.reset();
const last = cfg.tiers.length - 1;
game.state.current = last; game.state.next = last;
game.aim(cx); game.drop();
run(game, 70);
game.state.cooldown = 0; game.state.current = last;
game.aim(cx); game.drop();
run(game, 220);
check('拿到彩蛋分', game.state.score >= cfg.finalBonus, 'score=' + game.state.score);
check('终级不再生成新鱼', game.bodies().length === 0, '场上=' + game.bodies().length);

/* ── 4. 稳定性 ────────────────────────────────────── */
console.log('\n[4] 稳定性（乱丢 25 条 + 900 帧）');
game.reset();
let seed = 42;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
let drops = 0;
for (let i = 0; i < 25; i++) {
  game.state.cooldown = 0;
  game.state.current = cfg.dropTiers[(rnd() * cfg.dropTiers.length) | 0];
  game.aim(60 + rnd() * (cfg.width - 120));
  if (game.drop()) drops++;
  run(game, 18);
}
run(game, 900);
const bs = game.bodies();
check('25 条都落下去了', drops === 25, 'drops=' + drops);
check('没有 NaN 坐标', bs.every((b) => Number.isFinite(b.position.x) && Number.isFinite(b.position.y)));
check('鱼没穿过左右墙', bs.every((b) => b.position.x > 0 && b.position.x < cfg.width));
check('鱼没穿地板', bs.every((b) => b.position.y < cfg.height + 80));
check('分数为正', game.state.score > 0, 'score=' + game.state.score);

/* ── 5. 超线停留判定 ──────────────────────────────── */
console.log('\n[5] 超线停留判定');
game.reset();
const topTier = cfg.tiers.length - 1;
const stuck = Matter.Bodies.circle(
  cfg.width / 2,
  cfg.dangerY + cfg.tiers[topTier].r - 20,
  cfg.tiers[topTier].r,
  { label: 'fish', isStatic: true }
);
stuck.tier = topTier;
stuck.bornAt = Date.now() - 5000;
Matter.Composite.add(game.engine.world, stuck);

run(game, 60);
check('1 秒还不该判结束', !game.state.over, '停留=' + Math.round(game.state.overStay) + 'ms');
run(game, 90);
check('停留满 2 秒 → 判结束', game.state.over, '停留=' + Math.round(game.state.overStay) + 'ms');
check('结束后不再接受投放', game.drop() === null);

/* ── 6. 复活币 ───────────────────────────────────── */
console.log('\n[6] 复活币：每 ' + (cfg.coinEvery || 2000) + ' 分一颗 + 复活');
// 把一个 2 分的合成正好推到 2000 分
game.reset();
game.state.score = (cfg.coinEvery || 2000) - 2;
game.state.coinsEarned = 0;
game.state.coins = 0;
game.state.over = false;
game.state.overStay = 0;
game.state.current = 0; game.state.next = 0;
game.aim(cx); game.drop();
run(game, 55);
game.state.cooldown = 0; game.state.current = 0;
game.aim(cx); game.drop();
run(game, 170);
check('总分过 2000', game.state.score >= (cfg.coinEvery || 2000), 'score=' + game.state.score);
check('拿到 1 颗复活币', game.state.coins >= 1, 'coins=' + game.state.coins);

// 再造一次超线判负，然后复活
const stuck2 = Matter.Bodies.circle(
  cfg.width / 2,
  cfg.dangerY + cfg.tiers[topTier].r - 20,
  cfg.tiers[topTier].r,
  { label: 'fish', isStatic: true }
);
stuck2.tier = topTier;
stuck2.bornAt = Date.now() - 5000;
Matter.Composite.add(game.engine.world, stuck2);
run(game, 160);
check('又判结束了', game.state.over);
const coinsBefore = game.state.coins;
const bodiesBefore = game.bodies().length;
check('复活成功', game.revive() === true);
check('复活后游戏继续', game.state.over === false);
check('消耗一颗币', game.state.coins === coinsBefore - 1,
  coinsBefore + ' → ' + game.state.coins);
check('清掉了压在线上方的鱼', game.bodies().length < bodiesBefore,
  bodiesBefore + ' → ' + game.bodies().length);
check('没币时不能再复活', game.revive() === false);

/* ── 7. 渲染层：还没落地就带色环 ───────────────────── */
console.log('\n[7] 渲染层：待放的鱼已经带色环');
const strokes = [];
function fakeCtx() {
  const c = {};
  ['save', 'restore', 'translate', 'rotate', 'scale', 'beginPath', 'moveTo', 'lineTo', 'closePath',
    'arc', 'ellipse', 'clip', 'fillRect', 'drawImage', 'setLineDash', 'setTransform', 'arcTo',
    'fill', 'clearRect', 'fillText', 'strokeText'].forEach(function (k) { c[k] = function () {}; });
  c.measureText = function () { return { width: 0 }; };
  c.stroke = function () { strokes.push(String(c.strokeStyle)); };
  c.createLinearGradient = function () { return { addColorStop: function () {} }; };
  c.createRadialGradient = function () { return { addColorStop: function () {} }; };
  return c;
}

const renderer = sandbox.GameRender.create({
  ctx: fakeCtx(),
  config: cfg,
  assets: { get: function () { return null; } },
  shapes: shapes,
});

game.reset();
game.state.current = 3;                       // 河豚 = 金黄
renderer.draw({ game: game, effects: [], time: 0, geo: game.geometry(), danger: false });
check('待放的鱼（未落地）已画本级色环', strokes.indexOf(cfg.tiers[3].ring) >= 0,
  '期望 ' + cfg.tiers[3].ring + '，画到 ' + [...new Set(strokes)].join(' '));

strokes.length = 0;
const previewCanvas = { width: 96, height: 96, getContext: function () { return fakeCtx(); } };
renderer.drawPreview(previewCanvas, 6, 0);
check('「下一个」预览也带色环', strokes.indexOf(cfg.tiers[6].ring) >= 0,
  '期望 ' + cfg.tiers[6].ring + '，画到 ' + [...new Set(strokes)].join(' '));

/* ── 8. 音量设定 ─────────────────────────────────── */
console.log('\n[8] 音乐 / 音效音量');
const Audio = sandbox.GameAudio;
const st0 = Audio.init({ audio: { bgm: '', bgmVolume: 0.38, sfxVolume: 0.55 } });
check('默认音量读配置', Math.abs(st0.musicVol - 0.38) < 0.001 && Math.abs(st0.sfxVol - 0.55) < 0.001,
  'music=' + st0.musicVol + ' sfx=' + st0.sfxVol);
Audio.setMusicVolume(0.7);
check('音乐音量可调', Math.abs(Audio.state().musicVol - 0.7) < 0.001);
Audio.setMusicVolume(5);
check('超过 1 会夹到 1', Math.abs(Audio.state().musicVol - 1) < 0.001);
Audio.setSfxVolume(-2);
check('低于 0 会夹到 0', Audio.state().sfxVol === 0);
check('音效为 0 时不报错（静音保护）', (function () {
  Audio.pop(3, false);
  Audio.coin();
  return true;
})());
const m1 = Audio.toggleMusic();
check('音乐开关能切', m1 === false && Audio.state().music === false, '切到 ' + m1);
Audio.toggleMusic();
check('再切回来', Audio.state().music === true);

/* ── 9. 背景立绘每 30 秒轮播 ───────────────────────── */
console.log('\n[9] 背景立绘轮播（每 ' + (cfg.bg.intervalMs / 1000) + ' 秒）');
// 记录「真正被 drawImage 画上去的立绘」，而不是「被探测过的 key」
const drawn = [];
const fakeAssets = {
  get: function (k) {
    if (k.indexOf('bg-') === 0) return { width: 1122, height: 2019, __key: k };
    return null;
  },
};
function recordCtx() {
  const c = fakeCtx();
  c.drawImage = function (img) {
    if (img && img.__key) drawn.push(img.__key);
  };
  return c;
}
const r2 = sandbox.GameRender.create({ ctx: recordCtx(), config: cfg, assets: fakeAssets, shapes: shapes });
const geo2 = game.geometry();
const drawnKeys = () => [...new Set(drawn)];

drawn.length = 0;
r2.draw({ game: game, effects: [], time: 1000, geo: geo2, danger: false });
check('开局画第一张立绘', drawnKeys().join(',') === 'bg-0', '实际画了 ' + drawnKeys().join(','));

drawn.length = 0;
r2.draw({ game: game, effects: [], time: 32000, geo: geo2, danger: false });   // 到点开始换
r2.draw({ game: game, effects: [], time: 32600, geo: geo2, danger: false });   // 淡入中途
const k2 = drawnKeys();
check('30 秒后换到下一张', k2.indexOf('bg-1') >= 0, '实际画了 ' + k2.join(','));
check('换图是交叉淡入（新旧同帧都在画）', k2.indexOf('bg-0') >= 0 && k2.indexOf('bg-1') >= 0,
  '实际画了 ' + k2.join(','));

drawn.length = 0;
r2.draw({ game: game, effects: [], time: 63000, geo: geo2, danger: false });
r2.draw({ game: game, effects: [], time: 63600, geo: geo2, danger: false });
const k3 = drawnKeys();
check('再过 30 秒继续往后轮', k3.indexOf('bg-2') >= 0 && k3.indexOf('bg-0') < 0,
  '实际画了 ' + k3.join(','));

/* ── 10. 手机震动 ─────────────────────────────────── */
console.log('\n[10] 震动反馈（模拟 navigator.vibrate）');
const vibes = [];
sandbox.navigator = { vibrate: function (p) { vibes.push(p); return true; } };
const Hap = sandbox.GameHaptics;
const spin = function (ms) { const t = Date.now(); while (Date.now() - t < ms) { /* 等节流窗口过去 */ } };

Hap.init(cfg);
check('检测到支持', Hap.supported());
Hap.setEnabled(true);
vibes.length = 0;
Hap.merge(3, false);
check('合成会震动', vibes.length === 1, 'vibrate(' + vibes[0] + ')');

vibes.length = 0;
Hap.setEnabled(false);          // 关开关时会调 vibrate(0) 立刻停掉正在抖的
vibes.length = 0;               // 把那一次"停止"清掉，只看之后还会不会抖
Hap.merge(3, false);
check('关掉开关后不震动', vibes.length === 0);

Hap.setEnabled(true);
spin(60);
vibes.length = 0;
Hap.merge(10, true);
check('合出终级是三连抖', Array.isArray(vibes[0]) && vibes[0].length === 3, JSON.stringify(vibes[0]));

spin(60);
vibes.length = 0;
Hap.merge(1, false);
Hap.merge(1, false);
Hap.merge(1, false);
check('连锁合成只抖一次（间隔节流）', vibes.length === 1, 'vibrate 次数=' + vibes.length);

spin(60);
vibes.length = 0;
Hap.coin();
check('拿复活币也会抖一下', vibes.length === 1, JSON.stringify(vibes[0]));

/* ── 11. 排行榜 ───────────────────────────────────── */
console.log('\n[11] 排行榜（模拟 localStorage）');
const store = Object.create(null);
sandbox.localStorage = {
  getItem: function (k) { return k in store ? store[k] : null; },
  setItem: function (k, v) { store[k] = String(v); },
  removeItem: function (k) { delete store[k]; },
};
const LB = sandbox.GameLeaderboard;
LB.clear();
for (let i = 1; i <= 12; i++) LB.add({ name: '玩家' + i, score: i * 100, maxTier: i % 11 });
const top = LB.getList();
check('最多只留 10 条', top.length === 10, '实际 ' + top.length);
check('按分数降序', top[0].score === 1200 && top[9].score === 300,
  top[0].score + ' … ' + top[9].score);
const r = LB.add({ name: '我', score: 555, maxTier: 3 });
check('新成绩能算出名次', r.rank >= 1 && r.rank <= 10, '第 ' + r.rank + ' 名');
check('挤掉第 11 名', LB.getList().length === 10);

LB.clear();
const rEmpty = LB.add({ name: '我', score: 42, maxTier: 1 });
check('空榜第一条就是第 1 名', rEmpty.rank === 1);
LB.remove(rEmpty.list[0]);
check('可以撤销（复活时用）', LB.getList().length === 0);

LB.add({ name: 'A', score: 10, maxTier: 0 });
const st = LB.stats();
check('统计读得到', typeof st.best === 'number' && typeof st.games === 'number',
  'best=' + st.best + ' games=' + st.games);
LB.setName('小鱼片');
check('名字记得住', LB.name() === '小鱼片');

console.log('\n' + (fails === 0 ? '全部通过 ✓' : fails + ' 项未通过 ✗'));
process.exit(fails === 0 ? 0 : 1);
