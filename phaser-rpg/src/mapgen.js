// ---------------------------------------------------------------------
// 유틸리티 + 절차적 맵 생성 (마을, 들판, 숲, 호수, 폐허, 길)
// ---------------------------------------------------------------------
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const fmt = n => Math.floor(n).toLocaleString('ko-KR');

// 값 노이즈 (부드러운 보간)
function makeNoise(seed) {
  const h = (x, y) => { const v = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453; return v - Math.floor(v); };
  const sm = t => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}

function generateMap(seed) {
  const rnd = mulberry32(seed);
  const noise = makeNoise(seed);
  const m = [];
  for (let y = 0; y < MAP_H; y++) {
    const row = [];
    for (let x = 0; x < MAP_W; x++) {
      let t = noise(x / 7, y / 7) > 0.6 ? T.GRASS2 : T.GRASS;
      if (rnd() < 0.035) t = T.FLOWER;
      // 동쪽으로 갈수록 숲이 빽빽해짐
      const forest = noise(x / 5 + 50, y / 5) + (x - 50) / 45;
      if (x > 50 && forest > 0.9) t = T.TREE;
      else if (noise(x / 4 + 100, y / 4 + 100) > 0.8 && rnd() < 0.55) t = T.TREE;
      // 호수와 모래사장
      const w = noise(x / 11 + 200, y / 11 + 200);
      if (w > 0.74) t = T.WATER; else if (w > 0.7) t = T.SAND;
      if (t !== T.WATER && rnd() < 0.006) t = T.ROCK;
      if (x < 2 || y < 2 || x >= MAP_W - 2 || y >= MAP_H - 2) t = T.TREE;
      row.push(t);
    }
    m.push(row);
  }
  const set = (x, y, t) => { if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) m[y][x] = t; };
  const fillRect = (x0, y0, w, h, fn) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, fn(x, y)); };
  const grassy = () => rnd() < 0.05 ? T.FLOWER : T.GRASS;

  // 스폰 지점 주변 정리
  for (const s of SPAWNS) fillRect(s.x - s.r - 1, s.y - s.r - 1, s.r * 2 + 3, s.r * 2 + 3, (x, y) => BLOCKING.includes(m[y][x]) ? grassy() : m[y][x]);

  // 마을: 바깥 여백 정리 → 바닥 → 성벽 → 성문
  fillRect(TOWN.x - 3, TOWN.y - 3, TOWN.w + 6, TOWN.h + 6, grassy);
  fillRect(TOWN.x, TOWN.y, TOWN.w, TOWN.h, (x, y) =>
    (x === TOWN.x || y === TOWN.y || x === TOWN.x + TOWN.w - 1 || y === TOWN.y + TOWN.h - 1) ? T.WALL : T.FLOOR);
  const gateY = TOWN.y + 7, gateX = TOWN.x + 9;
  for (let d = -1; d <= 1; d++) { set(TOWN.x + TOWN.w - 1, gateY + d, T.PATH); set(gateX + d, TOWN.y + TOWN.h - 1, T.PATH); }
  // 마을 광장 장식
  fillRect(TOWN.x + 6, TOWN.y + 5, 6, 4, () => T.PATH);

  // 폐허: 어두운 바닥, 무너진 벽, 기둥
  fillRect(RUINS.x - 2, RUINS.y - 2, RUINS.w + 4, RUINS.h + 4, (x, y) => m[y][x] === T.WATER ? T.SAND : m[y][x]);
  fillRect(RUINS.x, RUINS.y, RUINS.w, RUINS.h, (x, y) => {
    const edge = x === RUINS.x || y === RUINS.y || x === RUINS.x + RUINS.w - 1 || y === RUINS.y + RUINS.h - 1;
    if (edge) return rnd() < 0.12 ? T.DFLOOR : T.WALL;
    if ((x - RUINS.x) % 5 === 2 && (y - RUINS.y) % 5 === 2 && rnd() < 0.7) return T.ROCK;
    return T.DFLOOR;
  });
  const ruinsGateX = RUINS.x + 11;
  for (let d = -1; d <= 1; d++) set(ruinsGateX + d, RUINS.y + RUINS.h - 1, T.DFLOOR);
  fillRect(84, 7, 7, 5, () => T.DFLOOR); // 보스 방은 비워 둠

  // 길: 폭 2, 물 위는 다리
  const road = (x0, y0, x1, y1) => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(x0 + (x1 - x0) * i / steps), y = Math.round(y0 + (y1 - y0) * i / steps);
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const cur = m[y + dy] && m[y + dy][x + dx];
        if (cur === undefined || cur === T.WALL || cur === T.FLOOR || cur === T.DFLOOR) continue;
        set(x + dx, y + dy, cur === T.WATER || cur === T.BRIDGE ? T.BRIDGE : T.PATH);
      }
    }
  };
  road(TOWN.x + TOWN.w, gateY - 1, ruinsGateX - 1, gateY - 1);
  road(ruinsGateX - 1, gateY - 1, ruinsGateX - 1, RUINS.y + RUINS.h);
  road(gateX - 1, TOWN.y + TOWN.h, gateX - 1, 62);
  road(gateX - 1, 62, 52, 62);
  road(52, 62, 52, gateY);
  return m;
}
