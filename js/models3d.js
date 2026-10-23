// ---------------------------------------------------------------------
// 3D characters: procedural Three.js models (articulated rigs with PBR
// materials) pre-rendered into 8-direction animated sprite atlases,
// like the pre-rendered 3D sprites of classic isometric MMOs.
// Falls back to the 2D vector renderer when WebGL/Three.js is missing.
// ---------------------------------------------------------------------
const M3 = {
  ready: false, atlases: new Map(), mats: new Map(), tex: {},
  PPU: 46,            // pixels per 3D unit
  FRAMES: 12,         // 0 idle, 1-6 walk, 7-11 attack
  init() {
    if (!window.THREE) return;
    // treat hex colors as sRGB (otherwise they render washed out with sRGB output)
    if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;
    try {
      const R = this.R = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
      R.setPixelRatio(1); R.setClearColor(0x000000, 0);
      R.outputEncoding = THREE.sRGBEncoding; R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.0;
    } catch (e) { return; }
    const S = this.scene = new THREE.Scene();
    S.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a2e20, 0.55));
    const key = new THREE.DirectionalLight(0xfff0dc, 2.4); key.position.set(-3, 6, 2.5); S.add(key);
    const rim = new THREE.DirectionalLight(0x9fc4ff, 1.6); rim.position.set(2.5, 3, -4); S.add(rim);
    const fill = new THREE.DirectionalLight(0xffd8a8, 0.3); fill.position.set(4, 1.5, 4); S.add(fill);
    // environment map for metallic reflections (sky gradient + bright panels)
    {
      const c = document.createElement('canvas'); c.width = 16; c.height = 256; const g = c.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 0, 256);
      gr.addColorStop(0, '#9ab8e8'); gr.addColorStop(0.45, '#f0e8d8'); gr.addColorStop(0.55, '#7a6a50'); gr.addColorStop(1, '#201810');
      g.fillStyle = gr; g.fillRect(0, 0, 16, 256);
      const env = new THREE.Scene();
      const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
      env.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide })));
      for (const [x, y, z] of [[-6, 5, 3], [5, 6, -4], [0, 8, 6]]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })); p.position.set(x, y, z); p.lookAt(0, 0, 0); env.add(p); }
      const pm = new THREE.PMREMGenerator(this.R);
      S.environment = pm.fromScene(env, 0.03).texture;
    }
    const d = new THREE.Vector3(1, Math.tan(30 * Math.PI / 180) * Math.SQRT2, 1).normalize();
    this.camDir = d;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    ['metal', 'cloth', 'grain', 'scales', 'rock'].forEach(k => {
      const t = new THREE.CanvasTexture(TEX[k]); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2); this.tex[k] = t;
    });
    this.ready = true;
  },
  mat(color, o = {}) {
    const k = color + JSON.stringify(o);
    if (this.mats.has(k)) return this.mats.get(k);
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color), roughness: o.rough != null ? o.rough : 0.75, metalness: o.metal || 0,
      envMapIntensity: o.metal ? 1.0 : 0.25, flatShading: !!o.flat
    });
    if (o.bump) { m.bumpMap = this.tex[o.bump]; m.bumpScale = o.bs || 0.015; }
    if (o.emissive) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = o.ei || 1; }
    if (o.opacity != null) { m.transparent = true; m.opacity = o.opacity; m.depthWrite = o.opacity > 0.8; }
    if (o.double) m.side = THREE.DoubleSide;
    this.mats.set(k, m);
    return m;
  },

  // ---------------------------------------------------------- atlas
  atlas(key, buildFn) {
    let a = this.atlases.get(key);
    if (a) { this.atlases.delete(key); this.atlases.set(key, a); return a; }
    a = this.render(buildFn());
    this.atlases.set(key, a);
    if (this.atlases.size > 40) this.atlases.delete(this.atlases.keys().next().value);
    return a;
  },
  render(model) {
    const { root, pose, size } = model;
    const m = size || 1;
    const FW = Math.round(100 * m * (model.wide || 1)), FH = Math.round(118 * m * (model.tall || 1)), foot = Math.round(14 * m);
    const R = this.R, cam = this.cam, P = this.PPU;
    R.setSize(FW, FH, false);
    cam.left = -FW / 2 / P; cam.right = FW / 2 / P; cam.top = (FH - foot) / P; cam.bottom = -foot / P; cam.updateProjectionMatrix();
    cam.position.copy(this.camDir).multiplyScalar(30); cam.lookAt(0, 0, 0);
    // the lookAt target sits at the feet; shift the frustum so feet land at (FW/2, FH-foot)
    const can = document.createElement('canvas'); can.width = FW * this.FRAMES; can.height = FH * 8;
    const g = can.getContext('2d');
    this.scene.add(root);
    for (let d = 0; d < 8; d++) {
      root.rotation.y = Math.PI / 2 - d * Math.PI / 4;
      for (let f = 0; f < this.FRAMES; f++) {
        const mode = f === 0 ? 'idle' : f <= 6 ? 'walk' : 'attack';
        const p = f === 0 ? 0.25 : f <= 6 ? (f - 1) / 6 : (f - 7) / 5;
        pose(mode, p);
        R.render(this.scene, cam);
        g.drawImage(R.domElement, f * FW, d * FH);
      }
    }
    this.scene.remove(root);
    root.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    return { can, FW, FH, ax: FW / 2, ay: FH - foot };
  },
  frameFor(anim) {
    if (anim.atk > 0) return 7 + Math.min(4, Math.floor((1 - anim.atk) * 5));
    if (anim.moving) return 1 + ((Math.floor(anim.walk / (Math.PI * 2) * 6) % 6) + 6) % 6;
    return 0;
  },
  dirFor(ang) { return ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8; }
};

// ---------------------------------------------------------------------
// geometry helpers
// ---------------------------------------------------------------------
const V2 = (x, y) => new THREE.Vector2(x, y);
function mk(geo, mat, x = 0, y = 0, z = 0, parent) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (parent) parent.add(m); return m; }
function grp(parent, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); if (parent) parent.add(g); return g; }
const capsule = (r, len, seg = 10) => new THREE.CapsuleGeometry(r, len, 4, seg);
const sphere = (r, w = 18, h = 14) => new THREE.SphereGeometry(r, w, h);
function lathe(pts, seg = 20) { return new THREE.LatheGeometry(pts.map(p => V2(p[0], p[1])), seg); }

