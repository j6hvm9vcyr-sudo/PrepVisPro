import { expect, test, type Page } from '@playwright/test';
import ExcelJS from 'exceljs';
import { readFileSync } from 'node:fs';
import { PNG_160x90_B64 } from '../src/test/fixtures';

const cell = (page: Page, row: number, col: string) => page.locator(`.line [id$="-${col}"]`).nth(row);

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  (page as unknown as { __errors: string[] }).__errors = errors;
  await page.goto('/?exemple');
  await expect(page.getByRole('grid', { name: 'Découpage' })).toBeFocused();
});

test.afterEach(async ({ page }) => {
  expect((page as unknown as { __errors: string[] }).__errors).toEqual([]);
});

test('saisie clavier : suggestion, évolutif, Tab, Entrée', async ({ page }) => {
  await page.screenshot({ path: 'test-results/01-ouverture.png' });
  // Le curseur est sur la Valeur du plan 1/1.
  await page.keyboard.type('ens > po');
  await expect(page.locator('.pop .sug.on')).toHaveText('Poitrine');
  await page.screenshot({ path: 'test-results/02-suggestion.png' });
  await page.keyboard.press('Tab');
  await expect(cell(page, 0, 'size')).toHaveText('Ensemble → Poitrine');
  await expect(cell(page, 0, 'size')).toHaveClass(/evol/);
  // Le curseur est passé à Axe.
  await expect(cell(page, 0, 'axis')).toHaveClass(/active/);
  await page.keyboard.type('pr');
  await page.keyboard.press('Enter');
  await expect(cell(page, 0, 'axis')).toHaveText('Profil');
  // Entrée valide et reste sur la case ; ↓ pour descendre.
  await expect(cell(page, 0, 'axis')).toHaveClass(/active/);
  await page.keyboard.press('ArrowDown');
  await expect(cell(page, 1, 'axis')).toHaveClass(/active/);
});

test('terme inconnu : jamais deviné, création explicite', async ({ page }) => {
  await page.keyboard.type('pied');
  await expect(page.locator('.pop .sug.on')).toContainText('Créer « Pied »');
  await page.keyboard.press('Enter');
  await expect(cell(page, 0, 'size')).toHaveText('Pied');
  await expect(cell(page, 0, 'size')).toHaveClass(/custom/);
  await expect(page.locator('.status .msg')).toContainText('Terme ajouté');
});

test('focale invalide : message, la saisie reste ouverte', async ({ page }) => {
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  await expect(cell(page, 0, 'focal')).toHaveClass(/active/);
  await page.keyboard.type('longue');
  await page.keyboard.press('Enter');
  await expect(page.locator('.pop .err')).toContainText('Focale');
  await page.keyboard.press('Escape');
  await expect(cell(page, 0, 'focal')).toHaveText('32 mm');
});

test('⌘↩ nouveau plan hérité, renumérotation, ⌘Z', async ({ page }) => {
  const before = await page.locator('.line.first').count();
  await page.keyboard.press('Meta+Enter');
  await expect(page.locator('.editor input')).toBeFocused();
  await page.keyboard.type('Nouveau plan de test');
  await page.keyboard.press('Tab');
  await expect(page.locator('.line.first')).toHaveCount(before + 1);
  await expect(page.locator('.line.first .code b').nth(1)).toHaveText('1/2');
  await expect(cell(page, 1, 'action')).toHaveText('Nouveau plan de test');
  // Repris par défaut : focale, mouvement, machinerie ; le cadrage est à saisir (Réglages › Saisie des plans).
  await expect(cell(page, 1, 'focal')).toHaveText('32 mm');
  await expect(cell(page, 1, 'grip')).toHaveText('Branches');
  await expect(cell(page, 1, 'size')).not.toHaveText('Ensemble');
  await page.screenshot({ path: 'test-results/03-nouveau-plan.png' });
  await page.keyboard.press('Meta+z');
  await page.keyboard.press('Meta+z');
  await expect(page.locator('.line.first')).toHaveCount(before);
  await page.keyboard.press('Meta+Shift+z');
  await expect(page.locator('.line.first')).toHaveCount(before + 1);
});

