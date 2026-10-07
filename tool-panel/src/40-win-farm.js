/* 40-win-farm.js — specialised windows: Garden, Pet. */
(function () {
  'use strict';
  const RT = window.__RT;
  const G = RT.G;
  const A = RT.A;
  const h = RT.h;
  const liveB = getter => RT.live(h('b'), getter);

  // ---------- Garden ----------
  RT.registerWindow({
    id: 'garden', title: '🪴 Vườn cây', width: 320,
    render(body) {
      const info = () => A.garden.info();
      const days = RT.input('number', 'số ngày', 1);
      const seedsN = RT.input('number', 'số hạt', 10);
      const buffD = RT.input('number', 'ngày buff', 7);
      const seedLine = RT.live(h('div', { class: 'rt-muted', style: 'margin-bottom:6px' }), () => {
        const i = info();
        if (!i) return 'Chưa có vườn';
        const defs = A.garden.defs();
        return 'Hạt: ' + Object.keys(defs).map(k => (defs[k][G.field('seedIcon')] || k) + ' ' + (i.seeds[k] || 0)).join('   ');
      });
      body.append(
        h('div', { class: 'rt-info' },
          h('span', null, 'Ô đất: ', liveB(() => { const i = info(); return i ? i.open + '/' + i.total : '—'; })),
          h('span', null, '🌿 Organic: ', liveB(() => { const i = info(); return i ? i.organic + ' ngày' : '—'; })),
          h('span', null, '🍋 Chanh: ', liveB(() => { const i = info(); return i ? i.lemon + ' ngày' : '—'; }))),
        seedLine,
        RT.sec('Chăm vườn (gọi hàm của game)'),
        RT.grid(2,
          RT.gbtn('💧 Tưới hết', ['obj.garden.waterAll'], A.garden.water),
          RT.gbtn('🧺 Thu hoạch hết', ['obj.garden.harvestAll'], A.garden.harvest)),
        RT.row(days, RT.gbtn('🌱 Tua vườn (tưới + qua ngày)', ['obj.garden.waterAll', 'obj.garden.advanceDay'], () => A.garden.advance(RT.num(days.value, 1)))),
        RT.sec('Tài nguyên'),
        RT.row(RT.gbtn('🔓 Mở khoá toàn bộ ô đất', ['state.gardenPlots'], A.garden.unlockPlots)),
        RT.row(seedsN, RT.gbtn('🌰 + hạt mỗi loại', ['obj.garden.SEED_DEFS', 'state.gardenSeeds'], () => A.garden.addSeeds(RT.num(seedsN.value, 10)))),
        RT.sec('Buff vườn (bản mạnh)'),
        RT.row(buffD,
          RT.gbtn('🌿 Organic', ['state.garden'], () => A.garden.setBuff('organic', RT.num(buffD.value, 7))),
          RT.gbtn('🍋 Chanh', ['state.garden'], () => A.garden.setBuff('lemon', RT.num(buffD.value, 7)), 'alt')),
        RT.statusBar()
      );
    }
  });

  // ---------- Pet ----------
  RT.registerWindow({
    id: 'pet', title: '🐕 Thú cưng', width: 300,
    render(body) {
      const unlocked = p => !!(p && p[G.field('petUnlocked')]);
      const rows = [
        ['Loại', p => p[G.field('petType')] || '—'],
        ['Cấp', p => p[G.field('petLevel')] || 0]
      ].concat(G.list('petStats').map(s => [G.label('petStats', s), p => Math.round(p[s] || 0)]));
      const info = h('div', { class: 'rt-info' });
      rows.forEach(([label, get]) => info.appendChild(h('span', null, label + ': ', liveB(() => {
        const p = A.pet.info();
        return unlocked(p) ? get(p) : '—';
      }))));
      const exp = RT.input('number', 'EXP', 100);
      const typeBtns = A.pet.types().map(t => RT.gbtn('Nuôi ' + t, ['state.pet'], () => A.pet.unlock(t), 'alt'));
      body.append(
        info,
        RT.sec('Mở khoá / đổi loại'),
        RT.grid(Math.max(1, typeBtns.length), ...typeBtns),
        RT.sec('Chăm sóc'),
        RT.row(RT.gbtn('💖 Max mọi chỉ số (theo cấp)', ['state.pet', 'fn.getPetMaxStat'], A.pet.maxStats)),
        RT.row(exp, RT.gbtn('✨ + EXP (game tự lên cấp)', ['fn.addPetExp'], () => A.pet.addExp(RT.num(exp.value, 100)))),
        RT.statusBar()
      );
    }
  });
})();