function weaponMesh(kind, col, glow) {
  const g = new THREE.Group();
  const steel = M3.mat(col || '#d8dce8', { metal: 0.95, rough: 0.25, emissive: glow || null, ei: glow ? 0.45 : 0 });
  const wood = M3.mat('#5a3a1e', { rough: 0.8, bump: 'grain' }), gold = M3.mat('#d8a840', { metal: 1, rough: 0.3 });
  switch (kind) {
    case 'sword': case 'dagger': {
      const len = kind === 'dagger' ? 0.32 : 0.78;
      const bladeShape = new THREE.Shape(); bladeShape.moveTo(-0.035, 0); bladeShape.lineTo(0.035, 0); bladeShape.lineTo(0.028, len * 0.85); bladeShape.lineTo(0, len); bladeShape.lineTo(-0.028, len * 0.85); bladeShape.closePath();
      const bg = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1 });
      bg.translate(0, 0.06, -0.006);
      mk(bg, steel, 0, 0, 0, g);
      mk(new THREE.BoxGeometry(0.2, 0.03, 0.04), gold, 0, 0.055, 0, g);
      mk(new THREE.CylinderGeometry(0.018, 0.02, 0.13, 8), M3.mat('#3a2414', { rough: 0.9 }), 0, -0.02, 0, g);
      mk(sphere(0.03, 10, 8), gold, 0, -0.095, 0, g);
      break;
    }
    case 'axe': case 'club': {
      mk(new THREE.CylinderGeometry(0.022, 0.026, 0.8, 8), wood, 0, 0.25, 0, g);
      if (kind === 'axe') {
        const s = new THREE.Shape(); s.moveTo(0, 0); s.quadraticCurveTo(0.3, 0.02, 0.28, 0.24); s.quadraticCurveTo(0.12, 0.14, 0, 0.16); s.closePath();
        const ag = new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.01, bevelSegments: 1 });
        ag.translate(0.01, 0.42, -0.01);
        mk(ag, steel, 0, 0, 0, g);
      } else {
        const c = mk(new THREE.CylinderGeometry(0.09, 0.05, 0.32, 9), M3.mat('#6a4a2a', { rough: 0.95, bump: 'grain', bs: 0.03 }), 0, 0.6, 0, g);
        for (let i = 0; i < 6; i++) { const sp = mk(new THREE.ConeGeometry(0.02, 0.07, 5), M3.mat('#9a9aa0', { metal: 0.7, rough: 0.4 }), Math.cos(i) * 0.08, 0.62 + (i % 2) * 0.08, Math.sin(i) * 0.08, g); sp.rotation.z = -Math.cos(i) * 1.4; sp.rotation.x = Math.sin(i) * 1.4; }
      }
      break;
    }
    case 'spear': case 'trident': {
      mk(new THREE.CylinderGeometry(0.018, 0.02, 1.5, 8), wood, 0, 0.45, 0, g);
      const tips = kind === 'trident' ? [-0.07, 0, 0.07] : [0];
      tips.forEach(x => mk(new THREE.ConeGeometry(0.03, 0.18, 6), steel, x, 1.28, 0, g));
      if (kind === 'trident') mk(new THREE.BoxGeometry(0.17, 0.025, 0.025), steel, 0, 1.19, 0, g);
      break;
    }
    case 'staff': {
      mk(new THREE.CylinderGeometry(0.02, 0.025, 1.35, 8), wood, 0, 0.3, 0, g);
      const orb = glow || col || '#88b8ff';
      mk(sphere(0.07), M3.mat(orb, { emissive: orb, ei: 1.6, rough: 0.2 }), 0, 1.04, 0, g);
      const ring = mk(new THREE.TorusGeometry(0.085, 0.012, 6, 18), gold, 0, 1.04, 0, g); ring.rotation.x = Math.PI / 2;
      for (let i = 0; i < 3; i++) { const p = mk(new THREE.ConeGeometry(0.015, 0.12, 5), gold, Math.cos(i * 2.1) * 0.06, 0.96, Math.sin(i * 2.1) * 0.06, g); p.rotation.z = Math.cos(i * 2.1) * 0.5; p.rotation.x = -Math.sin(i * 2.1) * 0.5; }
      break;
    }
    case 'bow': {
      const arc = mk(new THREE.TorusGeometry(0.42, 0.018, 6, 24, Math.PI * 0.78), M3.mat(col || '#7a4a22', { rough: 0.6, bump: 'grain' }), 0, 0, 0, g);
      arc.rotation.z = Math.PI / 2 + Math.PI * 0.11; arc.position.z = -0.32; arc.rotation.y = Math.PI / 2;
      const top = new THREE.Vector3(0, Math.sin(Math.PI * 0.39) * 0.42, -0.32 + Math.cos(Math.PI * 0.39) * 0.42);
      const str = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, top.y, top.z), new THREE.Vector3(0, -top.y, top.z)]);
      g.add(new THREE.Line(str, new THREE.LineBasicMaterial({ color: 0xeeeeee })));
      break;
    }
  }
  return g;
}

function wingMesh(kind, c1, c2, tier, side) {
  const s = new THREE.Shape(), k = tier > 1 ? 1.2 : 1;
  if (kind === 'bat') {
    s.moveTo(0, 0); s.lineTo(0.25 * k, 0.55 * k); s.lineTo(0.85 * k, 0.6 * k);
    s.quadraticCurveTo(0.7 * k, 0.35 * k, 0.78 * k, 0.12 * k); s.quadraticCurveTo(0.58 * k, 0.18 * k, 0.52 * k, -0.08 * k);
    s.quadraticCurveTo(0.36 * k, 0.02 * k, 0.26 * k, -0.2 * k); s.lineTo(0.02, -0.1);
  } else {
    s.moveTo(0, 0); s.quadraticCurveTo(0.45 * k, 0.75 * k, 0.95 * k, 0.55 * k);
    for (let i = 0; i < 5; i++) s.quadraticCurveTo((0.88 - i * 0.16) * k, (0.32 - i * 0.12) * k, (0.8 - i * 0.17) * k, (0.2 - i * 0.12) * k);
    s.lineTo(0.02, -0.1);
  }
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.015, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 1 });
  // vertex colors: gradient from root color to tip color
  const pos = geo.attributes.position, cols = [], A = new THREE.Color(c1), B = new THREE.Color(c2);
  for (let i = 0; i < pos.count; i++) { const t = clamp(Math.hypot(pos.getX(i), pos.getY(i)) / (0.95 * k), 0, 1); const c = A.clone().lerp(B, t); cols.push(c.r, c.g, c.b); }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: kind === 'bat' ? 0.55 : 0.45, metalness: tier > 1 ? 0.35 : 0.1, side: THREE.DoubleSide, envMapIntensity: 0.8 });
  if (tier > 1) { mat.emissive = new THREE.Color(c2); mat.emissiveIntensity = 0.35; }
  const m = new THREE.Mesh(geo, mat);
  m.scale.x = side;
  return m;
}

