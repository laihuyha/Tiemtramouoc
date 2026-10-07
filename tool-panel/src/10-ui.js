/* 10-ui.js — styles, DOM builder, live (diff-updated) bindings, draggable window manager. */
(function () {
  'use strict';
  const RT = window.__RT;
  RT.HOTKEY = 'Insert'; // show/hide every panel window (KeyboardEvent.key)

  // ---------- styles (scoped under .rt-win) ----------
  const style = document.createElement('style');
  style.id = 'rt-style';
  style.textContent = [
    '.rt-win{position:fixed;z-index:2147483000;width:320px;max-height:86vh;display:flex;flex-direction:column;overflow:hidden;',
    'background:#1f1a16;color:#f0e6da;font:12.5px/1.45 system-ui,"Segoe UI",Roboto,sans-serif;border:1px solid #4a3d30;',
    'border-radius:12px;box-shadow:0 10px 32px rgba(0,0,0,.45);user-select:none}',
    '.rt-win *{box-sizing:border-box}',
    '.rt-hd{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 10px;background:#e26d8a;color:#fff;font-weight:700;cursor:move;touch-action:none}',
    '.rt-title{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.rt-hb{background:rgba(255,255,255,.22);border:0;color:#fff;border-radius:6px;cursor:pointer;font-weight:700;padding:2px 8px;margin-left:4px}',
    '.rt-body{padding:10px;overflow:auto;user-select:text}',
    '.rt-tabs{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px}',
    '.rt-tab{flex:1 1 auto;background:#332b23;border:1px solid #4a3d30;color:#d9c8b6;border-radius:8px;padding:5px 8px;cursor:pointer;font:inherit;font-size:12px;font-weight:600}',
    '.rt-tab.rt-active{background:#e26d8a;border-color:#e26d8a;color:#fff}',
    '.rt-sec{margin:10px 0 5px;font-weight:700;color:#f08aa6;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em}',
    '.rt-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:6px}',
    '.rt-grid{display:grid;gap:5px;margin-bottom:6px}',
    '.rt-in{flex:1;min-width:60px;background:#332b23;color:#f0e6da;border:1px solid #4a3d30;border-radius:7px;padding:5px 7px;font:inherit}',
    '.rt-ta{width:100%;min-height:90px;resize:vertical;font:11.5px/1.4 ui-monospace,Consolas,monospace}',
    '.rt-b{background:#2f8a63;border:0;color:#fff;border-radius:7px;padding:6px 8px;cursor:pointer;font:inherit;font-weight:600;font-size:12px}',
    '.rt-b:hover{filter:brightness(1.12)}.rt-b:active{transform:translateY(1px)}.rt-b:disabled{opacity:.45;cursor:not-allowed}',
    '.rt-alt{background:#4a6fa5}.rt-danger{background:#b5563f}',
    '.rt-ghost,.rt-tgl{background:transparent;border:1px solid #4a3d30;color:#d9c8b6}',
    '.rt-tgl.rt-on{background:#2f8a63;border-color:#4cc088;color:#fff}',
    '.rt-info{display:grid;grid-template-columns:1fr 1fr;gap:3px 10px;background:#332b23;border-radius:8px;padding:7px 9px;margin-bottom:6px}',
    '.rt-info b{color:#fff;font-weight:700}',
    '.rt-item{display:flex;justify-content:space-between;align-items:center;gap:6px;padding:6px 8px;background:#2a2420;border:1px solid #3a3028;border-radius:8px;margin-bottom:4px}',
    '.rt-item.rt-cur{border-color:#4cc088}',
    '.rt-muted{color:#b2a493;font-size:11.5px}',
    '.rt-pre{background:#141110;border-radius:8px;padding:8px;max-height:260px;overflow:auto;margin:0;font:11.5px/1.4 ui-monospace,Consolas,monospace;white-space:pre-wrap;word-break:break-all}',
    '.rt-st{margin-top:8px;min-height:16px;font-size:11.5px;word-break:break-word;color:#4cc088}',
    '.rt-st.rt-k-warn{color:#f0b35a}.rt-st.rt-k-err{color:#ff6b67}',
    '.rt-err{color:#ff6b67}'
  ].join('');
  document.head.appendChild(style);
  RT.onCleanup(() => style.remove());

  // ---------- DOM builder ----------
  RT.h = function (tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(k => {
        const v = props[k];
        if (v == null || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'style') el.style.cssText = v;
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : String(v));
      });
    }
    kids.flat(Infinity).forEach(c => {
      if (c == null || c === false) return;
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    });
    return el;
  };

  // Every handler is guarded: one failing button never breaks the panel.
  function guard(label, fn) {
    return function (e) {
      try { fn(e); } catch (err) { RT.error(label, err); RT.notify(label + ': ' + err.message, 'err'); }
    };
  }
  RT.btn = (label, onClick, variant, title) =>
    RT.h('button', { class: 'rt-b' + (variant ? ' rt-' + variant : ''), type: 'button', title, onclick: guard(label, onClick) }, label);
  RT.input = (type, placeholder, value) =>
    RT.h('input', { class: 'rt-in', type, placeholder, value: value == null ? null : String(value) });
  RT.textarea = placeholder => RT.h('textarea', { class: 'rt-in rt-ta', placeholder, spellcheck: 'false' });
  RT.select = function (options, value) {
    const s = RT.h('select', { class: 'rt-in' });
    options.forEach(o => {
      const pair = Array.isArray(o) ? o : [o, o];
      const op = RT.h('option', { value: pair[0] }, pair[1]);
      if (pair[0] === value) op.selected = true;
      s.appendChild(op);
    });
    return s;
  };
  RT.row = (...kids) => RT.h('div', { class: 'rt-row' }, ...kids);
  RT.grid = (cols, ...kids) => RT.h('div', { class: 'rt-grid', style: 'grid-template-columns:repeat(' + cols + ',1fr)' }, ...kids);
  RT.sec = title => RT.h('div', { class: 'rt-sec' }, title);
  RT.muted = text => RT.h('div', { class: 'rt-muted' }, text);

  // ---------- live bindings: diff-updated text, auto-pruned when detached ----------
  const lives = new Set();
  function tickLive() {
    lives.forEach(b => {
      const connected = b.el.isConnected;
      if (connected) b.seen = true;
      else if (b.seen) { lives.delete(b); return; }
      let v;
      try { v = String(b.getter()); } catch (e) { v = '?'; }
      if (v !== b.last) { b.last = v; if (connected) b.el.textContent = v; }
    });
    if (!lives.size) RT.removeTask('live');
  }
  RT.live = function (el, getter) {
    lives.add({ el, getter, last: undefined, seen: false });
    if (!RT.hasTask('live')) RT.addTask('live', tickLive, 400);
    return el;
  };

  // Toggle: flips only if the handler succeeds; `isOn` keeps it in sync with real state.
  RT.toggle = function (label, onChange, isOn) {
    const b = RT.h('button', { class: 'rt-b rt-tgl', type: 'button' }, label);
    b.addEventListener('click', () => {
      const next = !b.classList.contains('rt-on');
      try {
        onChange(next);
        b.classList.toggle('rt-on', next);
        RT.notify((next ? '✅ Bật: ' : '⛔ Tắt: ') + label);
      } catch (e) { RT.error(label, e); RT.notify(label + ': ' + e.message, 'err'); }
    });
    if (isOn) {
      b.classList.toggle('rt-on', !!isOn());
      // A hidden probe rides the live loop to re-sync the toggle with real state.
      const probe = RT.h('span', { hidden: true });
      b.appendChild(probe);
      RT.live(probe, () => { b.classList.toggle('rt-on', !!isOn()); return ''; });
    }
    return b;
  };

  // ---------- status bar (subscribes to RT.notify) ----------
  RT.statusBar = function () {
    const el = RT.h('div', { class: 'rt-st' }, 'Sẵn sàng · ' + RT.HOTKEY + ' ẩn/hiện');
    let seen = false;
    const sink = (msg, kind) => {
      if (el.isConnected) seen = true;
      else if (seen) { RT._sinks.delete(sink); return; }
      el.textContent = msg;
      el.className = 'rt-st rt-k-' + kind;
    };
    RT._sinks.add(sink);
    return el;
  };

  // ---------- window manager ----------
  let zTop = 2147483000;
  const wins = new Map();
  const POS_KEY = 'rt.pos.';
  function loadPos(id) { try { return JSON.parse(localStorage.getItem(POS_KEY + id)); } catch (e) { return null; } }
  function savePos(id, x, y) {
    try { localStorage.setItem(POS_KEY + id, JSON.stringify({ x: Math.round(x), y: Math.round(y) })); } catch (e) { /* storage blocked: position not remembered */ }
  }
  function place(el, x, y) {
    const maxX = Math.max(0, window.innerWidth - el.offsetWidth);
    const maxY = Math.max(0, window.innerHeight - 40);
    el.style.left = Math.min(Math.max(0, x), maxX) + 'px';
    el.style.top = Math.min(Math.max(0, y), maxY) + 'px';
  }
  function makeDraggable(el, handle, id) {
    let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
    handle.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;
      dragging = true; sx = e.clientX; sy = e.clientY;
      const r = el.getBoundingClientRect(); ox = r.left; oy = r.top;
      handle.setPointerCapture(e.pointerId); e.preventDefault();
    });
    handle.addEventListener('pointermove', e => { if (dragging) place(el, ox + e.clientX - sx, oy + e.clientY - sy); });
    const end = e => {
      if (!dragging) return;
      dragging = false;
      try { handle.releasePointerCapture(e.pointerId); } catch (_) { /* already released */ }
      savePos(id, parseFloat(el.style.left), parseFloat(el.style.top));
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }
  function renderInto(def, body, api) {
    try { def.render(body, api); } catch (e) {
      RT.error('render ' + def.id, e);
      body.appendChild(RT.h('div', { class: 'rt-err' }, 'Lỗi hiển thị: ' + e.message));
    }
  }

  RT.openWindow = function (def) {
    const existing = wins.get(def.id);
    if (existing) { existing.el.hidden = false; existing.focus(); return existing; }
    const body = RT.h('div', { class: 'rt-body' });
    const btnMin = RT.h('button', { class: 'rt-hb', type: 'button', title: 'Thu gọn' }, '–');
    const btnClose = RT.h('button', { class: 'rt-hb', type: 'button', title: 'Đóng' }, '✕');
    const head = RT.h('div', { class: 'rt-hd' }, RT.h('span', { class: 'rt-title' }, def.title), RT.h('span', null, btnMin, btnClose));
    const el = RT.h('div', { class: 'rt-win', style: 'width:' + (def.width || 320) + 'px' }, head, body);
    // Keep the game's focusin/focusout keyboard heuristics from reacting to our inputs.
    ['focusin', 'focusout'].forEach(t => el.addEventListener(t, e => e.stopPropagation()));
    document.body.appendChild(el);

    const api = {
      id: def.id, el, body,
      focus() { el.style.zIndex = String(++zTop); },
      close() {
        el.remove(); wins.delete(def.id);
        if (def.onClose) { try { def.onClose(); } catch (e) { RT.error('onClose ' + def.id, e); } }
      },
      rerender() { body.textContent = ''; renderInto(def, body, api); }
    };
    btnClose.onclick = () => api.close();
    btnMin.onclick = () => { body.hidden = !body.hidden; };
    el.addEventListener('pointerdown', () => api.focus());
    makeDraggable(el, head, def.id);
    wins.set(def.id, api);

    const w = def.width || 320;
    const n = wins.size - 1;
    const pos = loadPos(def.id) || def.pos || { x: window.innerWidth - w - 16 - n * 28, y: 16 + n * 28 };
    place(el, pos.x, pos.y);
    api.focus();
    renderInto(def, body, api);
    return api;
  };
  RT.registerWindow = def => { RT.windows.push(def); };
  RT.openRegistered = function (id) {
    const def = RT.windows.find(w => w.id === id);
    if (!def) { RT.notify('Không có cửa sổ ' + id, 'warn'); return null; }
    return RT.openWindow(def);
  };
  RT.toggleAll = function () {
    const anyVisible = Array.from(wins.values()).some(w => !w.el.hidden);
    wins.forEach(w => { w.el.hidden = anyVisible; });
  };

  RT.on(window, 'resize', () => wins.forEach(w => place(w.el, parseFloat(w.el.style.left) || 0, parseFloat(w.el.style.top) || 0)));
  RT.on(document, 'keydown', e => {
    if (e.key === RT.HOTKEY && !e.repeat) { e.preventDefault(); RT.toggleAll(); }
  });
  RT.onCleanup(() => { wins.forEach(w => w.el.remove()); wins.clear(); });
})();
