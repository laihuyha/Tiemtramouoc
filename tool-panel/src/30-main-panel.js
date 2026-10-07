/* 30-main-panel.js — main window: common features grouped in tabs + launcher for the specialised windows. */
(function () {
  'use strict';
  const RT = window.__RT;
  const G = RT.G;
  const A = RT.A;
  const h = RT.h;
  const TAB_KEY = 'rt.mainTab';

  RT.registerTab = def => { RT.tabs.push(def); };

  const numIn = (ph, val) => RT.input('number', ph, val);
  const liveB = getter => RT.live(h('b'), getter);
  // Highlight a button while `pred()` holds (rides the shared live loop).
  function bindActive(btn, pred) {
    const probe = h('span', { hidden: true });
    btn.appendChild(probe);
    RT.live(probe, () => { btn.classList.toggle('rt-on', !!pred()); return ''; });
    return btn;
  }
  function copyText(text) {
    if (!navigator.clipboard || !navigator.clipboard.writeText) { RT.notify('Trình duyệt không cho copy tự động', 'warn'); return; }
    navigator.clipboard.writeText(text).then(
      () => RT.notify('📋 Đã copy (' + text.length.toLocaleString() + ' ký tự)'),
      () => RT.notify('Không copy được — chọn và Ctrl+C', 'warn'));
  }

  // ---------- Chung ----------
  RT.registerTab({
    id: 'general', title: 'Chung',
    render(el) {
      const money = numIn('Số tiền');
      const day = numIn('Ngày');
      const rate = numIn('0–5', 5); rate.step = '0.025'; rate.min = '0'; rate.max = '5';
      const fill = numIn('Mức tồn', 99);
      el.append(
        h('div', { class: 'rt-info' },
          h('span', null, '💰 ', liveB(() => RT.fmt(G.get('money', 0)))),
          h('span', null, '📅 Ngày ', liveB(() => G.get('day', 1))),
          h('span', null, '⭐ ', liveB(() => { const r = A.rating(); return Number.isFinite(r) ? r.toFixed(3) : '?'; })),
          h('span', null, '🏆 Chu kỳ 5★: ', liveB(() => G.get('star5Count', 0))),
          h('span', null, '🎛 ', liveB(() => G.mode() + (G.rt('paused', false) ? ' · pause' : ''))),
          h('span', null, '⏩ x', liveB(() => A.getSpeed()))),
        RT.sec('Tiền'),
        RT.live(h('div', { class: 'rt-muted', style: 'margin-bottom:6px' }), () => {
          const ac = A.antiCheat;
          const L = ac.limits();
          let mode = '⚠ anti-cheat đang bật';
          if (ac.durableGuard()) mode = '🛡 có Bảo vệ (an toàn cả khi reload)';
          else if (ac.sessionGuard()) mode = '🛡 chặn trong phiên (reload vẫn xét ngưỡng tải trang)';
          const r1 = Number.isFinite(L.rule1) ? RT.fmt(L.rule1) : 'không';
          return mode + ' · ngưỡng: ' + r1 + ' (trước ngày 30) / ' + RT.fmt(L.rule2) + ' (tải trang) · an toàn tối đa: ' + RT.fmt(ac.maxSafe());
        }),
        RT.row(money, RT.gbtn('Đặt', ['state.money'], () => A.setMoney(RT.num(money.value, 0)))),
        RT.grid(4,
          RT.btn('+1tr', () => A.addMoney(1e6), 'alt'), RT.btn('+10tr', () => A.addMoney(1e7), 'alt'),
          RT.btn('+100tr', () => A.addMoney(1e8), 'alt'), RT.btn('×2', () => A.mulMoney(2), 'alt')),
        RT.grid(2,
          RT.gbtn('💰 Tối đa an toàn', ['state.money', 'lex.CFG'], () => A.setMoneyMaxSafe()),
          RT.gbtn('👮 Thuê Bảo vệ (bền vững)', ['state.staffFlags'], () => A.staff.set(G.val('guardStaffId'), true), 'ghost')),
        RT.sec('Ngày'),
        RT.row(day, RT.gbtn('Đặt ngày', ['state.day'], () => A.setDay(RT.num(day.value, 1)))),
        RT.sec('Rating (chính xác tới 1/40 sao)'),
        RT.row(rate, RT.gbtn('Đặt rating', ['fn.rating', 'state.reviews'], () => A.setRating(RT.num(rate.value, 5)))),
        RT.row(RT.gbtn('🏆 Cán mốc 5★ (nhận thưởng chu kỳ của game)', ['fn.checkReset5'], () => A.claim5StarCycle(), 'alt')),
        RT.sec('Kho & món'),
        RT.row(fill, RT.gbtn('📦 Nạp kho tới mức', ['fn.addStock', 'lex.ITEMS'], () => A.fillStock(RT.num(fill.value, 99)))),
        RT.row(RT.gbtn('🔓 Mở khoá tất cả món', ['lex.ITEMS', 'state.unlocked'], () => A.unlockAll())),
        RT.sec('Combo (1 lần lưu + 1 lần render)'),
        RT.row(RT.btn('⚡ Tiền tối đa an toàn (≤1 tỷ) + 5★ + mở khoá + đầy kho', () => RT.batch('Combo', () => {
          A.setMoney(Math.min(1e9, A.antiCheat.maxSafe())); A.setRating(5); A.unlockAll(); A.fillStock(99);
        }), 'danger'))
      );
    }
  });

  // ---------- Menu game ----------
  RT.registerTab({
    id: 'menu', title: 'Menu game',
    render(el) {
      const grid = RT.grid(3);
      G.list('tabKeys').forEach(k => grid.appendChild(RT.gbtn(G.label('tabs', k), ['fn.switchTab', 'fn.renderPrep'], () => A.openTab(k), 'alt')));
      el.append(
        RT.muted('Mở thẳng màn hình của game, không reload (dùng ở màn chuẩn bị).'),
        grid,
        RT.sec('Hộp thoại'),
        RT.grid(2,
          RT.gbtn('🏦 Gửi tiết kiệm', ['fn.openBankDeposit'], () => G.call('openBankDeposit')),
          RT.gbtn('🏦 Rút tiền', ['fn.openBankWithdraw'], () => G.call('openBankWithdraw')),
          RT.gbtn('🏢 Chuỗi chi nhánh', ['fn.openChiNhanh'], () => G.call('openChiNhanh')),
          RT.gbtn('📱 Mạng xã hội', ['fn.openMxh'], () => G.call('openMxh')),
          RT.gbtn('🍬 Milk Tea Crush', ['obj.crush.open'], () => G.member('crush', 'open')()))
      );
    }
  });

  // ---------- Ca & sự kiện ----------
  RT.registerTab({
    id: 'shift', title: 'Ca & Sự kiện',
    render(el) {
      const speedRow = RT.grid(A.SPEEDS.length);
      A.SPEEDS.forEach(f => speedRow.appendChild(bindActive(RT.gbtn('x' + f, ['fn.tick', 'lex.timer'], () => A.setSpeed(f), 'tgl'), () => A.getSpeed() === f)));
      const evSel = RT.select([['', '— chọn sự kiện —']].concat(A.events().map(e => [e.id, e.name])));
      const moodSel = RT.select([['', 'Bình thường']].concat(A.moods().map(m => [m, G.label('moods', m)])));
      el.append(
        h('div', { class: 'rt-info' },
          h('span', null, 'Trạng thái: ', liveB(() => {
            if (!G.isSelling()) return 'chuẩn bị';
            return G.rt('paused', false) ? 'tạm dừng' : 'đang bán';
          })),
          h('span', null, 'Sự kiện: ', liveB(() => A.currentEvent() || '—')),
          h('span', null, 'Mood: ', liveB(() => {
            const m = G.get('mood', null);
            return m && G.get('evDay') === G.get('day') ? G.label('moods', m) : '—';
          }))),
        RT.sec('Ca bán'),
        RT.grid(2,
          RT.gbtn('▶ Mở cửa', ['fn.tryOpen'], A.openShop),
          RT.gbtn('⏹ Kết thúc ca', ['fn.endDay'], A.endShift, 'danger'),
          RT.gbtn('⏸ Tạm dừng', ['fn.pauseGame'], A.pause, 'ghost'),
          RT.gbtn('▶ Chơi tiếp', ['fn.resumeGame'], A.resume, 'ghost')),
        RT.sec('Tốc độ game (N tick / chu kỳ — chính xác tuyệt đối)'),
        speedRow,
        RT.sec('Sự kiện / thời tiết hôm nay'),
        RT.row(evSel,
          RT.gbtn('Áp', ['lex.EVS'], () => { if (!evSel.value) throw new Error('chọn sự kiện'); A.setEvent(evSel.value); }),
          RT.btn('Xoá', () => A.clearEvent(), 'ghost')),
        RT.sec('Tâm trạng khách hôm nay'),
        RT.row(moodSel, RT.btn('Áp', () => A.setMood(moodSel.value)))
      );
    }
  });

  // ---------- Patch ----------
  RT.registerTab({
    id: 'patch', title: 'Patch',
    render(el) {
      el.append(RT.muted('Ghi đè hàm game lúc chạy. Tắt = khôi phục nguyên bản. Không ghi vào save.'));
      const grid = RT.grid(1);
      Object.keys(A.P).forEach(k => {
        const p = A.P[k];
        const t = RT.toggle(p.label, on => (on ? p.on() : p.off()), p.isOn);
        const miss = G.missing(p.refs);
        if (miss.length) { t.disabled = true; t.title = 'Thiếu binding: ' + miss.join(', '); }
        grid.appendChild(t);
      });
      el.append(grid);
    }
  });

  // ---------- Save ----------
  RT.registerTab({
    id: 'save', title: 'Save',
    render(el) {
      const ta = RT.textarea('Dán JSON save để import, hoặc bấm Export');
      el.append(
        RT.grid(3,
          RT.btn('📤 Export', () => { ta.value = A.exportSave(); copyText(ta.value); }),
          RT.btn('📥 Import', () => { if (!ta.value.trim()) throw new Error('chưa dán JSON'); A.importSave(ta.value.trim()); }, 'alt'),
          RT.btn('↩ Hoàn tác', () => A.undoImport(), 'ghost')),
        ta,
        RT.row(RT.gbtn('💾 Lưu ngay', ['fn.save'], A.saveNow)),
        RT.muted('Import thay state tại chỗ (game không cần reload). Bản trước import được giữ để hoàn tác.')
      );
    }
  });

  // ---------- Cửa sổ ----------
  RT.registerTab({
    id: 'windows', title: 'Cửa sổ ▸',
    render(el) {
      el.append(RT.muted('Hệ thống chuyên biệt mở ở cửa sổ riêng — kéo thả, mở nhiều cái cùng lúc.'));
      const grid = RT.grid(2);
      RT.windows.forEach(w => grid.appendChild(RT.btn(w.title, () => RT.openWindow(w), 'alt')));
      el.append(grid);
    }
  });

  // ---------- main window ----------
  function renderMain(body) {
    const bar = h('div', { class: 'rt-tabs' });
    const pane = h('div');
    let current = null;
    try { current = localStorage.getItem(TAB_KEY); } catch (e) { current = null; }
    function show(id) {
      const def = RT.tabs.find(t => t.id === id) || RT.tabs[0];
      current = def.id;
      try { localStorage.setItem(TAB_KEY, current); } catch (e) { /* storage blocked: tab not remembered */ }
      Array.from(bar.children).forEach(b => b.classList.toggle('rt-active', b.dataset.tab === current));
      pane.textContent = '';
      try { def.render(pane); } catch (e) {
        RT.error('tab ' + def.id, e);
        pane.appendChild(h('div', { class: 'rt-err' }, 'Lỗi tab: ' + e.message));
      }
    }
    RT.tabs.forEach(t => bar.appendChild(h('button', { class: 'rt-tab', type: 'button', dataset: { tab: t.id }, onclick: () => show(t.id) }, t.title)));
    const hl = G.health();
    const healthLine = h('div', { class: 'rt-muted', style: 'margin-bottom:6px' },
      'Bindings ' + hl.ok + '/' + hl.total + ' · game v' + hl.version + (hl.missing.length ? ' · ⚠ ' + hl.missing.slice(0, 3).join(', ') : ' ✓'));
    body.append(healthLine, bar, pane, RT.statusBar());
    show(current);
  }

  RT.boot = function () {
    RT.openWindow({ id: 'main', title: '🛠 RE Tool Panel', width: 340, render: renderMain });
    const hl = G.health();
    if (hl.missing.length) RT.notify('⚠ ' + hl.missing.length + ' binding lỗi — chạy scan.mjs --fetch --write', 'warn');
    else RT.notify('✓ Sẵn sàng · ' + hl.ok + ' binding OK · ' + RT.HOTKEY + ' ẩn/hiện');
  };
})();
