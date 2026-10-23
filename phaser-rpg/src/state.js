// ---------------------------------------------------------------------
// 플레이어 상태: 능력치 계산, 아이템 생성, 저장/불러오기
// ---------------------------------------------------------------------
const SAVE_KEY = 'phaser-rpg-save-v1';
let UID = Date.now() % 1e6;

function makeGear(baseId, rarity = 0, ilvl) {
  const b = ITEM_BASES[baseId], r = RARITY[rarity];
  ilvl = ilvl ?? b.lv;
  const it = { uid: ++UID, base: baseId, name: b.name, slot: b.slot, lv: b.lv, rarity, affixes: [] };
  if (b.atk) it.atk = Math.round(b.atk * r.mult);
  if (b.def) it.def = Math.round(b.def * r.mult);
  if (b.int) it.int = Math.round(b.int * r.mult);
  const pool = AFFIXES.slice();
  const scale = 1 + ilvl / 6;
  for (let i = 0; i < r.affix; i++) {
    const a = pool.splice(randi(0, pool.length - 1), 1)[0];
    it.affixes.push({ k: a.k, v: Math.max(1, Math.round(rand(a.min, a.max) * scale)) });
  }
  if (rarity === 3) it.name = pick(LEGEND_PREFIX) + ' ' + b.name;
  else if (rarity === 2) it.name = pick(RARE_PREFIX) + ' ' + b.name;
  return it;
}

function rollRarity(boost = 0) {
  const r = Math.random();
  if (r < 0.02 + boost) return 3;
  if (r < 0.1 + boost * 2) return 2;
  if (r < 0.35 + boost * 2) return 1;
  return 0;
}

// 몬스터 레벨에 맞는 장비 하나
function rollGear(mlv, boost = 0) {
  const ids = Object.keys(ITEM_BASES).filter(id => ITEM_BASES[id].lv <= mlv + 2);
  ids.sort((a, b) => ITEM_BASES[b].lv - ITEM_BASES[a].lv);
  const id = Math.random() < 0.6 ? ids[randi(0, Math.min(3, ids.length - 1))] : pick(ids);
  return makeGear(id, rollRarity(boost), mlv);
}

const itemValue = it => Math.round(ITEM_BASES[it.base].price * (1 + it.rarity * 0.9));
const sellPrice = it => Math.max(1, Math.floor(itemValue(it) / 3));

function newState() {
  return {
    name: '용사', lv: 1, exp: 0, gold: 50,
    stats: { str: 5, dex: 5, int: 5, vit: 5 }, points: 0,
    hp: 1, mp: 1,
    inv: [], equip: { weapon: makeGear('w_wood'), helm: null, armor: makeGear('a_cloth'), ring: null },
    potions: { hp: 4, mp: 2 },
    quest: { idx: 0, progress: 0, state: 'none' },
    x: null, y: null, kills: 0, bossKills: 0,
  };
}

function derive(st) {
  const s = { ...st.stats };
  let atk = 0, def = 0, hp = 0, crit = 0, atkPct = 0;
  for (const k of SLOTS) {
    const it = st.equip[k];
    if (!it) continue;
    atk += it.atk || 0; def += it.def || 0; s.int += it.int || 0;
    for (const a of it.affixes) {
      if (a.k in s) s[a.k] += a.v;
      else if (a.k === 'hp') hp += a.v;
      else if (a.k === 'crit') crit += a.v;
      else if (a.k === 'atkPct') atkPct += a.v;
    }
  }
  return {
    str: s.str, dex: s.dex, int: s.int, vit: s.vit,
    atk: Math.round((6 + s.str * 1.6 + atk) * (1 + atkPct / 100)),
    def: Math.round(def + s.vit * 0.5 + s.dex * 0.2),
    maxHp: Math.round(70 + s.vit * 12 + st.lv * 8 + hp),
    maxMp: Math.round(25 + s.int * 6 + st.lv * 3),
    crit: Math.min(60, Math.round(5 + s.dex * 0.4 + crit)),
    spell: Math.round(8 + s.int * 2.4 + st.lv * 1.5),
    speed: Math.round(140 + Math.min(40, s.dex * 0.6)),
    atkDelay: Math.round(460 - Math.min(160, s.dex * 3)),
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function saveState(st) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(st)); } catch (e) { /* 저장 불가 환경 */ }
}
function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 무시 */ }
}

// ---- 효과음 (WebAudio로 생성) ----
let AC = null;
function sfx(kind) {
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime;
    const P = {
      swing: ['triangle', 320, 140, 0.08, 0.06], hit: ['square', 180, 60, 0.08, 0.05], crit: ['square', 420, 90, 0.12, 0.07],
      hurt: ['sawtooth', 140, 70, 0.15, 0.06], coin: ['square', 880, 1320, 0.09, 0.04], pick: ['triangle', 600, 900, 0.1, 0.06],
      cast: ['sine', 300, 900, 0.22, 0.07], boom: ['sawtooth', 120, 40, 0.3, 0.08], heal: ['sine', 500, 1000, 0.35, 0.06],
      level: ['triangle', 400, 1200, 0.6, 0.09], die: ['sawtooth', 300, 40, 0.8, 0.08], ui: ['sine', 700, 700, 0.05, 0.04],
    }[kind];
    if (!P) return;
    o.type = P[0]; o.frequency.setValueAtTime(P[1], t); o.frequency.exponentialRampToValueAtTime(P[2], t + P[3]);
    g.gain.setValueAtTime(P[4], t); g.gain.exponentialRampToValueAtTime(0.0001, t + P[3]);
    o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + P[3] + 0.02);
  } catch (e) { /* 오디오 미지원 */ }
}