// ---------------------------------------------------------------------
// Humanoid rig (player, NPCs, humanoid monsters)
// ---------------------------------------------------------------------
function buildHuman(L) {
  const sc = L.scale || 1, root = new THREE.Group(), body = grp(root);
  body.scale.setScalar(sc);
  const big = L.furry || L.rocky ? 1.25 : L.goblin ? 0.9 : 1;
  const matKind = L.rocky ? 'rock' : L.scaly ? 'scales' : L.furry ? 'grain' : L.material || (L.armored ? 'metal' : 'cloth');
  const isMetal = matKind === 'metal';
  const skinC = L.skin || (L.bones ? '#e8e0c8' : L.goblin ? '#6a9a3a' : L.c2 || '#e0c0a0');
  const skin = M3.mat(skinC, { rough: L.bones ? 0.7 : 0.6, bump: L.rocky ? 'rock' : L.scaly ? 'scales' : L.furry ? 'grain' : null, bs: 0.03, flat: !!L.rocky, emissive: L.icy ? '#4a7aa0' : null, ei: 0.4 });
  const bodyC = L.body || L.c1 || '#555';
  const bodyM = M3.mat(bodyC, { metal: isMetal ? 0.85 : 0, rough: isMetal ? 0.35 : matKind === 'cloth' ? 0.85 : 0.7, bump: matKind, bs: isMetal ? 0.008 : 0.02, flat: !!L.rocky });
  const legM = M3.mat(L.legs || shade(bodyC, -0.25), { metal: isMetal ? 0.7 : 0, rough: isMetal ? 0.4 : 0.85, bump: matKind === 'metal' ? 'metal' : 'cloth', bs: 0.015 });
  const armM = M3.mat(L.arms || bodyC, { metal: isMetal ? 0.8 : 0, rough: isMetal ? 0.4 : 0.85, bump: matKind, bs: 0.015 });
  const handM = M3.mat(L.hands || skinC, { metal: L.hands && isMetal ? 0.8 : 0, rough: 0.55 });
  const footM = M3.mat(L.feet || shade(bodyC, -0.45), { metal: L.feet && isMetal ? 0.7 : 0, rough: 0.5 });
  const trimM = M3.mat(L.trim || L.c2 || '#c8a040', { metal: 0.9, rough: 0.3 });

  const hips = grp(body, 0, 0.92, 0);
  mk(sphere(0.15), legM, 0, 0, 0, hips).scale.set(1.15 * big, 0.75, 0.85);
  const spine = grp(hips, 0, 0.04, 0);
  const torso = mk(lathe([[0.001, 0], [0.15, 0.0], [0.17, 0.12], [0.21, 0.34], [0.2, 0.46], [0.12, 0.54], [0.06, 0.57], [0.001, 0.57]], 22), bodyM, 0, 0, 0, spine);
  torso.scale.set(big, 1, 0.68 * big);
  if (L.armored || L.trim) {
    const belt = mk(new THREE.TorusGeometry(0.16, 0.025, 8, 24), trimM, 0, 0.06, 0, spine); belt.rotation.x = Math.PI / 2; belt.scale.set(big, 0.7 * big, 1);
    mk(new THREE.BoxGeometry(0.06, 0.3, 0.03), trimM, 0, 0.3, 0.14 * big, spine);
  }
  if (L.bones) for (let i = 0; i < 4; i++) { const rib = mk(new THREE.TorusGeometry(0.16 - i * 0.01, 0.012, 6, 18, Math.PI), skin, 0, 0.2 + i * 0.07, 0, spine); rib.rotation.y = Math.PI / 2 * 0; rib.scale.z = 0.7; }
  if (L.leafy) for (let i = 0; i < 9; i++) { const lf = mk(sphere(0.07, 8, 6), M3.mat('#3e7a24', { rough: 0.8 }), Math.cos(i) * 0.18, 0.42 + (i % 3) * 0.05, Math.sin(i) * 0.12, spine); lf.scale.set(1, 0.5, 1.4); }
  if (L.furry) for (let i = 0; i < 8; i++) mk(sphere(0.07, 8, 6), M3.mat(shade(bodyC, 0.15), { rough: 1, bump: 'grain', bs: 0.04 }), Math.cos(i * 0.8) * 0.17, 0.08 + (i % 2) * 0.05, Math.sin(i * 0.8) * 0.11, spine);
  // robe skirt
  if (L.robe) {
    const robe = mk(lathe([[0.17, 0.0], [0.2, -0.25], [0.27, -0.6], [0.33, -0.86], [0.001, -0.86]], 24), M3.mat(bodyC, { rough: 0.9, bump: 'cloth', bs: 0.02 }), 0, 0.1, 0, hips);
    robe.scale.z = 0.8;
    mk(new THREE.BoxGeometry(0.05, 0.9, 0.02), trimM, 0, -0.3, 0.2, hips);
  }
  // head
  const neck = grp(spine, 0, 0.56, 0);
  mk(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 10), skin, 0, 0.02, 0, neck);
  const head = grp(neck, 0, 0.14, 0);
  const hs = L.furry ? 1.2 : L.goblin ? 1.05 : 1;
  mk(sphere(0.115 * hs), skin, 0, 0, 0, head).scale.set(1, 1.1, 1.02);
  if (L.cyclops) {
    mk(sphere(0.05), M3.mat('#ffffff', { rough: 0.2 }), 0, 0.02, 0.095, head);
    mk(sphere(0.024), M3.mat('#c00000', { emissive: '#600', ei: 1 }), 0, 0.02, 0.135, head);
  } else {
    const eyeC = L.eye || (L.bones || L.glow ? (L.glow || '#ff3030') : '#1a1410');
    const eyeM = M3.mat(eyeC, { emissive: L.bones || L.glow ? eyeC : null, ei: 2, rough: 0.3 });
    [-0.042, 0.042].forEach(x => {
      if (!L.bones && !L.glow) mk(sphere(0.022, 8, 6), M3.mat('#f4f0ea', { rough: 0.3 }), x, 0.012, 0.094 * hs, head);
      mk(sphere(0.014, 8, 6), eyeM, x, 0.012, 0.108 * hs, head);
      if (!L.bones) mk(new THREE.BoxGeometry(0.045, 0.01, 0.015), M3.mat(L.hair || shade(skinC, -0.5), { rough: 0.8 }), x, 0.045, 0.105 * hs, head).rotation.z = x > 0 ? -0.15 : 0.15;
    });
    mk(new THREE.ConeGeometry(0.02, 0.055, 6), skin, 0, -0.02, 0.118 * hs, head).rotation.x = Math.PI / 2;
    mk(new THREE.BoxGeometry(0.04, 0.008, 0.01), M3.mat(shade(skinC, -0.45), { rough: 0.8 }), 0, -0.06, 0.106 * hs, head);
    if (L.bones) mk(new THREE.BoxGeometry(0.07, 0.03, 0.02), M3.mat('#1a1410'), 0, -0.065, 0.1, head);
  }
  if (L.goblin) [-1, 1].forEach(s => { const e = mk(new THREE.ConeGeometry(0.035, 0.16, 6), skin, s * 0.12, 0.03, 0, head); e.rotation.z = -s * 1.2; });
  if (L.hair && !L.helm) {
    // hair cap tilted back so the face stays visible, plus a fringe
    const hm = M3.mat(L.hair, { rough: 0.55, bump: 'grain', bs: 0.02 });
    const hair = mk(new THREE.SphereGeometry(0.125, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), hm, 0, 0.012, -0.02, head);
    hair.scale.set(1.06, 1.12, 1.1); hair.rotation.x = -0.75;
    const fr = mk(new THREE.SphereGeometry(0.122, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.3), hm, 0, 0.03, 0.0, head); fr.scale.set(1.05, 1.1, 1.08);
    if (L.longHair) { const lh = mk(capsule(0.08, 0.28), M3.mat(L.hair, { rough: 0.55, bump: 'grain' }), 0, -0.17, -0.08, head); lh.scale.z = 0.6; }
  }
  if (L.hood) { const hd = mk(new THREE.SphereGeometry(0.15, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.65), M3.mat(L.c1, { rough: 0.95, bump: 'cloth' }), 0, 0.015, -0.02, head); hd.scale.set(1, 1.1, 1.1); }
  if (L.helm) {
    const hm = M3.mat(L.helm, { metal: 0.9, rough: 0.3, bump: 'metal', bs: 0.006 });
    const h = mk(new THREE.SphereGeometry(0.135, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), hm, 0, 0.01, 0, head); h.scale.set(1, 1.1, 1.08);
    [-1, 1].forEach(s => mk(new THREE.BoxGeometry(0.03, 0.1, 0.1), hm, s * 0.115, -0.05, 0.02, head));
    if (L.helmTrim) mk(new THREE.BoxGeometry(0.025, 0.07, 0.24), M3.mat(L.helmTrim, { metal: 0.9, rough: 0.3 }), 0, 0.15, 0, head);
  }
  if (L.horns) [-1, 1].forEach(s => { const hn = mk(new THREE.ConeGeometry(0.035, 0.22, 8), M3.mat('#e8dcc0', { rough: 0.4 }), s * 0.1, 0.12, 0, head); hn.rotation.z = -s * 0.7; });
  if (L.crown) { const cm = M3.mat('#ffd040', { metal: 1, rough: 0.25 }); mk(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 16, 1, true), cm, 0, 0.1, 0, head); for (let i = 0; i < 6; i++) mk(new THREE.ConeGeometry(0.02, 0.07, 5), cm, Math.cos(i * 1.047) * 0.12, 0.15, Math.sin(i * 1.047) * 0.12, head); }

  // arms (left = +X since the model faces +Z)
  // collar + tunic skirt hide the joints and read as clothing
  mk(new THREE.TorusGeometry(0.075, 0.03, 8, 18), armM, 0, 0.53, 0, spine).rotation.x = Math.PI / 2;
  if (!L.robe && !L.bones && !L.rocky && !L.furry) {
    const sk = mk(lathe([[0.16, 0.04], [0.19, -0.08], [0.23, -0.24], [0.001, -0.24]], 22), M3.mat(shade(bodyC, -0.12), { rough: 0.85, bump: isMetal ? 'metal' : 'cloth', bs: 0.015, metal: isMetal ? 0.6 : 0 }), 0, 0.02, 0, hips);
    sk.scale.set(big, 1, 0.8 * big);
  }
  const arm = side => {
    const sh = grp(spine, side * 0.235 * big, 0.46, 0);
    mk(sphere(0.07 * big, 12, 10), armM, 0, -0.01, 0, sh);
    mk(capsule(0.062 * big, 0.19), armM, 0, -0.13, 0, sh);
    if (L.armored) {
      const pm = isMetal ? M3.mat(bodyC, { metal: 0.9, rough: 0.3, bump: 'metal', bs: 0.006 }) : M3.mat(shade(bodyC, 0.08), { rough: 0.65, bump: 'grain', bs: 0.02 });
      mk(new THREE.SphereGeometry(0.105 * big, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), pm, side * 0.015, 0.0, 0, sh).scale.set(1.15, 0.85, 1.05);
      mk(new THREE.SphereGeometry(0.11 * big, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), pm, side * 0.02, -0.04, 0, sh).scale.set(1.1, 0.6, 1);
    }
    const el = grp(sh, 0, -0.27, 0);
    mk(sphere(0.056 * big, 10, 8), armM, 0, 0, 0, el);
    mk(capsule(0.055 * big, 0.17), L.hands ? handM : armM, 0, -0.12, 0, el);
    if (L.hands) mk(new THREE.CylinderGeometry(0.068 * big, 0.06 * big, 0.08, 12), handM, 0, -0.17, 0, el);
    const hand = grp(el, 0, -0.27, 0);
    mk(sphere(0.05 * big, 10, 8), handM, 0, 0, 0, hand).scale.set(1, 1.1, 0.8);
    return { sh, el, hand };
  };
  const aL = arm(1), aR = arm(-1);
  // legs
  const leg = side => {
    const th = grp(hips, side * 0.09 * big, -0.02, 0);
    mk(capsule(0.085 * big, 0.26), legM, 0, -0.2, 0, th);
    const kn = grp(th, 0, -0.42, 0);
    mk(sphere(0.07 * big, 10, 8), L.feet ? footM : legM, 0, 0, 0.01, kn);
    mk(capsule(0.068 * big, 0.27), L.feet ? footM : legM, 0, -0.2, 0, kn);
    if (L.feet) mk(new THREE.CylinderGeometry(0.085 * big, 0.075 * big, 0.06, 12), footM, 0, -0.08, 0, kn);
    const ft = mk(capsule(0.055 * big, 0.12), footM, 0, -0.42, 0.05, kn); ft.rotation.x = Math.PI / 2; ft.scale.set(1.1, 1, 0.75);
    return { th, kn };
  };
  const lL = leg(1), lR = leg(-1);
  if (L.robe) { [lL, lR].forEach(l => l.th.children[0].visible = false); }
  // weapon / shield / bow
  const W = L.weapon;
  let wpn = null;
  if (W && W !== 'bow') {
    wpn = weaponMesh(W, L.weaponColor, L.weaponGlow); aR.hand.add(wpn);
    if (W === 'staff' || W === 'spear' || W === 'trident') wpn.position.y = -0.3;
    else wpn.rotation.x = 1.25;
  }
  if (W === 'bow') { wpn = weaponMesh('bow', L.weaponColor); aL.hand.add(wpn); wpn.position.z = 0.3; }
  if (L.shield) {
    const s = new THREE.Shape(); s.moveTo(-0.15, 0.17); s.lineTo(0.15, 0.17); s.lineTo(0.15, -0.02); s.quadraticCurveTo(0.12, -0.2, 0, -0.27); s.quadraticCurveTo(-0.12, -0.2, -0.15, -0.02); s.closePath();
    const sg = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.02, bevelSegments: 2 });
    const sm = mk(sg, M3.mat(L.shield, { metal: 0.6, rough: 0.45, bump: 'metal', bs: 0.01 }), 0.075, -0.13, 0.02, aL.el);
    sm.rotation.y = Math.PI / 2 - 0.25; sm.scale.setScalar(0.72);
    const boss = mk(sphere(0.05, 12, 8), M3.mat(L.shieldTrim || '#ccc', { metal: 1, rough: 0.25 }), 0, 0, 0.06, sm); boss.scale.z = 0.5;
    const rim = mk(new THREE.TorusGeometry(0.02, 0.01, 4, 8), M3.mat(L.shieldTrim || '#ccc', { metal: 1, rough: 0.3 }), 0, 0, 0, sm); rim.visible = false;
  }
  // wings
  const wings = [];
  const wk = L.wingsKind || (L.wings ? (L.horns ? 'bat' : 'feather') : null);
  if (wk) {
    const c1 = L.wing1 || L.c2, c2 = L.wing2 || L.c1, tier = L.wingTier || 1;
    [1, -1].forEach(side => {
      const pv = grp(spine, side * 0.06, 0.4, -0.13);
      const w = wingMesh(wk, c1, c2, tier, side); pv.add(w);
      w.rotation.x = -0.1;
      wings.push({ pv, side });
    });
  }
  const pose = (mode, p) => {
    const T = Math.PI * 2;
    // reset
    [aL, aR].forEach(a => { a.sh.rotation.set(0, 0, 0); a.el.rotation.set(0, 0, 0); });
    [lL, lR].forEach(l => { l.th.rotation.set(0, 0, 0); l.kn.rotation.set(0, 0, 0); });
    spine.rotation.set(0, 0, 0); hips.position.y = 0.92; head.rotation.set(0, 0, 0);
    aL.sh.rotation.z = 0.1; aR.sh.rotation.z = -0.1; aL.el.rotation.x = -0.2; aR.el.rotation.x = -0.25;
    if (W === 'bow') { aL.sh.rotation.x = -0.5; aL.el.rotation.x = -0.4; }
    if (L.shield) { aL.el.rotation.x = -1.2; aL.sh.rotation.x = -0.2; }
    if (W === 'staff') { aR.sh.rotation.x = -0.3; aR.el.rotation.x = -0.8; }
    if (mode === 'idle') {
      spine.rotation.x = 0.02; aR.sh.rotation.x += 0.05;
    } else if (mode === 'walk') {
      const s = Math.sin(p * T), c = Math.cos(p * T);
      lL.th.rotation.x = -s * 0.6; lR.th.rotation.x = s * 0.6;
      lL.kn.rotation.x = 0.1 + Math.max(0, c) * 0.75; lR.kn.rotation.x = 0.1 + Math.max(0, -c) * 0.75;
      if (!L.shield && W !== 'bow') aL.sh.rotation.x = s * 0.5;
      if (W !== 'staff') aR.sh.rotation.x = -s * 0.5;
      hips.position.y = 0.92 - Math.abs(c) * 0.035; spine.rotation.y = s * 0.08; spine.rotation.x = 0.06;
    } else { // attack
      if (W === 'bow') {
        const draw = p < 0.7 ? p / 0.7 : 1 - (p - 0.7) / 0.3;
        aL.sh.rotation.x = -1.5; aL.sh.rotation.z = 0.15; aL.el.rotation.x = 0;
        aR.sh.rotation.x = -1.45; aR.el.rotation.x = -0.4 - draw * 1.8; aR.sh.rotation.y = draw * 0.4;
        spine.rotation.y = -0.25;
      } else if (W === 'staff' || !W && L.robe) {
        const k = Math.sin(p * Math.PI);
        aR.sh.rotation.x = -0.3 - k * 1.5; aR.el.rotation.x = -0.8 + k * 0.6;
        aL.sh.rotation.x = -k * 1.2; aL.el.rotation.x = -0.3;
        spine.rotation.x = -k * 0.1;
      } else if (W === 'spear' || W === 'trident') {
        const k = p < 0.4 ? -p / 0.4 : Math.sin((p - 0.4) / 0.6 * Math.PI);
        aR.sh.rotation.x = -1.2 - k * 0.3; aR.el.rotation.x = -0.6 + k * 0.6; spine.rotation.y = -k * 0.2;
      } else {
        // overhead slash: wind up then strike
        const up = p < 0.35 ? p / 0.35 : 1 - Math.min(1, (p - 0.35) / 0.3);
        aR.sh.rotation.x = -0.3 - up * 2.5 + (p > 0.35 && p < 0.75 ? 0.4 : 0);
        aR.el.rotation.x = -0.3 - up * 0.6;
        spine.rotation.y = up * 0.35 - (1 - up) * 0.25; spine.rotation.x = (1 - up) * 0.12;
        lL.th.rotation.x = -0.35; lL.kn.rotation.x = 0.3; lR.th.rotation.x = 0.25;
        if (!L.shield) aL.sh.rotation.x = -0.4;
      }
    }
    wings.forEach(w => { const f = mode === 'walk' ? Math.sin(p * Math.PI * 2) * 0.25 : mode === 'attack' ? -0.3 : 0.05; w.pv.rotation.y = w.side * (0.45 + f); w.pv.rotation.z = w.side * 0.15; });
  };
  const winged = wings.length > 0;
  return { root, pose, size: Math.max(1, sc * 0.95), wide: winged ? 1.55 : 1, tall: (W === 'spear' || W === 'trident' || W === 'staff') ? 1.1 : 1 };
}

