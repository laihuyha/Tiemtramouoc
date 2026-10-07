/* 20-actions.js — game mechanics as actions.
 * Talks ONLY through RT.G binding keys: no game function, variable or field names live here. */
(function () {
  'use strict';
  const RT = window.__RT;
  const G = RT.G;
  const A = {};
  RT.A = A;

  const MAX_MONEY = Number.MAX_SAFE_INTEGER;
  const clampInt = (v, min, max) => Math.min(max, Math.max(min, Math.round(Number(v) || 0)));
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const fieldOf = (obj, key, fallback) => { const v = obj ? obj[G.field(key)] : undefined; return v === undefined ? fallback : v; };

  // ================= anti-cheat awareness =================
  // Both game rules end in cheatHit(), which leaves 100k–900k and confiscates the rest:
  //   ① after renders:     day < thiefDay  &&  money > thiefMoney
  //   ② on page load:      money > startMoney + day × sanitizeCapPerDay
  // A hired guard makes cheatHit a no-op and is saved with the game — the only protection that also
  // covers rule ② at the next page load, before the panel can be injected.
  const PRACTICAL_MAX = 1e12;
  A.antiCheat = {
    limits() {
      const C = G.lex('CFG') || {};
      const day = G.get('day', 1);
      const rule1 = day < C[G.field('cfgThiefDay')] ? C[G.field('cfgThiefMoney')] : Infinity;
      const rule2 = (C[G.field('cfgStartMoney')] || 0) + day * G.val('sanitizeCapPerDay');
      return { rule1, rule2, safe: Math.min(rule1, rule2) };
    },
    sessionGuard: () => G.isPatched('cheatHit'),
    durableGuard: () => A.staff.hired(G.val('guardStaffId')),
    // Highest cash the game tolerates now, given the active protections.
    maxSafe() {
      if (A.antiCheat.durableGuard()) return PRACTICAL_MAX;
      const L = A.antiCheat.limits();
      return Math.max(0, A.antiCheat.sessionGuard() ? L.rule2 : L.safe);
    },
    warnFor(money) {
      if (A.antiCheat.durableGuard()) return '';
      const L = A.antiCheat.limits();
      if (money > L.rule2) return ' · ⚠ vượt ngưỡng lúc tải trang ' + RT.fmt(L.rule2) + ' — reload sẽ bị tịch thu (thuê Bảo vệ để giữ)';
      if (money > L.rule1 && !A.antiCheat.sessionGuard()) return ' · ⚠ vượt ngưỡng anti-cheat ' + RT.fmt(L.rule1) + ' (bật "Chặn anti-cheat")';
      return '';
    }
  };
  const moneyMsg = (text, money) => { const w = A.antiCheat.warnFor(money); return { msg: text + w, kind: w ? 'warn' : 'ok' }; };

  // ================= money / day =================
  A.setMoney = v => RT.mutate('Tiền', () => {
    G.set('money', clampInt(v, 0, MAX_MONEY));
    return moneyMsg('💰 ' + RT.fmt(G.get('money')), G.get('money'));
  }, { refresh: 'head' });
  A.addMoney = n => RT.mutate('Tiền', () => {
    const next = clampInt(G.get('money', 0) + n, 0, MAX_MONEY);
    G.set('money', next);
    return moneyMsg('💰 ' + (n >= 0 ? '+' : '') + RT.fmt(n) + ' → ' + RT.fmt(next), next);
  }, { refresh: 'head' });
  A.mulMoney = k => A.addMoney(Math.round(G.get('money', 0) * (k - 1)));
  A.setMoneyMaxSafe = () => A.setMoney(A.antiCheat.maxSafe());
  A.setDay = d => RT.mutate('Ngày', () => {
    G.set('day', clampInt(d, 1, 1e6));
    return moneyMsg('📅 Ngày ' + G.get('day'), G.get('money', 0));
  });

  // ================= rating =================
  // The game averages the newest `ratingWindow` reviews. With W integer stars the reachable targets are k/W,
  // so spread sum = round(t·W) as base/base+1 stars — exact to 1/W, older history kept behind them.
  function starsFor(target) {
    const W = G.val('ratingWindow');
    const sum = Math.round(Math.min(5, Math.max(0, Number(target) || 0)) * W);
    const base = Math.floor(sum / W);
    const extra = sum - base * W;
    return Array.from({ length: W }, (_, i) => (i < extra ? base + 1 : base));
  }
  function reviewTexts() {
    const T = G.lex('TXT');
    const pool = T && Array.isArray(T[G.val('whyGreat')]) ? T[G.val('whyGreat')] : [];
    return (pool.length ? pool : ['Làm nhanh, đúng vị, sẽ quay lại']).map(t => String(t).replace(/\{mon\}/g, 'Trà sữa'));
  }
  function pushReviews(stars) {
    const day = G.get('day', 1);
    const texts = reviewTexts();
    const stamp = Date.now().toString(36);
    const fresh = stars.map((s, i) => G.shape('review', { stars: s, text: texts[i % texts.length], key: 'rt_' + stamp + '_' + i, day, name: 'Khách #' + (i + 1) }));
    const reviews = G.ensure('reviews', []);
    reviews.unshift(...fresh);
    const cap = G.val('reviewCap');
    if (reviews.length > cap) reviews.length = cap;
    G.set('revTotal', Math.max(G.get('revTotal', 0), reviews.length));
  }
  A.rating = () => (G.has('rating') ? G.call('rating') : NaN);
  A.setRating = target => RT.mutate('Rating', () => {
    pushReviews(starsFor(target));
    const r = A.rating();
    const warn = r >= G.val('reset5Threshold') && !G.isPatched('checkReset5') ? ' · ly kế tiếp sẽ kích hoạt reset chu kỳ (bật "Khoá rating" để giữ)' : '';
    return '⭐ Rating = ' + r.toFixed(2) + warn;
  });
  // Trigger the game's own prestige cycle: rating ≥ threshold → +1 star5Count, bank cap ↑, rating reset.
  A.claim5StarCycle = () => RT.mutate('Cán mốc 5★', () => {
    if (G.isPatched('checkReset5')) throw new Error('đang khoá rating — tắt khoá trước');
    if (A.rating() < G.val('reset5Threshold')) pushReviews(starsFor(5));
    const before = G.get('star5Count', 0);
    G.call('checkReset5');
    return '🏆 Cán mốc 5★: star5Count ' + before + ' → ' + G.get('star5Count', 0) + ', rating ' + A.rating().toFixed(2);
  });

  // ================= items & stock =================
  const itemKeys = () => Object.keys(G.lex('ITEMS') || {});
  const flavorSet = () => new Set(G.lex('FLAV_KEYS') || []);
  // Flavors are unlocked by the game from bottle stock, so they are skipped here and handled by fillStock.
  A.unlockAll = () => RT.mutate('Unlock', () => {
    const un = G.ensure('unlocked', {});
    const flav = flavorSet();
    const added = itemKeys().filter(k => !flav.has(k) && !un[k]);
    added.forEach(k => { un[k] = true; });
    return '🔓 Mở thêm ' + added.length + ' món';
  });
  // Tops every usable item up to `target` through the game's own addStock (correct batches + expiry).
  A.fillStock = target => RT.mutate('Kho', () => {
    const goal = clampInt(target, 1, 1e6);
    const un = G.get('unlocked', {});
    const flav = flavorSet();
    const qty = G.lex('qty');
    let added = 0, kinds = 0;
    itemKeys().forEach(k => {
      if (!un[k] && !flav.has(k)) return;
      const need = goal - (typeof qty === 'function' ? qty(k) : 0);
      if (need <= 0) return;
      G.call('addStock', k, need, G.S(), true);
      added += need; kinds++;
    });
    G.tryCall('syncFlav');
    return '📦 +' + added + ' phần cho ' + kinds + ' món (mức ' + goal + ')';
  });

  // ================= upgrade levels & equipment =================
  A.upgCats = function () {
    const C = G.lex('UPG_LV_CFG') || {};
    return Object.keys(C).map(key => ({
      key,
      name: fieldOf(C[key], 'upgName', key),
      bonus: lv => { const f = fieldOf(C[key], 'upgBonus', null); try { return typeof f === 'function' ? f(lv) : '?'; } catch (e) { return '?'; } }
    }));
  };
  A.upgLevel = cat => ((G.get('upgLv', {}) || {})[cat] || 0);
  A.upgCost = lv => (G.has('getUpgLvCost') ? G.call('getUpgLvCost', lv) : NaN);
  A.setUpgLevel = (cat, lv) => RT.mutate('Nâng cấp', () => {
    const L = G.ensure('upgLv', {});
    L[cat] = clampInt(lv, 0, 1e4);
    return '⬆ ' + cat + ' = cấp ' + L[cat];
  });
  A.upgradeViaGame = cat => RT.mutate('Nâng cấp', () => {
    const before = A.upgLevel(cat);
    G.call('handleUpgLv', cat);
    return '⬆ ' + cat + ': ' + before + ' → ' + A.upgLevel(cat) + ' (trả tiền theo game)';
  });
  A.equipFlags = () => G.list('equipFlags');
  A.hasEquip = flag => !!(G.get('staffFlags', {}) || {})[flag];
  A.setEquip = (flag, on) => RT.mutate('Trang bị', () => {
    const U = G.ensure('staffFlags', {});
    if (on) U[flag] = true; else delete U[flag];
    return (on ? '✅ ' : '⛔ ') + G.label('equip', flag);
  });

  // ================= events & mood =================
  A.events = () => { const E = G.lex('EVS') || {}; return Object.keys(E).map(id => ({ id, name: fieldOf(E[id], 'evName', id), desc: String(fieldOf(E[id], 'evDesc', '')) })); };
  A.currentEvent = function () {
    const ev = G.get('ev', null);
    if (!ev || G.get('evDay') !== G.get('day')) return null;
    const id = ev[G.field('evId')];
    const hit = A.events().find(e => e.id === id);
    return hit ? hit.name : id;
  };
  A.setEvent = id => RT.mutate('Sự kiện', () => {
    const info = A.events().find(e => e.id === id);
    // Events whose description has a "%" slot also need an item key (trending item, supplier sale).
    const needsItem = !!info && info.desc.indexOf('%') >= 0;
    const un = G.get('unlocked', {});
    const items = itemKeys().filter(k => un[k]);
    G.set('ev', G.shape('event', { id, item: needsItem && items.length ? pick(items) : undefined }));
    G.set('evDay', G.get('day', 1));
    return '🌦 ' + (info ? info.name : id);
  });
  A.clearEvent = () => RT.mutate('Sự kiện', () => { G.set('ev', null); return 'Đã xoá sự kiện'; });
  A.moods = () => G.list('moods');
  A.setMood = m => RT.mutate('Mood', () => {
    G.set('mood', m || null);
    G.set('evDay', G.get('day', 1));
    return 'Mood: ' + (m ? G.label('moods', m) : 'bình thường');
  });

  // ================= game menus (no reload) =================
  A.openTab = function (k) {
    if (G.isSelling()) throw new Error('đang trong ca bán — kết thúc ca trước');
    if (G.mode() !== 'prep') G.call('renderPrep');
    G.call('switchTab', k);
    RT.notify('📂 ' + G.label('tabs', k));
  };

  // ================= shift control =================
  A.openShop = () => { if (G.isSelling()) throw new Error('đang trong ca bán'); G.call('tryOpen'); RT.notify('▶ Mở cửa (game tự kiểm tra điều kiện)'); };
  A.endShift = () => { if (!G.isSelling()) throw new Error('chưa vào ca bán'); G.call('endDay'); RT.notify('⏹ Đã kết thúc ca'); };
  A.pause = () => { G.call('pauseGame'); RT.notify('⏸ Tạm dừng'); };
  A.resume = () => { G.call('resumeGame'); RT.notify('▶ Chơi tiếp'); };

  // ================= speed engine =================
  // tick() advances a fixed dt per call, so N calls per interval = exactly N× game speed (no timer clamping).
  // A watchdog re-installs our interval whenever the game replaces its timer (resume, new day).
  const speed = { factor: 1, id: 0 };
  function speedTick() {
    if (!G.isRunning()) return;
    const tick = G.fn('tick');
    if (!tick) return;
    for (let i = 0; i < speed.factor; i++) { tick(); if (!G.isRunning()) break; }
  }
  function speedWatch() {
    if (!G.isRunning()) return;
    const cur = G.lex('timer');
    if (cur === speed.id) return;
    clearInterval(cur);
    speed.id = setInterval(speedTick, G.val('tickMs'));
    G.setLex('timer', speed.id);
  }
  function restoreTimer() {
    if (!speed.id) return;
    if (G.lex('timer') === speed.id) {
      clearInterval(speed.id);
      G.setLex('timer', G.isRunning() && G.has('tick') ? setInterval(G.fn('tick'), G.val('tickMs')) : null);
    }
    speed.id = 0;
  }
  A.SPEEDS = [1, 2, 4, 8];
  A.getSpeed = () => speed.factor;
  A.setSpeed = function (f) {
    speed.factor = clampInt(f, 1, 8);
    if (speed.factor === 1) { RT.removeTask('speed'); restoreTimer(); }
    else RT.addTask('speed', speedWatch, 100);
    RT.notify('⏩ Tốc độ x' + speed.factor);
  };

  // ================= runtime patches (toggles) =================
  const state = { autoResume: null, caps: null };
  function keepTick() {
    const pat = G.val('custPat');
    const max = G.val('custPatMax');
    const refill = c => { if (c && typeof c[max] === 'number') c[pat] = c[max]; };
    (G.rt('slots', []) || []).forEach(refill);
    (G.rt('online', []) || []).forEach(refill);
  }
  function capsOn() {
    const C = G.lex('CFG');
    if (!C) throw new Error('thiếu CFG');
    state.caps = {};
    G.list('priceCapKeys').forEach(k => { state.caps[k] = C[k]; C[k] = 1e15; });
  }
  function capsOff() {
    const C = G.lex('CFG');
    if (C && state.caps) Object.assign(C, state.caps);
    state.caps = null;
    G.tryCall('saveCfg');
  }
  A.P = {
    noAutoPause: {
      label: '🚫 Không tự pause khi ẩn tab', refs: ['fn.pauseGame'],
      // Only the visibility-triggered pause is blocked; the in-game pause button keeps working.
      on: () => G.patch('pauseGame', orig => function () { if (document.hidden) return undefined; return orig.apply(this, arguments); }),
      off: () => G.unpatch('pauseGame'), isOn: () => G.isPatched('pauseGame')
    },
    autoResume: {
      label: '▶ Tự chơi tiếp khi quay lại', refs: ['fn.resumeGame'],
      on: () => {
        state.autoResume = () => { if (!document.hidden && G.rt('running', false) && G.rt('paused', false)) G.call('resumeGame'); };
        document.addEventListener('visibilitychange', state.autoResume);
      },
      off: () => { if (state.autoResume) document.removeEventListener('visibilitychange', state.autoResume); state.autoResume = null; },
      isOn: () => !!state.autoResume
    },
    always5: {
      label: '⭐ Mọi ly 5★', refs: ['fn.stars'],
      // The original still runs so its side effects stay consistent; only the score is overridden.
      on: () => G.patch('stars', orig => function () {
        const r = orig.apply(this, arguments) || {};
        const scoreF = G.field('starsScore');
        const out = Object.assign({}, r);
        out[scoreF] = 5;
        if (!(r[scoreF] >= 5)) out[G.field('starsWhy')] = G.val('whyGreat');
        return out;
      }),
      off: () => G.unpatch('stars'), isOn: () => G.isPatched('stars')
    },
    lock5: {
      label: '🔒 Khoá rating (chặn reset chu kỳ)', refs: ['fn.checkReset5'],
      on: () => G.patch('checkReset5', () => function () { return undefined; }),
      off: () => G.unpatch('checkReset5'), isOn: () => G.isPatched('checkReset5')
    },
    keepCustomers: {
      label: '⏳ Khách không mất kiên nhẫn', refs: [],
      on: () => RT.addTask('keep', keepTick), off: () => RT.removeTask('keep'), isOn: () => RT.hasTask('keep')
    },
    noPriceCap: {
      label: '🆓 Bỏ trần giá', refs: ['lex.CFG'],
      on: capsOn, off: capsOff, isOn: () => !!state.caps
    },
    virtualGuard: {
      label: '🛡 Bảo vệ ảo (0% tiền giả, chặn mặc cả)', refs: ['fn.isStaffActive'],
      on: () => { const id = G.val('guardStaffId'); G.patch('isStaffActive', orig => function (sid) { return sid === id || orig.apply(this, arguments); }); },
      off: () => G.unpatch('isStaffActive'), isOn: () => G.isPatched('isStaffActive')
    },
    // Game bug: watering schedules a deferred Garden.render() that writes into #pane even after the player
    // switched tabs, overwriting that tab. Only let it render into the default pane while the garden tab is open.
    gardenRenderGuard: {
      label: '🩹 Sửa lỗi game: vườn ghi đè tab khác', refs: ['obj.garden.render'],
      on: () => G.patchMember('garden', 'render', orig => function (target) {
        if (!target && G.rt('tab') !== G.val('gardenTabKey')) return undefined;
        return orig.apply(this, arguments);
      }),
      off: () => G.unpatchMember('garden', 'render'), isOn: () => G.isMemberPatched('garden', 'render')
    }
  };
  A.P.noCheatHit = {
    label: '🛡 Chặn anti-cheat của game (phiên này)', refs: ['fn.cheatHit'],
    on: () => G.patch('cheatHit', () => function () { RT.notify('🛡 Đã chặn anti-cheat của game (cheatHit)', 'warn'); return undefined; }),
    off: () => G.unpatch('cheatHit'), isOn: () => G.isPatched('cheatHit')
  };
  // On by default (still toggleable in the Patch tab): the game-bug fix, and the anti-cheat block —
  // without it, panel money actions get confiscated by the game's own cheat rules.
  ['gardenRenderGuard', 'noCheatHit'].forEach(k => { try { A.P[k].on(); } catch (e) { RT.error(k, e); } });

  RT.onCleanup(() => {
    A.P.autoResume.off();
    if (state.caps) capsOff();
    RT.removeTask('keep');
    RT.removeTask('speed');
    speed.factor = 1;
    restoreTimer();
  });

  // ================= save =================
  const BACKUP_KEY = 'rt.backup';
  A.exportSave = () => { if (!G.S()) throw new Error('chưa có state'); return G.has('pack') ? G.call('pack') : JSON.stringify(G.S()); };
  A.importSave = text => RT.mutate('Import', S => {
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || typeof data[G.statePath('money')] !== 'number' || typeof data[G.statePath('day')] !== 'number') {
      throw new Error('không phải save hợp lệ (thiếu money/day)');
    }
    try { localStorage.setItem(BACKUP_KEY, A.exportSave()); } catch (e) { RT.error('backup', e); }
    // Replace in place: the game keeps its own reference to S.
    Object.keys(S).forEach(k => { delete S[k]; });
    Object.assign(S, data);
    return '✓ Import ' + Object.keys(data).length + ' field (có thể hoàn tác)';
  });
  A.undoImport = function () {
    let b = null;
    try { b = localStorage.getItem(BACKUP_KEY); } catch (e) { RT.error('backup read', e); }
    if (!b) throw new Error('không có bản sao lưu');
    A.importSave(b);
  };
  A.saveNow = () => { G.persist(); RT.notify('💾 Đã lưu'); };

  // ================= garden =================
  A.garden = {
    defs: () => { const o = G.obj('garden'); return (o && o.SEED_DEFS) || {}; },
    info() {
      const g = G.get('garden', null);
      if (!g) return null;
      const plots = G.get('gardenPlots', []) || [];
      const lockedF = G.field('plotLocked');
      return {
        open: plots.filter(p => !p[lockedF]).length, total: plots.length,
        seeds: G.get('gardenSeeds', {}) || {},
        organic: fieldOf(g, 'organicDays', 0), lemon: fieldOf(g, 'lemonDays', 0)
      };
    },
    water: () => RT.mutate('Tưới vườn', () => { G.member('garden', 'waterAll')(); return '💧 Đã tưới tất cả'; }),
    harvest: () => RT.mutate('Thu hoạch', () => { G.member('garden', 'harvestAll')(); return '🧺 Đã thu hoạch tất cả'; }),
    // Water then advance, once per day — the same sequence the game runs at day end.
    advance: days => RT.mutate('Tua vườn', () => {
      const n = clampInt(days, 1, 60);
      const water = G.member('garden', 'waterAll');
      const adv = G.member('garden', 'advanceDay');
      for (let i = 0; i < n; i++) { water(); adv(); }
      return '🌱 Tua vườn ' + n + ' ngày';
    }),
    unlockPlots: () => RT.mutate('Mở ô đất', () => {
      const lockedF = G.field('plotLocked');
      const plots = G.get('gardenPlots', []) || [];
      const locked = plots.filter(p => p[lockedF]);
      locked.forEach(p => { p[lockedF] = false; });
      return '🔓 Mở ' + locked.length + ' ô đất';
    }),
    addSeeds: n => RT.mutate('Hạt giống', () => {
      const seeds = G.ensure('gardenSeeds', {});
      const add = clampInt(n, 1, 9999);
      Object.keys(A.garden.defs()).forEach(k => { seeds[k] = (seeds[k] || 0) + add; });
      return '🌰 +' + add + ' mỗi loại hạt';
    }),
    setBuff: (kind, days) => RT.mutate('Buff vườn', () => {
      const g = G.ensure('garden', {});
      const d = clampInt(days, 0, 999);
      g[G.field(kind === 'lemon' ? 'lemonDays' : 'organicDays')] = d;
      g[G.field(kind === 'lemon' ? 'lemonBoost' : 'organicBoost')] = d > 0;
      return (kind === 'lemon' ? '🍋' : '🌿') + ' buff ' + d + ' ngày (bản mạnh)';
    })
  };

  // ================= pet =================
  A.pet = {
    info: () => G.get('pet', null),
    types: () => G.list('petTypes'),
    unlock: type => RT.mutate('Thú cưng', () => {
      const p = G.ensure('pet', {});
      p[G.field('petUnlocked')] = true;
      p[G.field('petType')] = type;
      if (!p[G.field('petLevel')]) p[G.field('petLevel')] = 1;
      return '🐾 Đã có ' + type;
    }),
    maxStats: () => RT.mutate('Thú cưng', () => {
      const p = G.get('pet', null);
      if (!p) throw new Error('chưa có thú cưng');
      const m = G.has('getPetMaxStat') ? G.call('getPetMaxStat', p[G.field('petLevel')] || 1) : 100;
      G.list('petStats').forEach(s => { p[s] = m; });
      return '💖 Chỉ số = ' + m;
    }),
    addExp: n => RT.mutate('Thú cưng', () => { const v = clampInt(n, 1, 1e6); G.call('addPetExp', v); return '✨ +' + v + ' EXP'; })
  };

  // ================= startup location, branches, tax =================
  const idOf = (obj, fieldKey) => (obj ? obj[G.field(fieldKey)] : undefined);
  A.biz = {
    locations: () => G.lex('STARTUP_LOCATIONS') || [],
    branches: () => G.lex('BRANCH_LOCATIONS') || [],
    locId: loc => idOf(loc, 'locId'),
    branchId: b => idOf(b, 'branchId'),
    currentLoc: () => G.get('startupLocation', G.val('defaultLocId')),
    isDefaultLoc: loc => !!fieldOf(loc, 'locDefault', false) || idOf(loc, 'locId') === G.val('defaultLocId'),
    moveViaGame: id => RT.mutate('Khởi nghiệp', () => { G.call('setStartupLocation', id); return '🗺 → ' + id + ' (phí theo game)'; }),
    // Pre-pays the move cost so the game's own move runs with all its side effects at zero net cost.
    moveFree: id => RT.mutate('Khởi nghiệp', () => {
      if (A.biz.currentLoc() === id) throw new Error('đang ở địa điểm này');
      const loc = A.biz.locations().find(l => idOf(l, 'locId') === id);
      if (!loc) throw new Error('không có địa điểm ' + id);
      const cost = A.biz.isDefaultLoc(loc) ? 0 : G.val('moveCost');
      G.set('money', G.get('money', 0) + cost);
      G.call('setStartupLocation', id);
      if (A.biz.currentLoc() !== id) { G.set('money', G.get('money', 0) - cost); throw new Error('game từ chối chuyển'); }
      return '🗺 → ' + fieldOf(loc, 'locName', id) + ' (đã bù phí ' + RT.fmt(cost) + ')';
    }),
    ownsBranch: id => { const b = (G.get('branches', {}) || {})[id]; return !!(b && b[G.field('branchBought')] && !b[G.field('branchClosed')]); },
    setBranch: (id, owned) => RT.mutate('Chi nhánh', () => {
      const br = G.ensure('branches', {});
      if (owned) {
        const prev = br[id];
        const lvF = G.field('branchLevel');
        br[id] = G.shape('branch', { day: G.get('day', 1) });
        if (prev && prev[lvF]) br[id][lvF] = prev[lvF];
      } else delete br[id];
      return (owned ? '🏢 Sở hữu ' : '✖ Bỏ ') + id;
    }),
    renewTax: () => RT.mutate('Thuế', () => {
      const now = Date.now();
      const expires = now + G.val('taxCycleMs');
      Object.assign(G.ensure('tax', {}), G.shape('taxPaid', { now, expires, rate: G.val('taxPct') / 100 }));
      return '🏛 Buff thuế tới ' + new Date(expires).toLocaleString('vi-VN');
    }),
    taxActive: () => G.has('isTaxActive') && !!G.call('isTaxActive')
  };

  // ================= staff =================
  A.staff = {
    ids: () => G.list('staffIds'),
    hired: id => !!(G.get('staffFlags', {}) || {})[id],
    active: id => G.has('isStaffActive') && !!G.call('isStaffActive', id),
    wage: id => { const C = G.lex('CFG') || {}; return C[id.replace(new RegExp('^' + G.val('staffPrefix')), G.val('wagePrefix'))]; },
    set: (id, on) => RT.mutate('Nhân sự', () => {
      const U = G.ensure('staffFlags', {});
      if (on) U[id] = true; else delete U[id];
      [G.rt('staffDayOff', null), G.rt('staffLate', null)].forEach(m => { if (m) delete m[id]; });
      return (on ? '👤 Thuê ' : '✖ Cho nghỉ ') + G.label('staff', id);
    }),
    clearAbsence: () => RT.mutate('Nhân sự', () => {
      [G.rt('staffDayOff', null), G.rt('staffLate', null)].forEach(m => { if (m) Object.keys(m).forEach(k => { delete m[k]; }); });
      return '✓ Không ai nghỉ / đi trễ hôm nay';
    }, { refresh: 'head' })
  };
})();
