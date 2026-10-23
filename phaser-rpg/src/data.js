// ---------------------------------------------------------------------
// 게임 데이터: 맵 상수, 몬스터, 아이템, 스킬, 퀘스트
// ---------------------------------------------------------------------
const TILE = 32;
const MAP_W = 100, MAP_H = 75;
const T = { GRASS: 0, GRASS2: 1, FLOWER: 2, PATH: 3, SAND: 4, WATER: 5, TREE: 6, WALL: 7, FLOOR: 8, DFLOOR: 9, ROCK: 10, BRIDGE: 11 };
const TILE_COUNT = 12;
const BLOCKING = [T.WATER, T.TREE, T.WALL, T.ROCK];

// 영역 (타일 단위)
const TOWN = { x: 6, y: 30, w: 18, h: 14 };
const RUINS = { x: 72, y: 4, w: 22, h: 20 };

const MONSTERS = {
  slime:    { name: '슬라임',    lv: 1,  hp: 30,   atk: 5,  def: 0,  exp: 12,   gold: [2, 6],     speed: 45, aggro: 110, range: 22, cd: 1200, tex: 'mon_slime',    body: 11 },
  wolf:     { name: '들개',      lv: 4,  hp: 80,   atk: 11, def: 2,  exp: 30,   gold: [5, 12],    speed: 92, aggro: 150, range: 24, cd: 1000, tex: 'mon_wolf',     body: 11 },
  goblin:   { name: '고블린',    lv: 8,  hp: 150,  atk: 19, def: 5,  exp: 62,   gold: [10, 22],   speed: 76, aggro: 160, range: 24, cd: 1100, tex: 'mon_goblin',   body: 11 },
  skeleton: { name: '해골 전사', lv: 13, hp: 260,  atk: 30, def: 10, exp: 125,  gold: [18, 40],   speed: 70, aggro: 170, range: 26, cd: 1100, tex: 'mon_skeleton', body: 11 },
  lich:     { name: '고대 리치', lv: 20, hp: 3200, atk: 46, def: 16, exp: 2400, gold: [400, 600], speed: 55, aggro: 230, range: 34, cd: 1400, tex: 'mon_lich',     body: 20, boss: true, respawn: 120000 },
};

// 스폰 지점 (타일 좌표, 반경, 마릿수)
const SPAWNS = [
  { type: 'slime', x: 30, y: 33, r: 4, n: 5 },
  { type: 'slime', x: 36, y: 42, r: 4, n: 5 },
  { type: 'slime', x: 28, y: 46, r: 3, n: 4 },
  { type: 'wolf', x: 25, y: 60, r: 5, n: 5 },
  { type: 'wolf', x: 40, y: 64, r: 5, n: 5 },
  { type: 'wolf', x: 50, y: 52, r: 4, n: 4 },
  { type: 'goblin', x: 60, y: 44, r: 4, n: 5 },
  { type: 'goblin', x: 68, y: 56, r: 4, n: 5 },
  { type: 'goblin', x: 74, y: 40, r: 4, n: 5 },
  { type: 'skeleton', x: 78, y: 18, r: 3, n: 4 },
  { type: 'skeleton', x: 88, y: 18, r: 3, n: 4 },
  { type: 'skeleton', x: 80, y: 10, r: 3, n: 3 },
  { type: 'lich', x: 87, y: 9, r: 0, n: 1 },
];

const NPCS = [
  { id: 'elder', name: '촌장 아르덴', tex: 'npc_elder', x: 14, y: 34 },
  { id: 'merchant', name: '상인 미라', tex: 'npc_merchant', x: 10, y: 39 },
  { id: 'healer', name: '치유사 엘린', tex: 'npc_healer', x: 19, y: 39 },
];

const SLOTS = ['weapon', 'helm', 'armor', 'ring'];
const SLOT_NAMES = { weapon: '무기', helm: '투구', armor: '갑옷', ring: '반지' };

const ITEM_BASES = {
  w_wood:    { name: '나무 검',        slot: 'weapon', atk: 4,  lv: 1,  price: 30 },
  w_iron:    { name: '철 검',          slot: 'weapon', atk: 9,  lv: 4,  price: 160 },
  w_staff:   { name: '견습 지팡이',    slot: 'weapon', atk: 5,  int: 6, lv: 5, price: 260 },
  w_steel:   { name: '강철 대검',      slot: 'weapon', atk: 16, lv: 9,  price: 520 },
  w_rune:    { name: '룬 블레이드',    slot: 'weapon', atk: 26, lv: 14, price: 1400 },
  w_arch:    { name: '대마법사의 지팡이', slot: 'weapon', atk: 14, int: 16, lv: 15, price: 1600 },
  h_cap:     { name: '가죽 모자',      slot: 'helm', def: 1,  lv: 1,  price: 25 },
  h_iron:    { name: '철 투구',        slot: 'helm', def: 4,  lv: 6,  price: 240 },
  h_knight:  { name: '기사의 투구',    slot: 'helm', def: 8,  lv: 12, price: 800 },
  a_cloth:   { name: '천 옷',          slot: 'armor', def: 2,  lv: 1,  price: 30 },
  a_leather: { name: '가죽 갑옷',      slot: 'armor', def: 5,  lv: 4,  price: 160 },
  a_chain:   { name: '사슬 갑옷',      slot: 'armor', def: 10, lv: 9,  price: 520 },
  a_plate:   { name: '판금 갑옷',      slot: 'armor', def: 17, lv: 14, price: 1400 },
  r_copper:  { name: '구리 반지',      slot: 'ring', lv: 1,  price: 80 },
  r_silver:  { name: '은 반지',        slot: 'ring', lv: 8,  price: 400 },
  r_gold:    { name: '황금 반지',      slot: 'ring', lv: 14, price: 1000 },
};
const SHOP_GEAR = ['w_iron', 'w_staff', 'w_steel', 'h_cap', 'h_iron', 'a_leather', 'a_chain', 'r_copper'];

