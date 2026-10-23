// ---------------------------------------------------------------------
// 시작 화면 → Phaser 게임 생성
// WebGL 셰이더가 실패하는 환경(일부 GPU/가상 머신)에서는 Canvas 렌더러로 다시 시작
// ---------------------------------------------------------------------
(function () {
  const saved = loadState();
  const cont = document.getElementById('btn-continue');
  if (saved) {
    cont.hidden = false;
    document.getElementById('save-info').textContent = `저장된 기록: 레벨 ${saved.lv} · 골드 ${fmt(saved.gold)}`;
  }
  let game = null, usedCanvas = location.search.includes('canvas');
  const boot = () => {
    game = new Phaser.Game({
      type: usedCanvas ? Phaser.CANVAS : Phaser.WEBGL,
      parent: 'game',
      backgroundColor: '#0e0d14',
      pixelArt: true,
      scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
      physics: { default: 'arcade', arcade: { debug: false } },
      scene: [GameScene],
    });
  };
  window.addEventListener('error', e => {
    if (usedCanvas || !game || !/shader|webgl/i.test(e.message || '')) return;
    usedCanvas = true;
    try { game.destroy(true); } catch (err) { /* 부팅 도중 실패 */ }
    document.getElementById('game').innerHTML = '';
    boot();
  });
  const start = state => {
    window.START_STATE = state;
    document.getElementById('title').hidden = true;
    sfx('ui');
    boot();
  };
  cont.onclick = () => start(saved);
  document.getElementById('btn-new').onclick = () => {
    if (saved && !confirm('저장된 기록을 지우고 새로 시작할까요?')) return;
    clearSave(); start(newState());
  };
})();
