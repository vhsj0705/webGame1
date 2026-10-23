// ---------------------------------------------------------------------
// DOM HUD: 상태바, 스킬바, 미니맵, 퀘스트, 가방/캐릭터/상점/대화 창
// ---------------------------------------------------------------------
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const UI = {
  scene: null, dirty: true, panel: null, lastMini: 0,

  init(scene) {
    this.scene = scene;
    $('hud').hidden = false;
    this.buildSkillbar();
    this.buildMinimap();
    document.addEventListener('keydown', e => this.onKey(e));
    document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => this.close());
    $('btn-inv').onclick = () => this.toggle('inv');
    $('btn-char').onclick = () => this.toggle('char');
    $('btn-help').onclick = () => this.toggle('help');
    document.addEventListener('mousemove', e => { const t = $('tooltip'); t.style.left = Math.min(e.clientX + 16, innerWidth - t.offsetWidth - 8) + 'px'; t.style.top = Math.min(e.clientY + 16, innerHeight - t.offsetHeight - 8) + 'px'; });
    this.dirty = true;
  },
  get st() { return this.scene.st; },
  get d() { return this.scene.d; },

  onKey(e) {
    if (!this.scene) return;
    const k = e.key.toLowerCase();
    if (k === 'i' || k === 'ㅑ') this.toggle('inv');
    else if (k === 'c' || k === 'ㅊ') this.toggle('char');
    else if (k === 'h' || k === 'ㅗ' || e.key === 'F1') { e.preventDefault(); this.toggle('help'); }
    else if (e.key === 'Escape') this.close();
  },
  modalOpen() { return this.panel === 'shop' || this.panel === 'dialog'; },
  toggle(id) { if (this.panel === id) this.close(); else this.open(id); },
  open(id) {
    this.close();
    this.panel = id;
    const map = { inv: 'panel-inv', char: 'panel-char', shop: 'panel-shop', dialog: 'panel-dialog', help: 'panel-help' };
    $(map[id]).hidden = false;
    if (id === 'shop') $('panel-inv').hidden = false;
    this.renderPanels(); sfx('ui');
  },
  close() {
    for (const id of ['panel-inv', 'panel-char', 'panel-shop', 'panel-dialog', 'panel-help']) $(id).hidden = true;
    this.panel = null; this.hideTip();
  },

  // ---- 매 프레임 ----
  update(time) {
    const st = this.st, d = this.d;
    if (this.dirty) {
      this.dirty = false;
      $('lv').textContent = st.lv;
      this.bar('hp', st.hp, d.maxHp); this.bar('mp', st.mp, d.maxMp); this.bar('exp', st.exp, expNeed(st.lv));
      $('gold').textContent = fmt(st.gold);
      $('pot-hp').textContent = st.potions.hp; $('pot-mp').textContent = st.potions.mp;
      $('pts-badge').hidden = st.points <= 0;
      this.renderQuest();
      if (this.panel) this.renderPanels();
    }
    SKILLS.forEach(s => {
      const el = $('sk-' + s.id), cd = this.scene.cds[s.id] || 0;
      const left = Math.max(0, cd - time);
      el.querySelector('.cd').style.height = (left / s.cd * 100) + '%';
      el.querySelector('.cdt').textContent = left > 0 ? (left / 1000).toFixed(1) : '';
      el.classList.toggle('locked', st.lv < s.lv);
      el.classList.toggle('nomp', st.mp < s.mp && st.lv >= s.lv);
    });
    if (time - this.lastMini > 200) { this.lastMini = time; this.drawMinimap(); }
  },
  bar(id, v, max) {
    $(id + '-fill').style.width = clamp(v / max * 100, 0, 100) + '%';
    $(id + '-txt').textContent = id === 'exp' ? `${(v / max * 100).toFixed(1)}%` : `${Math.ceil(v)} / ${max}`;
  },
  msg(html, cls = '') {
    const log = $('log'), div = document.createElement('div');
    div.className = 'line ' + cls; div.innerHTML = html;
    log.appendChild(div);
    while (log.children.length > 7) log.removeChild(log.firstChild);
    setTimeout(() => div.classList.add('fade'), 7000);
  },
  zone(name) {
    $('zone-name').textContent = name;
    const b = $('zone-banner'); b.textContent = name;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  },
  hurtFlash() { const v = $('vignette'); v.classList.remove('hit'); void v.offsetWidth; v.classList.add('hit'); },
  death(show, text) { $('death').hidden = !show; if (text) $('death-text').textContent = text; },
  bossBar(ratio) {
    $('bossbar').hidden = ratio === null;
    if (ratio !== null) $('bossbar-fill').style.width = (ratio * 100) + '%';
  },

  // ---- 스킬바 ----
  buildSkillbar() {
    const bar = $('skills');
    bar.innerHTML = `<div class="slot" title="기본 공격 (좌클릭 / Space)"><span class="ico">⚔</span><span class="key">LMB</span></div>` +
      SKILLS.map(s => `<div class="slot" id="sk-${s.id}"><span class="ico">${s.icon}</span><span class="key">${s.label}</span><span class="mpc">${s.mp}</span><div class="cd"></div><span class="cdt"></span></div>`).join('') +
      `<div class="slot pot" title="체력 물약 (Q)"><img src="${ICONS.hp}"><span class="key">Q</span><span class="cnt" id="pot-hp"></span></div>` +
      `<div class="slot pot" title="마나 물약 (R)"><img src="${ICONS.mp}"><span class="key">R</span><span class="cnt" id="pot-mp"></span></div>`;
    SKILLS.forEach(s => {
      const el = $('sk-' + s.id);
      el.onmouseenter = () => this.showTip(`<b>${s.name}</b> <span class="dim">(${s.label}키)</span><br>${s.desc}<br><span class="blue">마나 ${s.mp}</span> · 재사용 ${s.cd / 1000}초<br><span class="dim">레벨 ${s.lv} 이상</span>`);
      el.onmouseleave = () => this.hideTip();
    });
  },

  // ---- 미니맵 ----
  buildMinimap() {
    const c = document.createElement('canvas'); c.width = MAP_W; c.height = MAP_H;
    const ctx = c.getContext('2d');
    const col = { [T.GRASS]: '#4f8a3a', [T.GRASS2]: '#46803a', [T.FLOWER]: '#4f8a3a', [T.PATH]: '#b08a5a', [T.SAND]: '#dcc68c', [T.WATER]: '#2f6fb3', [T.TREE]: '#1f5a2a', [T.WALL]: '#4b4d58', [T.FLOOR]: '#b3ab98', [T.DFLOOR]: '#3d3948', [T.ROCK]: '#7b7d86', [T.BRIDGE]: '#8a5a2b' };
    const m = this.scene.mapData;
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) { ctx.fillStyle = col[m[y][x]]; ctx.fillRect(x, y, 1, 1); }
    this.miniBase = c;
  },
  drawMinimap() {
    const cv = $('minimap'), ctx = cv.getContext('2d'), sx = cv.width / (MAP_W * TILE), sy = cv.height / (MAP_H * TILE);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.miniBase, 0, 0, cv.width, cv.height);
    const dot = (x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x * sx, y * sy, r, 0, 7); ctx.fill(); };
    for (const m of this.scene.monsters) if (!m.dead) dot(m.x, m.y, m.def.boss ? 4 : 1.6, m.def.boss ? '#c58cff' : '#ff4a4a');
    for (const n of this.scene.npcs) dot(n.sp.x, n.sp.y, 2.2, '#ffe14a');
    const p = this.scene.player;
    dot(p.x, p.y, 3.4, '#000'); dot(p.x, p.y, 2.4, '#fff');
  },

  // ---- 퀘스트 ----
  renderQuest() {
    const q = QUESTS[this.st.quest.idx], qs = this.st.quest, el = $('quest');
    if (!q) { el.innerHTML = '<div class="qt">모든 퀘스트 완료</div><div class="qd">왕국에 평화가 찾아왔습니다.</div>'; return; }
    if (qs.state === 'none') el.innerHTML = `<div class="qt">새 의뢰</div><div class="qd">마을의 촌장 아르덴에게 말을 거세요.</div>`;
    else if (qs.state === 'active') el.innerHTML = `<div class="qt">${q.title}</div><div class="qd">${MONSTERS[q.target].name} 처치 <b>${qs.progress} / ${q.count}</b></div>`;
    else el.innerHTML = `<div class="qt done">${q.title} ✔</div><div class="qd">촌장에게 돌아가 보상을 받으세요.</div>`;
  },
  openQuestDialog(npc) {
    const st = this.st, qs = st.quest, q = QUESTS[qs.idx];
    if (!q) { this.dialog(npc.name, '자네는 이 왕국의 영웅일세. 언제든 쉬어 가게나.'); return; }
    if (qs.state === 'none') {
      this.dialog(npc.name, q.talk, [{ label: `수락: ${q.title}`, fn: () => { qs.state = 'active'; qs.progress = 0; this.msg(`퀘스트 [${q.title}] 수락`, 'gold'); this.dirty = true; this.close(); } }, { label: '나중에', fn: () => this.close() }]);
    } else if (qs.state === 'active') {
      this.dialog(npc.name, `아직 ${MONSTERS[q.target].name}이(가) 남아 있네. (${qs.progress} / ${q.count})`);
    } else {
      const rew = makeGear(q.reward, 1);
      this.dialog(npc.name, `${q.done}<br><br><span class="gold">보상: 경험치 ${fmt(q.exp)}, 골드 ${fmt(q.gold)}, <span style="color:${RARITY[1].color}">${rew.name}</span></span>`, [{ label: '보상 받기', fn: () => {
        st.gold += q.gold;
        if (st.inv.length < 24) st.inv.push(rew); else this.scene.spawnDrop(this.scene.player.x, this.scene.player.y + 10, 'gear', 1, rew);
        qs.idx++; qs.state = 'none'; qs.progress = 0;
        this.scene.gainExp(q.exp); this.scene.save();
        this.close(); this.dirty = true;
        if (QUESTS[qs.idx]) this.msg('촌장에게 새 의뢰가 있습니다.', 'gold');
      } }]);
    }
  },
  dialog(name, html, buttons = [{ label: '닫기', fn: () => this.close() }]) {
    this.open('dialog');
    $('dlg-name').textContent = name;
    $('dlg-text').innerHTML = html;
    const box = $('dlg-btns'); box.innerHTML = '';
    for (const b of buttons) { const el = document.createElement('button'); el.textContent = b.label; el.onclick = b.fn; box.appendChild(el); }
  },

  // ---- 상점 ----
  openShop() { this.open('shop'); },
  renderShop() {
    const st = this.st, list = $('shop-list');
    const rows = [
      ...['hp', 'mp'].map(k => ({ icon: ICONS[k], name: POTIONS[k].name, desc: k === 'hp' ? `생명력 +${POTIONS.hp.heal}` : `마나 +${POTIONS.mp.mana}`, price: POTIONS[k].price, buy: () => { st.potions[k]++; } })),
      ...SHOP_GEAR.map(id => { const b = ITEM_BASES[id]; return { icon: ICONS[itemIconKey({ slot: b.slot, base: id })], name: b.name, desc: `${SLOT_NAMES[b.slot]} · ${b.atk ? '공격 ' + b.atk : ''}${b.def ? '방어 ' + b.def : ''}${b.int ? ' 지능 +' + b.int : ''}${!b.atk && !b.def ? '랜덤 옵션 1개' : ''} · Lv ${b.lv}`, price: b.price, buy: () => {
        if (st.inv.length >= 24) { this.msg('가방이 가득 찼습니다!', 'dim'); return false; }
        st.inv.push(makeGear(id, b.slot === 'ring' ? 1 : 0));
      } }; }),
    ];
    list.innerHTML = '';
    for (const r of rows) {
      const el = document.createElement('div'); el.className = 'shop-row' + (st.gold < r.price ? ' poor' : '');
      el.innerHTML = `<img src="${r.icon}"><div class="sr-txt"><b>${r.name}</b><span>${r.desc}</span></div><div class="price">${fmt(r.price)} G</div>`;
      el.onclick = () => {
        if (st.gold < r.price) { this.msg('골드가 부족합니다.', 'dim'); return; }
        if (r.buy() === false) return;
        st.gold -= r.price; sfx('coin'); this.dirty = true;
      };
      list.appendChild(el);
    }
  },

  // ---- 가방 / 장비 ----
  renderPanels() {
    if (!$('panel-inv').hidden) this.renderInv();
    if (!$('panel-char').hidden) this.renderChar();
    if (!$('panel-shop').hidden) this.renderShop();
  },
  renderInv() {
    const st = this.st, shop = this.panel === 'shop';
    $('inv-hint').textContent = shop ? '클릭: 판매' : '클릭: 장착 · 우클릭: 판매(상점에서)';
    const eq = $('equip'); eq.innerHTML = '';
    for (const s of SLOTS) {
      const it = st.equip[s], el = document.createElement('div');
      el.className = 'eslot' + (it ? ' r' + it.rarity : '');
      el.innerHTML = it ? `<img src="${ICONS[itemIconKey(it)]}">` : `<span>${SLOT_NAMES[s]}</span>`;
      if (it) { el.onmouseenter = () => this.showTip(this.itemTip(it, '클릭: 해제')); el.onmouseleave = () => this.hideTip(); el.onclick = () => this.unequip(s); }
      eq.appendChild(el);
    }
    const grid = $('inv-grid'); grid.innerHTML = '';
    for (let i = 0; i < 24; i++) {
      const it = st.inv[i], el = document.createElement('div');
      el.className = 'islot' + (it ? ' r' + it.rarity : '');
      if (it) {
        el.innerHTML = `<img src="${ICONS[itemIconKey(it)]}">` + (it.lv > st.lv ? '<i class="req"></i>' : '');
        el.onmouseenter = () => this.showTip(this.itemTip(it, shop ? `클릭: 판매 (${fmt(sellPrice(it))} G)` : '클릭: 장착', st.equip[it.slot]));
        el.onmouseleave = () => this.hideTip();
        el.onclick = () => shop ? this.sell(i) : this.equip(i);
        el.oncontextmenu = e => { e.preventDefault(); if (shop) this.sell(i); };
      }
      grid.appendChild(el);
    }
    $('inv-gold').textContent = fmt(st.gold);
  },
  equip(i) {
    const st = this.st, it = st.inv[i];
    if (it.lv > st.lv) { this.msg(`레벨 ${it.lv} 이상만 장착할 수 있습니다.`, 'dim'); return; }
    const old = st.equip[it.slot];
    st.equip[it.slot] = it; st.inv.splice(i, 1);
    if (old) st.inv.splice(i, 0, old);
    this.scene.recalc(); this.hideTip(); sfx('pick');
  },
  unequip(slot) {
    const st = this.st;
    if (st.inv.length >= 24) { this.msg('가방이 가득 찼습니다!', 'dim'); return; }
    st.inv.push(st.equip[slot]); st.equip[slot] = null;
    this.scene.recalc(); this.hideTip();
  },
  sell(i) {
    const st = this.st, it = st.inv[i];
    st.gold += sellPrice(it); st.inv.splice(i, 1);
    this.msg(`${esc(it.name)} 판매 (+${fmt(sellPrice(it))} G)`, 'dim');
    sfx('coin'); this.hideTip(); this.dirty = true;
  },
  itemTip(it, action, cmp) {
    const r = RARITY[it.rarity];
    let h = `<b style="color:${r.color}">${esc(it.name)}</b><br><span class="dim">${r.name} ${SLOT_NAMES[it.slot]} · 요구 레벨 ${it.lv}</span><br>`;
    const diff = (k, v) => { if (!cmp || cmp === it) return ''; const o = cmp[k] || 0; return v > o ? ` <span class="up">▲${v - o}</span>` : v < o ? ` <span class="down">▼${o - v}</span>` : ''; };
    if (it.atk) h += `공격력 ${it.atk}${diff('atk', it.atk)}<br>`;
    if (it.def) h += `방어력 ${it.def}${diff('def', it.def)}<br>`;
    if (it.int) h += `지능 +${it.int}<br>`;
    for (const a of it.affixes) { const A = AFFIXES.find(x => x.k === a.k); h += `<span class="blue">${A.name} +${a.v}${A.unit || ''}</span><br>`; }
    h += `<span class="dim">판매가 ${fmt(sellPrice(it))} G</span><br><span class="gold">${action}</span>`;
    return h;
  },

  // ---- 캐릭터 ----
  renderChar() {
    const st = this.st, d = this.d;
    $('char-pts').textContent = st.points;
    const stat = (k, name, desc) => `<div class="stat"><span>${name}</span><b>${d[k]}</b><small>${desc}</small>${st.points > 0 ? `<button data-stat="${k}">+</button>` : ''}</div>`;
    $('char-stats').innerHTML =
      stat('str', '힘', '공격력') + stat('dex', '민첩', '치명타·공격속도·이동') + stat('int', '지능', '마나·주문력') + stat('vit', '체력', '생명력·방어');
    $('char-derived').innerHTML = [
      ['레벨', st.lv], ['공격력', d.atk], ['주문력', d.spell], ['방어력', d.def], ['치명타', d.crit + '%'],
      ['최대 생명력', d.maxHp], ['최대 마나', d.maxMp], ['공격 간격', (d.atkDelay / 1000).toFixed(2) + '초'], ['처치 수', fmt(st.kills)],
    ].map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
    $('char-stats').querySelectorAll('button').forEach(b => b.onclick = () => {
      if (st.points <= 0) return;
      st.points--; st.stats[b.dataset.stat]++; this.scene.recalc(); sfx('ui');
    });
  },

  showTip(html) { const t = $('tooltip'); t.innerHTML = html; t.hidden = false; },
  hideTip() { $('tooltip').hidden = true; },
};
