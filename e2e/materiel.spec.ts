import { expect, test } from '@playwright/test';
import { pick } from './pick';

test('mon matériel : une caméra et un vocabulaire enregistrés une fois, repris dans un nouveau projet en un clic', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Projet vierge' }).click();
  await page.getByRole('button', { name: 'Réglages' }).click();

  // Caméra du projet, d'après la fiche du boîtier, enregistrée dans Mon matériel.
  await page.getByRole('tab', { name: 'Caméras' }).click();
  const save = page.getByRole('button', { name: 'Enregistrer dans mon matériel' });
  await expect(save).toBeDisabled(); // pas de boîtier : rien à retrouver plus tard
  await page.getByLabel('Boîtier').fill('Sony Venice 2');
  await page.getByLabel('Mode', { exact: true }).fill('6K 3:2');
  await page.getByLabel('Largeur capteur').fill('35,9');
  await page.getByLabel('Largeur capteur').press('Tab');
  await page.getByLabel('Hauteur capteur').fill('24');
  await page.getByLabel('Hauteur capteur').press('Tab');
  await save.click();
  await expect(page.getByRole('button', { name: 'Dans mon matériel ✓' })).toBeDisabled();
  // Modifiée dans le projet : Mon matériel n'a pas changé, il propose la mise à jour.
  await page.getByLabel('Hauteur capteur').fill('18,9');
  await page.getByLabel('Hauteur capteur').press('Tab');
  await expect(page.getByRole('button', { name: 'Mettre à jour mon matériel' })).toBeEnabled();
  await page.getByLabel('Hauteur capteur').fill('24');
  await page.getByLabel('Hauteur capteur').press('Tab');

  // Vocabulaire de départ : un terme maison, gardé pour les nouveaux projets.
  await page.getByRole('tab', { name: 'Listes de termes' }).click();
  await page.getByLabel('Ajouter à Valeurs').fill('Plan poitrine serré');
  await page.getByLabel('Ajouter à Valeurs').press('Enter');
  await page.getByRole('tab', { name: 'Mon matériel' }).click();
  const kit = page.getByRole('dialog', { name: 'Réglages du projet' });
  await expect(kit.getByRole('region', { name: 'Caméras' })).toContainText(/Sony Venice 2 · 6K 3:2\s*35,9 × 24 mm/);
  await expect(kit.getByRole('region', { name: 'Caméras' })).toContainText('Dans ce projet');
  await kit.getByRole('button', { name: 'Prendre celles de ce projet' }).click();
  await expect(kit.getByRole('button', { name: 'Identiques à ce projet ✓' })).toBeDisabled();
  await page.screenshot({ path: 'test-results/30-mon-materiel.png' });

  // Nouveau projet : le vocabulaire est là, la caméra s'ajoute en un clic (elle remplit la caméra A).
  await page.reload();
  await page.getByRole('button', { name: 'Projet vierge' }).click();
  await page.getByRole('button', { name: 'Réglages' }).click();
  await page.getByRole('tab', { name: 'Listes de termes' }).click();
  await expect(page.getByText('Plan poitrine serré')).toBeVisible();
  await page.getByRole('tab', { name: 'Caméras' }).click();
  await pick(page, 'Ajouter une caméra', 'Sony Venice 2 · 6K 3:2');
  await expect(page.locator('.camtab-item')).toHaveCount(1);
  await expect(page.getByLabel('Boîtier')).toHaveValue('Sony Venice 2');
  await expect(page.getByLabel('Largeur capteur')).toHaveValue('35,9');
  await expect(page.getByRole('button', { name: 'Dans mon matériel ✓' })).toBeVisible();
  // Une seconde caméra vierge reste possible (custom).
  await pick(page, 'Ajouter une caméra', 'Caméra vierge');
  await expect(page.locator('.camtab-item')).toHaveCount(2);
  await expect(page.getByLabel('Nom', { exact: true })).toHaveValue('B');
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

test('abréviations : ajoutées dans les Réglages, reconnues à la saisie ; une abréviation ambiguë est refusée', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Projet vierge' }).click();
  await page.getByRole('button', { name: 'Réglages' }).click();
  await page.getByRole('tab', { name: 'Listes de termes' }).click();
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
});
