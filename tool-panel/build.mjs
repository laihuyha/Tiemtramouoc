#!/usr/bin/env node
/* build.mjs — bundle src/*.js + bindings.json into dist/tool-panel.js (one injectable script).
 * Module order = file name order. Every module after the core is isolated in try/catch so one broken
 * window cannot take the whole panel down. The bundle is syntax-checked with `node --check`. */
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, 'src');
const OUT = join(HERE, 'dist', 'tool-panel.js');

function isolate(name, code) {
  return `try {\n${code}\n} catch (e) { console.error('[RT] module ${name} failed', e); }`;
}

async function main() {
  const bindings = JSON.parse(await readFile(join(HERE, 'bindings.json'), 'utf8'));
  const files = (await readdir(SRC)).filter(f => f.endsWith('.js')).sort();
  if (!files.length || !files[0].startsWith('00-')) throw new Error('src/ phải bắt đầu bằng module 00-core');

  const parts = [
    `/* RE Tool Panel — built ${new Date().toISOString()} · game ${bindings.gameVersion} · bindings ${bindings.scannedAt}`,
    ` * Inject: node inject.mjs (hoặc dán vào Console của game). Chạy lại = hot-reload an toàn. */`
  ];
  for (const f of files) {
    const code = await readFile(join(SRC, f), 'utf8');
    parts.push(`\n/* ===== ${f} ===== */`);
    // The core creates window.__RT; nothing can run without it, so it is not isolated.
    parts.push(f.startsWith('00-') ? code : isolate(f, code));
    if (f.startsWith('00-')) parts.push(`\n/* ===== bindings.json ===== */\nwindow.__RT.BINDINGS = ${JSON.stringify(bindings)};`);
  }
  parts.push('\nif (window.__RT && typeof window.__RT.boot === "function") window.__RT.boot();\n');

  await mkdir(dirname(OUT), { recursive: true });
  const bundle = parts.join('\n');
  await writeFile(OUT, bundle, 'utf8');

  const check = spawnSync(process.execPath, ['--check', OUT], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error('bundle lỗi cú pháp:\n' + check.stderr);
  console.log(`✓ dist/tool-panel.js · ${files.length} module · ${(bundle.length / 1024).toFixed(1)} KB · game ${bindings.gameVersion}`);
}

main().catch(e => { console.error('build lỗi:', e.message); process.exitCode = 1; });
