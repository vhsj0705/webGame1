// ---------------------------------------------------------------------
// 절차적 텍스처: 외부 이미지 없이 캔버스로 타일셋·캐릭터·이펙트를 그림
// 캐릭터는 2배 해상도(64px)로 그리고 스프라이트를 0.5배로 표시
// ---------------------------------------------------------------------
const OUT = '#15131c';

function canvasTex(scene, key, w, h, draw) {
  const tex = scene.textures.createCanvas(key, w, h);
  const ctx = tex.getContext();
  draw(ctx, w, h);
  tex.refresh();
  return tex;
}

// ---- 도형 헬퍼 ----
function ell(ctx, x, y, rx, ry, fill, stroke = OUT, lw = 3) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); }
}
function rrect(ctx, x, y, w, h, r, fill, stroke = OUT, lw = 3) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); }
}
function poly(ctx, pts, fill, stroke = OUT, lw = 3) {
  ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); }
}
function line(ctx, x1, y1, x2, y2, col, lw) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
  ctx.lineCap = 'round'; ctx.lineWidth = lw; ctx.strokeStyle = col; ctx.stroke();
}

// ---- 타일셋 (32px, 도트 느낌) ----
function drawTiles(ctx) {
  const rnd = mulberry32(7);
  const speck = (ox, cols, n, w = 1, h = 1) => {
    for (let i = 0; i < n; i++) { ctx.fillStyle = cols[Math.floor(rnd() * cols.length)]; ctx.fillRect(ox + Math.floor(rnd() * 32), Math.floor(rnd() * 32), w, h); }
  };
  const base = (i, col) => { ctx.fillStyle = col; ctx.fillRect(i * 32, 0, 32, 32); };
  const grass = (i, col) => { base(i, col); speck(i * 32, ['#5f9c47', '#3f7530', '#68a84e'], 40, 1, 2); };

  grass(T.GRASS, '#4f8a3a');
  grass(T.GRASS2, '#46803a');
  grass(T.FLOWER, '#4f8a3a');
  for (let k = 0; k < 4; k++) {
    const x = T.FLOWER * 32 + 4 + Math.floor(rnd() * 24), y = 4 + Math.floor(rnd() * 24);
    ctx.fillStyle = ['#ffe45c', '#ff86c0', '#ffffff', '#9fd0ff'][k];
    ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3);
    ctx.fillStyle = '#c9862b'; ctx.fillRect(x, y, 1, 1);
  }
  base(T.PATH, '#b08a5a'); speck(T.PATH * 32, ['#9a7647', '#c49d6b', '#a78150'], 50, 2, 2);
  base(T.SAND, '#dcc68c'); speck(T.SAND * 32, ['#cbb57a', '#e8d6a2'], 45, 1, 1);
  base(T.WATER, '#2f6fb3');
  for (let k = 0; k < 6; k++) { ctx.fillStyle = k % 2 ? '#4a8fd1' : '#28609c'; ctx.fillRect(T.WATER * 32 + Math.floor(rnd() * 24), Math.floor(rnd() * 30), 6 + Math.floor(rnd() * 4), 1); }
  // 나무: 풀 바탕 + 줄기 + 겹친 수관
  grass(T.TREE, '#4f8a3a');
  { const o = T.TREE * 32;
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(o + 16, 27, 11, 4, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#5b3a1e'; ctx.fillRect(o + 14, 18, 4, 10);
    for (const [cx, cy, r, c] of [[16, 13, 11, '#1f5a2a'], [11, 15, 7, '#256b31'], [21, 15, 7, '#256b31'], [16, 10, 8, '#2f7d3a'], [13, 8, 3, '#45a052']]) {
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(o + cx, cy, r, 0, 7); ctx.fill();
    }
  }
  // 성벽: 벽돌
  base(T.WALL, '#4b4d58');
  { const o = T.WALL * 32; ctx.fillStyle = '#33343d';
    for (let r = 0; r < 4; r++) { ctx.fillRect(o, r * 8 + 7, 32, 1); for (let c = 0; c < 3; c++) ctx.fillRect(o + ((c * 12 + (r % 2) * 6) % 32), r * 8, 1, 8); }
    ctx.fillStyle = '#6a6c78'; for (let r = 0; r < 4; r++) ctx.fillRect(o, r * 8, 32, 1);
    ctx.fillStyle = '#7d808c'; ctx.fillRect(o, 0, 32, 3);                                // 성벽 윗면
    ctx.fillStyle = '#22232a'; ctx.fillRect(o, 30, 32, 2);
  }
  // 마을 바닥: 밝은 돌판
  base(T.FLOOR, '#b3ab98');
  { const o = T.FLOOR * 32; ctx.fillStyle = '#9a927f';
    ctx.fillRect(o, 15, 32, 1); ctx.fillRect(o + 15, 0, 1, 15); ctx.fillRect(o + 7, 16, 1, 16); ctx.fillRect(o + 24, 16, 1, 16);
    speck(o, ['#c2baa6', '#a59d8a'], 20, 2, 1);
  }
  // 폐허 바닥
  base(T.DFLOOR, '#3d3948');
  { const o = T.DFLOOR * 32; ctx.fillStyle = '#2c2935';
    ctx.fillRect(o, 0, 32, 1); ctx.fillRect(o, 16, 32, 1); ctx.fillRect(o, 0, 1, 32); ctx.fillRect(o + 16, 0, 1, 32);
    ctx.fillStyle = '#4a4558'; ctx.fillRect(o + 3, 5, 6, 1); ctx.fillRect(o + 20, 24, 7, 1);
    ctx.fillStyle = '#5a2f6e'; ctx.fillRect(o + 22, 6, 2, 2);
  }
  // 바위
  grass(T.ROCK, '#4f8a3a');
  { const o = T.ROCK * 32;
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(o + 16, 26, 12, 4, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#7b7d86'; ctx.beginPath(); ctx.ellipse(o + 16, 18, 12, 9, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#9a9ca6'; ctx.beginPath(); ctx.ellipse(o + 13, 15, 6, 4, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#5c5e67'; ctx.fillRect(o + 18, 20, 7, 2);
  }
  // 다리
  base(T.BRIDGE, '#2f6fb3');
  { const o = T.BRIDGE * 32;
    for (let k = 0; k < 4; k++) { ctx.fillStyle = k % 2 ? '#93622f' : '#8a5a2b'; ctx.fillRect(o, k * 8, 32, 7); ctx.fillStyle = '#5e3b1a'; ctx.fillRect(o, k * 8 + 7, 32, 1); }
    ctx.fillStyle = '#5e3b1a'; ctx.fillRect(o + 3, 0, 1, 32); ctx.fillRect(o + 28, 0, 1, 32);
  }
}

// ---- 캐릭터 (64px, 오른쪽을 바라봄) ----
function drawPlayer(ctx) {
  ell(ctx, 18, 38, 9, 11, '#8a5a2b'); ell(ctx, 18, 38, 4, 5, '#c9a24a', null);       // 등 뒤 방패
  rrect(ctx, 24, 44, 7, 14, 2, '#4a3324'); rrect(ctx, 34, 44, 7, 14, 2, '#4a3324');      // 다리
  rrect(ctx, 22, 54, 10, 6, 2, '#2d2018'); rrect(ctx, 33, 54, 10, 6, 2, '#2d2018');     // 부츠
  rrect(ctx, 20, 28, 26, 20, 6, '#3a6fd8');                                            // 튜닉
  ctx.fillStyle = '#27489a'; ctx.fillRect(22, 40, 22, 3);
  ctx.fillStyle = '#c9a24a'; ctx.fillRect(31, 39, 5, 5);                               // 벨트 버클
  line(ctx, 49, 8, 49, 38, OUT, 7); line(ctx, 49, 9, 49, 37, '#dfe4ee', 4);             // 검날
  line(ctx, 43, 38, 55, 38, '#c9a24a', 4);                                             // 가드
  ell(ctx, 48, 42, 4, 4, '#f2c39b');                                                   // 손
  ell(ctx, 33, 19, 11, 11, '#f2c39b');                                                 // 얼굴
  ctx.beginPath(); ctx.arc(33, 18, 12, Math.PI * 1.02, Math.PI * 1.98); ctx.closePath();
  ctx.fillStyle = '#9aa4b5'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();  // 투구
  poly(ctx, [30, 6, 34, 0, 37, 7], '#d8423a', OUT, 2);                                  // 깃털
  ell(ctx, 38, 20, 1.8, 2.4, OUT, null);                                               // 눈
}
function drawSlime(ctx) {
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(32, 56, 20, 5, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.moveTo(10, 52); ctx.quadraticCurveTo(10, 22, 32, 20); ctx.quadraticCurveTo(54, 22, 54, 52); ctx.closePath();
  ctx.fillStyle = '#54c25c'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
  ell(ctx, 24, 30, 6, 4, '#a6f0a0', null);
  ell(ctx, 38, 38, 3, 4, OUT, null); ell(ctx, 46, 38, 3, 4, OUT, null);
  ell(ctx, 39, 37, 1, 1.2, '#fff', null); ell(ctx, 47, 37, 1, 1.2, '#fff', null);
}
function drawWolf(ctx) {
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(32, 58, 22, 4, 0, 0, 7); ctx.fill();
  line(ctx, 10, 34, 2, 24, OUT, 7); line(ctx, 10, 34, 3, 25, '#7c7f88', 4);            // 꼬리
  for (const x of [16, 24, 38, 45]) { rrect(ctx, x, 40, 6, 17, 2, '#6b6e77'); }
  ell(ctx, 30, 38, 20, 10, '#8a8d96');
  ell(ctx, 48, 28, 10, 9, '#8a8d96');
  poly(ctx, [42, 22, 44, 10, 50, 20], '#6b6e77', OUT, 2.5); poly(ctx, [49, 20, 54, 9, 56, 22], '#6b6e77', OUT, 2.5);
  rrect(ctx, 52, 28, 11, 7, 3, '#a3a6ae');
  ell(ctx, 62, 30, 2, 2, OUT, null);
  ell(ctx, 50, 26, 2, 2, '#ffcc33', null);
}
function drawGoblin(ctx) {
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(32, 58, 16, 4, 0, 0, 7); ctx.fill();
  rrect(ctx, 24, 44, 6, 13, 2, '#5f8a3a'); rrect(ctx, 34, 44, 6, 13, 2, '#5f8a3a');
  poly(ctx, [20, 30, 44, 30, 47, 50, 17, 50], '#7a5230');                               // 누더기
  line(ctx, 46, 44, 56, 18, OUT, 9); line(ctx, 46, 44, 56, 19, '#8a5a2b', 6);           // 몽둥이
  ell(ctx, 56, 17, 6, 6, '#8a5a2b');
  ell(ctx, 46, 44, 4, 4, '#79b04a');
  poly(ctx, [20, 24, 8, 16, 22, 30], '#79b04a', OUT, 2.5); poly(ctx, [44, 24, 56, 18, 42, 30], '#79b04a', OUT, 2.5);  // 귀
  ell(ctx, 32, 26, 12, 11, '#79b04a');
  ell(ctx, 30, 25, 2.5, 2.5, '#ffdd33', null); ell(ctx, 38, 25, 2.5, 2.5, '#ffdd33', null);
  line(ctx, 30, 32, 38, 32, OUT, 2);
}
function drawSkeleton(ctx) {
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(32, 58, 16, 4, 0, 0, 7); ctx.fill();
  line(ctx, 28, 44, 26, 58, OUT, 6); line(ctx, 28, 44, 26, 58, '#e8e4d6', 3);
  line(ctx, 36, 44, 38, 58, OUT, 6); line(ctx, 36, 44, 38, 58, '#e8e4d6', 3);
  rrect(ctx, 23, 28, 18, 17, 4, '#3a3540');
  ctx.strokeStyle = '#e8e4d6'; ctx.lineWidth = 2;
  for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(26, 32 + k * 4); ctx.lineTo(38, 32 + k * 4); ctx.stroke(); }
  line(ctx, 32, 29, 32, 44, '#e8e4d6', 2);
  line(ctx, 46, 42, 58, 12, OUT, 7); line(ctx, 46, 42, 58, 13, '#9a8f7a', 4);          // 녹슨 검
  line(ctx, 42, 40, 50, 44, '#5a4a3a', 4);
  ell(ctx, 32, 18, 11, 11, '#efe9d8');
  ell(ctx, 28, 18, 3, 3.5, OUT, null); ell(ctx, 36, 18, 3, 3.5, OUT, null);
  ell(ctx, 28, 18, 1, 1, '#ff3b3b', null); ell(ctx, 36, 18, 1, 1, '#ff3b3b', null);
  ctx.fillStyle = OUT; for (let k = 0; k < 4; k++) ctx.fillRect(27 + k * 3, 25, 2, 3);
}
function drawLich(ctx) {    // 128px
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(64, 118, 40, 8, 0, 0, 7); ctx.fill();
  const g = ctx.createRadialGradient(64, 70, 10, 64, 70, 60); g.addColorStop(0, 'rgba(160,80,255,.35)'); g.addColorStop(1, 'rgba(160,80,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  poly(ctx, [40, 40, 88, 40, 104, 116, 24, 116], '#3b2357', OUT, 4);                    // 로브
  poly(ctx, [52, 50, 76, 50, 84, 116, 44, 116], '#55337d', null);
  ctx.fillStyle = '#c9a24a'; ctx.fillRect(44, 78, 40, 5);
  line(ctx, 100, 118, 108, 20, OUT, 9); line(ctx, 100, 117, 108, 21, '#5a4030', 5);     // 지팡이
  const og = ctx.createRadialGradient(108, 16, 2, 108, 16, 14); og.addColorStop(0, '#fff'); og.addColorStop(0.4, '#c58cff'); og.addColorStop(1, 'rgba(120,40,220,0)');
  ctx.fillStyle = og; ctx.beginPath(); ctx.arc(108, 16, 14, 0, 7); ctx.fill();
  ell(ctx, 98, 70, 6, 6, '#e8e1cf');                                                    // 손
  ell(ctx, 64, 32, 18, 18, '#e8e1cf', OUT, 4);                                          // 해골
  ell(ctx, 57, 32, 5, 6, OUT, null); ell(ctx, 71, 32, 5, 6, OUT, null);
  ell(ctx, 57, 32, 2, 2, '#b46bff', null); ell(ctx, 71, 32, 2, 2, '#b46bff', null);
  ctx.fillStyle = OUT; for (let k = 0; k < 5; k++) ctx.fillRect(55 + k * 4, 42, 2, 5);
  poly(ctx, [46, 18, 50, 2, 56, 14, 64, 0, 72, 14, 78, 2, 82, 18], '#e0b13a', OUT, 3);   // 왕관
}
function drawNpc(ctx, robe, trim, extra) {
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(32, 59, 16, 4, 0, 0, 7); ctx.fill();
  poly(ctx, [22, 28, 42, 28, 48, 58, 16, 58], robe);
  ctx.fillStyle = trim; ctx.fillRect(18, 52, 28, 4); ctx.fillRect(30, 30, 4, 24);
  ell(ctx, 32, 19, 11, 11, '#f2c39b');
  ell(ctx, 28, 19, 1.6, 2, OUT, null); ell(ctx, 36, 19, 1.6, 2, OUT, null);
  extra(ctx);
}

// ---- 아이템 아이콘 (UI용 dataURL) ----
function iconCanvas(draw) {
  const c = document.createElement('canvas'); c.width = c.height = 48;
  draw(c.getContext('2d')); return c.toDataURL();
}
const ICON_DRAW = {
  weapon: ctx => { line(ctx, 10, 38, 36, 12, OUT, 8); line(ctx, 12, 36, 36, 12, '#dfe4ee', 4); line(ctx, 8, 30, 18, 40, '#c9a24a', 5); },
  staff: ctx => { line(ctx, 10, 40, 34, 14, OUT, 7); line(ctx, 10, 40, 34, 14, '#8a5a2b', 4); ell(ctx, 36, 12, 7, 7, '#7fc8ff'); },
  helm: ctx => { ctx.beginPath(); ctx.arc(24, 28, 15, Math.PI, 0); ctx.lineTo(39, 34); ctx.lineTo(9, 34); ctx.closePath(); ctx.fillStyle = '#9aa4b5'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke(); ctx.fillStyle = OUT; ctx.fillRect(22, 18, 4, 16); },
  armor: ctx => { poly(ctx, [12, 12, 20, 8, 28, 8, 36, 12, 38, 40, 10, 40], '#8a5a2b'); ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.fillRect(16, 16, 16, 4); },
  ring: ctx => { ell(ctx, 24, 28, 11, 11, null, OUT, 7); ell(ctx, 24, 28, 11, 11, null, '#e0b13a', 4); ell(ctx, 24, 15, 5, 5, '#ff4f7a'); },
  hp: ctx => { rrect(ctx, 19, 6, 10, 8, 2, '#c9a77a'); ell(ctx, 24, 30, 13, 13, '#e0344a'); ell(ctx, 19, 25, 3, 4, '#ff9aa6', null); },
  mp: ctx => { rrect(ctx, 19, 6, 10, 8, 2, '#c9a77a'); ell(ctx, 24, 30, 13, 13, '#3a6fe0'); ell(ctx, 19, 25, 3, 4, '#9ac0ff', null); },
};
const ICONS = {};
function itemIconKey(it) {
  if (it.slot === 'weapon') return ITEM_BASES[it.base].int ? 'staff' : 'weapon';
  return it.slot;
}

function makeTextures(scene) {
  canvasTex(scene, 'tiles', TILE * TILE_COUNT, TILE, drawTiles);
  canvasTex(scene, 'player', 64, 64, drawPlayer);
  canvasTex(scene, 'mon_slime', 64, 64, drawSlime);
  canvasTex(scene, 'mon_wolf', 64, 64, drawWolf);
  canvasTex(scene, 'mon_goblin', 64, 64, drawGoblin);
  canvasTex(scene, 'mon_skeleton', 64, 64, drawSkeleton);
  canvasTex(scene, 'mon_lich', 128, 128, drawLich);
  canvasTex(scene, 'npc_elder', 64, 64, c => drawNpc(c, '#5b3a8c', '#c9a24a', ctx => {
    poly(ctx, [24, 22, 40, 22, 36, 38, 28, 38], '#f4f1ea', OUT, 2);                      // 수염
    line(ctx, 50, 58, 50, 14, OUT, 6); line(ctx, 50, 57, 50, 15, '#8a5a2b', 3); ell(ctx, 50, 12, 4, 4, '#7fc8ff');
  }));
  canvasTex(scene, 'npc_merchant', 64, 64, c => drawNpc(c, '#8a5a2b', '#e0b13a', ctx => {
    ell(ctx, 46, 44, 8, 8, '#c9a77a'); ctx.fillStyle = '#e0b13a'; ctx.fillRect(44, 42, 4, 4);  // 돈주머니
    ctx.beginPath(); ctx.arc(32, 14, 12, Math.PI, 0); ctx.fillStyle = '#2f7d3a'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
  }));
  canvasTex(scene, 'npc_healer', 64, 64, c => drawNpc(c, '#eeeae0', '#d8423a', ctx => {
    ctx.fillStyle = '#d8423a'; ctx.fillRect(28, 36, 8, 3); ctx.fillRect(30.5, 33, 3, 9);
    ctx.beginPath(); ctx.arc(32, 15, 12, Math.PI, 0); ctx.fillStyle = '#e8c35a'; ctx.fill();
  }));
  // 그림자, 드롭, 이펙트
  canvasTex(scene, 'drop_gold', 32, 32, ctx => {
    for (const [x, y] of [[10, 20], [20, 21], [15, 14]]) { ell(ctx, x, y, 6, 4, '#ffd43a', '#8a6a10', 2); ell(ctx, x - 1, y - 1, 2, 1, '#fff6b0', null); }
  });
  canvasTex(scene, 'drop_hp', 32, 32, ctx => { ctx.scale(0.66, 0.66); ICON_DRAW.hp(ctx); });
  canvasTex(scene, 'drop_mp', 32, 32, ctx => { ctx.scale(0.66, 0.66); ICON_DRAW.mp(ctx); });
  canvasTex(scene, 'drop_gear', 32, 32, ctx => { rrect(ctx, 6, 10, 20, 16, 4, '#8a5a2b', OUT, 2); ctx.fillStyle = '#c9a24a'; ctx.fillRect(14, 14, 4, 6); });
  canvasTex(scene, 'fireball', 32, 32, ctx => {
    const g = ctx.createRadialGradient(16, 16, 1, 16, 16, 15); g.addColorStop(0, '#fffbe0'); g.addColorStop(0.35, '#ffb630'); g.addColorStop(0.7, '#ff4a1a'); g.addColorStop(1, 'rgba(255,60,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(16, 16, 15, 0, 7); ctx.fill();
  });
  canvasTex(scene, 'bolt', 32, 32, ctx => {
    const g = ctx.createRadialGradient(16, 16, 1, 16, 16, 14); g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, '#c58cff'); g.addColorStop(1, 'rgba(110,30,200,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(16, 16, 14, 0, 7); ctx.fill();
  });
  canvasTex(scene, 'slash', 96, 96, ctx => {
    ctx.beginPath(); ctx.arc(48, 48, 40, -1.1, 1.1); ctx.arc(48, 48, 26, 1.1, -1.1, true); ctx.closePath();
    const g = ctx.createLinearGradient(48, 0, 96, 48); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,.95)');
    ctx.fillStyle = g; ctx.fill();
  });
  canvasTex(scene, 'ring', 128, 128, ctx => { ell(ctx, 64, 64, 58, 58, null, 'rgba(255,255,255,.9)', 6); ell(ctx, 64, 64, 50, 50, null, 'rgba(140,200,255,.5)', 4); });
  canvasTex(scene, 'spark', 8, 8, ctx => { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(4, 4, 3, 0, 7); ctx.fill(); });
  for (const k in ICON_DRAW) ICONS[k] = iconCanvas(ICON_DRAW[k]);
}
