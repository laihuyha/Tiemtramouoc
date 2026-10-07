#!/usr/bin/env node
/* test.mjs — run test/smoke.page.js inside the game tab (panel must be injected first).
 * The page-side test snapshots the save, exercises every action, then restores the save exactly.
 * Exit code 0 = all passed. Run after every `scan.mjs --write` + build + inject. */
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = 9222;
const TIMEOUT_MS = 60000;

async function main() {
  const { baseUrl } = JSON.parse(await readFile(join(HERE, 'bindings.json'), 'utf8'));
  const host = new URL(baseUrl).host;
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const tab = targets.find(t => t.type === 'page' && t.url.includes(host));
  if (!tab) throw new Error(`không thấy tab ${host} trên CDP :${PORT}`);
  const expression = await readFile(join(HERE, 'test', 'smoke.page.js'), 'utf8');

  const result = await new Promise((resolve, reject) => {
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    const timer = setTimeout(() => { ws.close(); reject(new Error('timeout')); }, TIMEOUT_MS);
    ws.onerror = () => { clearTimeout(timer); reject(new Error('lỗi WebSocket CDP')); };
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id !== 1) return;
      clearTimeout(timer);
      ws.close();
      resolve(m.result);
    };
  });
  if (result.exceptionDetails) throw new Error((result.exceptionDetails.exception || {}).description || result.exceptionDetails.text);

  const rows = JSON.parse(result.result.value);
  rows.forEach(r => console.log(`${r.ok ? '  ✓' : '  ✗'} ${r.name}${r.detail ? '  — ' + r.detail : ''}`));
  const failed = rows.filter(r => !r.ok).length;
  console.log(`\n${rows.length - failed}/${rows.length} pass`);
  process.exitCode = failed ? 1 : 0;
}

main().catch(e => { console.error('test lỗi:', e.message); process.exitCode = 2; });
