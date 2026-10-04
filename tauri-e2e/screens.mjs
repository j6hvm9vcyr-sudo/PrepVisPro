// Revue visuelle de l'application réelle (moteur WebKit, comme sur Mac) : une capture par écran.
// Lancement : xvfb-run -a -s "-screen 0 1600x1000x24" node tauri-e2e/screens.mjs [dossier]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const APP = resolve('src-tauri/target/debug/prepvispro');
const DRIVER = process.env.TAURI_DRIVER ?? `${process.env.HOME}/.cargo/bin/tauri-driver`;
const BASE = 'http://127.0.0.1:4444';
const OUT = resolve(process.argv[2] ?? 'test-results/webkit');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function wd(method, path, body) {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
  return j.value;
}

const driver = spawn(DRIVER, [], { stdio: ['ignore', 'ignore', 'inherit'] });
try {
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(BASE + '/status');
      break;
    } catch {
      await sleep(200);
    }
  }
  const { sessionId: sid } = await wd('POST', '/session', { capabilities: { alwaysMatch: { 'tauri:options': { application: APP } } } });
  const exec = (script) => wd('POST', `/session/${sid}/execute/async`, { script: `const done = arguments[arguments.length - 1]; (async () => { ${script} })().then(done, (e) => done({ __error: String(e && e.message || e) }));`, args: [] });
  const key = (k, mods = []) => {
    const down = mods.map((m) => ({ type: 'keyDown', value: m }));
    const up = mods.map((m) => ({ type: 'keyUp', value: m }));
    return wd('POST', `/session/${sid}/actions`, { actions: [{ type: 'key', id: 'k', actions: [...down, { type: 'keyDown', value: k }, { type: 'keyUp', value: k }, ...up] }] });
  };
  const CTRL = '';
  const shot = async (name) => {
    await sleep(400);
    const b64 = await wd('GET', `/session/${sid}/screenshot`);
    writeFileSync(join(OUT, `${name}.png`), Buffer.from(b64, 'base64'));
    console.log('capture', name);
  };
  for (let i = 0; i < 50 && (await exec('return !!window.__prepvis;')) !== true; i++) await sleep(200);
  await wd('POST', `/session/${sid}/window/rect`, { width: 1470, height: 920, x: 0, y: 0 });
  await shot('01-accueil');
  await exec('await window.__prepvis.openSample(); return true;');
  await sleep(800);
  await shot('02-tableau');
  await exec('document.querySelector("[role=grid]").focus(); return true;');
  await key(''); // flèche bas
  await key('');
  await key('i', [CTRL]);
  await shot('03-details');
  await key('i', [CTRL]);
  await key('2', [CTRL]);
  await shot('04-fiches');
  await key('3', [CTRL]);
  await shot('05-plans-au-sol');
  await key('1', [CTRL]);
  await exec('document.querySelector("[role=grid]").focus(); return true;');
  await key('?');
  await shot('06-aide');
  await key('');
  await exec('[...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Réglages")?.click(); return true;');
  await shot('07-reglages');
  await key('');
  await key('e', [CTRL]);
  await shot('08-export');
  await key('');
  const info = await exec(`
    const cells = [...document.querySelectorAll('[role=gridcell]')];
    const empty = cells.filter((c) => c.textContent.trim() === '').length;
    return { errors: window.__prepvis.errors, alerts: window.__prepvis.alerts, cells: cells.length, emptyCells: empty, ua: navigator.userAgent };
  `);
  console.log(JSON.stringify(info, null, 2));
  await wd('DELETE', `/session/${sid}`).catch(() => {});
} finally {
  driver.kill();
}