// ---------------------------------------------------------------------
// Monsters
// ---------------------------------------------------------------------
function monMats(L) {
  const glow = L.glow;
  return {
    a: M3.mat(L.c1, { rough: 0.6, bump: L.scaly ? 'scales' : 'grain', bs: 0.025 }),
    b: M3.mat(L.c2, { rough: 0.5, bump: 'grain', bs: 0.015 }),
    shell: M3.mat(L.c1, { rough: 0.25, metal: 0.4, bump: 'scales', bs: 0.01 }),
    eye: M3.mat(glow || '#ffe040', { emissive: glow || '#ffb020', ei: 2.2 }),
    horn: M3.mat('#ece0c4', { rough: 0.4 })
  };
}
function buildBeast(L) {
  const sc = L.scale || 1, root = new THREE.Group(), b = grp(root); b.scale.setScalar(sc);
  const M = monMats(L);
  const body = grp(b, 0, 0.48, 0);
  const torso = mk(capsule(0.2, 0.42, 14), M.a, 0, 0, 0, body); torso.rotation.x = Math.PI / 2; torso.scale.set(1, 1, 0.95);
  mk(capsule(0.12, 0.3), M.b, 0, -0.1, 0.03, body).rotation.x = Math.PI / 2;
  const neck = grp(body, 0, 0.08, 0.32);
  const head = grp(neck, 0, 0.1, 0.12);
  mk(sphere(0.15), M.a, 0, 0, 0, head).scale.set(0.9, 0.85, 1.05);
  const snout = mk(capsule(0.08, 0.14), M.a, 0, -0.04, 0.15, head); snout.rotation.x = Math.PI / 2;
  const jaw = grp(head, 0, -0.07, 0.05);
  mk(new THREE.BoxGeometry(0.12, 0.03, 0.2), M.b, 0, 0, 0.08, jaw);
  for (let i = 0; i < 4; i++) mk(new THREE.ConeGeometry(0.01, 0.04, 4), M.horn, -0.04 + i * 0.027, 0.03, 0.16, jaw).rotation.x = Math.PI;
  [-1, 1].forEach(s => { mk(sphere(0.025, 8, 6), M.eye, s * 0.07, 0.04, 0.11, head); const e = mk(new THREE.ConeGeometry(0.045, 0.13, 6), M.a, s * 0.08, 0.13, -0.03, head); e.rotation.z = -s * 0.3; });
  if (L.horns) [-1, 1].forEach(s => { const h = mk(new THREE.ConeGeometry(0.035, 0.22, 7), M.horn, s * 0.06, 0.17, 0.02, head); h.rotation.x = -0.6; h.rotation.z = -s * 0.3; });
  const legs = [];
  [[1, 0.2], [-1, 0.2], [1, -0.22], [-1, -0.22]].forEach(([s, z]) => {
    const up = grp(body, s * 0.13, -0.05, z);
    mk(capsule(0.065, 0.2), M.a, 0, -0.13, 0, up);
    const lo = grp(up, 0, -0.27, 0);
    mk(capsule(0.045, 0.16), M.a, 0, -0.1, 0, lo);
    mk(sphere(0.055, 10, 8), M.b, 0, -0.2, 0.03, lo).scale.set(1, 0.6, 1.3);
    legs.push({ up, lo });
  });
  const tail = []; let tp = grp(body, 0, 0.05, -0.38);
  for (let i = 0; i < 4; i++) { mk(capsule(0.04 - i * 0.007, 0.1), M.a, 0, 0, -0.06, tp).rotation.x = Math.PI / 2; tail.push(tp); tp = grp(tp, 0, 0, -0.12); }
  const pose = (mode, p) => {
    const T = Math.PI * 2, s = Math.sin(p * T);
    legs.forEach((l, i) => { const ph = (i === 0 || i === 3) ? s : -s; l.up.rotation.x = mode === 'walk' ? ph * 0.55 : 0; l.lo.rotation.x = mode === 'walk' ? Math.max(0, -ph) * 0.6 : 0; });
    body.position.y = 0.48 + (mode === 'walk' ? Math.abs(Math.cos(p * T)) * 0.03 : 0);
    tail.forEach((t, i) => { t.rotation.x = 0.25 + (i === 0 ? 0.3 : 0); t.rotation.y = Math.sin(p * T + i) * 0.25; });
    neck.position.z = 0.32; neck.rotation.x = 0; jaw.rotation.x = 0;
    if (mode === 'attack') { const k = Math.sin(p * Math.PI); neck.position.z = 0.32 + k * 0.14; neck.rotation.x = k * 0.3; jaw.rotation.x = k * 0.5; body.rotation.x = k * 0.1; } else body.rotation.x = 0;
  };
  return { root, pose, size: Math.max(1, sc), wide: 1.1 };
}
function buildFlyer(L) {
  const sc = L.scale || 1, root = new THREE.Group(), b = grp(root); b.scale.setScalar(sc);
  const M = monMats(L);
  const body = grp(b, 0, 0.95, 0);
  mk(sphere(0.2), M.a, 0, 0, 0, body).scale.set(0.85, 0.75, 1.25);
  mk(sphere(0.13), M.b, 0, -0.06, 0.05, body).scale.set(0.9, 0.7, 1.2);
  const head = grp(body, 0, 0.1, 0.26);
  mk(sphere(0.12), M.a, 0, 0, 0, head).scale.set(0.9, 0.85, 1.1);
  mk(new THREE.ConeGeometry(0.06, 0.16, 8), M.b, 0, -0.02, 0.14, head).rotation.x = Math.PI / 2;
  [-1, 1].forEach(s => { mk(sphere(0.022, 8, 6), M.eye, s * 0.06, 0.04, 0.09, head); const h = mk(new THREE.ConeGeometry(0.025, 0.12, 6), M.horn, s * 0.05, 0.11, -0.04, head); h.rotation.x = -0.7; });
  const wings = [-1, 1].map(s => { const pv = grp(body, s * 0.12, 0.08, 0); const w = wingMesh('bat', L.c2, shade(L.c2, -0.3), 1, s); w.scale.multiplyScalar(0.9); w.rotation.y = -s * 0.2; w.rotation.x = -Math.PI / 2 + 0.3; pv.add(w); return { pv, s }; });
  const tail = []; let tp = grp(body, 0, 0, -0.25);
  for (let i = 0; i < 5; i++) { mk(capsule(0.04 - i * 0.006, 0.08), M.a, 0, 0, -0.05, tp).rotation.x = Math.PI / 2; tail.push(tp); tp = grp(tp, 0, 0, -0.1); }
  [-1, 1].forEach(s => mk(capsule(0.03, 0.12), M.a, s * 0.08, -0.17, 0.05, body));
  const pose = (mode, p) => {
    const T = Math.PI * 2, f = mode === 'idle' ? 0.2 : Math.sin(p * T * (mode === 'attack' ? 1 : 1));
    wings.forEach(w => { w.pv.rotation.z = w.s * (0.15 + f * 0.7); });
    body.position.y = 0.95 + Math.sin(p * T) * 0.05;
    tail.forEach((t, i) => { t.rotation.x = -0.15 + Math.sin(p * T + i * 0.8) * 0.15; });
    head.position.z = 0.26 + (mode === 'attack' ? Math.sin(p * Math.PI) * 0.12 : 0);
  };
  return { root, pose, size: Math.max(1, sc), wide: 1.7, tall: 1.15 };
}
function buildBug(L) {
  const sc = L.scale || 1, root = new THREE.Group(), b = grp(root); b.scale.setScalar(sc);
  const M = monMats(L);
  if (L.worm) {
    const segs = [];
    for (let i = 0; i < 7; i++) { const s = mk(sphere(0.12 - i * 0.008, 14, 10), i % 2 ? M.a : M.b, 0, 0.12, 0.3 - i * 0.14, b); s.scale.set(1, 0.9, 1.15); segs.push(s); }
    mk(sphere(0.03, 8, 6), M.eye, 0.05, 0.18, 0.4, b); mk(sphere(0.03, 8, 6), M.eye, -0.05, 0.18, 0.4, b);
    const pose = (mode, p) => segs.forEach((s, i) => { s.position.y = 0.12 + Math.max(0, Math.sin(p * Math.PI * 2 - i * 0.9)) * (mode === 'idle' ? 0.02 : 0.09) + (mode === 'attack' && i < 2 ? Math.sin(p * Math.PI) * 0.2 : 0); s.position.x = Math.sin(p * Math.PI * 2 + i * 0.7) * 0.03; });
    return { root, pose, size: Math.max(1, sc), wide: 1.2 };
  }
  const body = grp(b, 0, 0.2, 0);
  const abd = mk(sphere(0.2, 18, 14), L.shell ? M.shell : M.a, 0, 0.04, -0.2, body); abd.scale.set(1, 0.75, 1.3);
  mk(sphere(0.12, 14, 10), M.a, 0, 0.02, 0.05, body).scale.set(1, 0.8, 1);
  const head = grp(body, 0, 0.02, 0.2);
  mk(sphere(0.09, 12, 10), M.b, 0, 0, 0, head);
  for (let i = 0; i < 4; i++) mk(sphere(0.016, 6, 5), M.eye, -0.045 + i * 0.03, 0.04, 0.07, head);
  [-1, 1].forEach(s => { const f = mk(new THREE.ConeGeometry(0.018, 0.1, 5), M.horn, s * 0.04, -0.04, 0.09, head); f.rotation.x = Math.PI / 2 + 0.3; });
  const n = (L.legs || 6) / 2, legs = [];
  for (let i = 0; i < n; i++) [-1, 1].forEach(s => {
    const z = 0.12 - i * (0.24 / Math.max(1, n - 1));
    const up = grp(body, s * 0.08, 0, z);
    const u = mk(new THREE.CylinderGeometry(0.018, 0.014, 0.22, 6), M.a, s * 0.1, 0.06, 0, up); u.rotation.z = s * 1.0;
    const lo = mk(new THREE.CylinderGeometry(0.014, 0.008, 0.26, 6), M.a, s * 0.25, -0.05, 0, up); lo.rotation.z = -s * 0.5;
    up.rotation.y = s * (i - (n - 1) / 2) * -0.35;
    legs.push({ up, s, i });
  });
  const tail = [];
  if (L.tail) { let tp = grp(body, 0, 0.12, -0.42); for (let i = 0; i < 5; i++) { mk(sphere(0.06 - i * 0.006, 10, 8), M.a, 0, 0, 0, tp); tail.push(tp); tp = grp(tp, 0, 0.1, -0.02); } mk(new THREE.ConeGeometry(0.03, 0.12, 6), M.horn, 0, 0.05, 0.03, tp).rotation.x = 1.2; }
  const pose = (mode, p) => {
    const T = Math.PI * 2;
    legs.forEach(l => { const ph = ((l.i + (l.s > 0 ? 0 : 1)) % 2) ? 1 : -1; l.up.rotation.x = mode === 'walk' ? Math.sin(p * T) * 0.4 * ph : 0; l.up.position.y = mode === 'walk' ? Math.max(0, Math.sin(p * T) * ph) * 0.03 : 0; });
    tail.forEach((t, i) => { t.rotation.x = -0.55 + (mode === 'attack' ? -Math.sin(p * Math.PI) * 0.35 : Math.sin(p * T + i) * 0.05); });
    head.position.z = 0.2 + (mode === 'attack' ? Math.sin(p * Math.PI) * 0.1 : 0);
    body.position.y = 0.2 + (mode === 'walk' ? Math.abs(Math.sin(p * T * 2)) * 0.01 : 0);
  };
  return { root, pose, size: Math.max(1, sc), wide: 1.25 };
}
function buildGhost(L) {
  const sc = L.scale || 1, root = new THREE.Group(), b = grp(root); b.scale.setScalar(sc);
  const glow = L.glow || '#cff';
  const cloakM = M3.mat(L.c2, { emissive: glow, ei: 0.5, opacity: 0.72, rough: 0.9, double: true, bump: 'cloth', bs: 0.02 });
  const body = grp(b, 0, 0.45, 0);
  const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push([0.08 + Math.sin(t * Math.PI * 0.9) * 0.22 + t * 0.06, 0.9 - t * 0.95]); }
  mk(lathe(pts, 24), cloakM, 0, 0, 0, body);
  const hood = mk(new THREE.SphereGeometry(0.17, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.7), cloakM, 0, 0.92, 0, body);
  mk(sphere(0.12), M3.mat('#050608', { rough: 1 }), 0, 0.88, 0.04, body);
  const eM = M3.mat(glow, { emissive: glow, ei: 3 });
  [-0.045, 0.045].forEach(x => mk(sphere(0.022, 8, 6), eM, x, 0.9, 0.14, body));
  const arms = [-1, 1].map(s => { const a = grp(body, s * 0.2, 0.62, 0.02); const m = mk(new THREE.ConeGeometry(0.06, 0.42, 8, 1, true), cloakM, 0, -0.2, 0, a); m.rotation.x = Math.PI; return a; });
  const pose = (mode, p) => {
    const T = Math.PI * 2;
    body.position.y = 0.45 + Math.sin(p * T) * 0.06;
    arms.forEach((a, i) => { a.rotation.x = mode === 'attack' ? -1.3 * Math.sin(p * Math.PI) : -0.3 + Math.sin(p * T + i) * 0.15; a.rotation.z = (i ? -1 : 1) * 0.2; });
    body.rotation.x = mode === 'walk' ? 0.15 : 0;
  };
  return { root, pose, size: Math.max(1, sc), tall: 1.2 };
}
function buildMonster(def) {
  const L = def.look;
  switch (def.shape) {
    case 'beast': return buildBeast(L);
    case 'flyer': return buildFlyer(L);
    case 'bug': return buildBug(L);
    case 'ghost': return buildGhost(L);
    default: return buildHuman(L);
  }
}

