import { expect, test } from '@playwright/test';
import { pick } from './pick';

test.beforeEach(async ({ page }) => {
  await page.goto('/?exemple');
  await expect(page.getByRole('grid', { name: 'Découpage' })).toBeFocused();
});

test('jours de tournage : séquences du jour, ordre, soleil à la date du jour, matériel déduit', async ({ page }) => {
  // Fuseau fixé et position GPS du quai (pour le soleil).
  await page.getByRole('button', { name: 'Réglages' }).click();
  await page.getByLabel('Fuseau horaire').selectOption('Europe/Paris');
  await page.getByRole('button', { name: 'Terminé' }).click();
  await page.getByRole('button', { name: 'Modifier la séquence 1' }).click();
  const dlg = page.getByRole('dialog', { name: /Séquence/ });
  await dlg.getByLabel('Coordonnées GPS').fill('48.8566, 2.3522');
  await dlg.getByRole('button', { name: 'Terminé' }).click();

  await page.keyboard.press('ControlOrMeta+5');
  const list = page.getByRole('complementary', { name: 'Jours de tournage' });
  await expect(list).toBeVisible();
  // Sans jour : le matériel de tout le tournage est déjà là.
  const mat = page.getByRole('region', { name: 'Matériel' });
  await expect(mat).toContainText('Caméra A');
  await expect(mat).toContainText('Steadicam');

  await list.getByRole('button', { name: '+ Jour de tournage' }).click();
  await page.getByLabel('Date du jour de tournage').fill('2026-06-21');
  await pick(page, 'Ajouter une séquence au jour', '1 — EXT. QUAI DE GARE — JOUR');
  await pick(page, 'Ajouter une séquence au jour', '2 — INT. WAGON — JOUR');
  await expect(page.getByRole('heading', { level: 3 })).toHaveText('J1 — dimanche 21 juin 2026');
  const seqs = page.getByRole('region', { name: 'Séquences du jour' });
  await expect(seqs).toContainText('SÉQ. 1 — EXT. QUAI DE GARE — JOUR');
  await expect(seqs.getByRole('button', { name: 'Ordre de tournage à établir (vue Tournage)' }).first()).toBeVisible();
  // Soleil à la date du jour (référence NREL SPA : lever 05:46:56, coucher 21:57:51).
  const sun = page.getByRole('region', { name: 'Soleil du jour' });
  await expect(sun).toContainText(/Quai de gare.*05:47.*21:58/);
  // Matériel du jour : focales des séquences 1 et 2.
  await expect(mat).toContainText(/300 mm/);
  await expect(mat).toContainText(/25 mm/);
  await expect(list).toContainText('Sans jour : séq. 3, 4');
  await page.screenshot({ path: 'test-results/24-jour.png' });

  // J2 : la séquence 2 continue → signalée sur les deux jours.
  await list.getByRole('button', { name: '+ Jour de tournage' }).click();
  await pick(page, 'Ajouter une séquence au jour', /^2 — INT\. WAGON — JOURdéjà au J1/);
  await expect(seqs).toContainText('aussi au J1');
  // Le tableau montre les jours de chaque séquence.
  await page.keyboard.press('ControlOrMeta+1');
  await expect(page.locator('.band .day-chip')).toHaveText(['J1', 'J1, J2']);

  // Export : l'option est proposée et cochée.
  await page.keyboard.press('ControlOrMeta+5');
  await page.getByRole('button', { name: 'Exporter…' }).first().click();
  await expect(page.getByLabel(/Jours de tournage et matériel/)).toBeChecked();
});
