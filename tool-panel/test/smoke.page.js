/* smoke.page.js — runs INSIDE the game page (via test.mjs). Verifies every panel action drives the real
 * game mechanism, then restores the exact pre-test save. Returns a JSON report. */
(async function () {
  const RT = window.__RT;
  if (!RT || !RT.G || !RT.A) return JSON.stringify([{ name: 'panel', ok: false, detail: 'panel chưa inject (node inject.mjs)' }]);
  const G = RT.G;
  const A = RT.A;
  const results = [];
  const saveKey = G.val('storageKey');
  const ownerKey = G.val('ownerKey');
  const snap = localStorage.getItem(saveKey);
  const snapOwner = localStorage.getItem(ownerKey);
  if (!snap) return JSON.stringify([{ name: 'snapshot', ok: false, detail: 'không có save để snapshot' }]);

  const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
  async function t(name, fn) {
    try { const d = await fn(); results.push({ name, ok: true, detail: d == null ? '' : String(d) }); }
    catch (e) { results.push({ name, ok: false, detail: e.message }); }
  }

  try {
    await t('health', () => { const h = G.health(); assert(!h.missing.length, 'thiếu ' + h.missing.join(',')); return h.ok + '/' + h.total; });

    await t('anti-cheat: chặn mặc định', () => { assert(A.P.noCheatHit.isOn(), 'noCheatHit chưa bật mặc định'); });
    await t('anti-cheat: ngưỡng khớp luật game (ngày 1)', () => {
      const L = A.antiCheat.limits();
      const C = G.lex('CFG');
      const day = G.get('day');
      const r1 = day < C[G.field('cfgThiefDay')] ? C[G.field('cfgThiefMoney')] : Infinity;
      const r2 = C[G.field('cfgStartMoney')] + day * G.val('sanitizeCapPerDay');
      assert(L.rule1 === r1 && L.rule2 === r2, JSON.stringify(L));
      return 'rule1=' + L.rule1 + ' rule2=' + L.rule2;
    });
    await t('anti-cheat: cheatHit bị chặn khi tiền vượt ngưỡng', () => {
      A.setMoney(2e8);
      G.call('cheatHit');
      assert(G.get('money') === 2e8, 'bị tịch thu → ' + G.get('money'));
      assert(!G.S().badNow, 'badNow bị đặt');
    });
    await t('setMoney', () => { A.setMoney(123456789); assert(G.get('money') === 123456789, 'money=' + G.get('money')); });
    await t('addMoney', () => { A.addMoney(1000); assert(G.get('money') === 123457789, 'money=' + G.get('money')); });

    await t('setRating 4.5 chính xác', () => { A.setRating(4.5); const r = G.call('rating'); assert(Math.abs(r - 4.5) < 1e-9, 'rating=' + r); return r; });
    await t('setRating 4.975 chính xác (1/40)', () => { A.setRating(4.975); const r = G.call('rating'); assert(Math.abs(r - 4.975) < 1e-9, 'rating=' + r); return r; });
    await t('claim5StarCycle → star5Count+1', () => {
      const before = G.get('star5Count', 0);
      A.claim5StarCycle();
      assert(G.get('star5Count', 0) === before + 1, 'star5Count không tăng');
      return 'rating sau reset ' + G.call('rating').toFixed(3);
    });

    await t('unlockAll', () => {
      A.unlockAll();
      const un = G.get('unlocked');
      const flav = new Set(G.lex('FLAV_KEYS'));
      const locked = Object.keys(G.lex('ITEMS')).filter(k => !flav.has(k) && !un[k]);
      assert(!locked.length, 'còn khoá: ' + locked.join(','));
    });
    await t('fillStock 50 (qua addStock của game)', () => {
      A.fillStock(50);
      const qty = G.lex('qty');
      const un = G.get('unlocked');
      const low = Object.keys(G.lex('ITEMS')).filter(k => un[k] && qty(k) < 50);
      assert(!low.length, 'thiếu: ' + low.join(','));
    });

    await t('setEvent storm', () => { A.setEvent('storm'); assert(A.currentEvent(), 'không có sự kiện'); return A.currentEvent(); });
    await t('setEvent trend (cần item)', () => { A.setEvent('trend'); const ev = G.get('ev'); assert(ev && ev[G.field('evId')] === 'trend', 'id sai'); return JSON.stringify(ev); });
    await t('clearEvent', () => { A.clearEvent(); assert(!A.currentEvent(), 'vẫn còn sự kiện'); });
    await t('setMood', () => { A.setMood('vui'); assert(G.get('mood') === 'vui', 'mood'); A.setMood(''); });

    await t('setUpgLevel + hiệu ứng game', () => {
      const cat = A.upgCats()[0];
      A.setUpgLevel(cat.key, 7);
      assert(A.upgLevel(cat.key) === 7, 'lv');
      return cat.name + ' lv7: ' + cat.bonus(7);
    });
    await t('upgradeViaGame (handleUpgLv)', () => {
      const cat = A.upgCats()[0];
      const lv = A.upgLevel(cat.key);
      const cost = A.upgCost(lv);
      A.setMoney(cost + 1000);
      A.upgradeViaGame(cat.key);
      assert(A.upgLevel(cat.key) === lv + 1, 'không lên cấp');
      assert(G.get('money') === 1000, 'game trừ sai tiền: còn ' + G.get('money'));
      return 'trừ đúng ' + RT.fmt(cost);
    });
    await t('equip toggle', () => { A.setEquip('ac', true); assert(A.hasEquip('ac'), 'bật'); A.setEquip('ac', false); assert(!A.hasEquip('ac'), 'tắt'); });

    for (const k of Object.keys(A.P)) {
      await t('patch ' + k + ' bật/tắt + khôi phục', () => {
        const p = A.P[k];
        const was = p.isOn();
        try {
          if (was) p.off();
          p.on(); assert(p.isOn(), 'không bật');
          p.off(); assert(!p.isOn(), 'không tắt');
        } finally { if (was && !p.isOn()) p.on(); }
      });
    }
    await t('gardenRenderGuard: tưới rồi đổi tab không bị ghi đè', async () => {
      assert(A.P.gardenRenderGuard.isOn(), 'guard chưa bật mặc định');
      A.openTab(G.val('gardenTabKey'));
      G.member('garden', 'waterAll')();
      A.openTab('kho');
      const kho = document.getElementById('pane').innerHTML;
      await new Promise(r => setTimeout(r, 1500));
      assert(document.getElementById('pane').innerHTML === kho, 'pane Kho bị Garden.render ghi đè');
      return 'pane giữ nguyên sau 1.5s';
    });
    await t('always5: stars() → 5', () => {
      const pat = G.val('custPat'), max = G.val('custPatMax'), sc = G.field('starsScore');
      const mk = () => ({ [pat]: 5, [max]: 100, cups: [], wrong: 0 });
      const before = G.call('stars', mk(), false)[sc];
      A.P.always5.on();
      try {
        const after = G.call('stars', mk(), false)[sc];
        assert(after === 5, 'after=' + after);
        return before + ' → ' + after;
      } finally { A.P.always5.off(); }
    });
    await t('lock5: chặn reset chu kỳ', () => {
      A.setRating(5);
      A.P.lock5.on();
      try { G.call('checkReset5'); assert(G.call('rating') === 5, 'bị reset'); } finally { A.P.lock5.off(); }
    });
    await t('virtualGuard: isStaffActive(guard)', () => {
      const id = G.val('guardStaffId');
      A.P.virtualGuard.on();
      try { assert(G.call('isStaffActive', id) === true, 'guard không active'); } finally { A.P.virtualGuard.off(); }
    });

    await t('garden addSeeds', () => {
      const k = Object.keys(A.garden.defs())[0];
      const before = (G.get('gardenSeeds') || {})[k] || 0;
      A.garden.addSeeds(5);
      assert(G.get('gardenSeeds')[k] === before + 5, 'seed');
    });
    await t('garden unlockPlots', () => { A.garden.unlockPlots(); const i = A.garden.info(); assert(i.open === i.total, i.open + '/' + i.total); return i.open + '/' + i.total; });
    await t('garden advance (game advanceDay)', () => { A.garden.advance(2); });
    await t('garden buff', () => { A.garden.setBuff('organic', 3); assert(A.garden.info().organic === 3, 'organic'); });

    await t('pet unlock + max', () => {
      A.pet.unlock('cat');
      A.pet.maxStats();
      const p = A.pet.info();
      assert(p[G.field('petUnlocked')] && p[G.field('petType')] === 'cat', 'pet');
      return G.list('petStats').map(s => s + '=' + p[s]).join(' ');
    });
    await t('pet addExp (game)', () => { A.pet.addExp(10); });

    await t('moveFree → hue, tiền không đổi', () => {
      const m = G.get('money');
      A.biz.moveFree('hue');
      assert(A.biz.currentLoc() === 'hue', 'loc=' + A.biz.currentLoc());
      assert(G.get('money') === m, 'tiền lệch ' + (G.get('money') - m));
    });
    await t('moveFree → default', () => { A.biz.moveFree(G.val('defaultLocId')); assert(A.biz.currentLoc() === G.val('defaultLocId'), 'loc'); });
    await t('branch sở hữu / bỏ', () => {
      const id = A.biz.branchId(A.biz.branches()[0]);
      A.biz.setBranch(id, true); assert(A.biz.ownsBranch(id), 'own');
      A.biz.setBranch(id, false); assert(!A.biz.ownsBranch(id), 'unown');
    });
    await t('renewTax → isTaxActive()', () => { A.biz.renewTax(); assert(A.biz.taxActive(), 'tax inactive'); });
    await t('staff thuê → isStaffActive()', () => {
      const id = G.val('guardStaffId');
      A.staff.set(id, true); assert(A.staff.active(id), 'not active');
      A.staff.set(id, false); assert(!A.staff.hired(id), 'vẫn thuê');
    });

    await t('openTab (switchTab, không reload)', () => { A.openTab('vuon'); assert(G.rt('tab') === 'vuon', 'tab=' + G.rt('tab')); A.openTab('kho'); });
    await t('export → import roundtrip', () => {
      const txt = A.exportSave();
      const m = G.get('money');
      A.setMoney(1);
      A.importSave(txt);
      assert(G.get('money') === m, 'money=' + G.get('money'));
    });
    await t('batch: 3 action = 1 render', () => {
      const name = G.fnName('renderPrep');
      const orig = window[name];
      let renders = 0;
      window[name] = function () { renders++; return orig.apply(this, arguments); };
      try { RT.batch('test', () => { A.setMoney(5); A.setRating(4); A.unlockAll(); }); } finally { window[name] = orig; }
      assert(renders === 1, 'renders=' + renders);
      return 'renders=' + renders;
    });
  } finally {
    // Restore the exact pre-test save in place (the game keeps its reference to S).
    const S = G.S();
    const data = JSON.parse(snap);
    Object.keys(S).forEach(k => { delete S[k]; });
    Object.assign(S, data);
    if (snapOwner == null) localStorage.removeItem(ownerKey); else localStorage.setItem(ownerKey, snapOwner);
    G.persist();
    G.refresh('full');
    const same = localStorage.getItem(saveKey) === snap;
    results.push({ name: 'khôi phục save', ok: same, detail: same ? 'y hệt snapshot' : 'save khác snapshot!' });
  }
  return JSON.stringify(results);
})()
