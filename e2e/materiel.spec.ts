import { expect, test } from '@playwright/test';
import { pick } from './pick';

test('matériel : propre au projet ; l’ancien « Mon matériel » du Mac se reprend élément par élément', async ({ page }) => {
  await page.goto('/');
  // Fichier des versions 0.8.0 à 0.8.2, et un modèle d'export gardé à part avant lui.
  await page.evaluate(() => {
    localStorage.setItem('prepvispro.kit', JSON.stringify({ version: 1, cameras: [{ id: 'k1', label: 'A', body: 'Sony Venice 2', mode: '6K 3:2', sensorWidthMm: 35.9, sensorHeightMm: 24, squeeze: 1 }], lenses: [], fixtures: [{ id: 'k2', name: 'Fresnel 2K', watts: 2000, kind: 'tungsten', modes: [{ label: '', lux: 1000, distanceM: 5, beamDeg: 60 }] }], reflectors: [], terms: null, exposure: null }));
    localStorage.setItem('prepvispro.exportPresets', JSON.stringify([{ id: 'u1', name: 'Ancien modèle', options: { columns: ['plan', 'action'] } }]));
  });
  await page.getByRole('button', { name: 'Projet vierge' }).click();
  await page.getByRole('button', { name: 'Réglages' }).click();
  await page.getByRole('tab', { name: 'Matériel' }).click();
  const dlg = page.getByRole('dialog', { name: 'Réglages du projet' });
  await expect(dlg.getByRole('region', { name: 'Matériel de ce projet' })).toContainText(/Projecteurs\s*aucun/);
  await dlg.getByRole('button', { name: 'Ancien « Mon matériel » (3)' }).click();
  const list = dlg.getByRole('region', { name: 'Matériel à reprendre' });
  // Tout est coché d'office ; on laisse le projecteur de côté.
  await list.getByRole('checkbox', { name: 'Fresnel 2K' }).uncheck();
  await list.getByRole('button', { name: 'Ajouter à ce projet (2)' }).click();
  await expect(dlg.getByRole('region', { name: 'Matériel de ce projet' })).toContainText(/Caméras\s*Sony Venice 2 · 6K 3:2/);
  await expect(dlg.getByRole('region', { name: 'Matériel de ce projet' })).toContainText(/Modèles d’export\s*Ancien modèle/);
  await expect(dlg.getByRole('region', { name: 'Matériel de ce projet' })).toContainText(/Projecteurs\s*aucun/);
  await page.screenshot({ path: 'test-results/30-materiel.png' });
  // La caméra a rempli la caméra A du projet neuf.
  await page.getByRole('tab', { name: 'Caméras' }).click();
  await expect(page.locator('.camtab-item')).toHaveCount(1);
  await expect(page.getByLabel('Boîtier')).toHaveValue('Sony Venice 2');
  // Déjà repris : marqué comme tel, rien à ajouter deux fois.
  await page.getByRole('tab', { name: 'Matériel' }).click();
  await dlg.getByRole('button', { name: 'Ancien « Mon matériel » (3)' }).click();
  await expect(list.getByRole('checkbox', { name: 'Sony Venice 2 · 6K 3:2' })).toBeDisabled();
  await expect(list.getByRole('button', { name: 'Ajouter à ce projet (1)' })).toBeEnabled();
});

test('projet suivant : un nouveau projet reprend les réglages et l’équipe, pas les séquences', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Ouvrir l’exemple' }).click();
  await page.getByRole('button', { name: 'Réglages' }).click();
  await page.getByRole('button', { name: '+ Ajouter' }).click();
  await page.getByPlaceholder('Poste').fill('Chef opérateur');
  await page.getByPlaceholder('Nom').fill('Adrien Rousseau');
  await page.getByRole('tab', { name: 'Projet' }).click();
  await page.getByRole('button', { name: 'Nouveau projet avec ces réglages…' }).click();
  await expect(page.getByRole('dialog', { name: 'Réglages du projet' })).toHaveCount(0);
  await expect(page.locator('.line')).toHaveCount(1);
  await expect(page.locator('.toolbar .title')).toContainText('Sans titre');
  await page.getByRole('button', { name: 'Réglages' }).click();
  await expect(page.getByPlaceholder('Poste')).toHaveValue('Chef opérateur');
  await expect(page.getByPlaceholder('Nom')).toHaveValue('Adrien Rousseau');
  await expect(page.getByPlaceholder('1,85:1')).toHaveValue('1,85:1');
  await expect(page.getByRole('textbox', { name: 'Titre' })).toHaveValue('Sans titre');
});

