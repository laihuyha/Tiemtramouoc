#!/usr/bin/env node
/* scan.mjs — signature scanner for bindings.json ("offset table").
 *
 *   node scan.mjs                 scan local ../js sources against bindings.json
 *   node scan.mjs --fetch         download the latest game sources first (old copies kept in js/.prev/)
 *   node scan.mjs --write         apply relocated names / changed values back into bindings.json
 *   node scan.mjs --live          also verify every binding on the running page via CDP (port 9222)
 *   node scan.mjs --src <dir>     use another source directory
 *
 * Sources are only ever read as text and matched with regexes — never executed.
 * Exit code: 0 = all bindings resolved, 1 = something needs manual attention, 2 = scanner error. */
import { readFile, writeFile, mkdir, rename, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BINDINGS_PATH = join(HERE, 'bindings.json');
const args = process.argv.slice(2);
const flag = f => args.includes(f);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const SRC_DIR = resolve(HERE, opt('--src', '../js'));

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const exists = p => access(p).then(() => true, () => false);

// ---------- source loading ----------
async function fetchSources(B) {
  const prev = join(SRC_DIR, '.prev');
  await mkdir(prev, { recursive: true });
  for (const f of B.sources) {
    const url = B.baseUrl + f + '?v=' + Date.now();
    let res;
    for (let a = 1; ; a++) {
      try { res = await fetch(url); break; }
      catch (e) {
        const c = e.cause ? ` (${e.cause.code || ''} ${e.cause.message || e.cause})` : '';
        if (a >= 3) throw new Error(`fetch ${f}: ${e.message}${c}`);
        console.warn(`  ! ${f}: ${e.message}${c} — thử lại ${a}/2`);
        await new Promise(r => setTimeout(r, 1000 * a));
      }
    }
    if (!res.ok) throw new Error(`fetch ${f}: HTTP ${res.status}`);
    const text = await res.text();
    const dst = join(SRC_DIR, f);
    if (await exists(dst)) await rename(dst, join(prev, f));
    await writeFile(dst, text, 'utf8');
    console.log(`  ↓ ${f} (${text.length.toLocaleString()} bytes)`);
  }
}
async function loadSources(B) {
  const files = [];
  for (const f of B.sources) {
    const p = join(SRC_DIR, f);
    if (!(await exists(p))) { console.warn(`  ! thiếu source ${f}`); continue; }
    files.push({ file: f, text: await readFile(p, 'utf8') });
  }
  return files;
}
const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;

// ---------- matchers ----------
function findAll(files, re) {
  const out = [];
  for (const { file, text } of files) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let m;
    while ((m = g.exec(text))) { out.push({ file, index: m.index, line: lineOf(text, m.index), m }); if (m[0] === '') g.lastIndex++; }
  }
  return out;
}
function findString(files, needle) {
  const out = [];
  for (const { file, text } of files) {
    let i = text.indexOf(needle);
    while (i >= 0) { out.push({ file, text, index: i, line: lineOf(text, i) }); i = text.indexOf(needle, i + needle.length); }
  }
  return out;
}
// Name of the closest function declaration that starts before `index`.
function enclosingFunction(text, index) {
  const re = /function\s+([\w$]+)\s*\(/g;
  let m, last = null;
  while ((m = re.exec(text)) && m.index < index) last = m[1];
  return last;
}
// Top-level only (declaration at column 0) so local helpers with the same name are not mistaken for globals.
const defRe = name => new RegExp(`(?:^(?:async\\s+)?function\\s+${esc(name)}\\s*\\(|^(?:const|let|var)\\s+${esc(name)}\\s*=|window\\.${esc(name)}\\s*=)`, 'm');
const lexRe = name => new RegExp(`^(?:let|const|var)\\b[^;\\n]*?[\\s,]${esc(name)}\\s*=`, 'm');
// state/runtime entries are either "path" or { path, optional }.
const norm = v => (typeof v === 'string' ? { path: v, optional: false } : { optional: false, ...v });

// ---------- per-kind scanners (each returns {key, status, detail, fix?}) ----------
const squash = s => s.replace(/\s+/g, '');
function paramsOf(files, name) {
  const re = new RegExp(`^(?:async\\s+)?function\\s+${esc(name)}\\s*\\(([^)]*)\\)`, 'm');
  for (const { text } of files) { const m = re.exec(text); if (m) return m[1]; }
  return null;
}
// Our calls pass positional arguments, so a changed parameter list needs a human look.
function checkParams(files, key, e, result) {
  if (e.params === undefined || !['OK', 'RELOCATED', 'STALE', 'WARN'].includes(result.status)) return result;
  const name = (result.fix && result.fix.name) || e.name;
  const cur = paramsOf(files, name);
  if (cur === null || squash(cur) === squash(e.params)) return result;
  return { key, status: 'SIGCHANGE', detail: `${name}(${e.params}) → ${name}(${cur}) — kiểm tra lời gọi trong 20-actions.js`, fix: result.fix };
}
function scanFn(files, key, e) {
  return checkParams(files, key, e, scanFnName(files, key, e));
}
function scanFnName(files, key, e) {
  const defs = findAll(files, defRe(e.name));
  const where = defs[0] ? `${defs[0].file}:${defs[0].line}` : '';
  if (!e.anchor) return defs.length ? { key, status: 'OK', detail: `${e.name} @ ${where} (không có anchor)` } : { key, status: 'MISSING', detail: `${e.name} không còn, chưa có anchor để dò` };
  const hits = findString(files, e.anchor);
  const owners = [...new Set(hits.map(h => enclosingFunction(h.text, h.index)).filter(Boolean))];
  if (defs.length && owners.includes(e.name)) return { key, status: 'OK', detail: `${e.name} @ ${where}` };
  if (defs.length && !hits.length) return { key, status: 'STALE', detail: `${e.name} @ ${where} — anchor không còn, cần cập nhật anchor` };
  if (defs.length) return { key, status: 'WARN', detail: `${e.name} còn nhưng anchor nằm trong ${owners.join(', ')}` };
  if (owners.length === 1) return { key, status: 'RELOCATED', detail: `${e.name} → ${owners[0]}`, fix: { name: owners[0] } };
  if (owners.length > 1) return { key, status: 'AMBIGUOUS', detail: `${e.name} mất; anchor khớp: ${owners.join(', ')}` };
  return { key, status: 'MISSING', detail: `${e.name} mất; anchor không khớp` };
}
function scanLex(files, key, e) {
  const defs = findAll(files, lexRe(e.name));
  const where = defs[0] ? `${defs[0].file}:${defs[0].line}` : '';
  if (!e.pattern) return defs.length ? { key, status: 'OK', detail: `${e.name} @ ${where}` } : { key, status: 'MISSING', detail: e.name };
  const caps = [...new Set(findAll(files, new RegExp(e.pattern)).map(h => h.m[1]))];
  if (defs.length && (caps.includes(e.name) || !caps.length)) return { key, status: caps.length ? 'OK' : 'STALE', detail: `${e.name} @ ${where}${caps.length ? '' : ' — pattern không khớp'}` };
  if (caps.length === 1) return { key, status: 'RELOCATED', detail: `${e.name} → ${caps[0]}`, fix: { name: caps[0] } };
  if (caps.length > 1) return { key, status: 'AMBIGUOUS', detail: `${e.name} mất; pattern khớp: ${caps.join(', ')}` };
  return { key, status: 'MISSING', detail: `${e.name} mất; pattern không khớp` };
}
function scanObj(files, key, e) {
  const defs = findAll(files, new RegExp(`window\\.${esc(e.name)}\\s*=`));
  if (!defs.length) return { key, status: 'MISSING', detail: `window.${e.name}` };
  const host = files.find(f => f.file === defs[0].file).text;
  const lost = (e.members || []).filter(m => !new RegExp(`\\b${esc(m)}\\b`).test(host));
  return lost.length ? { key, status: 'WARN', detail: `window.${e.name} thiếu member: ${lost.join(', ')}` } : { key, status: 'OK', detail: `window.${e.name} @ ${defs[0].file}:${defs[0].line}` };
}
function scanValue(files, key, e) {
  const caps = [...new Set(findAll(files, new RegExp(e.pattern)).map(h => h.m[1]))];
  if (!caps.length) return { key, status: 'MISSING', detail: 'pattern không khớp' };
  if (caps.length > 1) return { key, status: 'AMBIGUOUS', detail: caps.join(', ') };
  const raw = caps[0];
  const val = typeof e.value === 'number' ? Number(raw) * (e.scale || 1) : raw;
  return val === e.value ? { key, status: 'OK', detail: String(val) } : { key, status: 'CHANGED', detail: `${e.value} → ${val}`, fix: { value: val } };
}
function scanList(files, key, e) {
  let scope = files;
  if (e.region) {
    scope = [];
    for (const f of files) {
      const s = f.text.indexOf(e.region[0]);
      if (s < 0) continue;
      const end = f.text.indexOf(e.region[1], s + e.region[0].length);
      scope.push({ file: f.file, text: f.text.slice(s, end < 0 ? undefined : end) });
    }
  }
  const found = new Set();
  e.patterns.forEach(p => findAll(scope, new RegExp(p)).forEach(h => found.add(h.m[1])));
  const cur = new Set(e.value);
  const added = [...found].filter(x => !cur.has(x));
  const removed = e.value.filter(x => !found.has(x));
  if (!added.length && !removed.length) return { key, status: 'OK', detail: `${found.size} mục` };
  const next = [...e.value.filter(x => found.has(x)), ...added];
  return { key, status: 'CHANGED', detail: `+[${added.join(', ')}] −[${removed.join(', ')}]`, fix: { value: next } };
}
function scanField(files, key, e) {
  const scope = e.file ? files.filter(f => f.file === e.file) : files;
  if (!e.pattern) {
    const n = findAll(scope, new RegExp(`\\b${esc(e.value)}\\b`)).length;
    return n ? { key, status: 'OK', detail: `${e.value} (${n} chỗ)` } : { key, status: 'WARN', detail: `không còn token "${e.value}" trong ${e.file || 'source'}` };
  }
  const caps = [...new Set(findAll(scope, new RegExp(e.pattern)).map(h => h.m[1]))];
  if (caps.includes(e.value)) return { key, status: 'OK', detail: e.value };
  if (caps.length === 1) return { key, status: 'CHANGED', detail: `${e.value} → ${caps[0]}`, fix: { value: caps[0] } };
  return caps.length ? { key, status: 'AMBIGUOUS', detail: caps.join(', ') } : { key, status: 'WARN', detail: `pattern không khớp (${e.value})` };
}
function scanShape(files, key, e) {
  return findAll(files, new RegExp(e.pattern)).length ? { key, status: 'OK', detail: 'shape khớp' } : { key, status: 'WARN', detail: 'không thấy code tạo shape — kiểm tra field thủ công' };
}
function scanPaths(files, key, entry, root) {
  const path = norm(entry).path;
  const head = path.split('.')[0];
  const n = findAll(files, new RegExp(`\\b${root}\\.${esc(head)}\\b`)).length;
  return n ? { key, status: 'OK', detail: `${root}.${path} (${n} chỗ)` } : { key, status: 'WARN', detail: `không thấy ${root}.${head}` };
}

// ---------- live verification through CDP ----------
function liveChecker(B) {
  const out = {};
  const lex = n => { try { return new Function('return typeof ' + n + ' !== "undefined"')(); } catch (e) { return false; } };
  const at = (o, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
  const nrm = v => (typeof v === 'string' ? { path: v, optional: false } : v);
  // Values: true = present, false = missing (required), 'opt' = absent but optional in this context.
  const path = (root, v) => {
    const e = nrm(v);
    if (root && at(root, e.path) !== undefined) return true;
    return e.optional ? 'opt' : false;
  };
  Object.entries(B.fn).forEach(([k, e]) => { out['fn.' + k] = typeof window[e.name] === 'function'; });
  Object.entries(B.lex).forEach(([k, e]) => { out['lex.' + k] = lex(e.name); });
  Object.entries(B.obj).forEach(([k, e]) => { const o = window[e.name]; out['obj.' + k] = !!o && (e.members || []).every(m => o[m] !== undefined); });
  Object.entries(B.state).forEach(([k, v]) => { out['state.' + k] = path(window.S, v); });
  Object.entries(B.runtime).forEach(([k, v]) => { out['runtime.' + k] = path(window.R, v); });
  return out;
}
async function liveVerify(B) {
  const targets = await (await fetch('http://127.0.0.1:9222/json')).json();
  const host = new URL(B.baseUrl).host;
  const page = targets.find(t => t.type === 'page' && t.url.includes(host));
  if (!page) throw new Error('không thấy tab game trên CDP :9222');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = bad; });
  try {
    const result = await new Promise((ok, bad) => {
      const timer = setTimeout(() => bad(new Error('CDP timeout')), 8000);
      ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id === 1) { clearTimeout(timer); ok(m.result); } };
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: `(${liveChecker.toString()})(${JSON.stringify(B)})`, returnByValue: true } }));
    });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  } finally { ws.close(); }
}