test('filtre des plans à compléter et repli de séquence', async ({ page }) => {
  await page.getByRole('button', { name: /à compléter/ }).click();
  await expect(page.locator('.line.first')).toHaveCount(2);
  await page.screenshot({ path: 'test-results/04-filtre.png' });
  await page.getByRole('button', { name: /tout afficher/ }).click();
  await page.getByRole('button', { name: 'Replier la séquence 1' }).click();
  await expect(page.locator('.line.first')).toHaveCount(4);
});

test('images : dépôt sur la vignette, choix Repérage, aperçu à l’espace', async ({ page }) => {
  const png = Buffer.from(PNG_160x90_B64, 'base64');
  const dt = await page.evaluateHandle((b64) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const d = new DataTransfer();
    d.items.add(new File([arr], 'reperage.png', { type: 'image/png' }));
    return d;
  }, png.toString('base64'));
  const target = cell(page, 0, 'image');
  await target.dispatchEvent('dragover', { dataTransfer: dt });
  await target.dispatchEvent('drop', { dataTransfer: dt });
  await expect(page.getByRole('dialog', { name: 'Type d’image' })).toBeVisible();
  await page.keyboard.press('r');
  await expect(page.locator('.line.first').first().locator('.thumb img')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Images' }).locator('.imgcard[data-kind="scouting"] img')).toHaveCount(1);
  await page.keyboard.press(' ');
  await expect(page.getByRole('dialog', { name: 'Aperçu de l’image' })).toBeVisible();
  await page.keyboard.press(' ');
  await expect(page.getByRole('dialog', { name: 'Aperçu de l’image' })).toHaveCount(0);
});

test('multicaméra et évolutif visibles, vue fiches, thème sombre', async ({ page }) => {
  // Une seule caméra au départ ; ⇧⌘C ajoute la caméra B au plan.
  await expect(page.locator('.camtag')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Shift+c');
  await expect(page.locator('.camtag', { hasText: 'B' })).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.press('Meta+2');
  await expect(page.locator('.card')).toHaveCount(8);
  await page.screenshot({ path: 'test-results/05-fiches.png' });
  await page.keyboard.press('Meta+1');
  await page.getByRole('button', { name: 'Réglages' }).click();
  await page.getByRole('tab', { name: 'Apparence' }).click();
  await page.getByLabel('Sombre').check();
  await page.getByRole('button', { name: 'Terminé' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: 'test-results/06-sombre.png' });
});

test('modifier une séquence', async ({ page }) => {
  await page.getByRole('button', { name: 'Modifier la séquence 1' }).click();
  const dlg = page.getByRole('dialog', { name: /Séquence/ });
  await dlg.getByLabel('Décor').fill('Gare du Nord');
  await dlg.getByLabel('Effet').selectOption('NUIT');
  await page.screenshot({ path: 'test-results/07-sequence.png' });
  await dlg.getByRole('button', { name: 'Terminé' }).click();
  await expect(page.locator('.band .ttl').first()).toHaveText('EXT. GARE DU NORD — NUIT');
  await expect(page.getByRole('grid', { name: 'Découpage' })).toBeFocused();
});

test('réglages : largeur capteur donne un angle de champ', async ({ page }) => {
  await page.getByRole('button', { name: 'Réglages' }).click();
  await page.getByRole('tab', { name: 'Caméras' }).click();
  await page.getByLabel('Largeur capteur').first().fill('36');
  await page.getByLabel('Hauteur capteur').fill('24');
  // Outil de vérification : 35 mm, cadre 1,85:1 dans un capteur 36 × 24 → 2·atan(36/70) et 2·atan((36/1,85)/70).
  const angles = page.locator('.camtab-angles');
  await expect(angles.locator('tr', { hasText: 'Horizontal' }).locator('td')).toHaveText('54,4°');
  await expect(angles.locator('tr', { hasText: 'Vertical' }).locator('td')).toHaveText('31,1°');
  await expect(page.getByText(/le ratio 1,85:1 rogne le haut et le bas/)).toBeVisible();
  await page.screenshot({ path: 'test-results/16-cameras.png' });
  await page.getByRole('button', { name: 'Terminé' }).click();
  // 1/1 : 32 mm sur 36 mm de large → 2·atan(36/64) = 58,7°
  await expect(page.locator('.camrow .fov .mono').first()).toHaveText('58,7°');
});

test('enchaîner les plans sans quitter le clavier : action, ⌘↩, action…', async ({ page }) => {
  await page.keyboard.press('Meta+Enter');
  await page.keyboard.type('Premier nouveau plan');
  await page.keyboard.press('Meta+Enter');
  await page.keyboard.type('Second nouveau plan');
  await page.keyboard.press('Enter');
  await expect(cell(page, 1, 'action')).toHaveText('Premier nouveau plan');
  await expect(cell(page, 2, 'action')).toHaveText('Second nouveau plan');
  await expect(page.locator('.line.first .code b').nth(2)).toHaveText('1/3');
});

test('copier-coller d’une cellule au clavier', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.keyboard.press('ControlOrMeta+c');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ControlOrMeta+v');
  await expect(cell(page, 1, 'size')).toHaveText('Ensemble');
  await expect(page.locator('.status .msg')).toContainText('1 cellule collée');
});

