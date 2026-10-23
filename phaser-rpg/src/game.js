// ---------------------------------------------------------------------
// 메인 게임 씬: 맵, 플레이어, 몬스터 AI(easystar.js 길찾기), 전투, 드롭
// ---------------------------------------------------------------------
const tileAt = (map, px, py) => {
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  return (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) ? T.WALL : map[ty][tx];
};
const isBlocked = (map, px, py) => BLOCKING.includes(tileAt(map, px, py));

function zoneAt(px, py) {
  const tx = px / TILE, ty = py / TILE;
  if (tx >= TOWN.x && tx < TOWN.x + TOWN.w && ty >= TOWN.y && ty < TOWN.y + TOWN.h) return '평화의 마을';
  if (tx >= RUINS.x && tx < RUINS.x + RUINS.w && ty >= RUINS.y && ty < RUINS.y + RUINS.h) return '저주받은 폐허';
  if (tx > 52) return '고블린 숲';
  if (ty > 50) return '들개 평원';
  return '초록 들판';
}

class Monster {
  constructor(scene, type, spawn) {
    this.scene = scene; this.type = type; this.def = MONSTERS[type]; this.spawn = spawn;
    const d = this.def, big = !!d.boss;
    this.sp = scene.physics.add.sprite(0, 0, d.tex).setScale(0.5);
    const tw = big ? 128 : 64;
    this.sp.body.setCircle(d.body * 2, tw / 2 - d.body * 2, tw - d.body * 4 - 4);
    scene.physics.add.collider(this.sp, scene.layer);
    this.sp.mon = this;
    this.reset();
  }
  get x() { return this.sp.x; }
  get y() { return this.sp.y; }
  reset() {
    const p = this.scene.randomSpot(this.spawn);
    this.sp.setPosition(p.x, p.y).setVisible(true).setAlpha(1).setScale(0.5);
    this.sp.body.enable = true; this.sp.body.setVelocity(0);
    this.home = { x: p.x, y: p.y };
    this.maxHp = this.def.hp; this.hp = this.maxHp;
    this.dead = false; this.state = 'idle'; this.path = null; this.pathAt = 0; this.nextAtk = 0;
    this.wanderAt = 0; this.specialAt = this.scene.time.now + 3000;
  }
  update(time) {
    if (this.dead) return;
    const s = this.scene, d = this.def, sp = this.sp;
    const dist = Phaser.Math.Distance.Between(sp.x, sp.y, s.player.x, s.player.y);
    const homeDist = Phaser.Math.Distance.Between(sp.x, sp.y, this.home.x, this.home.y);
    sp.setDepth(sp.y + (d.boss ? 16 : 0));

    if (this.state === 'return') {
      if (homeDist < 12) { this.state = 'idle'; sp.body.setVelocity(0); }
      else this.moveTo(this.home.x, this.home.y, time, d.speed * 1.4);
      return;
    }
    const engaged = !s.dead && !s.inTown && (dist < d.aggro || (this.state === 'chase' && dist < d.aggro * 2.2));
    if (engaged) {
      if (homeDist > (d.boss ? 300 : 420)) { this.state = 'return'; this.hp = this.maxHp; this.path = null; return; }
      this.state = 'chase';
      sp.setFlipX(s.player.x < sp.x);
      if (dist <= d.range + 10) {
        sp.body.setVelocity(0);
        if (time >= this.nextAtk) this.attack(time);
      } else this.moveTo(s.player.x, s.player.y, time, d.speed);
      if (d.boss && time >= this.specialAt) this.bossSpecial(time);
    } else {
      if (this.state === 'chase') { this.state = 'return'; return; }
      if (time >= this.wanderAt) {
        this.wanderAt = time + rand(1500, 3500);
        if (Math.random() < 0.5 || homeDist > 70) {
          const a = homeDist > 70 ? Math.atan2(this.home.y - sp.y, this.home.x - sp.x) : rand(0, Math.PI * 2);
          sp.body.setVelocity(Math.cos(a) * d.speed * 0.4, Math.sin(a) * d.speed * 0.4);
          sp.setFlipX(Math.cos(a) < 0);
        } else sp.body.setVelocity(0);
      }
    }
  }
  // 직선으로 보이면 바로 이동, 막혀 있으면 easystar 경로를 따라감
  moveTo(tx, ty, time, speed) {
    const s = this.scene, sp = this.sp;
    let gx = tx, gy = ty;
    if (!s.lineClear(sp.x, sp.y + 8, tx, ty + 8)) {
      if (time >= this.pathAt) {
        this.pathAt = time + 600;
        const fx = Math.floor(sp.x / TILE), fy = Math.floor((sp.y + 8) / TILE);
        const ex = Math.floor(tx / TILE), ey = Math.floor((ty + 8) / TILE);
        if (s.walkGrid[fy] && s.walkGrid[fy][fx] === 0 && s.walkGrid[ey] && s.walkGrid[ey][ex] === 0)
          s.easystar.findPath(fx, fy, ex, ey, path => { this.path = path && path.length > 1 ? path.slice(1) : null; });
      }
      if (this.path && this.path.length) {
        const n = this.path[0];
        gx = n.x * TILE + TILE / 2; gy = n.y * TILE + TILE / 2 - 8;
        if (Phaser.Math.Distance.Between(sp.x, sp.y, gx, gy) < 6) this.path.shift();
      } else { sp.body.setVelocity(0); return; }
    } else this.path = null;
    const a = Math.atan2(gy - sp.y, gx - sp.x);
    sp.body.setVelocity(Math.cos(a) * speed, Math.sin(a) * speed);
  }
  attack(time) {
    const s = this.scene, d = this.def;
    this.nextAtk = time + d.cd;
    const dir = s.player.x < this.sp.x ? -1 : 1;
    s.tweens.add({ targets: this.sp, x: this.sp.x + dir * 6, duration: 70, yoyo: true });
    s.hurtPlayer(d.atk * rand(0.9, 1.1), this);
  }
  bossSpecial(time) {
    const s = this.scene, enraged = this.hp < this.maxHp / 2;
    this.specialAt = time + (enraged ? 2800 : 4000);
    const n = enraged ? 14 : 10, off = rand(0, 1);
    for (let i = 0; i < n; i++) {
      const a = off + i / n * Math.PI * 2;
      s.spawnProj(this.sp.x, this.sp.y, a, 150, 'bolt', 'monster', this.def.atk * 0.8, 0);
    }
    if (enraged) {
      const a = Math.atan2(s.player.y - this.sp.y, s.player.x - this.sp.x);
      for (const da of [-0.25, 0, 0.25]) s.spawnProj(this.sp.x, this.sp.y, a + da, 230, 'bolt', 'monster', this.def.atk, 0);
    }
    s.cameras.main.shake(120, 0.004);
  }
}