// ---------------------------------------------------------------------
// 2D integration
// ---------------------------------------------------------------------
function lookKey(L) { return JSON.stringify(L, (k, v) => typeof v === 'number' ? Math.round(v * 100) / 100 : v); }
function draw3D(ctx, x, y, key, build, anim, alpha) {
  if (!M3.ready) return false;
  const A = M3.atlas(key, build);
  const d = M3.dirFor(anim.ang != null ? anim.ang : Math.PI / 4), f = M3.frameFor(anim);
  const sx = Math.round(x - A.ax), sy = Math.round(y - A.ay);
  if (alpha != null) { ctx.save(); ctx.globalAlpha = alpha; }
  ctx.drawImage(A.can, f * A.FW, d * A.FH, A.FW, A.FH, sx, sy, A.FW, A.FH);
  if (anim.hurt > 0) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = anim.hurt * 0.45;
    ctx.drawImage(A.can, f * A.FW, d * A.FH, A.FW, A.FH, sx, sy, A.FW, A.FH); ctx.restore();
  }
  if (alpha != null) ctx.restore();
  return true;
}
function drawPlayer3D(ctx, x, y, p, anim) {
  const L = p.look();
  if (L.aura) { glowAt(ctx, x, y - 34, 44, L.aura >= 13 ? `hsl(${(G.time * 120) % 360},100%,65%)` : L.aura >= 11 ? '#ffd860' : '#6aa8ff', 0.4); }
  const ok = draw3D(ctx, x, y, 'P' + lookKey(L), () => buildHuman(L), anim);
  if (ok && L.aura >= 11) { ctx.save(); ctx.translate(x, y); drawAura(ctx, L.aura, G.time, 1); ctx.restore(); }
  return ok;
}
function drawMonster3D(ctx, x, y, m, anim, alpha) {
  return draw3D(ctx, x, y, 'M' + m.id, () => buildMonster(m.def), anim, alpha);
}
function drawNpc3D(ctx, x, y, n, anim) {
  const L = Object.assign({ scale: n.look.goblin ? 0.85 : 1 }, n.look);
  return draw3D(ctx, x, y, 'N' + n.id, () => buildHuman(L), anim);
}
// static preview (character select / create screens), facing the camera
function drawPreview3D(g, x, y, L, scale) {
  if (!M3.ready) return false;
  const A = M3.atlas('P' + lookKey(L), () => buildHuman(L));
  g.imageSmoothingQuality = 'high';
  g.drawImage(A.can, 0, A.FH, A.FW, A.FH, x - A.ax * scale, y - A.ay * scale, A.FW * scale, A.FH * scale);
  return true;
}
function prewarm3D() {
  if (!M3.ready || !G.map) return;
  const ids = new Set(G.monsters.map(m => m.id));
  ids.forEach(id => M3.atlas('M' + id, () => buildMonster(MONSTERS[id])));
}
