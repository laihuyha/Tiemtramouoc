/* 05-adapter.js — the ONLY layer that knows game identifiers.
 * Everything above it talks in binding keys from bindings.json (embedded by build.mjs as RT.BINDINGS).
 * When the game updates: `node scan.mjs --fetch --write`, rebuild — no logic file changes. */
(function () {
  'use strict';
  const RT = window.__RT;
  const B = RT.BINDINGS;
  if (!B) throw new Error('RT.BINDINGS chưa được nhúng — build lại bằng build.mjs');
  const W = window;

  const norm = v => (typeof v === 'string' ? { path: v, optional: false } : Object.assign({ optional: false }, v));
  const at = (o, path) => path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
  function setAt(obj, path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    const parent = keys.reduce((a, k) => { if (a[k] == null) a[k] = {}; return a[k]; }, obj);
    parent[last] = value;
  }
  function entry(section, key) {
    const e = B[section] && B[section][key];
    if (e === undefined) throw new Error('binding ' + section + '.' + key + ' không có trong bindings.json');
    return e;
  }

  const G = {};
  RT.G = G;

  // ---------- functions ----------
  G.fnName = key => entry('fn', key).name;
  G.fn = key => { const f = W[G.fnName(key)]; return typeof f === 'function' ? f : null; };
  G.has = key => !!(B.fn[key] && typeof W[B.fn[key].name] === 'function');
  G.call = function (key, ...args) {
    const f = G.fn(key);
    if (!f) throw new Error('thiếu hàm game fn.' + key + ' (' + G.fnName(key) + ') — chạy scan.mjs');
    return f.apply(W, args);
  };
  G.tryCall = (key, ...args) => (G.has(key) ? G.call(key, ...args) : undefined);

  // ---------- lexical globals / window objects ----------
  G.lex = key => RT.lex(entry('lex', key).name);
  G.setLex = (key, v) => RT.setLex(entry('lex', key).name, v);
  G.obj = key => W[entry('obj', key).name] || null;
  G.member = function (objKey, m) {
    const o = G.obj(objKey);
    if (!o || typeof o[m] !== 'function') throw new Error('thiếu ' + objKey + '.' + m + ' — chạy scan.mjs');
    return o[m].bind(o);
  };

  // ---------- values / lists / fields / shapes / labels ----------
  G.val = key => entry('values', key).value;
  G.list = key => (B.lists[key] ? B.lists[key].value.slice() : []);
  G.field = key => entry('fields', key).value;
  // Deep copy of a shape template; "$name" placeholders are filled from `vars`.
  G.shape = (key, vars) => JSON.parse(JSON.stringify(entry('shapes', key).value), (k, v) =>
    (typeof v === 'string' && v[0] === '$' && vars && Object.prototype.hasOwnProperty.call(vars, v.slice(1)) ? vars[v.slice(1)] : v));
  G.label = (group, key) => (B.labels && B.labels[group] && B.labels[group][key]) || key;

  // ---------- state S / runtime R ----------
  G.S = () => W.S || null;
  G.R = () => W.R || null;
  G.statePath = key => norm(entry('state', key)).path;
  G.get = function (key, fallback) {
    const S = G.S();
    const v = S ? at(S, G.statePath(key)) : undefined;
    return v === undefined ? fallback : v;
  };
  G.set = function (key, value) {
    const S = G.S();
    if (!S) throw new Error('chưa có state S');
    setAt(S, G.statePath(key), value);
  };
  // Returns the live container (object/array) so game state is edited in place — the game keeps references to it.
  G.ensure = function (key, init) {
    let v = G.get(key);
    if (v == null) { v = init; G.set(key, v); }
    return v;
  };
  G.rt = function (key, fallback) {
    const R = G.R();
    const v = R ? at(R, norm(entry('runtime', key)).path) : undefined;
    return v === undefined ? fallback : v;
  };

  // ---------- game-level helpers ----------
  G.mode = () => G.rt('mode', 'prep');
  G.isSelling = () => G.mode() === 'sell';
  G.isRunning = () => !!G.rt('running', false) && !G.rt('paused', false);
  G.persist = () => G.tryCall('save');
  // level: 'head' = header only, 'full' = re-render prep view (keeps current tab), false = none.
  G.refresh = function (level) {
    if (level === false) return;
    if (level !== 'head' && G.mode() === 'prep') G.tryCall('renderPrep');
    G.tryCall('head');
  };
  G.toast = (msg, ms) => G.tryCall('toast', msg, ms || 2500);

  // ---------- patches addressed by binding key ----------
  G.patch = (key, factory) => RT.patch(G.fnName(key), factory);
  G.unpatch = key => RT.unpatch(G.fnName(key));
  G.isPatched = key => !!B.fn[key] && RT.isPatched(B.fn[key].name);
  G.patchMember = (objKey, member, factory) => RT.patchMember(G.obj(objKey), 'obj.' + objKey, member, factory);
  G.unpatchMember = (objKey, member) => RT.unpatchMember('obj.' + objKey + '.' + member);
  G.isMemberPatched = (objKey, member) => RT.isMemberPatched('obj.' + objKey + '.' + member);

  // ---------- health: refs like 'fn.save', 'lex.CFG', 'obj.garden.waterAll', 'state.money' ----------
  G.check = function (ref) {
    const parts = ref.split('.');
    const kind = parts[0], key = parts[1], member = parts[2];
    try {
      switch (kind) {
        case 'fn': return G.has(key);
        case 'lex': return G.lex(key) !== undefined;
        case 'obj': { const o = G.obj(key); return !!o && (!member || o[member] !== undefined); }
        case 'state': return norm(entry('state', key)).optional || G.get(key) !== undefined;
        case 'runtime': return norm(entry('runtime', key)).optional || G.rt(key) !== undefined;
        case 'values': case 'lists': case 'fields': case 'shapes': return !!(B[kind] && B[kind][key]);
        default: return false;
      }
    } catch (e) { return false; }
  };
  G.missing = refs => (refs || []).filter(r => !G.check(r));
  G.allRefs = function () {
    return [].concat(
      Object.keys(B.fn).map(k => 'fn.' + k),
      Object.keys(B.lex).map(k => 'lex.' + k),
      Object.keys(B.obj).reduce((acc, k) => acc.concat(['obj.' + k], (B.obj[k].members || []).map(m => 'obj.' + k + '.' + m)), []),
      Object.keys(B.state).map(k => 'state.' + k),
      Object.keys(B.runtime).map(k => 'runtime.' + k)
    );
  };
  G.health = function () {
    const refs = G.allRefs();
    const missing = G.missing(refs);
    return { total: refs.length, ok: refs.length - missing.length, missing, version: B.gameVersion, scannedAt: B.scannedAt };
  };

  // ---------- RT.mutate: guard → change → persist → refresh → report ----------
  // Inside RT.batch() the persist/refresh work is coalesced: one save + one render for many actions.
  const REFRESH_RANK = { false: 0, head: 1, full: 2 };
  const KIND_RANK = { ok: 0, warn: 1, err: 2 };
  let batch = null;
  RT.batch = function (label, fn) {
    if (batch) { fn(); return; }
    batch = { persist: false, refresh: false, msgs: [], kind: 'ok' };
    try { fn(); } finally {
      const b = batch;
      batch = null;
      if (b.persist) G.persist();
      G.refresh(b.refresh);
      RT.notify('✓ ' + label + (b.msgs.length ? ': ' + b.msgs.join(' · ') : ''), b.kind);
    }
  };
  // fn may return a message string or { msg, kind } ('ok' | 'warn').
  RT.mutate = function (label, fn, opts) {
    const o = opts || {};
    if (!G.S()) { RT.notify('Chưa có state S — mở game trước', 'warn'); return false; }
    try {
      const res = fn(G.S());
      const msg = res && typeof res === 'object' ? res.msg : res;
      const kind = (res && typeof res === 'object' && res.kind) || 'ok';
      const level = o.refresh === undefined ? 'full' : o.refresh;
      if (batch) {
        batch.persist = batch.persist || o.persist !== false;
        if (REFRESH_RANK[level] > REFRESH_RANK[batch.refresh]) batch.refresh = level;
        if (KIND_RANK[kind] > KIND_RANK[batch.kind]) batch.kind = kind;
        batch.msgs.push(msg || label);
        return true;
      }
      if (o.persist !== false) G.persist();
      G.refresh(level);
      RT.notify(msg || ('✓ ' + label), kind);
      return true;
    } catch (e) {
      RT.error(label, e);
      RT.notify(label + ': ' + e.message, 'err');
      return false;
    }
  };

  // Binding-aware button: disabled (with the reason) when a required binding is missing.
  RT.gbtn = function (label, refs, onClick, variant, title) {
    const b = RT.btn(label, onClick, variant, title);
    const miss = G.missing(refs);
    if (miss.length) { b.disabled = true; b.title = 'Thiếu binding: ' + miss.join(', ') + ' — chạy scan.mjs'; }
    return b;
  };
})();
