/* 合成大肥鱼 · 全局配置
 * 想调难度/尺寸/配色/音频，改这里就够了，不用碰逻辑代码。
 * tiers 从 0 开始，越往后越大；两两相同才合成。
 */
window.GAME_CONFIG = {
  /* 逻辑分辨率（渲染时按屏幕 DPR 放大） */
  width: 480,
  height: 780,

  /* 罐子内边距与墙厚 */
  margin: { left: 16, right: 16, bottom: 14 },
  wallThickness: 14,

  /* 出手位置 / 危险线 */
  dropY: 96,
  dangerY: 156,

  /* 物理 */
  gravity: 1.0,
  /* 材质：弹性拉高、摩擦压低 = 更 Q 弹（压扁回弹的视觉在 render.js 里） */
  physics: {
    restitution: 0.58,      // 弹性（越大越弹）
    friction: 0.08,         // 表面摩擦（小 = 滑、转得动）
    frictionStatic: 0.10,
    frictionAir: 0.005,     // 空气阻尼（防止永远抖个不停）
    density: 0.0012,
    slop: 0.02,
    wallRestitution: 0.34,  // 撞墙/撞底的弹性
  },
  /* 按图片轮廓造刚体时，轮廓归一化坐标要乘的系数（与 render.js 的 2.06 保持一致） */
  shapeScale: 2.06,
  /* 每满多少分给一颗复活币 */
  coinEvery: 2000,

  /* 手感 */
  dropCooldownMs: 260,
  overStayMs: 2000,
  spawnGraceMs: 900,
  /* 判定「这条鱼已经堆在这儿了」的速度上限（px/步）；只用来挡掉正在下落的鱼 */
  settleSpeed: 6,

  /* 只从这几级掉落（越小越友好；0~4 = 鱼子…鲳鱼） */
  dropTiers: [0, 1, 2, 3, 4],

  /* 合成到第 N 级时加的分（索引 = 目标等级） */
  score: [0, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024],
  /* 两条「蓝色大肥鱼」相撞的彩蛋分 */
  finalBonus: 2048,

  /* 音频 */
  audio: {
    bgm: 'assets/music/bgm.mp3',
    bgmVolume: 0.38,
    sfxVolume: 0.55,
    /* 这首歌 2 分钟；如果解析出来的时长比这还短，说明文件被截断了，就别硬播 */
    bgmMinSeconds: 25,
  },

  /* 背景立绘轮播：每 intervalMs 毫秒换一张（带交叉淡入），文件按顺序循环
   * 换图/加图：把透明底 PNG/WebP 丢进 assets/bg/，再把文件名加到 files 里 */
  bg: {
    dir: 'assets/bg/',
    files: ['01.webp', '02.webp', '03.webp', '04.webp', '05.webp'],
    intervalMs: 30000,
    fadeMs: 1400,
    opacity: 0.46,
  },

  /* 图片素材约定：assets/fish/<key>.png（有就自动用，没有就画占位鱼） */
  assetDir: 'assets/fish/',
  assetBg: 'assets/bg.png',

  /* 等级表：r 是半径（相邻级差拉大了，一眼能看出大小），ring 是这一级的识别色
   * 配色按色相大跨度排（青→绿→黄绿→金→橙→红→粉紫→紫→蓝紫→银→金），
   * 相邻两级至少差 30°，前几级不再全挤在蓝色里。 */
  tiers: [
    { key: '00', name: '鱼子',       r: 14,  ring: '#4DD9FF', color: '#4DD9FF' },
    { key: '01', name: '小鱼苗',     r: 20,  ring: '#3BE07A', color: '#3BE07A' },
    { key: '02', name: '小金鱼',     r: 27,  ring: '#C6F03B', color: '#C6F03B' },
    { key: '03', name: '河豚',       r: 35,  ring: '#FFC93B', color: '#FFC93B' },
    { key: '04', name: '鲳鱼',       r: 44,  ring: '#FF8A3B', color: '#FF8A3B' },
    { key: '05', name: '鲈鱼',       r: 54,  ring: '#FF4D5E', color: '#FF4D5E' },
    { key: '06', name: '鲑鱼',       r: 65,  ring: '#FF3BD2', color: '#FF3BD2' },
    { key: '07', name: '鲨鱼',       r: 77,  ring: '#B83BFF', color: '#B83BFF' },
    { key: '08', name: '鲸鱼',       r: 90,  ring: '#6B5BFF', color: '#6B5BFF' },
    { key: '09', name: '小鲸鱼娘',   r: 104, ring: '#E8ECF5', color: '#E8ECF5' },
    { key: '10', name: '蓝色大肥鱼', r: 119, ring: '#FFD84D', color: '#FFD84D' },
  ],
};
