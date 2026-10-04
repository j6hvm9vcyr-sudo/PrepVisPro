// Test de l'application réelle (enveloppe Tauri + interface), piloté par WebDriver.
// Prérequis (Linux) : tauri-driver, WebKitWebDriver, Xvfb, et un binaire construit avec
//   VITE_TEST_HOOKS=1 npx tauri build --debug --no-bundle
// Lancement : xvfb-run node tauri-e2e/run.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const APP = resolve('src-tauri/target/debug/prepvispro');
const DRIVER = process.env.TAURI_DRIVER ?? `${process.env.HOME}/.cargo/bin/tauri-driver`;
const BASE = 'http://127.0.0.1:4444';
const work = mkdtempSync(join(tmpdir(), 'prepvis-e2e-'));
const projectDir = join(work, 'Film test.prepvis');

let failures = 0;
/** Dernier script envoyé à l'application (pour situer un blocage). */
let lastScript = '';
const CI = !!process.env.GITHUB_ACTIONS;
const ok = (cond, label) => {
  console.log(`${cond ? '✓' : '✘'} ${label}`);
  // En CI, chaque échec devient une annotation lisible via l'API GitHub.
  if (!cond && CI) console.log(`::error title=Application réelle::${label.replace(/\n/g, ' ')}`);
  if (!cond) failures++;
};
/** Attend qu'une condition soit vraie (au lieu de délais fixes, fragiles sur une machine lente). */
async function waitFor(fn, timeoutMs = 10000, step = 100) {
  const t0 = Date.now();
  for (;;) {
    try {
      if (await fn()) return true;
    } catch {
      /* on réessaie */
    }
    if (Date.now() - t0 > timeoutMs) return false;
    await new Promise((r) => setTimeout(r, step));
  }
}