// ---------- main ----------
const ICON = { OK: '✓', STALE: '~', WARN: '!', CHANGED: 'Δ', RELOCATED: '→', SIGCHANGE: '⚑', AMBIGUOUS: '?', MISSING: '✗' };
const NEEDS_HUMAN = new Set(['MISSING', 'AMBIGUOUS', 'SIGCHANGE']);

async function main() {
  const B = JSON.parse(await readFile(BINDINGS_PATH, 'utf8'));
  if (flag('--fetch')) { console.log('Tải source mới:'); await fetchSources(B); }
  const files = await loadSources(B);
  if (!files.length) throw new Error('không có source nào trong ' + SRC_DIR);

  const game = files.find(f => f.file === 'game.js');
  const ver = game ? (game.text.match(/GAME_VERSION\s*=\s*'([^']+)'/) || [])[1] : undefined;
  console.log(`\nGame version: ${ver || '?'} (bindings quét lúc ${B.scannedAt} cho ${B.gameVersion})\n`);

  const sections = [
    ['fn', Object.entries(B.fn).map(([k, e]) => scanFn(files, k, e))],
    ['lex', Object.entries(B.lex).map(([k, e]) => scanLex(files, k, e))],
    ['obj', Object.entries(B.obj).map(([k, e]) => scanObj(files, k, e))],
    ['values', Object.entries(B.values).map(([k, e]) => scanValue(files, k, e))],
    ['lists', Object.entries(B.lists).map(([k, e]) => scanList(files, k, e))],
    ['fields', Object.entries(B.fields || {}).map(([k, e]) => scanField(files, k, e))],
    ['shapes', Object.entries(B.shapes).map(([k, e]) => scanShape(files, k, e))],
    ['state', Object.entries(B.state).map(([k, p]) => scanPaths(files, k, p, 'S'))],
    ['runtime', Object.entries(B.runtime).map(([k, p]) => scanPaths(files, k, p, 'R'))]
  ];

  const tally = {};
  for (const [sec, rows] of sections) {
    console.log(`[${sec}]`);
    rows.forEach(r => { tally[r.status] = (tally[r.status] || 0) + 1; console.log(`  ${ICON[r.status]} ${r.status.padEnd(9)} ${r.key.padEnd(20)} ${r.detail}`); });
  }

  let liveFail = 0;
  if (flag('--live')) {
    console.log('\n[live CDP]');
    const live = await liveVerify(B);
    const entries = Object.entries(live);
    const optional = entries.filter(([, v]) => v === 'opt').map(([ref]) => ref);
    entries.forEach(([ref, v]) => { if (v === false) { liveFail++; console.log(`  ✗ ${ref}`); } });
    if (optional.length) console.log(`  · chưa xuất hiện (optional theo ngữ cảnh): ${optional.join(', ')}`);
    console.log(`  ${entries.length - liveFail}/${entries.length} binding hợp lệ trên trang`);
  }

  console.log('\nTổng:', Object.entries(tally).map(([s, n]) => `${s}=${n}`).join('  '));

  if (flag('--write')) {
    let applied = 0;
    for (const [sec, rows] of sections) {
      rows.filter(r => r.fix).forEach(r => { Object.assign(B[sec][r.key], r.fix); applied++; });
    }
    B.scannedAt = new Date().toISOString().slice(0, 10);
    if (ver) B.gameVersion = ver;
    await writeFile(BINDINGS_PATH, JSON.stringify(B, null, 2) + '\n', 'utf8');
    console.log(`\n✎ Đã ghi bindings.json (${applied} thay đổi tự động). Chạy lại build.mjs để cập nhật bundle.`);
  }

  const human = Object.entries(tally).filter(([s]) => NEEDS_HUMAN.has(s)).reduce((a, [, n]) => a + n, 0) + liveFail;
  if (human) console.log(`\n⚠ ${human} binding cần xử lý tay (MISSING/AMBIGUOUS/live).`);
  process.exitCode = human ? 1 : 0;
}

main().catch(e => { console.error('scan lỗi:', e.message); process.exitCode = 2; });