test('abréviations : ajoutées dans les Préférences, reconnues à la saisie, gardées au lancement suivant ; une abréviation ambiguë est refusée', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Projet vierge' }).click();
  // Les réglages du projet renvoient vers les préférences.
  await page.getByRole('button', { name: 'Réglages' }).click();
  await page.getByRole('tab', { name: 'Listes de termes' }).click();
  await page.getByRole('button', { name: 'Préférences… (⌘,)' }).click();
  await expect(page.getByRole('dialog', { name: 'Réglages du projet' })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Préférences de PrepVisPro' })).toBeVisible();
  await page.getByRole('button', { name: 'Dolly', exact: true }).click();
  const field = page.getByLabel('Ajouter une abréviation à Dolly');
  await field.fill('stead');
  await expect(page.getByText('Déjà prise par « Steadicam »')).toBeVisible();
  await field.fill('chariot');
  await field.press('Enter');
  await expect(page.getByRole('button', { name: 'Dolly · chariot' })).toBeVisible();
  await page.getByRole('button', { name: 'Terminé' }).click();
  // Saisie dans la colonne Machinerie : « chariot » devient Dolly.
  await page.locator('.line [id$="-grip"]').first().click();
  await page.keyboard.type('chariot');
  await page.keyboard.press('Enter');
  await expect(page.locator('.line [id$="-grip"]').first()).toHaveText('Dolly');
  // Pas dans le projet : sur ce Mac, relues au lancement suivant.
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('prepvispro.prefs') ?? '{}').aliases?.Dolly)).toContain('chariot');
  await page.reload();
  await page.getByRole('button', { name: 'Projet vierge' }).click();
  await page.keyboard.press('ControlOrMeta+,');
  await expect(page.getByRole('dialog', { name: 'Préférences de PrepVisPro' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Dolly · chariot' })).toBeVisible();
});

test('plan suivant : choisi dans les Préférences, appliqué au nouveau plan ; ⇧⌘, ouvre les réglages du projet', async ({ page }) => {
  await page.goto('/?exemple');
  await expect(page.getByRole('grid', { name: 'Découpage' })).toBeFocused();
  await page.keyboard.press('ControlOrMeta+Shift+,');
  await expect(page.getByRole('dialog', { name: 'Réglages du projet' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Apparence' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+,');
  const dlg = page.getByRole('dialog', { name: 'Préférences de PrepVisPro' });
  await expect(dlg).toBeVisible();
  await dlg.getByLabel('Valeur').check();
  await dlg.getByRole('button', { name: 'Terminé' }).click();
  // 1/1 : Ensemble ; le plan suivant reprend maintenant la valeur.
  await page.locator('.line [id$="-size"]').first().click();
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(page.locator('.line [id$="-size"]').nth(1)).toHaveText('Ensemble');
});

test('plans types : enregistrés depuis un plan, appliqués en un clic à un autre', async ({ page }) => {
  await page.goto('/?exemple');
  await expect(page.getByRole('grid', { name: 'Découpage' })).toBeFocused();
  // Plan 1/2 : Poitrine · 3/4 · 75 mm · Fixe · Branches.
  await page.locator('.line [id$="-action"]').nth(1).click();
  const cams = page.getByRole('region', { name: 'Caméra A' });
  await pick(page, 'Plan type', '+ Enregistrer ce réglage comme plan type');
  await expect(cams.getByRole('button', { name: 'Plan type' })).toHaveText(/Plan type : Poitrine · 3\/4 · À niveau · 75 mm · Fixe · Branches/);
  // Plan 4/1, vide : appliqué en un clic.
  await page.locator('.line [id$="-action"]').nth(7).click();
  await pick(page, 'Plan type', 'Poitrine · 3/4');
  await expect(page.locator('.line [id$="-size"]').nth(7)).toHaveText('Poitrine');
  await expect(page.locator('.line [id$="-focal"]').nth(7)).toHaveText('75 mm');
  await expect(page.locator('.line [id$="-grip"]').nth(7)).toHaveText('Branches');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.line [id$="-focal"]').nth(7)).not.toHaveText('75 mm');
});