test('menu contextuel : supprimer un plan, puis annuler', async ({ page }) => {
  const before = await page.locator('.line.first').count();
  await cell(page, 1, 'action').click({ button: 'right' });
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await page.screenshot({ path: 'test-results/11-menu.png' });
  await menu.getByRole('menuitem', { name: /Supprimer le plan/ }).click();
  await expect(page.locator('.line.first')).toHaveCount(before - 1);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.line.first')).toHaveCount(before);
});

test('Entrée valide aussi pendant une composition (accents, texte prédictif de macOS)', async ({ page }) => {
  // Première lettre : ouvre la saisie.
  await page.keyboard.type('p');
  const input = page.getByLabel('Saisie');
  await expect(input).toBeFocused();
  // Suite tapée en « composition » (texte marqué), puis Entrée avant la fin de composition.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.imeSetComposition', { text: 'oi', selectionStart: 2, selectionEnd: 2 });
  await expect(input).toHaveValue('poi');
  await page.keyboard.press('Enter');
  await expect(cell(page, 0, 'size')).toHaveText('Poitrine');
  await expect(cell(page, 0, 'size')).toHaveClass(/active/);
  await expect(input).toHaveCount(0);
});

test('clic sur la cellule active : la saisie s’ouvre et reste ouverte ; clic droit n’édite pas', async ({ page }) => {
  await cell(page, 0, 'size').click();
  await cell(page, 0, 'size').click();
  const input = page.getByLabel('Saisie');
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('Ensemble');
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('po');
  await page.keyboard.press('Enter');
  await expect(cell(page, 0, 'size')).toHaveText('Poitrine');
  // Valeur identique validée : pas d'étape d'annulation fantôme.
  await cell(page, 1, 'axis').click({ button: 'right' });
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(input).toHaveCount(0);
  await page.keyboard.press('Escape');
});