class GameScene extends Phaser.Scene {
  constructor() { super('game'); }

  create() {
    makeTextures(this);
    this.mapData = generateMap(20261023);
    const map = this.make.tilemap({ data: this.mapData, tileWidth: TILE, tileHeight: TILE });
    const tiles = map.addTilesetImage('tiles', 'tiles', TILE, TILE, 0, 0);
    this.layer = map.createLayer(0, tiles, 0, 0).setDepth(-10);
    this.layer.setCollision(BLOCKING);
    this.physics.world.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE);

    // easystar.js 길찾기 격자
    this.walkGrid = this.mapData.map(row => row.map(t => BLOCKING.includes(t) ? 1 : 0));
    this.easystar = new EasyStar.js();
    this.easystar.setGrid(this.walkGrid);
    this.easystar.setAcceptableTiles([0]);
    this.easystar.enableDiagonals();
    this.easystar.disableCornerCutting();
    this.easystar.setIterationsPerCalculation(600);

    // 상태
    this.st = window.START_STATE || newState();
    this.d = derive(this.st);
    if (this.st.hp <= 1) { this.st.hp = this.d.maxHp; this.st.mp = this.d.maxMp; }
    this.cds = {}; this.nextAttack = 0; this.dead = false; this.dashUntil = 0; this.invulnUntil = 0;
    this.projs = []; this.drops = []; this.zone = '';

