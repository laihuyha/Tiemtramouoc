/* 00-core.js — namespace, safe game access, restorable patch registry, scheduler, lifecycle.
 * Runs in the game page's global scope (console paste or CDP Runtime.evaluate). */
(function () {
  'use strict';
  const W = window;

  // Hot reload: tear down a previous instance before building a new one.
  if (W.__RT && typeof W.__RT.destroy === 'function') {
    try { W.__RT.destroy(); } catch (e) { console.error('[RT] previous destroy failed', e); }
  }

  // Originals survive reloads so a patch never wraps an already-patched function.
  const ORIG = W.__RT_ORIG || (W.__RT_ORIG = Object.create(null));
  const IDENT = /^[A-Za-z_$][\w$]*$/;

  const RT = {
    version: '1.0.0',
    tabs: [],
    windows: [],
    _listeners: [],
    _patches: new Set(),
    _cleanups: [],
    _sinks: new Set()
  };
  W.__RT = RT;

  // ---------- logging / status ----------
  RT.debug = false;
  RT.log = (...a) => { if (RT.debug) console.debug('[RT]', ...a); };
  RT.error = (ctx, err) => console.error('[RT] ' + ctx, err);
  RT.notify = function (msg, kind) {
    Array.from(RT._sinks).forEach(fn => { try { fn(msg, kind || 'ok'); } catch (e) { RT._sinks.delete(fn); } });
  };

  // ---------- generic global access (game-specific names live in bindings.json + adapter) ----------
  // Top-level let/const live in the global lexical scope, not on window. Compiled accessors are cached.
  const getters = Object.create(null);
  const setters = Object.create(null);
  function assertIdent(name) { if (!IDENT.test(name)) throw new Error('identifier không hợp lệ: ' + name); }
  RT.lex = function (name) {
    assertIdent(name);
    const g = getters[name] || (getters[name] = new Function('return typeof ' + name + ' !== "undefined" ? ' + name + ' : undefined;'));
    try { return g(); } catch (e) { return undefined; }
  };
  RT.setLex = function (name, value) {
    assertIdent(name);
    const s = setters[name] || (setters[name] = new Function('v', name + ' = v;'));
    s(value);
  };

  RT.global = name => W[name];

  // ---------- restorable patches on global functions ----------
  RT.patch = function (name, factory) {
    if (typeof W[name] !== 'function') throw new Error('không có hàm ' + name);
    if (!(name in ORIG)) ORIG[name] = W[name];
    W[name] = factory(ORIG[name]);
    RT._patches.add(name);
  };
  RT.unpatch = function (name) {
    if (name in ORIG) { W[name] = ORIG[name]; delete ORIG[name]; }
    RT._patches.delete(name);
  };
  RT.isPatched = name => RT._patches.has(name);

  // Same idea for methods on objects (e.g. window.Garden.render). `id` names the owner, key = "id.member".
  RT._memberPatches = new Set();
  RT.patchMember = function (obj, id, member, factory) {
    const key = id + '.' + member;
    if (!obj || typeof obj[member] !== 'function') throw new Error('không có hàm ' + key);
    if (!(key in ORIG)) ORIG[key] = { obj, member, fn: obj[member] };
    obj[member] = factory(ORIG[key].fn);
    RT._memberPatches.add(key);
  };
  RT.unpatchMember = function (key) {
    const o = ORIG[key];
    if (o && typeof o === 'object') { o.obj[o.member] = o.fn; delete ORIG[key]; }
    RT._memberPatches.delete(key);
  };
  RT.isMemberPatched = key => RT._memberPatches.has(key);

  // ---------- listeners & cleanups ----------
  RT.on = function (target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    RT._listeners.push([target, type, fn, opts]);
  };
  RT.onCleanup = fn => { RT._cleanups.push(fn); };

  // ---------- scheduler: one rAF loop while visible, 250ms interval while hidden ----------
  const tasks = new Map();
  let rafId = 0;
  let bgId = 0;
  function runTasks(now) {
    tasks.forEach((t, id) => {
      if (t.every && now - t.last < t.every) return;
      t.last = now;
      try { t.fn(now); } catch (e) { RT.error('task ' + id, e); }
    });
  }
  function frame(now) { rafId = 0; runTasks(now); schedule(); }
  function schedule() {
    if (!tasks.size) { stopLoop(); return; }
    if (document.hidden) {
      if (!bgId) bgId = setInterval(() => runTasks(performance.now()), 250);
      return;
    }
    if (bgId) { clearInterval(bgId); bgId = 0; }
    if (!rafId) rafId = requestAnimationFrame(frame);
  }
  function stopLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    if (bgId) clearInterval(bgId);
    rafId = 0; bgId = 0;
  }
  RT.addTask = function (id, fn, everyMs) { tasks.set(id, { fn, every: everyMs || 0, last: 0 }); schedule(); };
  RT.removeTask = function (id) { tasks.delete(id); if (!tasks.size) stopLoop(); };
  RT.hasTask = id => tasks.has(id);
  RT.on(document, 'visibilitychange', schedule);

  // ---------- teardown ----------
  RT.destroy = function () {
    stopLoop();
    tasks.clear();
    RT._cleanups.splice(0).reverse().forEach(fn => { try { fn(); } catch (e) { RT.error('cleanup', e); } });
    Array.from(RT._patches).forEach(RT.unpatch);
    Array.from(RT._memberPatches).forEach(RT.unpatchMember);
    RT._listeners.splice(0).forEach(([t, ty, f, o]) => t.removeEventListener(ty, f, o));
    RT._sinks.clear();
    if (W.__RT === RT) delete W.__RT;
  };

  // ---------- formatting ----------
  RT.fmt = n => (Number(n) || 0).toLocaleString('vi-VN') + 'đ';
  RT.num = (v, fallback) => { const n = Number(String(v).replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : fallback; };
})();