test('saisie incomplète puis clic ailleurs : rien n’est perdu', async ({ page }) => {
  await page.keyboard.type('pa');
  await expect(page.getByLabel('Saisie')).toHaveValue('pa');
  await cell(page, 2, 'axis').click();
  // « pa » ne correspond à aucun terme exact : la saisie reste ouverte.
  await expect(page.getByLabel('Saisie')).toHaveValue('pa');
  await expect(page.getByText(/Saisie à terminer/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Saisie')).toHaveCount(0);
});

test('fenêtres Réglages et Export : Esc ferme, et le clavier ne touche pas au tableau derrière', async ({ page }) => {
  await page.keyboard.press('ControlOrMeta+e');
  await expect(page.getByRole('dialog', { name: 'Exporter' })).toBeVisible();
  await page.keyboard.press('Backspace');
  await page.keyboard.type('x');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Exporter' })).toHaveCount(0);
  await expect(cell(page, 0, 'size')).toHaveText('Ensemble');
  await expect(page.getByLabel('Saisie')).toHaveCount(0);

  await page.getByRole('button', { name: 'Réglages' }).click();
  await expect(page.getByRole('dialog', { name: 'Réglages du projet' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Réglages du projet' })).toHaveCount(0);
  // Le clavier revient au tableau.
  await page.keyboard.press('ArrowRight');
  await expect(cell(page, 0, 'axis')).toHaveClass(/active/);
});

test('case vide : ↩, choix aux flèches, ↩ → la valeur choisie est appliquée (aussi au clic)', async ({ page }) => {
  // Plan 4/1 : cellules vides.
  await page.locator('.line', { hasText: '4/1' }).locator('[id$="-axis"]').click();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Saisie')).toHaveValue('');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  const chosen = await page.locator('.pop .sug.on').innerText();
  await page.keyboard.press('Enter');
  const axis = page.locator('.line', { hasText: '4/1' }).locator('[id$="-axis"]');
  await expect(axis).toHaveText(chosen);
  // Au clic sur une suggestion, case vide.
  await page.locator('.line', { hasText: '4/1' }).locator('[id$="-angle"]').click();
  await page.keyboard.press('Enter');
  await page.locator('.pop .sug', { hasText: 'Plongée' }).click();
  await expect(page.locator('.line', { hasText: '4/1' }).locator('[id$="-angle"]')).toHaveText('Plongée');
});

test('saisie groupée : plusieurs lignes sélectionnées dans une colonne, une seule frappe les remplit', async ({ page }) => {
  // Valeur des plans 1/1, 1/2, 1/3.
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Shift+ArrowDown');
  await expect(page.getByText(/3 cellules sélectionnées — tapez une valeur/)).toBeVisible();
  await page.keyboard.type('gp');
  await expect(page.getByText('↩ remplit les 3 cellules sélectionnées')).toBeVisible();
  await page.keyboard.press('Enter');
  for (const i of [0, 1, 2]) await expect(cell(page, i, 'size')).toHaveText('GP');
  await expect(cell(page, 3, 'size')).toHaveText('Poitrine');
  await expect(page.locator('.status .msg')).toContainText('3 cellules remplies');
  // Une seule annulation remet tout.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(cell(page, 0, 'size')).toHaveText('Ensemble');
  await expect(cell(page, 2, 'size')).toHaveText('Général → Poitrine');
});

test('décor déjà utilisé : l’adresse est reprise, et peut être reportée aux autres séquences', async ({ page }) => {
  await page.getByRole('button', { name: 'Modifier la séquence 1' }).click();
  let dlg = page.getByRole('dialog', { name: /Séquence/ });
  await dlg.getByLabel('Adresse').fill('Gare de Lyon, Paris');
  await dlg.getByRole('button', { name: 'Terminé' }).click();
  // Séquence 3 : même décor que la 1 → adresse remplie toute seule.
  await page.getByRole('button', { name: 'Modifier la séquence 3' }).click();
  dlg = page.getByRole('dialog', { name: /Séquence/ });
  await dlg.getByLabel('Décor').fill('Quai de gare');
  await expect(dlg.getByLabel('Adresse')).toHaveValue('Gare de Lyon, Paris');
  // Changer l'adresse ici propose de la reporter à la séquence 1.
  await dlg.getByLabel('Adresse').fill('Gare de l’Est, Paris');
  await dlg.getByRole('button', { name: /Reporter cette adresse à/ }).click();
  await dlg.getByRole('button', { name: 'Terminé' }).click();
  await page.getByRole('button', { name: 'Modifier la séquence 1' }).click();
  await expect(page.getByRole('dialog', { name: /Séquence/ }).getByLabel('Adresse')).toHaveValue('Gare de l’Est, Paris');
});

test('saisie groupée sur une sélection de plusieurs colonnes : la colonne active est remplie', async ({ page }) => {
  // Valeur → Axe, plans 1/1 à 1/2.
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.type('pro');
  await page.keyboard.press('Enter');
  await expect(cell(page, 0, 'axis')).toHaveText('Profil');
  await expect(cell(page, 1, 'axis')).toHaveText('Profil');
  await expect(cell(page, 0, 'size')).toHaveText('Ensemble');
});

test('versions : enregistrer, voir ce qui a changé, revenir en arrière sans rien perdre', async ({ page }) => {
  await page.getByRole('button', { name: 'Versions' }).click();
  const dlg = page.getByRole('dialog', { name: 'Versions du projet' });
  await dlg.getByLabel('Nom de la version').fill('V1 réalisation');
  await dlg.getByRole('button', { name: 'Enregistrer cette version' }).click();
  await expect(dlg.locator('.version-item')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  // Modifier : focale du 1/1 et nouveau plan.
  await cell(page, 0, 'focal').click();
  await page.keyboard.type('40');
  await page.keyboard.press('Enter');
  await expect(cell(page, 0, 'focal')).toHaveText('40 mm');
  // Les exports disent de quelle version il s'agit.
  await page.keyboard.press('ControlOrMeta+e');
  const dl = page.waitForEvent('download');
  await page.getByRole('dialog', { name: 'Exporter' }).getByRole('button', { name: 'Excel', exact: true }).click();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(readFileSync(await (await dl).path()).buffer as ArrayBuffer);
  expect(String(wb.getWorksheet('Page de garde')!.getCell('C7').value)).toMatch(/^V1 réalisation \(du .+\) \+ modifications$/);
  await page.keyboard.press('Escape');
  // Comparer.
  await page.keyboard.press('ControlOrMeta+Shift+s');
  await dlg.locator('.version-item', { hasText: 'V1 réalisation' }).click();
  await expect(dlg.locator('.diff-sum')).toHaveText('0 plan ajouté · 0 retiré · 1 modifié');
  await expect(dlg.locator('.diff-change', { hasText: 'Focale' })).toContainText('32 mm');
  await expect(dlg.locator('.diff-change', { hasText: 'Focale' })).toContainText('40 mm');
  await page.screenshot({ path: 'test-results/18-versions.png' });
  // Revenir : l'état actuel est d'abord gardé comme version.
  await dlg.getByRole('button', { name: 'Revenir à cette version…' }).click();
  await expect(dlg).toHaveCount(0);
  await expect(cell(page, 0, 'focal')).toHaveText('32 mm');
  await page.keyboard.press('ControlOrMeta+Shift+s');
  await expect(dlg.locator('.version-item')).toHaveCount(2);
  await expect(dlg.locator('.version-item').first()).toContainText('Avant le retour à « V1 réalisation »');
});

test('optiques du projet : focales proposées à la saisie, focale hors série signalée', async ({ page }) => {
  await page.getByRole('button', { name: 'Réglages' }).click();
  await page.getByRole('tab', { name: 'Optiques' }).click();
  await page.getByRole('button', { name: '+ Série de fixes' }).click();
  await page.getByLabel('Nom de la série').fill('Supreme');
  await page.getByLabel('Focales de la série').fill('18 25 35 50 75');
  await page.getByRole('button', { name: 'Terminé' }).click();
  // 1/1 est à 32 mm : absent de la série.
  await expect(cell(page, 0, 'focal')).toHaveClass(/offkit/);
  await expect(cell(page, 0, 'focal')).toHaveAttribute('title', /pas dans les optiques du projet/);
  // Saisie : « 3 » propose 35 ; ↩ l'applique.
  await cell(page, 0, 'focal').click();
  await page.keyboard.type('3');
  await expect(page.locator('.pop .sug.on')).toHaveText('35');
  await page.keyboard.press('ArrowDown'); // une seule proposition : reste sur 35
  await page.keyboard.press('Enter');
  await expect(cell(page, 0, 'focal')).toHaveText('35 mm');
  await expect(cell(page, 0, 'focal')).not.toHaveClass(/offkit/);
});

test('↩ sur une case remplie : toute la liste est proposée, les flèches changent la valeur', async ({ page }) => {
  // 1/1 : Valeur « Ensemble ».
  await page.keyboard.press('Enter');
  const list = page.getByRole('listbox', { name: 'Suggestions' });
  await expect(list.getByRole('option')).toHaveCount(9);
  await expect(list.getByRole('option', { selected: true })).toHaveText('Ensemble');
  // ↑ : la valeur précédente de la liste (Demi-ensemble), appliquée par ↩.
  await page.keyboard.press('ArrowUp');
  await expect(page.getByLabel('Saisie')).toHaveValue('Demi-ensemble');
  await page.keyboard.press('Enter');
  await expect(cell(page, 0, 'size')).toHaveText('Demi-ensemble');
  // Taper revient à la saisie normale (filtrage).
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await page.keyboard.type('GP');
  await expect(list.getByRole('option').first()).toHaveText('GP');
  await page.keyboard.press('Escape');
});
