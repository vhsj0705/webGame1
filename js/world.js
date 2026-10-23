// ---------------------------------------------------------------------
// World: procedural map generation + ground / static-object rendering
// ---------------------------------------------------------------------
const T = { GRASS: 0, ROAD: 1, STONE: 2, WATER: 3, SAND: 4, DFLOOR: 5, DWALL: 6, SNOW: 7, ICE: 8, FGRASS: 9, TFLOOR: 10, SEA: 11, TWALL: 12, PLAZA: 13 };
const BLOCK_TILES = new Set([T.WATER, T.DWALL, T.TWALL]);
const CHUNK = 16;

function hash2(x, y, s) { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); }
function vnoise(x, y, scale, s) {
  x /= scale; y /= scale;
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

class GameMap {
  constructor(id) {
    this.id = id; this.def = MAPS[id]; this.size = this.def.size; this.theme = this.def.theme;
    const N = this.size;
    this.tiles = new Uint8Array(N * N);
    this.block = new Uint8Array(N * N);
    this.objects = []; this.chunkObjs = new Map(); this.chunkCache = new Map();
    this.lights = [];
    this.rng = mulberry32(this.def.seed);
    this.generate();
    this.buildChunks();
  }
  idx(x, y) { return y * this.size + x; }
  inb(x, y) { return x >= 0 && y >= 0 && x < this.size && y < this.size; }
  tile(x, y) { return this.inb(x, y) ? this.tiles[this.idx(x, y)] : T.DWALL; }
  setT(x, y, t) { if (this.inb(x, y)) this.tiles[this.idx(x, y)] = t; }
  walk(x, y) { return this.inb(x, y) && !this.block[this.idx(x, y)] && !BLOCK_TILES.has(this.tiles[this.idx(x, y)]); }
  blockRect(x, y, w, h) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (this.inb(i, j)) this.block[this.idx(i, j)] = 1; }
  free(x, y, w, h) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (!this.walk(i, j)) return false;
    return true;
  }
  inTown(x, y) { const t = this.def.town; return t && Math.abs(x - t.x) <= t.r && Math.abs(y - t.y) <= t.r; }
  addObj(o) { this.objects.push(o); return o; }

  // -------------------------------------------------------------- generation
  generate() {
    const N = this.size, r = this.rng, s = this.def.seed;
    const th = this.theme;
    if (th === 'dungeon' || th === 'tower') return this.genDungeon();
    const base = th === 'grass' ? T.GRASS : th === 'forest' ? T.FGRASS : th === 'snow' ? T.SNOW : T.SEA;
    this.tiles.fill(base);
    // patches
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const n = vnoise(x, y, 9, s), m = vnoise(x, y, 5, s + 9);
      if (th === 'grass') { if (n > 0.78) this.setT(x, y, T.ROAD); if (m < 0.08 && n < 0.4) this.setT(x, y, T.WATER); }
      if (th === 'forest') { if (n > 0.8) this.setT(x, y, T.GRASS); if (m < 0.07) this.setT(x, y, T.WATER); }
      if (th === 'snow') { if (n > 0.74) this.setT(x, y, T.ICE); }
      if (th === 'water') { if (n > 0.7) this.setT(x, y, T.SAND); }
    }
    // border walls of the world: trees / rocks
    const c = this.def.center;
    // roads from center to edges
    if (th !== 'water') {
      const roadT = th === 'snow' ? T.ROAD : T.ROAD;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        let x = c.x, y = c.y, wob = 0;
        while (x > 1 && y > 1 && x < N - 2 && y < N - 2) {
          wob += (r() - 0.5) * 0.6; wob = clamp(wob, -3, 3);
          const px = Math.round(x + (dy ? wob : 0)), py = Math.round(y + (dx ? wob : 0));
          for (let k = -1; k <= 1; k++) { this.setT(px + (dy ? k : 0), py + (dx ? k : 0), roadT); }
          x += dx; y += dy;
        }
      }
    }
    // town
    const t = this.def.town;
    if (t) {
      for (let y = t.y - t.r; y <= t.y + t.r; y++) for (let x = t.x - t.r; x <= t.x + t.r; x++) this.setT(x, y, T.PLAZA);
      for (let y = t.y - 2; y <= t.y + 2; y++) for (let x = t.x - 2; x <= t.x + 2; x++) this.setT(x, y, T.STONE);
      // walls
      const R = t.r + 1;
      for (let k = -R; k <= R; k++) {
        for (const [wx, wy] of [[t.x + k, t.y - R], [t.x + k, t.y + R], [t.x - R, t.y + k], [t.x + R, t.y + k]]) {
          if (Math.abs(k) <= 1) { this.setT(wx, wy, T.STONE); continue; } // gates
          this.addObj({ type: 'wall', x: wx, y: wy, theme: th }); this.blockRect(wx, wy, 1, 1); this.setT(wx, wy, T.STONE);
        }
      }
      for (const [gx, gy] of [[t.x, t.y - R], [t.x, t.y + R], [t.x - R, t.y], [t.x + R, t.y]]) {
        for (const o of [-2, 2]) {
          const tx = gx + (gy === t.y ? 0 : o), ty = gy + (gy === t.y ? o : 0);
          this.addObj({ type: 'torch', x: tx + 0.5, y: ty + 0.5, onWall: true });
          this.lights.push({ x: tx + 0.5, y: ty + 0.5, r: 5, c: '#ffb060' });
        }
      }
      // center piece
      if (th === 'forest') { this.addObj({ type: 'bigtree', x: t.x - 1, y: t.y - 1, w: 3, h: 3 }); this.blockRect(t.x - 1, t.y - 1, 3, 3); }
      else { this.addObj({ type: 'fountain', x: t.x - 1, y: t.y - 1, w: 3, h: 3, theme: th }); this.blockRect(t.x - 1, t.y - 1, 3, 3); }
      // houses in corners
      const hs = [[-t.r + 1, -t.r + 1], [t.r - 4, -t.r + 1], [-t.r + 1, t.r - 4], [t.r - 4, t.r - 4], [-t.r + 1, -2], [t.r - 4, 1]];
      hs.forEach(([ox, oy], i) => {
        const hx = t.x + ox, hy = t.y + oy;
        if (this.def.npcs && this.def.npcs.some(n => n.x >= hx - 1 && n.x <= hx + 4 && n.y >= hy - 1 && n.y <= hy + 4)) return;
        this.addObj({ type: 'house', x: hx, y: hy, w: 3, h: 3, theme: th, var: i });
        this.blockRect(hx, hy, 3, 3);
      });
      // benches / statues
      this.addObj({ type: 'statue', x: t.x - 5, y: t.y - 5, w: 1, h: 1 }); this.blockRect(t.x - 5, t.y - 5, 1, 1);
      this.addObj({ type: 'statue', x: t.x + 5, y: t.y + 5, w: 1, h: 1 }); this.blockRect(t.x + 5, t.y + 5, 1, 1);
    }
    // scatter vegetation & rocks
    const dens = th === 'forest' ? 0.075 : th === 'grass' ? 0.04 : th === 'snow' ? 0.035 : 0.03;
    for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
      const tt = this.tile(x, y);
      if (tt === T.ROAD || tt === T.PLAZA || tt === T.STONE || tt === T.WATER || this.block[this.idx(x, y)]) continue;
      if (t && Math.abs(x - t.x) <= t.r + 3 && Math.abs(y - t.y) <= t.r + 3) continue;
      if (this.def.entry && dist(x, y, this.def.entry.x, this.def.entry.y) < 4) continue;
      const edge = x < 3 || y < 3 || x > N - 4 || y > N - 4;
      const roll = r();
      if (edge ? roll < 0.6 : roll < dens * (0.6 + vnoise(x, y, 7, s + 3))) {
        let type = th === 'snow' ? 'pine' : th === 'water' ? (r() < 0.5 ? 'coral' : 'kelp') : th === 'forest' ? (r() < 0.25 ? 'mushtree' : 'tree') : 'tree';
        if (r() < 0.15 && th !== 'water') type = 'rock';
        if (th === 'water' && r() < 0.08) type = 'ruin';
        this.addObj({ type, x: x + 0.5, y: y + 0.5, s: 0.8 + r() * 0.5, v: r() });
        this.blockRect(x, y, 1, 1);
      } else if (r() < 0.06) {
        this.addObj({ type: th === 'water' ? 'shell' : th === 'snow' ? 'snowtuft' : 'flower', x: x + r(), y: y + r(), v: r(), deco: true });
      }
    }
  }

  genDungeon() {
    const N = this.size, r = this.rng;
    const wall = this.theme === 'tower' ? T.TWALL : T.DWALL, floor = this.theme === 'tower' ? T.TFLOOR : T.DFLOOR;
    this.tiles.fill(wall);
    const rooms = [];
    const e = this.def.entry;
    rooms.push({ x: Math.floor(e.x) - 4, y: Math.floor(e.y) - 4, w: 9, h: 9 });
    for (let tries = 0; tries < 400 && rooms.length < 26; tries++) {
      const w = 6 + Math.floor(r() * 9), h = 6 + Math.floor(r() * 9);
      const x = 2 + Math.floor(r() * (N - w - 4)), y = 2 + Math.floor(r() * (N - h - 4));
      if (rooms.some(o => x < o.x + o.w + 2 && x + w + 2 > o.x && y < o.y + o.h + 2 && y + h + 2 > o.y)) continue;
      rooms.push({ x, y, w, h });
    }
    const carve = (x, y) => { if (x > 0 && y > 0 && x < N - 1 && y < N - 1) this.setT(x, y, floor); };
    rooms.forEach(o => { for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) carve(x, y); });
    // connect: each room to nearest already-connected room
    const conn = [rooms[0]];
    const rest = rooms.slice(1);
    while (rest.length) {
      let bi = 0, bj = 0, bd = 1e9;
      rest.forEach((a, i) => conn.forEach((b, j) => { const d = dist(a.x + a.w / 2, a.y + a.h / 2, b.x + b.w / 2, b.y + b.h / 2); if (d < bd) { bd = d; bi = i; bj = j; } }));
      const a = rest.splice(bi, 1)[0], b = conn[bj];
      let x = Math.floor(a.x + a.w / 2), y = Math.floor(a.y + a.h / 2);
      const tx = Math.floor(b.x + b.w / 2), ty = Math.floor(b.y + b.h / 2);
      const hFirst = r() < 0.5;
      const stepX = () => { while (x !== tx) { carve(x, y); carve(x, y + 1); carve(x, y - 1); x += Math.sign(tx - x); } };
      const stepY = () => { while (y !== ty) { carve(x, y); carve(x + 1, y); carve(x - 1, y); y += Math.sign(ty - y); } };
      if (hFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
      conn.push(a);
    }
    // extra loops
    for (let k = 0; k < 6; k++) {
      const a = pick(rooms), b = pick(rooms);
      let x = Math.floor(a.x + a.w / 2), y = Math.floor(a.y + a.h / 2);
      const tx = Math.floor(b.x + b.w / 2), ty = Math.floor(b.y + b.h / 2);
      while (x !== tx) { carve(x, y); carve(x, y + 1); x += Math.sign(tx - x); }
      while (y !== ty) { carve(x, y); carve(x + 1, y); y += Math.sign(ty - y); }
    }
    this.rooms = rooms;
    // wall objects only on edges facing floor
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (this.tile(x, y) !== wall) continue;
      let edge = false;
      for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) if (this.inb(x + dx, y + dy) && this.tile(x + dx, y + dy) === floor) { edge = true; break; }
      if (edge) this.addObj({ type: 'dwall', x, y, theme: this.theme, v: hash2(x, y, 3) });
    }
    // decorations: pillars, torches, crystals, bones
    rooms.forEach((o, i) => {
      if (o.w >= 8 && o.h >= 8 && i > 0) {
        for (const [px, py] of [[o.x + 2, o.y + 2], [o.x + o.w - 3, o.y + 2], [o.x + 2, o.y + o.h - 3], [o.x + o.w - 3, o.y + o.h - 3]]) {
          this.addObj({ type: 'pillar', x: px + 0.5, y: py + 0.5, theme: this.theme }); this.blockRect(px, py, 1, 1);
        }
      }
      const lx = o.x + Math.floor(o.w / 2), ly = o.y;
      this.addObj({ type: 'torch', x: lx + 0.5, y: ly + 0.5, onWall: false });
      this.lights.push({ x: lx + 0.5, y: ly + 0.5, r: 6, c: this.theme === 'tower' ? '#c070ff' : '#ff9a40' });
      for (let k = 0; k < 3; k++) {
        const dx = o.x + 1 + Math.floor(r() * (o.w - 2)), dy = o.y + 1 + Math.floor(r() * (o.h - 2));
        this.addObj({ type: this.theme === 'tower' ? 'crystal' : 'bones', x: dx + r(), y: dy + r(), v: r(), deco: true });
      }
    });
  }

  buildChunks() {
    for (const o of this.objects) {
      const k = Math.floor(o.x / CHUNK) + ',' + Math.floor(o.y / CHUNK);
      if (!this.chunkObjs.has(k)) this.chunkObjs.set(k, []);
      this.chunkObjs.get(k).push(o);
    }
  }

  randomFloor(cx, cy, dmin, dmax) {
    for (let i = 0; i < 200; i++) {
      const a = Math.random() * Math.PI * 2, d = rand(dmin, dmax);
      const x = Math.floor(cx + Math.cos(a) * d), y = Math.floor(cy + Math.sin(a) * d);
      if (this.walk(x, y) && !this.inTown(x, y)) return { x: x + 0.5, y: y + 0.5 };
    }
    for (let i = 0; i < 2000; i++) {
      const x = randi(1, this.size - 2), y = randi(1, this.size - 2);
      if (this.walk(x, y) && !this.inTown(x, y)) return { x: x + 0.5, y: y + 0.5 };
    }
    return { x: cx, y: cy };
  }

  // -------------------------------------------------------------- ground rendering
  tileColor(t, x, y) {
    const s = this.def.seed, n = vnoise(x, y, 6, s + 1) * 0.6 + hash2(x, y, s) * 0.4;
    const v = (n - 0.5) * 0.18;
    const base = {
      [T.GRASS]: '#4f7a2c', [T.FGRASS]: '#2f5a26', [T.ROAD]: '#8a7050', [T.STONE]: '#8c8a82', [T.PLAZA]: '#9a9080',
      [T.WATER]: '#2a5a8a', [T.SAND]: '#b8a878', [T.DFLOOR]: '#4a4540', [T.DWALL]: '#15120f', [T.SNOW]: '#dfe8f0',
      [T.ICE]: '#a8d0e8', [T.TFLOOR]: '#3a3048', [T.TWALL]: '#120c18', [T.SEA]: '#2a6a7a'
    }[t];
    return shade(base, v);
  }
  renderChunk(cx, cy) {
    const can = document.createElement('canvas');
    can.width = CHUNK * TW; can.height = CHUNK * TH + 2;
    const g = can.getContext('2d');
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    const ox = (x0 - y0 - CHUNK) * TW / 2, oy = (x0 + y0) * TH / 2;
    const rr = mulberry32(cx * 9173 + cy * 131 + this.def.seed);
    for (let y = y0; y < y0 + CHUNK; y++) for (let x = x0; x < x0 + CHUNK; x++) {
      if (!this.inb(x, y)) continue;
      const t = this.tile(x, y);
      const p = iso(x, y); const px = p.x - ox, py = p.y - oy;
      g.beginPath();
      g.moveTo(px, py); g.lineTo(px + TW / 2, py + TH / 2); g.lineTo(px, py + TH); g.lineTo(px - TW / 2, py + TH / 2); g.closePath();
      g.fillStyle = this.tileColor(t, x, y); g.fill();
      // subtle edge so roads/plaza read as tiles
      if (t === T.STONE || t === T.PLAZA || t === T.DFLOOR || t === T.TFLOOR) {
        g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1; g.stroke();
        g.beginPath(); g.moveTo(px - TW / 4, py + TH / 4); g.lineTo(px + TW / 4, py + TH * 3 / 4);
        g.strokeStyle = 'rgba(255,255,255,0.05)'; g.stroke();
      }
      // texture specks
      const specks = t === T.GRASS || t === T.FGRASS ? 7 : t === T.ROAD || t === T.SAND ? 5 : t === T.SNOW ? 4 : t === T.DFLOOR || t === T.TFLOOR ? 3 : 2;
      for (let k = 0; k < specks; k++) {
        const u = rr() - 0.5, v = rr() - 0.5;
        const sx = px + (u - v) * TW / 2 * 0.9, sy = py + TH / 2 + (u + v) * TH / 2 * 0.9;
        if (t === T.GRASS || t === T.FGRASS) {
          g.strokeStyle = rr() < 0.5 ? 'rgba(20,50,10,0.5)' : 'rgba(160,200,90,0.35)';
          g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + (rr() - 0.5) * 3, sy - 3 - rr() * 3); g.stroke();
        } else if (t === T.WATER || t === T.SEA) {
          g.fillStyle = 'rgba(180,220,255,0.18)'; g.fillRect(sx - 4, sy, 8, 1);
        } else if (t === T.SNOW || t === T.ICE) {
          g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(sx, sy, 1.5, 1.5);
        } else if (t === T.DWALL || t === T.TWALL) {
        } else {
          g.fillStyle = rr() < 0.5 ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.12)';
          g.fillRect(sx, sy, 2, 1.5);
        }
      }
    }
    return { can, ox, oy };
  }
  getChunk(cx, cy) {
    const k = cx + ',' + cy;
    let c = this.chunkCache.get(k);
    if (!c) {
      c = this.renderChunk(cx, cy); this.chunkCache.set(k, c);
      if (this.chunkCache.size > 28) this.chunkCache.delete(this.chunkCache.keys().next().value);
    }
    return c;
  }
  // returns list of visible chunk coords for camera
  visibleChunks(cam, W, H) {
    const out = [];
    const corners = [unIso(cam.x - W / 2, cam.y - H / 2), unIso(cam.x + W / 2, cam.y - H / 2), unIso(cam.x - W / 2, cam.y + H / 2), unIso(cam.x + W / 2, cam.y + H / 2)];
    const minX = Math.min(...corners.map(c => c.x)), maxX = Math.max(...corners.map(c => c.x));
    const minY = Math.min(...corners.map(c => c.y)), maxY = Math.max(...corners.map(c => c.y));
    const nC = Math.ceil(this.size / CHUNK);
    for (let cy = Math.max(0, Math.floor(minY / CHUNK) - 1); cy <= Math.min(nC - 1, Math.floor(maxY / CHUNK) + 1); cy++)
      for (let cx = Math.max(0, Math.floor(minX / CHUNK) - 1); cx <= Math.min(nC - 1, Math.floor(maxX / CHUNK) + 1); cx++)
        out.push([cx, cy]);
    return out;
  }
  drawGround(ctx, cam, W, H) {
    for (const [cx, cy] of this.visibleChunks(cam, W, H)) {
      const c = this.getChunk(cx, cy);
      const sx = c.ox - cam.x + W / 2, sy = c.oy - cam.y + H / 2;
      if (sx > W || sy > H || sx + c.can.width < 0 || sy + c.can.height < 0) continue;
      ctx.drawImage(c.can, Math.round(sx), Math.round(sy));
    }
  }
  visibleObjects(cam, W, H) {
    const out = [];
    for (const [cx, cy] of this.visibleChunks(cam, W, H)) {
      const l = this.chunkObjs.get(cx + ',' + cy);
      if (l) for (const o of l) out.push(o);
    }
    return out;
  }
}

