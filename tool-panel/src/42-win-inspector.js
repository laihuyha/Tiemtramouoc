/* 42-win-inspector.js — specialised windows: State Inspector (read/write any path), Bindings health. */
(function () {
  'use strict';
  const RT = window.__RT;
  const G = RT.G;
  const h = RT.h;
  const BAD_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
  const PREVIEW_LIMIT = 20000;

  // "money", "garden.seeds.mint" → S; "R.mode" → runtime R.
  function resolve(input) {
    const raw = String(input || '').trim();
    const useR = /^R\./.test(raw);
    const rel = raw.replace(/^[SR]\./, '');
    const keys = rel ? rel.split('.') : [];
    if (keys.some(k => !k || BAD_KEYS.has(k))) throw new Error('đường dẫn không hợp lệ');
    return { root: useR ? G.R() : G.S(), keys };
  }
  const read = (root, keys) => keys.reduce((a, k) => (a == null ? undefined : a[k]), root);
  function preview(v) {
    let s;
    try { s = JSON.stringify(v, null, 2); } catch (e) { s = String(v); }
    if (s === undefined) s = String(v);
    return s.length > PREVIEW_LIMIT ? s.slice(0, PREVIEW_LIMIT) + '\n… (' + s.length.toLocaleString() + ' ký tự)' : s;
  }
  function parseValue(text) { try { return JSON.parse(text); } catch (e) { return text; } }

  RT.registerWindow({
    id: 'inspector', title: '🔎 State Inspector', width: 390,
    render(body) {
      const path = RT.input('text', 'vd: money · garden.seeds.mint · R.mode');
      const val = RT.input('text', 'giá trị (JSON hoặc chữ)');
      const out = h('pre', { class: 'rt-pre' });
      const keysBox = h('div');
      function show() {
        const { root, keys } = resolve(path.value);
        out.textContent = preview(keys.length ? read(root, keys) : root);
      }
      function write() {
        const { root, keys } = resolve(path.value);
        if (!keys.length) throw new Error('nhập đường dẫn');
        if (!root) throw new Error('chưa có state');
        const v = parseValue(val.value);
        RT.mutate('Inspector', () => {
          const last = keys[keys.length - 1];
          const parent = keys.slice(0, -1).reduce((a, k) => { if (a[k] == null) a[k] = {}; return a[k]; }, root);
          parent[last] = v;
          return '✎ ' + keys.join('.') + ' = ' + preview(v).slice(0, 80);
        });
        show();
      }
      function renderKeys() {
        keysBox.textContent = '';
        const S = G.S();
        if (!S) { keysBox.appendChild(RT.muted('Chưa có state')); return; }
        Object.keys(S).sort().forEach(k => {
          const v = S[k];
          let t = typeof v;
          if (Array.isArray(v)) t = '[' + v.length + ']';
          else if (v && t === 'object') t = '{' + Object.keys(v).length + '}';
          keysBox.appendChild(h('button', {
            class: 'rt-b rt-ghost', type: 'button', style: 'margin:2px;padding:2px 6px;font-size:11px',
            onclick: () => { path.value = k; try { show(); } catch (e) { RT.notify(e.message, 'err'); } }
          }, k + ' ' + t));
        });
      }
      body.append(
        RT.sec('Đọc / ghi state'),
        RT.row(path, RT.btn('Đọc', show, 'alt')),
        RT.row(val, RT.btn('Ghi', write, 'danger')),
        out,
        RT.sec('Field gốc của S'),
        RT.row(RT.btn('↻ Làm mới', renderKeys, 'ghost')),
        keysBox,
        RT.statusBar()
      );
      renderKeys();
    }
  });

  RT.registerWindow({
    id: 'health', title: '🩺 Bindings', width: 340,
    render(body) {
      const out = h('pre', { class: 'rt-pre' });
      function run() {
        const hl = G.health();
        const lines = [
          'Game v' + hl.version + ' · bindings quét ' + hl.scannedAt,
          hl.ok + '/' + hl.total + ' binding sống trên trang'
        ];
        if (hl.missing.length) {
          lines.push('', 'Thiếu:', ...hl.missing.map(m => '  ✗ ' + m), '',
            'Cập nhật offset:', '  node scan.mjs --fetch --write', '  node build.mjs', '  node inject.mjs');
        } else lines.push('', '✓ Tất cả OK');
        out.textContent = lines.join('\n');
      }
      body.append(RT.row(RT.btn('↻ Kiểm tra lại', run, 'alt')), out, RT.statusBar());
      run();
    }
  });
})();
