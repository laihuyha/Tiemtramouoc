#!/usr/bin/env node
/* inject.mjs — evaluate dist/tool-panel.js inside the running game tab via CDP (no page reload).
 *
 *   node inject.mjs              inject / hot-reload the panel
 *   node inject.mjs --eject      remove the panel and restore every patched game function
 *   node inject.mjs --port 9222  CDP port (Edge/Chrome started with --remote-debugging-port) */
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const PORT = Number(opt('--port', 9222));
const EJECT = args.includes('--eject');
const TIMEOUT_MS = 15000;

async function findTab() {
  const { baseUrl } = JSON.parse(await readFile(join(HERE, 'bindings.json'), 'utf8'));
  const host = new URL(baseUrl).host;
  let targets;
  try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); } catch (e) {
    throw new Error(`không kết nối được CDP :${PORT} — mở Edge với --remote-debugging-port=${PORT} (${e.message})`);
  }
  const tab = targets.find(t => t.type === 'page' && t.url.includes(host));
  if (!tab) throw new Error(`không thấy tab ${host} — mở game trong Edge đó trước`);
  return tab;
}

function evaluate(wsUrl, expression) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => { ws.close(); reject(new Error('CDP timeout')); }, TIMEOUT_MS);
    ws.onerror = () => { clearTimeout(timer); reject(new Error('lỗi WebSocket CDP')); };
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true, userGesture: true } }));
    ws.onmessage = ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id !== 1) return;
      clearTimeout(timer);
      ws.close();
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    };
  });
}

// The tab can exist before the game has finished booting (e.g. right after the browser opens).
async function waitForGame(wsUrl) {
  for (let i = 0; i < 40; i++) {
    const r = await evaluate(wsUrl, '!!(window.S && typeof window.S === "object")');
    if (r.result && r.result.value === true) return;
    await new Promise(res => setTimeout(res, 500));
  }
  throw new Error('game chưa khởi tạo xong sau 20s (không thấy state S)');
}

async function main() {
  const tab = await findTab();
  if (!EJECT) await waitForGame(tab.webSocketDebuggerUrl);
  const report = '\n;JSON.stringify(window.__RT ? { loaded: true, version: window.__RT.version, health: window.__RT.G && window.__RT.G.health() } : { loaded: false })';
  const expression = EJECT
    ? '(function(){ if (!window.__RT) return "chưa nạp"; window.__RT.destroy(); return "đã gỡ panel, khôi phục toàn bộ hàm gốc"; })()'
    : (await readFile(join(HERE, 'dist', 'tool-panel.js'), 'utf8')) + report;

  const result = await evaluate(tab.webSocketDebuggerUrl, expression);
  if (result.exceptionDetails) {
    const d = result.exceptionDetails;
    throw new Error(`lỗi trong trang: ${(d.exception && d.exception.description) || d.text} (dòng ${d.lineNumber + 1})`);
  }
  if (EJECT) { console.log('✓', result.result.value); return; }

  const info = JSON.parse(result.result.value);
  if (!info.loaded) throw new Error('bundle chạy nhưng không khởi tạo được __RT — xem Console của game');
  const hl = info.health;
  console.log(`✓ Đã inject RE Tool Panel v${info.version} vào "${tab.title}"`);
  console.log(`  Bindings ${hl.ok}/${hl.total} sống · game v${hl.version}`);
  if (hl.missing.length) console.log(`  ⚠ thiếu: ${hl.missing.join(', ')} → node scan.mjs --fetch --write && node build.mjs`);
}

main().catch(e => { console.error('inject lỗi:', e.message); process.exitCode = 1; });
