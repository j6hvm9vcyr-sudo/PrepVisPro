import { expect, test } from '@playwright/test';
import { pick } from './pick';
import { resolve } from 'node:path';
import { copyFileSync, readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';

test('plan au sol : fond, mise à l’échelle, caméra du découpage avec son champ, mesure', async ({ page }) => {
  await page.goto('/?exemple');
  await expect(page.getByRole('grid', { name: 'Découpage' })).toBeFocused();
  // Format capteur renseigné : le champ peut être dessiné.
  await page.getByRole('button', { name: 'Réglages' }).click();
  await page.getByRole('tab', { name: 'Caméras' }).click();
  await page.getByLabel('Largeur capteur').first().fill('24,89');
  await page.getByRole('button', { name: 'Terminé' }).click();

  await page.keyboard.press('ControlOrMeta+3');
  await expect(page.getByText('Aucun plan au sol pour l’instant.')).toBeVisible();
  await pick(page, 'Créer un plan au sol pour la séquence', '1 — Quai de gare');
  await expect(page.getByRole('application', { name: 'Plan au sol' })).toBeVisible();

  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Importer un fond…' }).click();
  await (await chooser).setFiles(resolve('e2e/plan-decor.png'));
  await expect(page.locator('.floor-canvas image')).toHaveCount(1);

  // L'outil Échelle est activé après l'import : deux clics sur le mur du haut (10 m).
  const canvas = page.getByRole('application', { name: 'Plan au sol' });
  const box = (await page.locator('.floor-canvas svg').boundingBox())!;
  const img = (await page.locator('.floor-canvas image').boundingBox())!;
  const at = (x: number, y: number) => ({ x: img.x + (x / 1200) * img.width, y: img.y + (y / 800) * img.height });
  const a = at(100, 100);
  const b = at(1100, 100);
  await page.mouse.click(a.x, a.y);
  await page.mouse.click(b.x, b.y);
  await page.getByLabel('Distance en mètres').fill('10');
  await page.getByRole('button', { name: 'Valider' }).click();
  await expect(page.locator('.floor-scalebar')).toBeVisible();

  // Placer la caméra 1/1 depuis la liste.
  await page.locator('.place-item', { hasText: '1/1' }).click();
  const c = at(300, 600);
  await page.mouse.click(c.x, c.y);
  await expect(page.locator('.floor-canvas [data-el]')).toHaveCount(1);
  await expect(page.locator('.floor-canvas polygon')).toHaveCount(1);
  await expect(page.locator('.floor-canvas text', { hasText: '1/1' })).toBeVisible();
  const suggest = page.getByRole('region', { name: 'D’après le plan' });
  await expect(suggest).toContainText('Aucun personnage dans le champ');

  // Un personnage à 3 m devant la caméra, tourné vers elle : valeur et axe déduits du plan.
  await canvas.press('p');
  const who = at(300, 300);
  await page.mouse.click(who.x, who.y);
  await page.mouse.click(c.x, c.y); // re-sélectionne la caméra
  // 32 mm, image 24,89 × 13,45 mm (ratio 1,85:1) : à 3 m, champ de 1,26 m de haut → Américain, de face.
  await expect(suggest).toContainText('Personnage 1 à 3 m');
  await expect(suggest).toContainText('champ ≈ 1,3 m de haut');
  await expect(suggest.locator('.suggest-row', { hasText: 'Valeur' })).toContainText('Américain');
  await expect(suggest.locator('.suggest-row', { hasText: 'Axe' })).toContainText('Face');
  // Calcul inverse : la focale qui garde la valeur du découpage (Ensemble) à cette distance.
  await expect(suggest.locator('.suggest-row.ideal')).toContainText('pour un Ensemble à 3 m');
  // Le tableau signale l'écart, et Détails propose de reporter.
  await page.keyboard.press('ControlOrMeta+1');
  await expect(page.locator('.cell.floor-diff')).toHaveCount(1);
  await expect(page.locator('.cell.floor-diff')).toHaveAttribute('title', /Plan au sol « Séq\. 1 — Quai de gare » : Américain \(ici : Ensemble\)/);
  await expect(page.locator('.floor-note')).toContainText('valeur Américain');
  await page.keyboard.press('ControlOrMeta+3');
  await suggest.locator('.suggest-row', { hasText: 'Valeur' }).getByRole('button', { name: 'Reporter' }).click();
  await expect(suggest.locator('.suggest-row', { hasText: 'Valeur' }).locator('.suggest-ok')).toBeVisible();
  await page.keyboard.press('ControlOrMeta+1');
  await expect(page.locator('.cell.floor-diff')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+3');
  // Retirer le personnage pour la suite du test.
  await page.mouse.click(who.x, who.y);
  await canvas.press('Backspace');
  await expect(page.locator('.floor-canvas [data-el]')).toHaveCount(1);

  // Mesure : 5 m entre deux points.
  await canvas.press('m');
  const m1 = at(100, 400);
  const m2 = at(600, 400);
  await page.mouse.click(m1.x, m1.y);
  await page.mouse.move(m2.x, m2.y);
  await page.mouse.click(m2.x, m2.y);
  await expect(page.locator('.floor-canvas text', { hasText: /^(4,9[89]|5|5,0[12]) m$/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/12-plan-au-sol.png' });
  expect(box.width).toBeGreaterThan(400);

  // Le plan au sol suit le découpage : renuméroter met l'étiquette à jour.
  await canvas.press('Escape');
  await page.keyboard.press('ControlOrMeta+1');
  await page.keyboard.press('ControlOrMeta+Enter');
  await page.keyboard.press('Escape');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Alt+ArrowDown');
  await page.keyboard.press('ControlOrMeta+3');
  await expect(page.locator('.floor-canvas text', { hasText: '1/2' })).toBeVisible();

  // Export du plan : image PNG haute définition, puis PDF avec légende.
  const dl = page.waitForEvent('download');
  await page.getByRole('group', { name: 'Exporter ce plan' }).getByRole('button', { name: 'PNG' }).click();
  const png = await (await dl).path();
  const bytes = readFileSync(png);
  expect(bytes.subarray(1, 4).toString()).toBe('PNG');
  const w = bytes.readUInt32BE(16);
  const h = bytes.readUInt32BE(20);
  expect(Math.max(w, h)).toBe(4000);
  copyFileSync(png, 'test-results/13-export-plan.png');
  await expect(page.getByText(/Plan exporté/)).toBeVisible();

  const dl2 = page.waitForEvent('download');
  await page.getByRole('group', { name: 'Exporter ce plan' }).getByRole('button', { name: 'PDF' }).click();
  const pdfBytes = readFileSync(await (await dl2).path());
  expect(pdfBytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect(pdfBytes.length).toBeGreaterThan(50_000);
  copyFileSync(await (await dl2).path(), 'test-results/14-export-plan.pdf');

  // Le PDF du découpage inclut les plans au sol.
  await page.keyboard.press('ControlOrMeta+e');
  await expect(page.getByLabel('Plans au sol des séquences exportées (1 plan), en PDF et Excel')).toBeChecked();
  const dl3 = page.waitForEvent('download');
  await page.getByRole('dialog', { name: 'Exporter' }).getByRole('button', { name: 'PDF', exact: true }).click();
  const full = readFileSync(await (await dl3).path());
  expect(full.subarray(0, 5).toString()).toBe('%PDF-');
  await expect(page.getByText('Exporté :', { exact: true })).toBeVisible();
  copyFileSync(await (await dl3).path(), 'test-results/15-decoupage-avec-plan.pdf');
  // Et dans l'Excel : une feuille « Plans au sol » avec l'image du plan et sa légende.
  const dl4 = page.waitForEvent('download');
  await page.getByRole('dialog', { name: 'Exporter' }).getByRole('button', { name: 'Excel', exact: true }).click();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(readFileSync(await (await dl4).path()).buffer as ArrayBuffer);
  const fws = wb.getWorksheet('Plans au sol')!;
  expect(fws).toBeTruthy();
  expect(fws.getImages()).toHaveLength(1);
  expect(String(fws.getCell(1, 1).value)).toContain('PLAN AU SOL — Séq. 1');
});

test('plan au sol : fond PDF (plan d’architecte), texte saisi au clavier, champs décimaux à la française', async ({ page }) => {
  await page.goto('/?exemple');
  await expect(page.getByRole('grid', { name: 'Découpage' })).toBeFocused();
  await page.keyboard.press('ControlOrMeta+3');
  await pick(page, 'Créer un plan au sol pour la séquence', '1 — Quai de gare');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Importer un fond…' }).click();
  await (await chooser).setFiles(resolve('e2e/plan-decor.pdf'));
  await expect(page.locator('.floor-canvas image')).toHaveCount(1, { timeout: 15000 });
  await expect(page.getByText(/Import du fond impossible/)).toHaveCount(0);
  const img = (await page.locator('.floor-canvas image').boundingBox())!;
  expect(img.width / img.height).toBeCloseTo(1.5, 1);

  // Échelle : le champ de distance prend le focus tout seul.
  await page.mouse.click(img.x + img.width * 0.1, img.y + img.height * 0.2);
  await page.mouse.click(img.x + img.width * 0.9, img.y + img.height * 0.2);
  await expect(page.getByLabel('Distance en mètres')).toBeFocused();
  await page.keyboard.type('8,5');
  await page.keyboard.press('Enter');
  await expect(page.locator('.floor-scalebar')).toBeVisible();

  // Texte : placé puis tapé directement.
  const canvas = page.getByRole('application', { name: 'Plan au sol' });
  await canvas.press('t');
  await page.mouse.click(img.x + img.width * 0.5, img.y + img.height * 0.5);
  await page.keyboard.type('Camion');
  await expect(page.locator('.floor-canvas text', { hasText: 'Camion' })).toBeVisible();

  // Longueur des champs (réglage du plan, sans élément sélectionné) : « 2,5 » accepté.
  await canvas.press('Escape');
  await page.getByLabel('Longueur des champs caméra en mètres').fill('2,5');
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Longueur des champs caméra en mètres')).toHaveValue('2,5');
});

test('bibliothèque d’icônes : import d’un dossier, recherche, pose sur le plan, export', async ({ page }) => {
  await page.goto('/?exemple');
  await expect(page.getByRole('grid', { name: 'Découpage' })).toBeFocused();
  await page.keyboard.press('ControlOrMeta+3');
  await pick(page, 'Créer un plan au sol pour la séquence', '1 — Quai de gare');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Importer un dossier d’icônes…' }).click();
  await (await chooser).setFiles(resolve('e2e/icones-test'));
  await expect(page.getByRole('region', { name: 'Bibliothèque d’icônes' }).locator('.fold-h .count')).toHaveText('4');
  await expect(page.getByText(/4 icônes dans la bibliothèque/)).toBeVisible();
  // Catégories = sous-dossiers ; les images à la racine vont dans la catégorie du dossier.
  // (Noms sans accents : Chromium piloté par les tests ne relit pas les fichiers d'un dossier accentué ;
  // l'application Mac lit le dossier par son propre code, testé avec accents.)
  await expect(page.locator('.icon-group-h')).toHaveText([/icones-test\s*1/, /Lumieres\s*2/, /Machinerie\s*1/]);
  await page.getByLabel('Rechercher une icône').fill('fres');
  await page.getByRole('button', { name: 'Poser Fresnel 650' }).click();
  const canvas = page.locator('.floor-canvas svg');
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('.floor-canvas [data-el] image')).toHaveCount(1);
  await expect(page.getByText('Fresnel 650 posé')).toBeVisible();
  // L'icône se déplace à la souris, comme une caméra.
  const icon = page.locator('.floor-canvas [data-el]').first();
  const before = await icon.getAttribute('transform');
  const ib = (await icon.boundingBox())!;
  await page.mouse.move(ib.x + ib.width / 2, ib.y + ib.height / 2);
  await page.mouse.down();
  await page.mouse.move(ib.x + ib.width / 2 + 120, ib.y + ib.height / 2 + 60, { steps: 6 });
  await page.mouse.up();
  await expect(icon).not.toHaveAttribute('transform', before!);
  // Glisser-déposer depuis la palette.
  await page.getByRole('button', { name: 'Poser Fresnel 650' }).dragTo(page.locator('.floor-canvas'), { targetPosition: { x: 200, y: 200 } });
  await expect(page.locator('.floor-canvas [data-el] image')).toHaveCount(2);
  // Légende et taille.
  await page.getByPlaceholder('ex. 2K, Fresnel 650').fill('650 W');
  await page.getByRole('group', { name: 'Taille de l’icône' }).getByRole('button', { name: 'Grande', exact: true }).click();
  await expect(page.locator('.floor-canvas text', { hasText: '650 W' })).toBeVisible();
  // L'icône est dans le PNG exporté (le rendu ne casse pas). Export du plan : panneau du plan (rien de sélectionné).
  await page.getByRole('application', { name: 'Plan au sol' }).press('Escape');
  await page.getByRole('application', { name: 'Plan au sol' }).press('Escape');
  const dl = page.waitForEvent('download');
  await page.getByRole('group', { name: 'Exporter ce plan' }).getByRole('button', { name: 'PNG' }).click();
  expect(readFileSync(await (await dl).path()).subarray(1, 4).toString()).toBe('PNG');
  await page.screenshot({ path: 'test-results/17-icones.png' });
  // Une icône posée devient un personnage, un réflecteur ou un projecteur (elle garde son image).
  const posed = page.locator('.floor-canvas [data-el]').filter({ has: page.locator('image') }).first();
  await posed.click();
  await page.getByRole('group', { name: 'Utiliser l’icône comme' }).getByRole('button', { name: 'Personnage' }).click();
  await expect(page.locator('.insp-body .sec-h').first()).toHaveText('Personnage');
  await expect(page.getByRole('region', { name: 'Lumière reçue' }).or(page.getByLabel('Nom'))).toBeVisible();
  await page.keyboard.press('ControlOrMeta+z');
  await posed.click();
  await page.getByRole('group', { name: 'Utiliser l’icône comme' }).getByRole('button', { name: 'Réflecteur' }).click();
  await expect(page.getByLabel('Données de la matière')).toContainText('Poly / bead board');
  await expect(page.locator('.floor-canvas image')).toHaveCount(2);
});

test('figures : icônes importées par défaut pour le projet, et une icône différente par figure (deux personnages, deux sources)', async ({ page }) => {
  await page.goto('/?exemple');
  await expect(page.getByRole('grid', { name: 'Découpage' })).toBeFocused();
  await page.keyboard.press('ControlOrMeta+3');
  await pick(page, 'Créer un plan au sol pour la séquence', '1 — Quai de gare');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Importer un dossier d’icônes…' }).click();
  await (await chooser).setFiles(resolve('e2e/icones-test'));
  await expect(page.getByText(/4 icônes dans la bibliothèque/)).toBeVisible();
  const figures = page.getByRole('region', { name: 'Figures du plan' });
  // Caméras du projet : icône « Dolly », qui regarde vers la droite.
  await pick(page, 'Icône : caméras', 'Dolly');
  await figures.getByRole('radio', { name: '→' }).click();
  // Personnages du projet : « Accessoires ».
  await pick(page, 'Icône : personnages', 'Accessoires');
  const canvas = page.getByRole('application', { name: 'Plan au sol' });
  const box = (await page.locator('.floor-canvas svg').boundingBox())!;
  const images = page.locator('.floor-canvas [data-el] image');
  await canvas.press('c');
  await page.mouse.click(box.x + 200, box.y + 200);
  await expect(page.locator('.floor-canvas [data-el] image[transform="rotate(270)"]')).toHaveCount(1);
  // Deux personnages : le second reçoit sa propre icône.
  await canvas.press('p');
  await page.mouse.click(box.x + 400, box.y + 200);
  await canvas.press('p');
  await page.mouse.click(box.x + 500, box.y + 200);
  await pick(page, 'Icône : icône de cette figure', 'Kino 4 tubes');
  await expect(images).toHaveCount(3);
  // L'icône choisie est d'abord copiée dans le projet : le dessin change juste après.
  await expect.poll(async () => new Set(await images.evaluateAll((els) => els.map((e) => e.getAttribute('href')))).size).toBe(3);
  // Projecteur : l'icône de son modèle (la source utilisée).
  await canvas.press('l');
  await page.mouse.click(box.x + 300, box.y + 350);
  await pick(page, 'Modèle de projecteur', '+ Nouveau projecteur…');
  await page.keyboard.type('Fresnel 650');
  await page.getByRole('tab', { name: 'Lumière' }).click();
  await canvas.press('Escape');
  await canvas.press('Escape');
  await page.getByRole('tab', { name: 'Lumière' }).click();
  await pick(page, 'Icône : icône sur le plan', 'Fresnel 650');
  await expect(images).toHaveCount(4);
  await page.screenshot({ path: 'test-results/18-figures.png' });
  // Retour au symbole standard pour les caméras : plus d'image pour elles.
  await page.getByRole('tab', { name: 'Plan' }).click();
  await pick(page, 'Icône : caméras', 'Symbole standard');
  await expect(images).toHaveCount(3);
});

test('tournage : installations proposées d’après le plan au sol, réorganisées à la main', async ({ page }) => {
  await page.goto('/?exemple');
  await expect(page.getByRole('grid', { name: 'Découpage' })).toBeFocused();
  await page.keyboard.press('ControlOrMeta+3');
  await pick(page, 'Créer un plan au sol pour la séquence', '1 — Quai de gare');
  const canvas = page.getByRole('application', { name: 'Plan au sol' });
  const box = (await page.locator('.floor-canvas svg').boundingBox())!;
  const at = (fx: number, fy: number) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });
  // 1/1 et 1/2 depuis le bas (champ), 1/3 depuis le haut (contrechamp) ; 1/2B pas placé.
  for (const [code, fx, fy] of [['1/1', 0.5, 0.85], ['1/2', 0.52, 0.83], ['1/3', 0.5, 0.15]] as const) {
    await page.locator('.place-item').filter({ has: page.getByText(code, { exact: true }) }).click();
    const p = at(fx, fy);
    await page.mouse.click(p.x, p.y);
  }
  // Orienter la caméra du 1/3 vers le bas (contrechamp) : R tourne de 15°, on règle directement l'orientation.
  await page.getByLabel('Orientation en degrés').fill('180');
  await page.keyboard.press('Enter');
  await canvas.press('Escape');

  await page.keyboard.press('ControlOrMeta+4');
  await page.getByRole('button', { name: 'Proposer un ordre' }).click();
  const installs = page.locator('.install:not(.loose)');
  await expect(installs).toHaveCount(3);
  // 1/3 (Général → Poitrine) est le plus large : son côté passe en premier, puis l'autre côté du large au serré.
  await expect(installs.nth(0).locator('.shot-code')).toHaveText(['1/3']);
  await expect(installs.nth(0).locator('.install-name')).toHaveValue('Champ 1');
  await expect(installs.nth(1).locator('.shot-code')).toHaveText(['1/1', '1/2']);
  await expect(installs.nth(1).locator('.install-name')).toHaveValue('Contrechamp 2');
  await expect(installs.nth(2).locator('.install-name')).toHaveValue('Sans position sur le plan');
  await expect(page.locator('.shot-order')).toHaveText(['1', '2', '3', '4']);
  // Réorganiser : 1/2 passe avant 1/1.
  await page.getByRole('button', { name: 'Monter 1/2', exact: true }).click();
  await expect(installs.nth(1).locator('.shot-code')).toHaveText(['1/2', '1/1']);
  // Glisser 1/2B dans la première installation.
  await page.locator('.shot-row', { hasText: '1/2B' }).dragTo(installs.nth(0).locator('.shot-row').first());
  await expect(installs.nth(0).locator('.shot-code')).toHaveText(['1/2B', '1/3']);
  // Glisser une installation par sa poignée : la 3e passe en tête.
  await installs.nth(2).locator('.drag-handle').dragTo(installs.nth(0), { targetPosition: { x: 60, y: 4 } });
  await expect(installs.nth(0).locator('.install-name')).toHaveValue('Sans position sur le plan');
  await expect(installs.nth(1).locator('.install-name')).toHaveValue('Champ 1');
  await expect(installs.nth(2).locator('.install-name')).toHaveValue('Contrechamp 2');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(installs.nth(0).locator('.install-name')).toHaveValue('Champ 1');
  // Un plan ajouté au découpage apparaît « à ranger ».
  await page.keyboard.press('ControlOrMeta+1');
  await page.keyboard.press('ControlOrMeta+Enter');
  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+4');
  await expect(page.locator('.install.loose .shot-row')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/19-tournage.png' });
  // L'ordre de tournage part dans l'Excel.
  await page.getByRole('button', { name: 'Exporter…' }).first().click();
  await expect(page.getByLabel('Ordre de tournage (installations), en PDF et Excel')).toBeChecked();
  const dl = page.waitForEvent('download');
  await page.getByRole('dialog', { name: 'Exporter' }).getByRole('button', { name: 'Excel', exact: true }).click();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(readFileSync(await (await dl).path()).buffer as ArrayBuffer);
  const sh = wb.getWorksheet('Ordre de tournage')!;
  const vals: unknown[] = [];
  sh.eachRow((r) => r.eachCell((c) => vals.push(c.value)));
  expect(vals).toContain('Installation 1 · Champ 1');
  expect(vals).toContain('À ranger');
});

test('plan feux : projecteur créé et renseigné sur le plan, éclairement et diaph sur le personnage, puissance', async ({ page }) => {
  await page.goto('/?exemple');
  await expect(page.getByRole('grid', { name: 'Découpage' })).toBeFocused();
await page.keyboard.press('ControlOrMeta+3');
  await pick(page, 'Créer un plan au sol pour la séquence', '2 — Wagon');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Importer un fond…' }).click();
  await (await chooser).setFiles(resolve('e2e/plan-decor.png'));
  const img = (await page.locator('.floor-canvas image').boundingBox())!;
  const at = (x: number, y: number) => ({ x: img.x + (x / 1200) * img.width, y: img.y + (y / 800) * img.height });
  const a = at(100, 100);
  const b = at(1100, 100);
  await page.mouse.click(a.x, a.y);
  await page.mouse.click(b.x, b.y);
  await page.getByLabel('Distance en mètres').fill('10');
  await page.keyboard.press('Enter');
  const canvas = page.getByRole('application', { name: 'Plan au sol' });

  // Personnage, puis projecteur à 2,5 m à sa gauche, tourné vers lui.
  await canvas.press('p');
  const who = at(600, 400);
  await page.mouse.click(who.x, who.y);
  await canvas.press('l');
  const l = at(350, 400);
  await page.mouse.click(l.x, l.y);
  await page.getByLabel('Orientation en degrés').fill('90');
  await page.keyboard.press('Enter');
  // Aucun projecteur dans ce projet : on le crée sur place, d'après sa fiche (1000 lx à 5 m, 60°, 2000 W).
  await pick(page, 'Modèle de projecteur', '+ Nouveau projecteur…');
  await expect(page.getByLabel('Nom du projecteur')).toBeFocused();
  await page.keyboard.type('Fresnel 2K');
  await page.getByLabel('Type de projecteur').selectOption('tungsten');
  await page.getByLabel('Puissance en watts').fill('2000');
  // Tant que la fiche n'est pas complète, aucun chiffre.
  await page.getByLabel('Éclairement en lux').fill('1000');
  await expect(page.getByRole('group', { name: 'Données du projecteur' }).or(page.getByLabel('Données du projecteur'))).toContainText(/sans ces trois valeurs/);
  await expect(page.locator('.light-readings')).not.toContainText(/lx/);
  await page.getByLabel('Distance de la mesure en mètres').fill('5');
  await page.getByLabel('Angle du faisceau en degrés').fill('60');
  await page.screenshot({ path: 'test-results/20-projecteur-sur-plan.png' });
  await expect(page.locator('.light-readings')).toContainText(/Personnage 1 à 2,5 m/);
  // 1000 lx × (5 / 2,5)² = 4000 lx ; ISO 800, 1/48 s : N = √(4000 × 800 / 48 / 340) ≈ 14 → T11 ⅔.
  await expect(page.locator('.light-readings')).toContainText(/4\s?000 lx · T11 ⅔/);
  // Gradateur à 50 % : 2000 lx.
  await page.getByLabel('Gradateur').fill('50');
  await expect(page.locator('.light-readings')).toContainText(/2\s?000 lx/);
  await expect(page.locator('.floor-canvas text', { hasText: 'Fresnel 2K' })).toBeVisible();
  // Puissance : onglet Lumière (soleil, projecteurs, réflecteurs au même endroit).
  await canvas.press('Escape');
  await page.getByRole('tab', { name: 'Lumière' }).click();
  await expect(page.getByRole('region', { name: 'Puissance électrique' })).toContainText(/2\s?000 W · 8,7 A/);
  await page.getByRole('tab', { name: 'Plan' }).click();
  // Le personnage voit la même lecture.
  await page.mouse.click(who.x, who.y);
  await expect(page.getByRole('region', { name: 'Lumière reçue' })).toContainText(/Fresnel 2K à 2,5 m/);
  await page.screenshot({ path: 'test-results/21-plan-feux.png' });

  // Gélatine : CTB LEE 201 sur un tungstène → 35 % (fiche LEE, mesure tungstène). 2000 × 0,35 = 700 lx.
  await page.mouse.click(l.x, l.y);
  await pick(page, 'Ajouter une gélatine ou une diffusion', /^201 Full C\.T\. Blue/, 'ctb 201');
  await expect(page.locator('.light-readings')).toContainText(/700 lx/);
  await expect(page.locator('.gel-chip')).toHaveText(/Lee 201 CTB/);
  await expect(page.locator('.floor-canvas text', { hasText: 'CTB' })).toBeVisible();
  // Diffusion forte : avertissement, valeur indicative.
  await pick(page, 'Ajouter une gélatine ou une diffusion', /^216 White Diffusion/, '216');
  await expect(page.getByText(/Diffusion forte/)).toBeVisible();
  await expect(page.locator('.light-readings')).toContainText(/≈ 250 lx/);
  await page.getByRole('button', { name: 'Retirer Lee 216' }).click();
  await page.getByRole('button', { name: 'Retirer Lee 201 CTB' }).click();
  await expect(page.locator('.gel-chip')).toHaveCount(0);

  // Réflecteur : poly 4×4 à 5 m du projecteur, face à lui, derrière le personnage.
  await canvas.press('b');
  const rf = at(850, 400);
  await page.mouse.click(rf.x, rf.y);
  await page.getByLabel('Orientation en degrés').fill('270');
  await page.keyboard.press('Enter');
  // Par défaut : poly, valeur publiée (essai Porwoll ancré sur le coton blanchi : ≈ 81 %, 79–84 %).
  await expect(page.getByLabel('Données de la matière')).toContainText(/Poly \/ bead board\s*≈ 81 %\s*\(79–84 %\)/);
  // Reçoit 2000 × (2,5 / 5)² = 500 lx ; renvoie 0,812 × 500 × r² / (r² + 2,5²), r² = 1,22² / π → ≈ 29 lx.
  await expect(page.getByLabel('Lumière du réflecteur')).toContainText(/Reçoit de Fresnel 2K\s*500 lx/);
  await expect(page.getByLabel('Lumière du réflecteur')).toContainText(/≈ 29 lx/);
  // Un autre preset du menu : Ultrabounce, 0,875 × 500 × 0,0705 → ≈ 31 lx.
  await pick(page, 'Matière du réflecteur', /^Ultrabounce \(blanc\)85–90 %/);
  await expect(page.getByLabel('Lumière du réflecteur')).toContainText(/≈ 31 lx/);
  // Matière de son parc, valeur mesurée : sans taux, aucun chiffre.
  await pick(page, 'Matière du réflecteur', '+ Matière à valeur mesurée…');
  await expect(page.getByLabel('Nom de la matière')).toBeFocused();
  await page.keyboard.type('Poly maison');
  await expect(page.getByLabel('Lumière du réflecteur')).toContainText(/taux à mesurer/);
  await page.getByLabel('Taux de réflexion mesuré en pour cent').fill('80');
  // 0,8 × 500 × r² / (r² + 2,5²) → ≈ 28 lx.
  await expect(page.getByLabel('Lumière du réflecteur')).toContainText(/≈ 28 lx/);
  await page.screenshot({ path: 'test-results/22-reflecteur.png' });
  await page.mouse.click(who.x, who.y);
  await expect(page.getByRole('region', { name: 'Lumière reçue' })).toContainText(/Poly maison ← Fresnel 2K à 2,5 m\s*≈ 28 lx/);

  // Les listes du projet (onglet Lumière) contiennent le projecteur et la matière saisis sur le plan.
  await page.getByRole('tab', { name: 'Lumière' }).click();
  await expect(page.getByRole('tab', { name: 'Lumière' })).toHaveAttribute('aria-selected', 'true');
  await page.screenshot({ path: 'test-results/26-onglet-lumiere.png' });
  await expect(page.getByLabel('Nom du projecteur')).toHaveValue('Fresnel 2K');
  // Projecteur placé : on ne peut pas le retirer de la liste par mégarde.
  await expect(page.getByRole('region', { name: 'Projecteurs du projet' }).getByRole('button', { name: 'Retirer', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Éclairement en lux')).toHaveValue('1000');
  await expect(page.getByLabel('Retirer ce mode')).toBeDisabled();
  await expect(page.getByLabel('Nom de la matière')).toHaveValue('Poly maison');
  await expect(page.getByLabel('Taux de réflexion mesuré en pour cent')).toHaveValue('80');
});

test('soleil : position GPS du décor, nord du plan, heure simulée, rapport avec la caméra', async ({ page }) => {
  await page.goto('/?exemple');
  await expect(page.getByRole('grid', { name: 'Découpage' })).toBeFocused();
  // Fuseau du projet fixé (les heures ne dépendent pas de l'ordinateur qui fait le test).
  await page.getByRole('button', { name: 'Réglages' }).click();
  await page.getByLabel('Fuseau horaire').selectOption('Europe/Paris');
  await page.getByRole('button', { name: 'Terminé' }).click();

  // Position GPS du décor, collée depuis une carte. Un texte qui n'est pas une position est refusé.
  await page.getByRole('button', { name: 'Modifier la séquence 2' }).click();
  const dlg = page.getByRole('dialog', { name: /Séquence/ });
  const gps = dlg.getByLabel('Coordonnées GPS');
  await gps.fill('rue de Rivoli');
  await expect(dlg.getByText(/Format non reconnu/)).toBeVisible();
  await gps.fill('48°51\'23.8"N 2°21\'7.9"E');
  // ↩ ferme la fiche : la position est déjà enregistrée.
  await gps.press('Enter');
  await expect(dlg).toBeHidden();
  await page.getByRole('button', { name: 'Modifier la séquence 2' }).click();
  await expect(gps).toHaveValue('48.85661, 2.35219');
  await dlg.getByRole('button', { name: 'Terminé' }).click();

  await page.keyboard.press('ControlOrMeta+3');
  await pick(page, 'Créer un plan au sol pour la séquence', '2 — Wagon');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Importer un fond…' }).click();
  await (await chooser).setFiles(resolve('e2e/plan-decor.png'));
  await page.getByRole('tab', { name: 'Lumière' }).click();
  const sun = page.getByRole('region', { name: 'Soleil' });
  await expect(sun).toBeVisible();
  // La position du décor se lit (et se corrige) ici aussi.
  await expect(sun.getByLabel('Coordonnées GPS du décor')).toHaveValue('48.85661, 2.35219');
  await sun.getByRole('button', { name: 'Nord en haut' }).click();
  await sun.getByRole('button', { name: 'Simuler le soleil' }).click();
  await sun.getByLabel('Date simulée').fill('2026-06-21');
  await sun.getByLabel('Heure simulée').fill('14:00');
  // Référence NREL SPA : azimut 184,05°, hauteur 64,54° ; lever 05:46:56, coucher 21:57:51.
  await expect(sun.getByLabel('Position du soleil')).toContainText(/Direction\s*184° \(S\)/);
  await expect(sun.getByLabel('Position du soleil')).toContainText(/Hauteur\s*65°/);
  await expect(sun.getByLabel('Journée du soleil')).toContainText(/Lever · coucher\s*05:47 · 21:58/);
  await expect(page.locator('.floor-canvas text', { hasText: 'Soleil 14:00 · 65°' })).toBeVisible();
  // Heure qui n'existe pas (passage à l'heure d'été) : signalée.
  await sun.getByLabel('Date simulée').fill('2026-03-29');
  await sun.getByLabel('Heure simulée').fill('02:30');
  await expect(sun.getByText(/n’existe pas ce jour-là/)).toBeVisible();
  await sun.getByLabel('Date simulée').fill('2026-06-21');
  await sun.getByLabel('Heure simulée').fill('14:00');

  // Caméra 2/1 tournée vers le sud (180°) : le soleil (184°, 65° de haut) est devant elle → contre-jour, soleil haut.
  await page.getByRole('tab', { name: 'Plan' }).click();
  await page.getByRole('button', { name: /^2\/1/ }).click();
  const img = (await page.locator('.floor-canvas image').boundingBox())!;
  await page.mouse.click(img.x + img.width * 0.4, img.y + img.height * 0.4);
  await page.getByLabel('Orientation en degrés').fill('180');
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Soleil pour cette caméra')).toHaveText('Soleil à 14:00 : contre-jour (soleil haut)');
  await page.screenshot({ path: 'test-results/23-soleil.png' });
  // À 19 h (azimut 277°, ouest) : la caméra regarde au sud, l'ouest est à sa droite → latéral, à droite.
  await page.getByRole('application', { name: 'Plan au sol' }).press('Escape');
  await page.getByRole('tab', { name: 'Lumière' }).click();
  await sun.getByLabel('Heure simulée').fill('19:00');
  await expect(sun.getByLabel('Soleil et caméras')).toContainText(/2\/1\s*latéral, à droite/);
});

test('positions : début, intermédiaire et fin d’un personnage, orientation, déplacement, lumière à chaque position', async ({ page }) => {
  await page.goto('/?exemple');
  await expect(page.getByRole('grid', { name: 'Découpage' })).toBeFocused();
  await page.keyboard.press('ControlOrMeta+3');
  await pick(page, 'Créer un plan au sol pour la séquence', '2 — Wagon');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Importer un fond…' }).click();
  await (await chooser).setFiles(resolve('e2e/plan-decor.png'));
  const img = (await page.locator('.floor-canvas image').boundingBox())!;
  const at = (x: number, y: number) => ({ x: img.x + (x / 1200) * img.width, y: img.y + (y / 800) * img.height });
  const canvas = page.getByRole('application', { name: 'Plan au sol' });
  await canvas.press('Escape');
  await canvas.press('p');
  const p1 = at(400, 400);
  await page.mouse.click(p1.x, p1.y);
  await page.getByRole('button', { name: '+ Positions (déplacement)' }).click();
  // Deux positions de plus : vers la droite, puis vers le bas.
  const p2 = at(700, 400);
  const p3 = at(700, 600);
  await page.mouse.click(p2.x, p2.y);
  await page.mouse.click(p3.x, p3.y);
  await canvas.press('Enter');
  const field = page.getByLabel('Positions', { exact: true });
  await expect(field.locator('.pos-row')).toHaveText([/1\s*début/, /2\s*intermédiaire/, /3\s*fin/]);
  // Le personnage se tourne dans le sens de la marche : 90° (droite) puis 180° (bas).
  await expect(page.getByLabel('Orientation à la position 2 en degrés')).toHaveValue('90');
  await expect(page.getByLabel('Orientation à la position 3 en degrés')).toHaveValue('180');
  await page.getByLabel('Orientation à la position 3 en degrés').fill('45');
  await page.keyboard.press('Enter');
  const ghosts = page.locator('.floor-canvas [data-pos]');
  await expect(ghosts).toHaveCount(2);
  await expect(ghosts.nth(1)).toHaveAttribute('transform', /rotate\(45\)/);
  await page.screenshot({ path: 'test-results/25-positions.png' });
  // Le fantôme se déplace à la souris.
  const before = await ghosts.nth(0).getAttribute('transform');
  const gb = (await ghosts.nth(0).boundingBox())!;
  await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
  await page.mouse.down();
  await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2 + 60, { steps: 5 });
  await page.mouse.up();
  await expect(ghosts.nth(0)).not.toHaveAttribute('transform', before!);
  // ⌘Z annule le déplacement ; retirer une position.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(ghosts.nth(0)).toHaveAttribute('transform', before!);
  await page.getByRole('button', { name: 'Retirer la position 2' }).click();
  await expect(ghosts).toHaveCount(1);
  await expect(field.locator('.pos-row')).toHaveText([/1\s*début/, /2\s*fin/]);
});