async function wd(method, path, body) {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
  return j.value;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const driver = spawn(DRIVER, [], { stdio: ['ignore', 'inherit', 'inherit'] });
try {
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(BASE + '/status');
      break;
    } catch {
      await sleep(200);
    }
  }
  const session = await wd('POST', '/session', { capabilities: { alwaysMatch: { 'tauri:options': { application: APP } } } });
  const sid = session.sessionId;
  // Machines d'intégration parfois lentes : délai généreux pour les scripts asynchrones.
  await wd('POST', `/session/${sid}/timeouts`, { script: 120000 }).catch(() => {});
  const exec = (script, args = []) => ((lastScript = script.replace(/\s+/g, ' ').slice(0, 160)), wd('POST', `/session/${sid}/execute/async`, { script: `const done = arguments[arguments.length - 1]; (async () => { ${script} })().then(done, (e) => done({ __error: String(e && e.message || e) }));`, args }));
  const keys = (text) => wd('POST', `/session/${sid}/actions`, { actions: [{ type: 'key', id: 'k', actions: [...text].flatMap((c) => [{ type: 'keyDown', value: c }, { type: 'keyUp', value: c }]) }] });

  // Attendre l'interface.
  for (let i = 0; i < 50; i++) {
    const has = await exec('return !!window.__prepvis;');
    if (has === true) break;
    await sleep(200);
  }
  ok(await exec('return document.title;') === 'PrepVisPro', 'la fenêtre s’ouvre');
  ok(await exec('return !!document.querySelector(".welcome");'), 'écran d’accueil sans projet récent');

  // Créer un projet sur disque.
  const created = await exec(`return await window.__prepvis.newProjectAt(${JSON.stringify(projectDir)});`);
  ok(created === true, 'nouveau projet créé');
  ok(existsSync(join(projectDir, 'project.json')), 'project.json écrit sur disque');
  ok(existsSync(join(projectDir, 'images')) && existsSync(join(projectDir, 'backups')), 'dossiers images et backups créés');
  await waitFor(async () => (await exec('return !!document.querySelector("[role=grid]");')) === true);

  // Saisie au clavier réelle dans la cellule Valeur.
  await exec('document.querySelector("[role=grid]").focus(); return true;');
  await keys('poi');
  await keys(''); // Entrée
  await waitFor(async () => (await exec('return window.__prepvis.doc().sequences[0].plans[0].cameras[0].start.size;')) === 'Poitrine', 5000);
  const size = await exec('return window.__prepvis.doc().sequences[0].plans[0].cameras[0].start.size;');
  ok(size === 'Poitrine', `saisie clavier appliquée (${size})`);

  // Moteur WebKit : clic sur la cellule active → la saisie s'ouvre et garde le focus.
  {
    const found = await wd('POST', `/session/${sid}/element`, { using: 'css selector', value: '.line [id$="-axis"]' });
    const elId = Object.values(found)[0];
    await wd('POST', `/session/${sid}/element/${elId}/click`, {});
    await wd('POST', `/session/${sid}/element/${elId}/click`, {});
    const focused = await waitFor(async () => (await exec('return document.activeElement && document.activeElement.getAttribute("aria-label");')) === 'Saisie', 3000);
    ok(focused, 'clic sur la cellule active : la saisie s’ouvre et garde le focus');
    await keys('pro');
    await keys('\uE007'); // Entrée
    const axis = await waitFor(async () => (await exec('return window.__prepvis.doc().sequences[0].plans[0].cameras[0].start.axis;')) === 'Profil', 3000);
    ok(axis, 'saisie validée par Entrée après un clic');
  }

  // Enregistrement automatique.
  const saved = await waitFor(() => JSON.parse(readFileSync(join(projectDir, 'project.json'), 'utf8')).sequences[0].plans[0].cameras[0].start.size === 'Poitrine');
  ok(saved, 'enregistrement automatique sur disque');
  await waitFor(async () => (await exec('return window.__prepvis.project().status;')) === 'saved');
  ok((await exec('return window.__prepvis.project().status;')) === 'saved', 'état « Enregistré »');

  // Image : écriture via IPC binaire, affichage via le protocole asset.
  const img = await exec(`return await window.__prepvis.addTestImage('scouting');`);
  ok(img && !img.__error && /^images\/[a-z0-9-]+\.png$/.test(img.file), `image importée (${JSON.stringify(img)})`);
  ok(existsSync(join(projectDir, img.file)), 'fichier image écrit dans le projet');
  const loaded = await exec(`return await new Promise((res) => { const i = new Image(); i.onload = () => res(i.naturalWidth); i.onerror = () => res(-1); i.src = ${JSON.stringify(img.url)}; });`);
  ok(loaded === 16, `image affichable depuis le disque (largeur ${loaded})`);

  // Exports écrits sur disque (avec l'image du projet).
  for (const [fmt, magic] of [['pdf', '%PDF-'], ['xlsx', 'PK'], ['csv', '\uFEFF']]) {
    const out = join(work, `export.${fmt}`);
    const failed = await exec(`return await window.__prepvis.exportTo(${JSON.stringify(out)}, '${fmt}');`);
    const ok1 = existsSync(out) && readFileSync(out).toString('utf8', 0, 5).startsWith(magic);
    ok(ok1 && failed === 0, `export ${fmt.toUpperCase()} écrit (${failed === 0 ? 'images lues' : `${JSON.stringify(failed)}`})`);
  }
  ok(String(await exec(`return await window.__prepvis.exportTo(${JSON.stringify(join(work, 'x.sh'))}, 'csv').then(() => 'écrit', (e) => 'refusé');`)).includes('refusé'), 'type de fichier d’export non autorisé refusé');

  // Lecture d'un scénario Final Draft.
  const { writeFileSync: wf } = await import('node:fs');
  wf(join(work, 'scenario.fdx'), '<?xml version="1.0"?><FinalDraft><Content><Paragraph Type="Scene Heading" Number="1"><Text>INT. CHAMBRE - NUIT</Text></Paragraph></Content></FinalDraft>');
  ok(String(await exec(`return await window.__prepvis.readScript(${JSON.stringify(join(work, 'scenario.fdx'))});`)).includes('CHAMBRE'), 'scénario .fdx lu');

  // Versions : écrites dans le dossier versions/ du projet, relues et vérifiées.
  {
    const v = await exec(`return await window.__prepvis.createVersion('V1 réalisation', 'envoyée à Victor');`);
    ok(v && !v.__error && existsSync(join(projectDir, 'versions', v.file)), `version écrite (${JSON.stringify(v)})`);
    const list = await exec('return await window.__prepvis.listVersions();');
    ok(Array.isArray(list) && list[0]?.name === 'V1 réalisation' && list[0]?.note === 'envoyée à Victor', 'versions listées');
    const back = await exec(`return (await window.__prepvis.readVersion(${JSON.stringify(v?.file ?? '')})).sequences.length;`);
    ok(back >= 1, 'version relue et validée');
  }

  // Bibliothèque d'icônes : dossier aux noms accentués, réduction, stockage, affichage.
  {
    const { mkdirSync: md } = await import('node:fs');
    const src = join(work, 'Icônes perso');
    md(join(src, 'Lumière'), { recursive: true });
    md(join(src, '.cache'), { recursive: true });
    const png = Buffer.from(readFileSync(resolve('e2e/plan-decor.png')));
    wf(join(src, 'Lumière', 'Fresnel 650.png'), png);
    wf(join(src, '.cache', 'caché.png'), png);
    wf(join(src, 'notes.txt'), 'pas une image');
    const lib = await exec(`return await window.__prepvis.importIconsFrom(${JSON.stringify(src)});`);
    ok(lib && !lib.__error && lib.r?.added === 1 && lib.items?.[0]?.category === 'Lumière' && lib.items?.[0]?.name === 'Fresnel 650', `icônes importées (${JSON.stringify(lib).slice(0, 200)})`);
    const w = lib?.url ? await exec(`return await new Promise((res) => { const i = new Image(); i.onload = () => res(i.naturalWidth); i.onerror = () => res(-1); i.src = ${JSON.stringify(lib.url)}; });`) : -1;
    ok(w > 0 && w <= 512, `icône affichée depuis la bibliothèque, réduite (${w} px)`);
  }

  // Mon matériel : écrit dans le dossier de l'application, relu à l'identique (accents compris).
  {
    const k = await exec('return await window.__prepvis.kitRoundTrip();');
    ok(k?.w?.ok === true && k?.body === 'Caméra d’essai é', `Mon matériel enregistré et relu (${JSON.stringify(k).slice(0, 200)})`);
  }

  // Fermer puis rouvrir : le projet revient à l'identique.
  await exec('await window.__prepvis.flushSave(); return true;');
  const before = await exec('return JSON.stringify(window.__prepvis.doc());');
  ok((await exec('return await window.__prepvis.closeProject();')) === true, 'fermeture du projet');
  ok((await exec(`return await window.__prepvis.openPath(${JSON.stringify(join(projectDir, 'project.json'))});`)) === true, 'réouverture via project.json');
  ok((await exec('return JSON.stringify(window.__prepvis.doc());')) === before, 'projet rouvert identique');
  const backups = readdirSync(join(projectDir, 'backups'));
  ok(backups.length >= 1, `copie de sauvegarde à l’ouverture (${backups.length})`);

  // Fichier corrompu : refusé, sans rien écraser.
  const bad = join(work, 'Casse.prepvis');
  const t0 = Date.now();
  const r1 = await exec(`return await Promise.race([window.__prepvis.newProjectAt(${JSON.stringify(bad)}), new Promise((r) => setTimeout(() => r('TIMEOUT ' + JSON.stringify(window.__prepvis.project())), 8000))]);`);
  console.log('   newProjectAt(bad) →', r1, Date.now() - t0, 'ms');
  const r2 = await exec(`return await Promise.race([window.__prepvis.openPath(${JSON.stringify(projectDir)}), new Promise((r) => setTimeout(() => r('TIMEOUT ' + JSON.stringify(window.__prepvis.project())), 8000))]);`);
  console.log('   openPath(projet) →', r2);
  const { writeFileSync } = await import('node:fs');
  writeFileSync(join(bad, 'project.json'), '{"schemaVersion":1,');
  ok((await exec(`return await window.__prepvis.openPath(${JSON.stringify(bad)});`)) === false, 'fichier corrompu refusé');
  ok(readFileSync(join(bad, 'project.json'), 'utf8') === '{"schemaVersion":1,', 'fichier corrompu laissé intact');
  const alerts = await exec('return window.__prepvis.alerts;');
  ok(alerts.length === 1 && /illisible/.test(alerts[0]), `message clair à l’utilisateur (${alerts[0]})`);
  ok((await exec('return window.__prepvis.project().dir;')) === projectDir, 'le projet en cours reste ouvert');

  // Modification faite ailleurs (synchronisation) : copie de sécurité, rien n'est écrasé en silence.
  {
    const pj = join(projectDir, 'project.json');
    const ext = JSON.parse(readFileSync(pj, 'utf8'));
    ext.meta.title = 'Modifié ailleurs';
    writeFileSync(pj, JSON.stringify(ext));
    await exec('const st = window.__prepvis.app(); st.startEdit(""); st.setEditText("Taille"); st.commitEdit("stay"); await window.__prepvis.flushSave(); return true;');
    const copies = readdirSync(join(projectDir, 'backups')).filter((f) => f.startsWith('conflit-'));
    ok(copies.length === 1, `conflit détecté, copie de sécurité écrite (${copies.join(', ')})`);
    const after = JSON.parse(readFileSync(pj, 'utf8'));
    ok(after.sequences[0].plans[0].cameras[0].start.size === 'Taille', 'version choisie (la mienne) enregistrée');
  }

  // Dernière modification puis fermeture de la fenêtre : doit être enregistrée avant de quitter.
  await exec('const st = window.__prepvis.app(); st.startEdit(""); st.setEditText("GP"); st.commitEdit("stay"); return true;');
  // Comme un clic sur le bouton rouge de la fenêtre.
  await exec('window.__prepvis.closeWindow().catch((e) => console.error(e)); return true;').catch(() => {});
  await waitFor(() => JSON.parse(readFileSync(join(projectDir, 'project.json'), 'utf8')).sequences[0].plans.some((p) => p.cameras[0].start.size === 'GP'), 15000);
  const final = JSON.parse(readFileSync(join(projectDir, 'project.json'), 'utf8'));
  const sizes = final.sequences[0].plans.map((p) => p.cameras[0].start.size);
  ok(sizes.includes('GP'), `modification enregistrée à la fermeture (${sizes.join(', ')})`);
  try {
    await wd('DELETE', `/session/${sid}`);
  } catch {
    /* déjà fermée */
  }
} catch (e) {
  console.error('✘ erreur :', e.message);
  if (CI) console.log(`::error title=Application réelle (exception)::${String(e.message).replace(/\n/g, ' ').slice(0, 600)} — dernier script : ${lastScript}`);
  failures++;
} finally {
  driver.kill();
  rmSync(work, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} échec(s)` : '\nTout est vert.');
process.exit(failures ? 1 : 0);
