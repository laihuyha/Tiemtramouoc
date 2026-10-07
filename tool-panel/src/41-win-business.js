/* 41-win-business.js — specialised windows: Startup & Branches, Tax & Bank, Upgrades & Equipment, Staff. */
(function () {
  'use strict';
  const RT = window.__RT;
  const G = RT.G;
  const A = RT.A;
  const h = RT.h;
  const liveB = getter => RT.live(h('b'), getter);
  const f = (obj, key, fallback) => { const v = obj ? obj[G.field(key)] : undefined; return v === undefined ? fallback : v; };
  // Game-provided bonus texts may carry markup: parse inertly (DOMParser never runs scripts or loads resources).
  const plain = s => new DOMParser().parseFromString(String(s), 'text/html').body.textContent;

  // ---------- Startup locations & branches ----------
  RT.registerWindow({
    id: 'biz', title: '🗺 Khởi nghiệp & Chi nhánh', width: 350,
    render(body) {
      const locList = h('div');
      const brList = h('div');
      function renderLocs() {
        locList.textContent = '';
        const cur = A.biz.currentLoc();
        A.biz.locations().forEach(loc => {
          const id = A.biz.locId(loc);
          const isCur = id === cur;
          const label = h('span', null, f(loc, 'locIcon', '') + ' ' + f(loc, 'locName', id), h('div', { class: 'rt-muted' }, f(loc, 'locRegion', '')));
          const actions = isCur ? h('b', null, 'Đang ở') : h('span', null,
            RT.gbtn('Miễn phí', ['fn.setStartupLocation'], () => { A.biz.moveFree(id); renderLocs(); }),
            ' ',
            RT.gbtn(A.biz.isDefaultLoc(loc) ? 'Về (0đ)' : '−' + RT.fmt(G.val('moveCost')), ['fn.setStartupLocation'], () => { A.biz.moveViaGame(id); renderLocs(); }, 'ghost'));
          locList.appendChild(h('div', { class: 'rt-item' + (isCur ? ' rt-cur' : '') }, label, actions));
        });
      }
      function renderBranches() {
        brList.textContent = '';
        A.biz.branches().forEach(b => {
          const id = A.biz.branchId(b);
          const owned = A.biz.ownsBranch(id);
          brList.appendChild(h('div', { class: 'rt-item' + (owned ? ' rt-cur' : '') },
            h('span', null, f(b, 'branchIcon', '') + ' ' + f(b, 'branchName', id),
              h('div', { class: 'rt-muted' }, 'Giá ' + RT.fmt(f(b, 'branchCost', 0)) + ' · thuê ' + RT.fmt(f(b, 'branchRent', 0)) + '/ngày')),
            RT.gbtn(owned ? 'Bỏ' : 'Sở hữu', ['state.branches'], () => { A.biz.setBranch(id, !owned); renderBranches(); }, owned ? 'ghost' : 'alt')));
        });
      }
      renderLocs();
      renderBranches();
      body.append(
        RT.sec('Địa điểm khởi nghiệp'),
        RT.muted('"Miễn phí" = bù phí rồi gọi đúng hàm chuyển của game (đủ mọi hiệu ứng).'),
        locList,
        RT.sec('Chi nhánh (sở hữu ngay, không tốn tiền mua)'),
        brList,
        RT.row(RT.btn('↻ Làm mới', () => { renderLocs(); renderBranches(); }, 'ghost')),
        RT.statusBar()
      );
    }
  });

  // ---------- Tax & bank ----------
  RT.registerWindow({
    id: 'finance', title: '🏛 Thuế & Bank', width: 300,
    render(body) {
      body.append(
        h('div', { class: 'rt-info' },
          h('span', null, 'Buff thuế: ', liveB(() => (A.biz.taxActive() ? 'đang hiệu lực' : 'không'))),
          h('span', null, 'Hết hạn: ', liveB(() => {
            const exp = f(G.get('tax', null), 'taxExpires', 0);
            return exp ? new Date(exp).toLocaleString('vi-VN') : '—';
          }))),
        RT.sec('Thuế'),
        RT.row(RT.gbtn('🏛 Gia hạn buff thuế 1 chu kỳ (miễn phí)', ['state.tax'], A.biz.renewTax)),
        RT.muted('Buff thuế của game: giảm tiền giả, có cơ hội x2 bill, tăng khách, không bị quá hạn.'),
        RT.sec('Tà Tưa Bank (hộp thoại của game)'),
        RT.grid(2,
          RT.gbtn('Gửi tiền', ['fn.openBankDeposit'], () => G.call('openBankDeposit')),
          RT.gbtn('Rút tiền', ['fn.openBankWithdraw'], () => G.call('openBankWithdraw'))),
        RT.statusBar()
      );
    }
  });

  // ---------- Upgrade levels & equipment ----------
  RT.registerWindow({
    id: 'upgrade', title: '⬆ Nâng cấp & Trang bị', width: 360,
    render(body) {
      const list = h('div');
      A.upgCats().forEach(c => {
        const lvIn = RT.input('number', 'cấp', A.upgLevel(c.key));
        lvIn.style.maxWidth = '72px';
        const detail = RT.live(h('div', { class: 'rt-muted' }), () => {
          const lv = A.upgLevel(c.key);
          return 'Cấp ' + lv + ': ' + plain(c.bonus(lv)) + ' · lên cấp: ' + RT.fmt(A.upgCost(lv));
        });
        list.appendChild(h('div', { class: 'rt-item', style: 'flex-wrap:wrap' },
          h('div', { style: 'flex:1 1 100%' }, h('b', null, c.name), detail),
          lvIn,
          RT.gbtn('Đặt cấp', ['state.upgLv'], () => A.setUpgLevel(c.key, RT.num(lvIn.value, 0))),
          RT.gbtn('+1 (trả tiền)', ['fn.handleUpgLv'], () => A.upgradeViaGame(c.key), 'ghost')));
      });
      const equip = RT.grid(2);
      A.equipFlags().forEach(flag => equip.appendChild(RT.toggle(G.label('equip', flag), on => A.setEquip(flag, on), () => A.hasEquip(flag))));
      body.append(
        RT.sec('Cấp độ (hiệu ứng đọc trực tiếp từ game)'),
        list,
        RT.sec('Trang bị'),
        equip,
        RT.statusBar()
      );
    }
  });

  // ---------- Staff ----------
  RT.registerWindow({
    id: 'staff', title: '👥 Nhân sự', width: 330,
    render(body) {
      const list = h('div');
      A.staff.ids().forEach(id => {
        const wage = A.staff.wage(id);
        const status = RT.live(h('div', { class: 'rt-muted' }), () => {
          if (!A.staff.hired(id)) return '⚪ chưa thuê';
          return A.staff.active(id) ? '🟢 đang làm' : '🟡 vắng / chưa tới giờ';
        });
        list.appendChild(h('div', { class: 'rt-item' },
          h('span', null, G.label('staff', id), h('div', { class: 'rt-muted' }, wage != null ? RT.fmt(wage) + '/ngày' : ''), status),
          RT.toggle('Thuê', on => A.staff.set(id, on), () => A.staff.hired(id))));
      });
      body.append(
        RT.muted('Thuê / cho nghỉ trực tiếp (bỏ qua phí thuê). Lương vẫn trừ cuối ngày theo game.'),
        list,
        RT.row(RT.btn('✓ Xoá nghỉ phép / đi trễ hôm nay', A.staff.clearAbsence, 'alt')),
        RT.statusBar()
      );
    }
  });
})();