const POTIONS = {
  hp: { name: '체력 물약', heal: 70, price: 20 },
  mp: { name: '마나 물약', mana: 45, price: 25 },
};

// 희귀도 (dungeon-crawler-rpg-od / 디아블로식 등급)
const RARITY = [
  { name: '일반', color: '#e6e6e6', affix: 0, mult: 1 },
  { name: '마법', color: '#6aa8ff', affix: 1, mult: 1.1 },
  { name: '희귀', color: '#ffd84a', affix: 2, mult: 1.25 },
  { name: '전설', color: '#ff8a2a', affix: 3, mult: 1.5 },
];
const AFFIXES = [
  { k: 'str', name: '힘', min: 1, max: 3 },
  { k: 'dex', name: '민첩', min: 1, max: 3 },
  { k: 'int', name: '지능', min: 1, max: 3 },
  { k: 'vit', name: '체력', min: 1, max: 3 },
  { k: 'hp', name: '최대 생명력', min: 6, max: 14 },
  { k: 'crit', name: '치명타 확률', min: 1, max: 2, unit: '%' },
  { k: 'atkPct', name: '공격력', min: 2, max: 5, unit: '%' },
];
const RARE_PREFIX = ['날카로운', '단단한', '빛나는', '사나운', '고요한'];
const LEGEND_PREFIX = ['용살자의', '태양의', '심연의', '왕의', '폭풍의'];

const SKILLS = [
  { key: 'ONE', label: '1', id: 'whirl', name: '회전 베기', mp: 12, cd: 4000, lv: 1, icon: '🌀', desc: '주변 모든 적에게 공격력의 160% 피해' },
  { key: 'TWO', label: '2', id: 'fireball', name: '파이어볼', mp: 15, cd: 1400, lv: 3, icon: '🔥', desc: '마우스 방향으로 화염구 발사 (지능 비례, 폭발 범위 피해)' },
  { key: 'THREE', label: '3', id: 'heal', name: '치유', mp: 25, cd: 10000, lv: 5, icon: '✚', desc: '생명력 회복 (지능 비례)' },
  { key: 'FOUR', label: '4', id: 'dash', name: '돌진', mp: 8, cd: 3000, lv: 7, icon: '💨', desc: '마우스 방향으로 돌진, 지나간 적에게 피해' },
];

const QUESTS = [
  { title: '슬라임 퇴치', target: 'slime', count: 6, exp: 90, gold: 60, reward: 'h_cap',
    talk: '마을 동쪽 들판에 슬라임이 들끓고 있다네. 6마리만 처치해 주게.', done: '고맙네! 이 모자라도 받아 두게.' },
  { title: '들개 사냥', target: 'wolf', count: 8, exp: 260, gold: 150, reward: 'a_leather',
    talk: '남쪽 평원의 들개들이 가축을 노리고 있어. 8마리를 처치해 주게.', done: '훌륭해! 가죽 갑옷을 주겠네.' },
  { title: '고블린 소탕', target: 'goblin', count: 10, exp: 700, gold: 400, reward: 'w_steel',
    talk: '동쪽 숲의 고블린들이 길목을 막고 있네. 10마리를 쓰러뜨려 주게.', done: '역시 대단하군. 강철 대검을 가져가게.' },
  { title: '폐허의 해골들', target: 'skeleton', count: 10, exp: 1600, gold: 900, reward: 'h_knight',
    talk: '북동쪽 폐허에서 해골 전사들이 깨어났네. 10마리를 쓰러뜨려 주게.', done: '폐허가 조금은 조용해졌군. 기사의 투구일세.' },
  { title: '고대 리치 토벌', target: 'lich', count: 1, exp: 4000, gold: 3000, reward: 'w_rune',
    talk: '모든 재앙의 근원, 폐허 깊은 곳의 고대 리치를 쓰러뜨려 주게. 왕국의 운명이 자네에게 달렸네.', done: '자네가 왕국을 구했네! 전설의 룬 블레이드를 받게.' },
];

const expNeed = lv => Math.floor(40 * Math.pow(lv, 1.65));