    // 플레이어
    const town = this.townCenter();
    const sx = this.st.x ?? town.x, sy = this.st.y ?? town.y;
    this.player = this.physics.add.sprite(sx, sy, 'player').setScale(0.5);
    this.player.body.setCircle(18, 14, 26);
    this.player.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, this.layer);

    // NPC
    this.npcs = NPCS.map(n => {
      const sp = this.add.sprite(n.x * TILE + 16, n.y * TILE + 16, n.tex).setScale(0.5).setDepth(n.y * TILE + 16);
      const label = this.add.text(sp.x, sp.y - 26, n.name, this.textStyle(9, '#ffe9a8')).setOrigin(0.5).setDepth(99990);
      sp.setInteractive({ useHandCursor: true });
      sp.on('pointerdown', () => { this.suppressAttack = this.time.now + 250; this.tryInteract(n); });
      this.tweens.add({ targets: sp, scaleY: 0.52, duration: 900 + Math.random() * 400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      return { ...n, sp, label };
    });
    this.hint = this.add.text(0, 0, '[E] 대화', this.textStyle(9, '#ffffff')).setOrigin(0.5).setDepth(99995).setVisible(false);

    // 몬스터
    this.monsters = [];
    for (const s of SPAWNS) for (let i = 0; i < s.n; i++) this.monsters.push(new Monster(this, s.type, s));
    this.boss = this.monsters.find(m => m.def.boss);
    this.bossLabel = this.add.text(0, 0, '☠ 고대 리치', this.textStyle(10, '#d6a6ff')).setOrigin(0.5).setDepth(99990);

    this.overlay = this.add.graphics().setDepth(99980);

    // 카메라
    const cam = this.cameras.main;
    cam.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE);
    cam.startFollow(this.player, true, 0.15, 0.15);
    cam.setZoom(2);
    cam.setRoundPixels(true);

    // 입력
    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,E,Q,R,ONE,TWO,THREE,FOUR');
    this.input.mouse.disableContextMenu();

    // 주기 작업
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.regen() });
    this.time.addEvent({ delay: 15000, loop: true, callback: () => this.save() });

    UI.init(this);
    UI.msg('잊혀진 왕국에 오신 것을 환영합니다! 촌장 아르덴에게 말을 걸어 보세요. (도움말: H)', 'gold');
  }

  textStyle(size, color) {
    return { fontFamily: 'Pretendard, "Malgun Gothic", sans-serif', fontSize: size + 'px', color, stroke: '#000', strokeThickness: 3, resolution: 3 };
  }
  townCenter() { return { x: (TOWN.x + TOWN.w / 2) * TILE, y: (TOWN.y + TOWN.h / 2 + 1) * TILE }; }
  randomSpot(s) {
    for (let k = 0; k < 40; k++) {
      const tx = s.x + randi(-s.r, s.r), ty = s.y + randi(-s.r, s.r);
      if (this.walkGrid[ty] && this.walkGrid[ty][tx] === 0) return { x: tx * TILE + 16, y: ty * TILE + 8 };
    }
    return { x: s.x * TILE + 16, y: s.y * TILE + 8 };
  }
  lineClear(ax, ay, bx, by) {
    const d = Phaser.Math.Distance.Between(ax, ay, bx, by), n = Math.ceil(d / 10);
    for (let i = 1; i < n; i++) if (isBlocked(this.mapData, ax + (bx - ax) * i / n, ay + (by - ay) * i / n)) return false;
    return true;
  }
  pointerWorld() {
    const p = this.input.activePointer;
    return this.cameras.main.getWorldPoint(p.x, p.y);
  }
  aimAngle() { const w = this.pointerWorld(); return Math.atan2(w.y - this.player.y, w.x - this.player.x); }
  recalc() {
    this.d = derive(this.st);
    this.st.hp = Math.min(this.st.hp, this.d.maxHp); this.st.mp = Math.min(this.st.mp, this.d.maxMp);
    UI.dirty = true;
  }
  save() {
    if (this.dead) return;
    this.st.x = this.player.x; this.st.y = this.player.y;
    saveState(this.st);
  }

  // ------------------------------------------------------------------
  update(time, delta) {
    const dt = delta / 1000, p = this.player, k = this.keys;
    this.easystar.calculate();
    this.inTown = zoneAt(p.x, p.y + 8) === '평화의 마을';

    if (!this.dead) {
      // 이동
      if (time < this.dashUntil) { /* 돌진 중: 속도 유지 */ }
      else if (UI.modalOpen()) p.body.setVelocity(0);
      else {
        let vx = (k.D.isDown || k.RIGHT.isDown) - (k.A.isDown || k.LEFT.isDown);
        let vy = (k.S.isDown || k.DOWN.isDown) - (k.W.isDown || k.UP.isDown);
        const len = Math.hypot(vx, vy) || 1;
        p.body.setVelocity(vx / len * this.d.speed, vy / len * this.d.speed);
        if (vx) p.setFlipX(vx < 0);
        this.walkBob = (vx || vy) ? (this.walkBob || 0) + dt * 14 : 0;
        p.setAngle(Math.sin(this.walkBob) * 4);
      }
      // 공격 / 스킬 / 물약
      const ptr = this.input.activePointer;
      if (!UI.modalOpen() && ((ptr.isDown && ptr.leftButtonDown() && time > (this.suppressAttack || 0)) || k.SPACE.isDown)) this.basicAttack(time);
      SKILLS.forEach(s => { if (Phaser.Input.Keyboard.JustDown(k[s.key])) this.useSkill(s, time); });
      if (Phaser.Input.Keyboard.JustDown(k.Q)) this.drink('hp');
      if (Phaser.Input.Keyboard.JustDown(k.R)) this.drink('mp');
      if (Phaser.Input.Keyboard.JustDown(k.E)) { const n = this.nearNpc(); if (n) this.tryInteract(n); }
    } else p.body.setVelocity(0);
    p.setDepth(p.y);

    for (const m of this.monsters) m.update(time);
    this.updateProjs(dt);
    this.updateDrops();

    // NPC 힌트
    const near = this.nearNpc();
    this.hint.setVisible(!!near && !UI.modalOpen());
    if (near) this.hint.setPosition(near.sp.x, near.sp.y - 38);

    // 지역 이름
    const z = zoneAt(p.x, p.y + 8);
    if (z !== this.zone) { this.zone = z; UI.zone(z); }

    this.drawOverlay();
    UI.update(time);
  }

  nearNpc() {
    let best = null, bd = 44;
    for (const n of this.npcs) { const d = Phaser.Math.Distance.Between(n.sp.x, n.sp.y, this.player.x, this.player.y); if (d < bd) { bd = d; best = n; } }
    return best;
  }
  tryInteract(n) {
    if (Phaser.Math.Distance.Between(n.sp.x, n.sp.y, this.player.x, this.player.y) > 90) { UI.msg('더 가까이 가야 합니다.', 'dim'); return; }
    sfx('ui');
    if (n.id === 'merchant') UI.openShop();
    else if (n.id === 'elder') UI.openQuestDialog(n);
    else if (n.id === 'healer') {
      this.st.hp = this.d.maxHp; this.st.mp = this.d.maxMp; sfx('heal');
      this.burst(this.player.x, this.player.y, 0x8cff9a, 14);
      UI.dialog(n.name, '빛의 축복이 함께하길. 생명력과 마나를 모두 회복했어요.');
    }
  }

  // ---- 전투 ----
  basicAttack(time) {
    if (time < this.nextAttack) return;
    this.nextAttack = time + this.d.atkDelay;
    const a = this.aimAngle(), p = this.player;
    p.setFlipX(Math.cos(a) < 0);
    const fx = this.add.image(p.x + Math.cos(a) * 14, p.y + Math.sin(a) * 14, 'slash').setScale(0.5).setRotation(a).setDepth(99000);
    this.tweens.add({ targets: fx, alpha: 0, scale: 0.65, duration: 180, onComplete: () => fx.destroy() });
    sfx('swing');
    for (const m of this.monsters) {
      if (m.dead) continue;
      const d = Phaser.Math.Distance.Between(p.x, p.y, m.x, m.y);
      const reach = 46 + (m.def.boss ? 18 : 0);
      if (d > reach) continue;
      const diff = Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(m.y - p.y, m.x - p.x) - a));
      if (diff < 1.15 || d < 18) this.damageMonster(m, this.d.atk, true);
    }
  }
  useSkill(s, time) {
    const st = this.st;
    if (st.lv < s.lv) { UI.msg(`${s.name}: 레벨 ${s.lv}부터 사용할 수 있습니다.`, 'dim'); return; }
    if ((this.cds[s.id] || 0) > time) return;
    if (st.mp < s.mp) { UI.msg('마나가 부족합니다.', 'dim'); return; }
    st.mp -= s.mp; this.cds[s.id] = time + s.cd; UI.dirty = true;
    const p = this.player, a = this.aimAngle();
    if (s.id === 'whirl') {
      const fx = this.add.image(p.x, p.y, 'ring').setScale(0.2).setDepth(99000);
      this.tweens.add({ targets: fx, scale: 0.65, alpha: 0, angle: 360, duration: 320, onComplete: () => fx.destroy() });
      sfx('swing');
      for (const m of this.monsters) if (!m.dead && Phaser.Math.Distance.Between(p.x, p.y, m.x, m.y) < 72) this.damageMonster(m, this.d.atk * 1.6, true);
    } else if (s.id === 'fireball') {
      sfx('cast');
      this.spawnProj(p.x, p.y, a, 340, 'fireball', 'player', this.d.spell * 1.5, 40);
    } else if (s.id === 'heal') {
      const amt = Math.round(this.d.spell * 2.5 + this.d.maxHp * 0.2);
      st.hp = Math.min(this.d.maxHp, st.hp + amt); sfx('heal');
      this.floatText(p.x, p.y - 20, '+' + amt, '#7dff8a');
      this.burst(p.x, p.y, 0x8cff9a, 16);
    } else if (s.id === 'dash') {
      p.body.setVelocity(Math.cos(a) * 560, Math.sin(a) * 560);
      this.dashUntil = time + 190; this.invulnUntil = time + 260;
      p.setFlipX(Math.cos(a) < 0);
      this.dashHit = new Set();
      const ghost = () => { const g = this.add.image(p.x, p.y, 'player').setScale(0.5).setFlipX(p.flipX).setAlpha(0.5).setTint(0x88ccff).setDepth(p.depth - 1); this.tweens.add({ targets: g, alpha: 0, duration: 250, onComplete: () => g.destroy() }); };
      for (let i = 0; i < 4; i++) this.time.delayedCall(i * 45, () => {
        ghost();
        for (const m of this.monsters) if (!m.dead && !this.dashHit.has(m) && Phaser.Math.Distance.Between(p.x, p.y, m.x, m.y) < 30) { this.dashHit.add(m); this.damageMonster(m, this.d.atk * 1.2, true); }
      });
      sfx('swing');
    }
  }
  damageMonster(m, base, physical) {
    if (m.dead) return;
    const crit = Math.random() * 100 < this.d.crit;
    let dmg = base * rand(0.88, 1.12) * (crit ? 1.8 : 1) - m.def.def * (physical ? 0.5 : 0.25);
    dmg = Math.max(1, Math.round(dmg));
    m.hp -= dmg;
    m.state = 'chase';
    this.floatText(m.x, m.y - 18, (crit ? '치명타! ' : '') + dmg, crit ? '#ffd23a' : '#ffffff', crit ? 12 : 10);
    m.sp.setTintFill(0xffffff); this.time.delayedCall(70, () => m.sp.clearTint());
    if (!m.def.boss) { const a = Math.atan2(m.y - this.player.y, m.x - this.player.x); m.sp.body.setVelocity(Math.cos(a) * 160, Math.sin(a) * 160); m.nextAtk = Math.max(m.nextAtk, this.time.now + 250); }
    sfx(crit ? 'crit' : 'hit');
    if (m.hp <= 0) this.killMonster(m);
  }
  killMonster(m) {
    m.dead = true; m.sp.body.enable = false; m.sp.body.setVelocity(0);
    this.tweens.add({ targets: m.sp, alpha: 0, scaleX: 0.7, scaleY: 0.2, duration: 350, onComplete: () => m.sp.setVisible(false) });
    this.burst(m.x, m.y, m.def.boss ? 0xc58cff : 0xffffff, m.def.boss ? 40 : 8);
    const d = m.def, st = this.st;
    st.kills++;
    this.gainExp(d.exp);
    // 드롭
    this.spawnDrop(m.x, m.y, 'gold', randi(d.gold[0], d.gold[1]));
    if (Math.random() < 0.18) this.spawnDrop(m.x + rand(-10, 10), m.y + rand(-6, 6), Math.random() < 0.65 ? 'hp' : 'mp', 1);
    const gearN = d.boss ? 3 : (Math.random() < 0.11 ? 1 : 0);
    for (let i = 0; i < gearN; i++) this.spawnDrop(m.x + rand(-18, 18), m.y + rand(-12, 12), 'gear', 1, rollGear(d.lv, d.boss ? 0.2 : 0));
    // 퀘스트
    const q = QUESTS[st.quest.idx];
    if (q && st.quest.state === 'active' && q.target === m.type) {
      st.quest.progress++;
      if (st.quest.progress >= q.count) { st.quest.state = 'done'; UI.msg(`퀘스트 [${q.title}] 완료! 촌장에게 돌아가세요.`, 'gold'); sfx('level'); }
      UI.dirty = true;
    }
    if (d.boss) { st.bossKills++; UI.msg('고대 리치를 쓰러뜨렸습니다! 폐허에 잠시 평화가 찾아옵니다.', 'gold'); this.cameras.main.flash(400, 200, 160, 255); }
    this.time.delayedCall(d.respawn || rand(9000, 14000), () => {
      m.reset();
      m.sp.setAlpha(0); this.tweens.add({ targets: m.sp, alpha: 1, duration: 500 });
    });
  }
  gainExp(n) {
    const st = this.st;
    st.exp += n;
    this.floatText(this.player.x, this.player.y - 30, `+${n} EXP`, '#9fd8ff', 9);
    let up = false;
    while (st.exp >= expNeed(st.lv)) { st.exp -= expNeed(st.lv); st.lv++; st.points += 5; up = true; }
    if (up) {
      this.recalc(); st.hp = this.d.maxHp; st.mp = this.d.maxMp;
      sfx('level'); this.burst(this.player.x, this.player.y, 0xffd23a, 30);
      this.floatText(this.player.x, this.player.y - 40, 'LEVEL UP!', '#ffd23a', 14);
      UI.msg(`레벨 ${st.lv} 달성! 능력치 포인트 5를 얻었습니다. (C: 캐릭터 창)`, 'gold');
      const unlocked = SKILLS.find(s => s.lv === st.lv);
      if (unlocked) UI.msg(`새 스킬 [${unlocked.name}] 사용 가능! (${unlocked.label}키)`, 'gold');
      this.save();
    }
    UI.dirty = true;
  }
  hurtPlayer(raw, src) {
    if (this.dead || this.time.now < this.invulnUntil) return;
    const dmg = Math.max(1, Math.round(raw - this.d.def * 0.6));
    this.st.hp -= dmg;
    this.floatText(this.player.x, this.player.y - 18, '-' + dmg, '#ff5a5a', 10);
    this.player.setTintFill(0xff4444); this.time.delayedCall(80, () => this.player.clearTint());
    this.cameras.main.shake(80, 0.003);
    sfx('hurt'); UI.dirty = true; UI.hurtFlash();
    if (this.st.hp <= 0) this.die(src);
  }
  die(src) {
    this.dead = true; this.st.hp = 0;
    const lost = Math.floor(this.st.gold * 0.1);
    this.st.gold -= lost;
    sfx('die');
    this.player.setTint(0x555555).setAngle(90);
    UI.death(true, `${src ? src.def.name + '에게 ' : ''}쓰러졌습니다. (골드 ${fmt(lost)} 잃음)`);
    this.time.delayedCall(3000, () => {
      const t = this.townCenter();
      this.player.setPosition(t.x, t.y).clearTint().setAngle(0);
      this.st.hp = this.d.maxHp; this.st.mp = this.d.maxMp;
      this.dead = false; this.invulnUntil = this.time.now + 2000;
      for (const m of this.monsters) if (m.state === 'chase') m.state = 'return';
      this.projs.forEach(pr => pr.sp.destroy()); this.projs = [];
      UI.death(false); this.save();
    });
  }
  drink(kind) {
    const st = this.st;
    if (st.potions[kind] <= 0) { UI.msg(`${POTIONS[kind].name}이 없습니다. 상인에게 구입하세요.`, 'dim'); return; }
    if (kind === 'hp' && st.hp >= this.d.maxHp) return;
    if (kind === 'mp' && st.mp >= this.d.maxMp) return;
    st.potions[kind]--;
    if (kind === 'hp') { st.hp = Math.min(this.d.maxHp, st.hp + POTIONS.hp.heal); this.floatText(this.player.x, this.player.y - 20, '+' + POTIONS.hp.heal, '#7dff8a'); }
    else { st.mp = Math.min(this.d.maxMp, st.mp + POTIONS.mp.mana); this.floatText(this.player.x, this.player.y - 20, '+' + POTIONS.mp.mana, '#7fb4ff'); }
    sfx('heal'); UI.dirty = true;
  }
  regen() {
    if (this.dead) return;
    const st = this.st, f = this.inTown ? 5 : 1;
    st.hp = Math.min(this.d.maxHp, st.hp + this.d.maxHp * 0.008 * f + this.d.vit * 0.05);
    st.mp = Math.min(this.d.maxMp, st.mp + this.d.maxMp * 0.02 * f);
    UI.dirty = true;
  }

  // ---- 투사체 ----
  spawnProj(x, y, ang, speed, tex, owner, dmg, aoe) {
    const sp = this.add.image(x, y, tex).setScale(owner === 'player' ? 0.6 : 0.5).setDepth(99500).setBlendMode(Phaser.BlendModes.ADD);
    this.projs.push({ sp, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, owner, dmg, aoe, until: this.time.now + 1800 });
  }
  updateProjs(dt) {
    const keep = [];
    for (const pr of this.projs) {
      pr.sp.x += pr.vx * dt; pr.sp.y += pr.vy * dt; pr.sp.rotation += dt * 8;
      let hit = this.time.now >= pr.until || isBlocked(this.mapData, pr.sp.x, pr.sp.y + 6);
      if (!hit && pr.owner === 'player') {
        for (const m of this.monsters) if (!m.dead && Phaser.Math.Distance.Between(pr.sp.x, pr.sp.y, m.x, m.y) < (m.def.boss ? 30 : 16)) { hit = true; break; }
      } else if (!hit && !this.dead && Phaser.Math.Distance.Between(pr.sp.x, pr.sp.y, this.player.x, this.player.y) < 12) {
        hit = true; this.hurtPlayer(pr.dmg * rand(0.9, 1.1), this.boss);
      }
      if (hit) {
        if (pr.owner === 'player') {
          sfx('boom'); this.burst(pr.sp.x, pr.sp.y, 0xff8a2a, 14);
          const fx = this.add.image(pr.sp.x, pr.sp.y, 'fireball').setScale(0.6).setDepth(99500).setBlendMode(Phaser.BlendModes.ADD);
          this.tweens.add({ targets: fx, scale: 2.4, alpha: 0, duration: 260, onComplete: () => fx.destroy() });
          for (const m of this.monsters) if (!m.dead && Phaser.Math.Distance.Between(pr.sp.x, pr.sp.y, m.x, m.y) < pr.aoe + (m.def.boss ? 14 : 0)) this.damageMonster(m, pr.dmg, false);
        }
        pr.sp.destroy();
      } else keep.push(pr);
    }
    this.projs = keep;
  }

  // ---- 드롭 ----
  spawnDrop(x, y, kind, amount, item) {
    if (isBlocked(this.mapData, x, y + 6)) { x = this.player.x; y = this.player.y; }
    const tex = kind === 'gear' ? 'drop_gear' : 'drop_' + kind;
    const sp = this.add.image(x, y, tex).setScale(0.6).setDepth(y - 4);
    const dr = { sp, kind, amount, item, born: this.time.now };
    if (item) {
      const col = RARITY[item.rarity].color;
      sp.setTint(Phaser.Display.Color.HexStringToColor(col).color);
      dr.label = this.add.text(x, y - 12, item.name, this.textStyle(8, col)).setOrigin(0.5).setDepth(99970);
      if (item.rarity >= 2) { dr.glow = this.add.image(x, y, 'spark').setScale(4).setAlpha(0.35).setTint(sp.tintTopLeft).setBlendMode(Phaser.BlendModes.ADD).setDepth(y - 5); this.tweens.add({ targets: dr.glow, alpha: 0.1, duration: 600, yoyo: true, repeat: -1 }); }
    }
    sp.y -= 10; this.tweens.add({ targets: sp, y: y, duration: 300, ease: 'Bounce.out' });
    this.drops.push(dr);
  }
  updateDrops() {
    if (this.dead) return;
    const p = this.player, now = this.time.now;
    this.drops = this.drops.filter(dr => {
      if (now - dr.born > 90000) { this.removeDrop(dr); return false; }
      if (now - dr.born < 350 || Phaser.Math.Distance.Between(dr.sp.x, dr.sp.y, p.x, p.y + 6) > 20) return true;
      const st = this.st;
      if (dr.kind === 'gold') { st.gold += dr.amount; this.floatText(dr.sp.x, dr.sp.y - 10, `+${dr.amount} G`, '#ffd23a', 9); sfx('coin'); }
      else if (dr.kind === 'hp' || dr.kind === 'mp') { st.potions[dr.kind] += dr.amount; UI.msg(`${POTIONS[dr.kind].name} 획득`, 'dim'); sfx('pick'); }
      else {
        if (st.inv.length >= 24) { if (!dr.warned) { UI.msg('가방이 가득 찼습니다!', 'dim'); dr.warned = true; } return true; }
        st.inv.push(dr.item); sfx('pick');
        UI.msg(`<span style="color:${RARITY[dr.item.rarity].color}">[${RARITY[dr.item.rarity].name}] ${dr.item.name}</span> 획득`);
      }
      UI.dirty = true; this.removeDrop(dr); return false;
    });
  }
  removeDrop(dr) { dr.sp.destroy(); if (dr.label) dr.label.destroy(); if (dr.glow) dr.glow.destroy(); }

  // ---- 연출 ----
  floatText(x, y, text, color, size = 10) {
    const t = this.add.text(x + rand(-6, 6), y, text, this.textStyle(size, color)).setOrigin(0.5).setDepth(100000);
    this.tweens.add({ targets: t, y: y - 22, alpha: 0, duration: 800, ease: 'Cubic.out', onComplete: () => t.destroy() });
  }
  burst(x, y, tint, n) {
    for (let i = 0; i < n; i++) {
      const s = this.add.image(x, y, 'spark').setTint(tint).setDepth(99600).setBlendMode(Phaser.BlendModes.ADD).setScale(rand(0.5, 1.2));
      const a = rand(0, Math.PI * 2), r = rand(12, 40);
      this.tweens.add({ targets: s, x: x + Math.cos(a) * r, y: y + Math.sin(a) * r - 10, alpha: 0, duration: rand(300, 650), onComplete: () => s.destroy() });
    }
  }
  drawOverlay() {
    const g = this.overlay; g.clear();
    for (const m of this.monsters) {
      if (m.dead || m.hp >= m.maxHp || m.def.boss) continue;
      const w = 22, x = m.x - w / 2, y = m.y - 20;
      g.fillStyle(0x000000, 0.7).fillRect(x - 1, y - 1, w + 2, 4);
      g.fillStyle(0xe0344a, 1).fillRect(x, y, w * Math.max(0, m.hp / m.maxHp), 2);
    }
    const b = this.boss;
    this.bossLabel.setVisible(!b.dead).setPosition(b.x, b.y - 40);
    if (!b.dead) {
      const w = 56, x = b.x - w / 2, y = b.y - 34;
      g.fillStyle(0x000000, 0.75).fillRect(x - 1, y - 1, w + 2, 5);
      g.fillStyle(0xa04aff, 1).fillRect(x, y, w * Math.max(0, b.hp / b.maxHp), 3);
    }
    UI.bossBar(b.state === 'chase' && !b.dead ? b.hp / b.maxHp : null);
  }
}
