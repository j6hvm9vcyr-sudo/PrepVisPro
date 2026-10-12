// Test de l'application réelle (enveloppe Tauri + interface), piloté par WebDriver.
// Prérequis (Linux) : tauri-driver, WebKitWebDriver, Xvfb, et un binaire construit avec
//   VITE_TEST_HOOKS=1 npx tauri build --debug --no-bundle
// Lancement : xvfb-run node tauri-e2e/run.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const APP = resolve('src-tauri/target/debug/topshot');
const DRIVER = process.env.TAURI_DRIVER ?? `${process.env.HOME}/.cargo/bin/tauri-driver`;
const BASE = 'http://127.0.0.1:4444';
const work = mkdtempSync(join(tmpdir(), 'prepvis-e2e-'));
const projectDir = join(work, 'Film test.topshot');

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
  /**
   * Appel qui ne doit pas bloquer : au-delà de `ms`, on rend la main avec l'état de l'application
   * (appels à Rust en cours, état du projet) au lieu d'attendre le délai du pilote (2 min).
   */
  const call = async (expr, label, ms = 20000) => {
    const t0 = Date.now();
    const r = await exec(`return await Promise.race([(async () => (${expr}))(), new Promise((r) => setTimeout(() => r({ __timeout: true, pending: window.__prepvis.pending(), project: window.__prepvis.project() }), ${ms}))]);`);
    const dt = Date.now() - t0;
    if (r && r.__timeout) ok(false, `${label} : bloqué plus de ${ms / 1000} s — appels en cours : ${JSON.stringify(r.pending)} ; projet : ${JSON.stringify(r.project).slice(0, 300)}`);
    else if (CI && dt > 3000) console.log(`::notice title=Application réelle (lent)::${label} : ${dt} ms`);
    return r;
  };
  const keys = (text) => wd('POST', `/session/${sid}/actions`, { actions: [{ type: 'key', id: 'k', actions: [...text].flatMap((c) => [{ type: 'keyDown', value: c }, { type: 'keyUp', value: c }]) }] });

  // Attendre l'interface.
  for (let i = 0; i < 50; i++) {
    const has = await exec('return !!window.__prepvis;');
    if (has === true) break;
    await sleep(200);
  }
  ok(await exec('return document.title;') === 'Topshot', 'la fenêtre s’ouvre');
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

  const click = async (using, value) => {
    const found = await wd('POST', `/session/${sid}/element`, { using, value });
    await wd('POST', `/session/${sid}/element/${Object.values(found)[0]}/click`, {});
  };
  // Élément qui a le focus : sa classe et son nom (une liste et son bouton portent le même nom).
  const active = () => exec('const a = document.activeElement; return a ? `${a.tagName.toLowerCase()}.${a.className} ${a.getAttribute("aria-label") ?? ""}`.trim() : null;');

  // Abréviation accentuée (préférences de l'app, enregistrées sur le Mac), tapée au clavier dans la cellule Machinerie.
  {
    const file = await exec('return window.__prepvis.setAliases("Dolly", ["grué"]);');
    ok(typeof file === 'string' && JSON.parse(file).aliases.Dolly.includes('grué'), 'préférences écrites puis relues sur le disque (preferences.json)');
    await click('css selector', '.line [id$="-grip"]');
    await click('css selector', '.line [id$="-grip"]');
    await waitFor(async () => String(await active()).endsWith(' Saisie'), 3000);
    await keys('grué');
    await keys('\uE007');
    const grip = await waitFor(async () => (await exec('return window.__prepvis.doc().sequences[0].plans[0].cameras[0].grip.join();')) === 'Dolly', 3000);
    ok(grip, 'abréviation accentuée reconnue à la saisie (grué → Dolly)');
  }

  // Liste de choix (plan type) : ouverte au clic, pilotée au clavier, le focus revient au bouton.
  {
    await click('css selector', 'button[aria-label="Plan type"]');
    const inList = await waitFor(async () => String(await active()).includes('pick-list'), 3000);
    ok(inList, `liste ouverte au clic, focus dans la liste (${await active()})`);
    await keys('\uE007');
    ok(await waitFor(async () => (await exec('return window.__prepvis.doc().settings.shotPresets.length;')) === 1, 3000), 'plan type enregistré au clavier (Entrée)');
    ok(String(await active()).startsWith('button.picker'), `le focus revient au bouton (${await active()})`);
  }

  // Liste à recherche : recherche tapée avec accent, sans tenir compte des accents du décor.
  {
    const n = await exec(`return await window.__prepvis.addSequences(['Quai', 'Wagon', 'Salon', 'Rue', 'Pont', 'Cave', 'Toit', 'Église Saint-Étienne']);`);
    ok(n === 9, `séquences ajoutées (${n})`);
    await exec('window.__prepvis.app().setView("days"); return true;');
    await click('xpath', "(//button[normalize-space()='+ Jour'])[1]");
    await click('css selector', 'button[aria-label="Ajouter une séquence au jour"]');
    ok(await waitFor(async () => String(await active()).startsWith('input.pick-search'), 3000), 'liste à recherche : le champ de recherche a le focus');
    await keys('étienne');
    await keys('\uE007');
    const added = await waitFor(async () => (await exec('const d = window.__prepvis.doc(); const s = d.sequences.find((x) => x.location.startsWith("Église")); return !!s && d.shootingDays[0].sequenceIds.includes(s.id);')) === true, 3000);
    ok(added, 'séquence trouvée par une recherche accentuée et ajoutée au jour');
    await exec('window.__prepvis.app().setView("table"); return true;');
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
    ok(lib?.builtinCount === 194, `icônes livrées avec l'app (${lib?.builtinCount})`);
    const wb = lib?.builtinUrl ? await exec(`return await new Promise((res) => { const i = new Image(); i.onload = () => res(i.naturalWidth); i.onerror = () => res(-1); i.src = ${JSON.stringify(lib.builtinUrl)}; });`) : -1;
    ok(wb > 0, `icône livrée affichée (${wb} px)`);
  }

  // Ancien « Mon matériel » (fichier du Mac, accents compris) : lu pour être repris dans un projet.
  {
    const { mkdirSync: md } = await import('node:fs');
    const appData = join(process.env.XDG_DATA_HOME ?? join(process.env.HOME, '.local/share'), 'fr.adrienrousseau.prepvispro');
    md(appData, { recursive: true });
    wf(join(appData, 'materiel.json'), JSON.stringify({ version: 1, cameras: [{ id: 'k1', label: 'A', body: 'Caméra d’essai é', mode: '4K', sensorWidthMm: 24.9, sensorHeightMm: 14, squeeze: 1 }], lenses: [], fixtures: [], reflectors: [], terms: null, exposure: null }));
    const k = await exec('return await window.__prepvis.oldEquipment();');
    ok(k?.cameras?.[0] === 'Caméra d’essai é', `ancien « Mon matériel » lu (${JSON.stringify(k).slice(0, 200)})`);
    rmSync(join(appData, 'materiel.json'));
    const o = await exec(`return await window.__prepvis.otherProject(${JSON.stringify(projectDir)});`);
    ok(o?.name === 'Film test' && o?.cameras >= 1, `autre projet lu sans l’ouvrir (${JSON.stringify(o)})`);
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
  const bad = join(work, 'Casse.topshot');
  const r1 = await call(`window.__prepvis.newProjectAt(${JSON.stringify(bad)})`, 'création du projet Casse');
  ok(r1 === true, 'projet Casse créé');
  const r2 = await call(`window.__prepvis.openPath(${JSON.stringify(projectDir)})`, 'retour au projet');
  ok(r2 === true, 'retour au projet');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(join(bad, 'project.json'), '{"schemaVersion":1,');
  ok((await call(`window.__prepvis.openPath(${JSON.stringify(bad)})`, 'ouverture du fichier corrompu')) === false, 'fichier corrompu refusé');
  ok(readFileSync(join(bad, 'project.json'), 'utf8') === '{"schemaVersion":1,', 'fichier corrompu laissé intact');
  const alerts = await exec('return window.__prepvis.alerts;');
  ok(alerts.length === 1 && /illisible/.test(alerts[0]), `message clair à l’utilisateur (${alerts[0]})`);
  ok((await exec('return window.__prepvis.project().dir;')) === projectDir, 'le projet en cours reste ouvert');

  // Projet d'avant la 0.12 (« Nom.prepvis ») : ouvert, renommé « Nom.topshot », contenu et images intacts.
  {
    const { cpSync } = await import('node:fs');
    const old = join(work, 'Ancien film.prepvis');
    cpSync(projectDir, old, { recursive: true });
    const json = readFileSync(join(old, 'project.json'), 'utf8');
    ok((await call(`window.__prepvis.openPath(${JSON.stringify(old)})`, 'ouverture d’un ancien .prepvis')) === true, 'ancien projet .prepvis ouvert');
    const renamed = join(work, 'Ancien film.topshot');
    ok((await exec('return window.__prepvis.project().dir;')) === renamed && !existsSync(old) && existsSync(renamed), 'ancien projet renommé en .topshot');
    ok(readFileSync(join(renamed, 'project.json'), 'utf8') === json, 'contenu intact après renommage');
    const imgs = readdirSync(join(renamed, 'images'));
    if (imgs.length) {
      const w = await exec(`const d = window.__prepvis.project().dir; return await new Promise((res) => { const i = new Image(); i.onload = () => res(i.naturalWidth); i.onerror = () => res(-1); i.src = window.__prepvis.imageUrl(d, ${JSON.stringify('images/' + imgs[0])}); });`);
      ok(w > 0, `images lisibles après renommage (${w} px)`);
    }
    ok((await call(`window.__prepvis.openPath(${JSON.stringify(projectDir)})`, 'retour au projet')) === true, 'retour au projet');
  }

  // Panneau Scénario (0.17–0.18) : sélection d'un passage dans le texte de la scène, sous WebKit.
  {
    const r = await exec(`
      const st = window.__prepvis.app();
      st.updateDoc((d) => { d.sequences[0].scriptText = 'Le quai est désert.\\n\\nLÉA attend, seule sur le quai.'; d.sequences[0].plans[0].scriptExcerpt = 'LÉA attend, seule sur le quai.'; });
      st.setView('table');
      await window.__prepvis.panel('scenario', true);
      await new Promise((res) => setTimeout(res, 300));
      const root = document.querySelector('.scene-doc');
      if (!root) return { error: 'pas de texte de scène affiché' };
      const linked = document.querySelector('.scene-doc .lk')?.textContent;
      const uncovered = document.querySelector('.scene-state')?.textContent;
      const node = [...root.childNodes].find((n) => (n.textContent || '').includes('désert'));
      const t = node.firstChild;
      const range = document.createRange();
      range.setStart(t, 0);
      range.setEnd(t, 'Le quai est désert.'.length);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      root.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      await new Promise((res) => setTimeout(res, 200));
      const pick = document.querySelector('.scene-pick .pick-txt')?.textContent;
      const userSelect = getComputedStyle(root).webkitUserSelect || getComputedStyle(root).userSelect;
      sel.removeAllRanges();
      await window.__prepvis.panel('scenario', false);
      st.undo();
      return { linked, uncovered, pick, userSelect };
    `);
    ok(r && !r.error && r.linked === 'LÉA attend, seule sur le quai.', `scénario : extrait relié au passage (${JSON.stringify(r)})`);
    ok(/1 passage non couvert/.test(r?.uncovered ?? ''), 'scénario : passage non couvert signalé');
    ok(r?.pick === '« Le quai est désert. »' && r?.userSelect === 'text', `scénario : passage sélectionnable sous WebKit (${r?.pick}, ${r?.userSelect})`);
  }

  // Panneaux (0.18) sous WebKit : barre du haut, minuteur logé dans le panneau Scénario, espace au clavier.
  {
    ok(await exec('return !!document.querySelector("header.ibar [data-tauri-drag-region]") && !!document.querySelector(".ibar-proj .proj-menu") && document.querySelectorAll(".pages-top .page-top").length === 3 && !document.querySelector(".pagebar");'), 'barre du haut (0.24) : projet, pages au centre, plus de barre en bas, fenêtre déplaçable');
    await exec(`const st = window.__prepvis.app(); window.__savedCursor = st.cursor; st.setView('table'); const s = window.__prepvis.doc().sequences.find((x) => x.plans.some((p) => !p.repriseOf)); st.goToPlan(s.plans[0].id); st.setTiming(s.id); await window.__prepvis.panel('scenario', true); return true;`);
    ok(await waitFor(async () => (await exec('return !!document.querySelector(".scene-panel .timer-dock");')) === true, 3000), 'minuteur dans le panneau Scénario');
    await exec('document.querySelector("[role=grid]").focus(); return true;');
    await keys(' ');
    const started = await waitFor(async () => /^Plan /.test(String(await exec('return document.querySelector(".tm-status")?.textContent;'))), 3000);
    ok(started, `minuteur : espace démarre, même le clavier sur le tableau (${await exec('return document.querySelector(".tm-status")?.textContent;')})`);
    await keys('\uE00C');
    await keys('\uE00C');
    const closed = await waitFor(async () => (await exec('return !document.querySelector(".timer-dock");')) === true, 3000);
    ok(closed, 'minuteur fermé (échap), rien enregistré');
    await exec(`await window.__prepvis.panel('scenario', false); window.__prepvis.app().setCursor(window.__savedCursor); return true;`);
  }

  // Publier (0.20) : les fichiers sont réécrits sur place (même fichier : le lien d'un drive reste bon).
  {
    const drive = join(work, 'Drive', 'Le Quai');
    mkdirSync(drive, { recursive: true });
    const r1 = await exec(`return await window.__prepvis.publishTo(${JSON.stringify(drive)});`);
    ok(r1?.ok === true, `publication 1 (${JSON.stringify(r1)})`);
    const names = readdirSync(drive).filter((n) => n !== 'Retours').sort();
    ok(names.length === r1?.files?.length && names.every((n) => n.includes(' — découpage.') || n.includes(' — découpage interactif.') || n.includes(' — plans au sol.')), `fichiers publiés (${names.join(', ')})`);
    const html = names.find((n) => n.endsWith('découpage interactif.html'));
    ok(!!html && readFileSync(join(drive, html), 'utf8').includes('id="topshot-data"'), 'découpage interactif publié');
    ok(statSync(join(drive, 'Retours')).isDirectory(), 'dossier « Retours » créé à côté');
    const pdf = names.find((n) => n.endsWith('découpage.pdf'));
    const before = pdf ? statSync(join(drive, pdf)) : null;
    ok(!!before && readFileSync(join(drive, pdf)).subarray(0, 5).toString() === '%PDF-', 'PDF publié lisible');
    await exec('const st = window.__prepvis.app(); st.updateDoc((d) => { d.meta.title = "Titre changé"; }); return true;');
    const r2 = await exec(`return await window.__prepvis.publishTo(${JSON.stringify(drive)});`);
    ok(r2?.ok === true && r2.n === r1.n + 1, `publication suivante (${JSON.stringify(r2)})`);
    const after = statSync(join(drive, pdf));
    ok(readdirSync(drive).filter((n) => n !== 'Retours').sort().join() === names.join(), 'mêmes noms après un changement de titre');
    ok(after.ino === before.ino, `même fichier réécrit sur place (inode ${before.ino} → ${after.ino})`);
    await exec('window.__prepvis.app().undo(); return true;');
    // Retours (0.21) : un fichier déposé dans « Retours » est trouvé ; un fichier abîmé est signalé, un autre projet ignoré.
    const projectId = await exec('return window.__prepvis.app().hist.present.doc.id;');
    const retours = (id, author, items) => JSON.stringify({ topshotRetours: 1, id, projectId: author === 'Autre' ? 'autre-projet' : projectId, publication: 1, author, role: 'Image', sentAt: 1760000000000, items });
    writeFileSync(join(drive, 'Retours', 'Retours Margaux.topshot-retours'), retours('r-1', 'Margaux', [{ id: 'i1', planId: null, seqId: null, code: '1/1', verdict: 'revoir', text: 'Plutôt un 50', proposal: null }]));
    writeFileSync(join(drive, 'Retours', 'Retours Autre.topshot-retours'), retours('r-2', 'Autre', [{ id: 'i1', planId: null, seqId: null, code: '1/1', verdict: 'ok', text: '', proposal: null }]));
    writeFileSync(join(drive, 'Retours', 'abîmé.topshot-retours'), '{ pas du json');
    writeFileSync(join(drive, 'Retours', 'notes.txt'), 'rien à voir');
    const scan = await exec('return await window.__prepvis.scanRetours();');
    ok(scan?.waiting?.length === 1 && scan.waiting[0].author === 'Margaux' && scan.waiting[0].items === 1, `retours trouvés dans « Retours » (${JSON.stringify(scan?.waiting)})`);
    ok(scan?.errors?.length === 1 && scan.errors[0].name === 'abîmé.topshot-retours', `fichier abîmé signalé (${JSON.stringify(scan?.errors)})`);
  }

  // Animatique (0.22) : dossier neuf avec ses images (rendues par WebKit) et sa timeline ; un second ne remplace rien.
  {
    const out = join(work, 'Montage');
    mkdirSync(out, { recursive: true });
    const a = await exec(`return await window.__prepvis.animaticTo(${JSON.stringify(out)}, 'otio', 3);`);
    ok(!!a?.folder && existsSync(a.folder), `animatique créée (${JSON.stringify(a)})`);
    const pngs = readdirSync(join(a.folder, 'images')).sort();
    ok(pngs.length === a.plans && pngs.length > 0, `une image par plan (${pngs.join(', ')})`);
    const head = readFileSync(join(a.folder, 'images', pngs[0]));
    ok(head.subarray(1, 4).toString() === 'PNG' && head.readUInt32BE(16) === 1920 && head.readUInt32BE(20) === 1080, 'images PNG 1920×1080');
    const otio = JSON.parse(readFileSync(a.timeline, 'utf8'));
    const url = otio.tracks.children[0].children[0].media_references.DEFAULT_MEDIA.target_url;
    ok(existsSync(decodeURIComponent(new URL(url).pathname)), `la timeline retrouve ses images (${url})`);
    const b = await exec(`return await window.__prepvis.animaticTo(${JSON.stringify(out)}, 'fcpxml', 3);`);
    ok(b?.folder?.endsWith(' (2)') && readFileSync(b.timeline, 'utf8').includes('<fcpxml version="1.9">') && readdirSync(join(a.folder, 'images')).length === pngs.length, `second dossier, le premier intact (${b?.folder})`);
    if (process.env.ANIMATIC_KEEP) {
      const { cpSync } = await import('node:fs');
      cpSync(out, process.env.ANIMATIC_KEEP, { recursive: true });
    }
  }

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
