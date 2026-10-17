/* 合成大肥鱼 · 本机排行榜
 * 纯静态站没有后端，所以记录存在 localStorage：最高 10 名 + 玩家自己的数据。
 * 想换成真正的"全球排行"，把这个模块的 add/getList 换成一个后端接口即可（见 README）。
 */
window.GameLeaderboard = (function () {
  'use strict';

  var KEY = 'merge-big-fat-fish.scores';
  var NAME_KEY = 'merge-big-fat-fish.name';
  var GAMES_KEY = 'merge-big-fat-fish.games';
  var MAX = 10;

  function readList() {
    try {
      var raw = localStorage.getItem(KEY);
      var arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) return [];
      return arr.slice(0, MAX);
    } catch (e) { return []; }
  }

  function writeList(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); } catch (e) { /* ignore */ }
  }

  function getList() { return readList(); }

  /* 加一条记录，返回它在榜上的名次（0 = 没进前 10） */
  function add(entry) {
    var list = readList();
    entry = entry || {};
    entry.id = entry.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
    entry.name = String(entry.name || '匿名玩家').slice(0, 12);
    entry.score = Math.max(0, Math.round(Number(entry.score) || 0));
    entry.maxTier = Math.max(0, Math.round(Number(entry.maxTier) || 0));
    entry.date = entry.date || new Date().toISOString().slice(0, 10);
    list.push(entry);
    list.sort(function (a, b) { return (b.score || 0) - (a.score || 0); });
    var kept = list.slice(0, MAX);
    var rank = 0;
    for (var i = 0; i < kept.length; i++) {
      if (kept[i] === entry) { rank = i + 1; break; }
    }
    writeList(kept);
    return { rank: rank, list: kept };
  }

  /* 撤销一条（复活后继续打时，之前那条不该留在榜上） */
  function remove(entry) {
    if (!entry) return readList();
    var list = readList();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === entry.id) { list.splice(i, 1); break; }
    }
    writeList(list);
    return readList();
  }

  function clear() { writeList([]); }

  function name() {
    try { return localStorage.getItem(NAME_KEY) || ''; } catch (e) { return ''; }
  }
  function setName(v) {
    try { localStorage.setItem(NAME_KEY, String(v || '').slice(0, 12)); } catch (e) { /* ignore */ }
  }

  function games() {
    try { return Number(localStorage.getItem(GAMES_KEY) || 0) || 0; } catch (e) { return 0; }
  }
  function bumpGames() {
    var n = games() + 1;
    try { localStorage.setItem(GAMES_KEY, String(n)); } catch (e) { /* ignore */ }
    return n;
  }

  function stats() {
    var list = readList();
    var sum = 0;
    for (var i = 0; i < list.length; i++) sum += list[i].score || 0;
    return {
      best: list.length ? list[0].score : 0,
      count: list.length,
      games: games(),
      avg: list.length ? Math.round(sum / list.length) : 0,
    };
  }

  return {
    MAX: MAX,
    getList: getList,
    add: add,
    remove: remove,
    clear: clear,
    name: name,
    setName: setName,
    games: games,
    bumpGames: bumpGames,
    stats: stats,
  };
})();