// ---------------------------------------------------------------------
// static object drawing (sx, sy = screen pos of object's ground anchor)
// ---------------------------------------------------------------------
function isoBox(ctx, x, y, w, h, H, cam, W2, H2, top, left, right) {
  const P = (a, b) => { const p = iso(a, b); return [p.x - cam.x + W2, p.y - cam.y + H2]; };
  const A = P(x, y), B = P(x + w, y), C = P(x + w, y + h), D = P(x, y + h);
  ctx.fillStyle = left; ctx.beginPath(); ctx.moveTo(D[0], D[1]); ctx.lineTo(C[0], C[1]); ctx.lineTo(C[0], C[1] - H); ctx.lineTo(D[0], D[1] - H); ctx.fill();
  ctx.fillStyle = right; ctx.beginPath(); ctx.moveTo(C[0], C[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(B[0], B[1] - H); ctx.lineTo(C[0], C[1] - H); ctx.fill();
  if (top) { ctx.fillStyle = top; ctx.beginPath(); ctx.moveTo(A[0], A[1] - H); ctx.lineTo(B[0], B[1] - H); ctx.lineTo(C[0], C[1] - H); ctx.lineTo(D[0], D[1] - H); ctx.fill(); }
  return { A, B, C, D };
}

function drawStatic(ctx, o, cam, W2, H2, time) {
  const p = iso(o.x, o.y); const sx = p.x - cam.x + W2, sy = p.y - cam.y + H2;
  switch (o.type) {
    case 'tree': {
      const s = o.s || 1;
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(sx, sy, 22 * s, 10 * s, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#4a3020'; ctx.fillRect(sx - 3 * s, sy - 34 * s, 6 * s, 34 * s);
      const sway = Math.sin(time * 1.3 + o.x) * 1.5;
      const cols = o.v < 0.5 ? ['#1f4a18', '#2f6a22', '#4a8a30'] : ['#2a4a12', '#3e6a1a', '#6a9a2a'];
      [[0, -48, 24], [-12, -40, 16], [12, -42, 16], [0, -62, 17]].forEach((c, i) => {
        ctx.fillStyle = cols[i % 3]; ctx.beginPath(); ctx.arc(sx + c[0] * s + sway, sy + c[1] * s, c[2] * s, 0, 7); ctx.fill();
      });
      ctx.fillStyle = 'rgba(200,255,150,0.12)'; ctx.beginPath(); ctx.arc(sx - 6 * s + sway, sy - 56 * s, 10 * s, 0, 7); ctx.fill();
      break;
    }
    case 'mushtree': {
      const s = o.s || 1;
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(sx, sy, 18 * s, 8 * s, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#d8d0b0'; ctx.fillRect(sx - 4 * s, sy - 30 * s, 8 * s, 30 * s);
      ctx.fillStyle = o.v < 0.5 ? '#8a3a6a' : '#3a6a8a'; ctx.beginPath(); ctx.ellipse(sx, sy - 32 * s, 22 * s, 12 * s, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(sx + (i - 1.5) * 9 * s, sy - 38 * s + (i % 2) * 4, 2.2 * s, 0, 7); ctx.fill(); }
      break;
    }
    case 'pine': {
      const s = o.s || 1;
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(sx, sy, 18 * s, 8 * s, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#3a2618'; ctx.fillRect(sx - 3 * s, sy - 16 * s, 6 * s, 16 * s);
      for (let i = 0; i < 3; i++) {
        const yy = sy - 14 * s - i * 16 * s, ww = (22 - i * 5) * s;
        ctx.fillStyle = '#1e3a2a'; ctx.beginPath(); ctx.moveTo(sx - ww, yy); ctx.lineTo(sx + ww, yy); ctx.lineTo(sx, yy - 26 * s); ctx.fill();
        ctx.fillStyle = '#f0f6ff'; ctx.beginPath(); ctx.moveTo(sx - ww * 0.5, yy - 13 * s); ctx.lineTo(sx + ww * 0.2, yy - 15 * s); ctx.lineTo(sx, yy - 26 * s); ctx.fill();
      }
      break;
    }
    case 'rock': {
      const s = o.s || 1;
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(sx, sy, 16 * s, 7 * s, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#6a6862'; ctx.beginPath(); ctx.moveTo(sx - 15 * s, sy); ctx.lineTo(sx - 10 * s, sy - 16 * s); ctx.lineTo(sx + 4 * s, sy - 20 * s); ctx.lineTo(sx + 15 * s, sy - 6 * s); ctx.lineTo(sx + 12 * s, sy + 2); ctx.fill();
      ctx.fillStyle = '#8a8880'; ctx.beginPath(); ctx.moveTo(sx - 10 * s, sy - 16 * s); ctx.lineTo(sx + 4 * s, sy - 20 * s); ctx.lineTo(sx + 2 * s, sy - 8 * s); ctx.fill();
      break;
    }
    case 'coral': case 'kelp': {
      const s = o.s || 1;
      if (o.type === 'kelp') {
        ctx.strokeStyle = '#2a8a5a'; ctx.lineWidth = 4 * s;
        for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(sx + i * 6, sy); ctx.quadraticCurveTo(sx + i * 6 + Math.sin(time * 2 + o.x + i) * 8, sy - 25 * s, sx + i * 6 + Math.sin(time * 2 + i) * 4, sy - 50 * s); ctx.stroke(); }
      } else {
        ctx.fillStyle = o.v < 0.5 ? '#e0607a' : '#f0a050';
        for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(sx + (i - 2) * 6 * s, sy - 10 * s - (i % 3) * 8 * s, 4 * s, 12 * s, (i - 2) * 0.3, 0, 7); ctx.fill(); }
      }
      break;
    }
    case 'ruin': {
      ctx.fillStyle = '#8aa0a8'; ctx.fillRect(sx - 8, sy - 60, 16, 60);
      ctx.fillStyle = '#a8c0c8'; ctx.fillRect(sx - 12, sy - 66, 24, 8);
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(sx + 2, sy - 60, 6, 60);
      break;
    }
    case 'flower': {
      ctx.fillStyle = ['#ff7', '#f8a', '#fff', '#adf'][Math.floor(o.v * 4)];
      ctx.beginPath(); ctx.arc(sx, sy - 2, 2, 0, 7); ctx.fill();
      break;
    }
    case 'snowtuft': { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(sx, sy, 6, 3, 0, 0, 7); ctx.fill(); break; }
    case 'shell': { ctx.fillStyle = '#f0d8c0'; ctx.beginPath(); ctx.arc(sx, sy, 3, Math.PI, 0); ctx.fill(); break; }
    case 'bones': {
      ctx.strokeStyle = '#cfc8b0'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx - 6, sy - 2); ctx.lineTo(sx + 6, sy + 2); ctx.moveTo(sx - 5, sy + 3); ctx.lineTo(sx + 4, sy - 3); ctx.stroke();
      if (o.v > 0.6) { ctx.fillStyle = '#ddd6c0'; ctx.beginPath(); ctx.arc(sx + 8, sy - 3, 4, 0, 7); ctx.fill(); ctx.fillStyle = '#222'; ctx.fillRect(sx + 6, sy - 4, 1.5, 1.5); ctx.fillRect(sx + 9, sy - 4, 1.5, 1.5); }
      break;
    }
    case 'crystal': {
      const gl = 0.6 + Math.sin(time * 2 + o.x) * 0.3;
      ctx.fillStyle = `rgba(180,100,255,${gl})`;
      ctx.beginPath(); ctx.moveTo(sx, sy - 22); ctx.lineTo(sx + 6, sy - 6); ctx.lineTo(sx, sy); ctx.lineTo(sx - 6, sy - 6); ctx.fill();
      ctx.fillStyle = 'rgba(255,220,255,0.8)'; ctx.beginPath(); ctx.moveTo(sx, sy - 22); ctx.lineTo(sx + 2, sy - 8); ctx.lineTo(sx, sy - 4); ctx.fill();
      break;
    }
    case 'wall': {
      const pal = o.theme === 'snow' ? ['#c8ccd8', '#8a90a0', '#a8aebc'] : o.theme === 'forest' ? ['#7a8a6a', '#4a5a3a', '#5e6e4e'] : ['#a89a80', '#6a5e4a', '#857660'];
      isoBox(ctx, o.x, o.y, 1, 1, 46, cam, W2, H2, pal[0], pal[1], pal[2]);
      const q = iso(o.x + 0.5, o.y + 0.5); const qx = q.x - cam.x + W2, qy = q.y - cam.y + H2;
      ctx.fillStyle = pal[0]; ctx.fillRect(qx - 7, qy - 58, 14, 8);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.moveTo(qx - 32, qy - 30); ctx.lineTo(qx, qy - 14); ctx.lineTo(qx + 32, qy - 30); ctx.stroke();
      break;
    }
    case 'dwall': {
      const tower = o.theme === 'tower';
      const top = tower ? '#2a1e38' : '#2a2520', l = tower ? '#4a3a62' : '#5a5045', r = tower ? '#3a2c4e' : '#463e35';
      const b = isoBox(ctx, o.x, o.y, 1, 1, 52, cam, W2, H2, top, l, r);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
      for (let k = 1; k < 4; k++) {
        ctx.beginPath(); ctx.moveTo(b.D[0], b.D[1] - k * 13); ctx.lineTo(b.C[0], b.C[1] - k * 13); ctx.lineTo(b.B[0], b.B[1] - k * 13); ctx.stroke();
      }
      if (o.v > 0.85) { ctx.fillStyle = tower ? 'rgba(200,120,255,0.5)' : 'rgba(60,120,40,0.5)'; ctx.fillRect(b.C[0] - 10, b.C[1] - 30, 6, 20); }
      break;
    }
    case 'pillar': {
      const tower = o.theme === 'tower';
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(sx, sy, 14, 6, 0, 0, 7); ctx.fill();
      const g = ctx.createLinearGradient(sx - 10, 0, sx + 10, 0);
      g.addColorStop(0, tower ? '#4a3a62' : '#6a6055'); g.addColorStop(0.4, tower ? '#8a70b0' : '#a89a88'); g.addColorStop(1, tower ? '#2a1e38' : '#3a342c');
      ctx.fillStyle = g; ctx.fillRect(sx - 10, sy - 80, 20, 80);
      ctx.fillStyle = tower ? '#6a5a8a' : '#8a8070'; ctx.fillRect(sx - 14, sy - 86, 28, 8); ctx.fillRect(sx - 13, sy - 6, 26, 6);
      break;
    }
    case 'torch': {
      const h = o.onWall ? 50 : 40;
      ctx.fillStyle = '#3a2a1a'; ctx.fillRect(sx - 2, sy - h, 4, h);
      ctx.fillStyle = '#5a4a3a'; ctx.fillRect(sx - 5, sy - h - 4, 10, 5);
      const f = Math.sin(time * 15 + o.x * 3) * 2;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(sx, sy - h - 10, 0, sx, sy - h - 10, 26);
      g.addColorStop(0, 'rgba(255,200,100,0.6)'); g.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy - h - 10, 26, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffd070'; ctx.beginPath(); ctx.moveTo(sx - 5, sy - h - 3); ctx.quadraticCurveTo(sx + f, sy - h - 24, sx + 5, sy - h - 3); ctx.fill();
      ctx.fillStyle = '#fff4c0'; ctx.beginPath(); ctx.moveTo(sx - 2, sy - h - 3); ctx.quadraticCurveTo(sx + f * 0.5, sy - h - 14, sx + 2, sy - h - 3); ctx.fill();
      ctx.restore();
      break;
    }
    case 'statue': {
      const q = iso(o.x + 0.5, o.y + 0.5); const qx = q.x - cam.x + W2, qy = q.y - cam.y + H2;
      isoBox(ctx, o.x + 0.1, o.y + 0.1, 0.8, 0.8, 14, cam, W2, H2, '#b0a890', '#6a6250', '#857c68');
      ctx.fillStyle = '#9a9a9a';
      ctx.fillRect(qx - 5, qy - 50, 10, 30); ctx.beginPath(); ctx.arc(qx, qy - 55, 6, 0, 7); ctx.fill();
      ctx.fillRect(qx + 5, qy - 64, 3, 40);
      ctx.fillStyle = '#7a7a7a'; ctx.beginPath(); ctx.moveTo(qx - 5, qy - 48); ctx.lineTo(qx - 14, qy - 22); ctx.lineTo(qx - 5, qy - 22); ctx.fill();
      break;
    }
    case 'fountain': {
      isoBox(ctx, o.x + 0.1, o.y + 0.1, 2.8, 2.8, 12, cam, W2, H2, null, '#7a7468', '#958e80');
      const P = (a, b) => { const p = iso(a, b); return [p.x - cam.x + W2, p.y - cam.y + H2 - 12]; };
      const A = P(o.x + 0.1, o.y + 0.1), B = P(o.x + 2.9, o.y + 0.1), C = P(o.x + 2.9, o.y + 2.9), D = P(o.x + 0.1, o.y + 2.9);
      ctx.fillStyle = '#a8a090'; ctx.beginPath(); ctx.moveTo(...A); ctx.lineTo(...B); ctx.lineTo(...C); ctx.lineTo(...D); ctx.fill();
      const Q = (a, b) => { const p = iso(a, b); return [p.x - cam.x + W2, p.y - cam.y + H2 - 12]; };
      const a2 = Q(o.x + 0.4, o.y + 0.4), b2 = Q(o.x + 2.6, o.y + 0.4), c2 = Q(o.x + 2.6, o.y + 2.6), d2 = Q(o.x + 0.4, o.y + 2.6);
      const wg = ctx.createLinearGradient(0, a2[1], 0, c2[1]);
      wg.addColorStop(0, o.theme === 'snow' ? '#bfe6ff' : '#3a8ac8'); wg.addColorStop(1, o.theme === 'snow' ? '#e8f8ff' : '#2a5a9a');
      ctx.fillStyle = wg; ctx.beginPath(); ctx.moveTo(...a2); ctx.lineTo(...b2); ctx.lineTo(...c2); ctx.lineTo(...d2); ctx.fill();
      const cx = (a2[0] + c2[0]) / 2, cy = (a2[1] + c2[1]) / 2;
      ctx.fillStyle = '#b8b0a0'; ctx.fillRect(cx - 4, cy - 40, 8, 40);
      ctx.beginPath(); ctx.ellipse(cx, cy - 40, 14, 6, 0, 0, 7); ctx.fill();
      if (o.theme !== 'snow') {
        ctx.fillStyle = 'rgba(200,235,255,0.75)';
        for (let i = 0; i < 10; i++) {
          const t = (time * 1.2 + i / 10) % 1, ang = i / 10 * Math.PI * 2;
          ctx.beginPath(); ctx.arc(cx + Math.cos(ang) * 26 * t, cy - 44 + Math.sin(ang) * 10 * t - Math.sin(t * Math.PI) * 18 + 40 * t * t, 2, 0, 7); ctx.fill();
        }
      }
      break;
    }
    case 'bigtree': {
      const q = iso(o.x + 1.5, o.y + 1.5); const qx = q.x - cam.x + W2, qy = q.y - cam.y + H2;
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(qx, qy, 70, 32, 0, 0, 7); ctx.fill();
      const g = ctx.createLinearGradient(qx - 20, 0, qx + 20, 0); g.addColorStop(0, '#3a2414'); g.addColorStop(0.5, '#7a5030'); g.addColorStop(1, '#2a180c');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(qx - 26, qy); ctx.lineTo(qx - 14, qy - 110); ctx.lineTo(qx + 14, qy - 110); ctx.lineTo(qx + 26, qy); ctx.fill();
      [[0, -150, 70, '#1a4a1a'], [-45, -125, 45, '#245a20'], [45, -130, 45, '#245a20'], [0, -190, 50, '#2e6a28'], [-25, -170, 35, '#3a7a2e'], [28, -175, 32, '#3a7a2e']]
        .forEach(c => { ctx.fillStyle = c[3]; ctx.beginPath(); ctx.arc(qx + c[0] + Math.sin(time + c[0]) * 2, qy + c[1], c[2], 0, 7); ctx.fill(); });
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 12; i++) {
        const a = time * 0.5 + i * 0.52, rr = 60 + Math.sin(time + i) * 20;
        ctx.fillStyle = `rgba(200,255,150,${0.3 + Math.sin(time * 3 + i) * 0.2})`;
        ctx.beginPath(); ctx.arc(qx + Math.cos(a) * rr, qy - 130 + Math.sin(a * 1.3) * 50, 2, 0, 7); ctx.fill();
      }
      ctx.restore();
      break;
    }
    case 'house': {
      const roof = o.theme === 'snow' ? ['#f0f4ff', '#c8d0e0'] : o.theme === 'forest' ? ['#5a7a3a', '#3a5a2a'] : [['#9a3a2a', '#6a2418'], ['#3a4a7a', '#26305a'], ['#7a5a2a', '#5a3e18']][o.var % 3];
      const b = isoBox(ctx, o.x + 0.15, o.y + 0.15, o.w - 0.3, o.h - 0.3, 56, cam, W2, H2, null, '#c8b898', '#a89878');
      // timber lines
      ctx.strokeStyle = '#5a4028'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(b.D[0], b.D[1] - 56); ctx.lineTo(b.C[0], b.C[1] - 56); ctx.lineTo(b.B[0], b.B[1] - 56);
      ctx.moveTo(b.D[0], b.D[1]); ctx.lineTo(b.D[0], b.D[1] - 56); ctx.moveTo(b.C[0], b.C[1]); ctx.lineTo(b.C[0], b.C[1] - 56); ctx.moveTo(b.B[0], b.B[1]); ctx.lineTo(b.B[0], b.B[1] - 56); ctx.stroke();
      // door + windows
      const mx = (b.D[0] + b.C[0]) / 2, my = (b.D[1] + b.C[1]) / 2;
      ctx.fillStyle = '#4a2e18'; ctx.beginPath(); ctx.moveTo(mx - 9, my - 4); ctx.lineTo(mx + 9, my + 4); ctx.lineTo(mx + 9, my - 26); ctx.lineTo(mx - 9, my - 34); ctx.fill();
      const wx = (b.C[0] + b.B[0]) / 2, wy = (b.C[1] + b.B[1]) / 2;
      const lit = 0.6 + Math.sin(time * 3 + o.x) * 0.1;
      ctx.fillStyle = `rgba(255,210,120,${lit})`; ctx.beginPath(); ctx.moveTo(wx - 10, wy - 26); ctx.lineTo(wx + 10, wy - 36); ctx.lineTo(wx + 10, wy - 22); ctx.lineTo(wx - 10, wy - 12); ctx.fill();
      // gable roof
      const top = (pt, dy) => [pt[0], pt[1] - 56 - dy];
      const A = top(b.A, 0), B = top(b.B, 0), C = top(b.C, 0), D = top(b.D, 0);
      const r1 = [(A[0] + D[0]) / 2, (A[1] + D[1]) / 2 - 40], r2 = [(B[0] + C[0]) / 2, (B[1] + C[1]) / 2 - 40];
      ctx.fillStyle = roof[1]; ctx.beginPath(); ctx.moveTo(...A); ctx.lineTo(...B); ctx.lineTo(...r2); ctx.lineTo(...r1); ctx.fill();
      ctx.fillStyle = roof[0]; ctx.beginPath(); ctx.moveTo(...D); ctx.lineTo(...C); ctx.lineTo(...r2); ctx.lineTo(...r1); ctx.fill();
      ctx.fillStyle = '#d8c8a8'; ctx.beginPath(); ctx.moveTo(...C); ctx.lineTo(...B); ctx.lineTo(...r2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1;
      for (let k = 1; k < 5; k++) { const t = k / 5; ctx.beginPath(); ctx.moveTo(lerp(D[0], r1[0], t), lerp(D[1], r1[1], t)); ctx.lineTo(lerp(C[0], r2[0], t), lerp(C[1], r2[1], t)); ctx.stroke(); }
      // chimney smoke
      ctx.fillStyle = '#6a5a4a'; ctx.fillRect(r2[0] - 14, r2[1] + 4, 8, 16);
      for (let i = 0; i < 4; i++) {
        const t = (time * 0.3 + i / 4) % 1;
        ctx.fillStyle = `rgba(200,200,200,${0.35 * (1 - t)})`; ctx.beginPath(); ctx.arc(r2[0] - 10 + t * 12, r2[1] - t * 40, 4 + t * 8, 0, 7); ctx.fill();
      }
      break;
    }
  }
}
function staticDepth(o) {
  if (o.w) return o.x + o.w / 2 + o.y + o.h / 2;
  if (o.type === 'wall' || o.type === 'dwall') return o.x + o.y + 1;
  if (o.deco) return o.x + o.y - 2;
  return o.x + o.y;
}
