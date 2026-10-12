import { expect, test } from '@playwright/test';
import { pick } from './pick';
import { openSettings, sequenceDetails, share } from './ui';

test.beforeEach(async ({ page }) => {
  await page.goto('/?exemple');
  await expect(page.getByRole('grid', { name: 'Découpage' })).toBeFocused();
});

test('tournage : jours et installations ensemble — séquences du jour, ordre, soleil à la date du jour, matériel déduit', async ({ page }) => {
  // Fuseau fixé et position GPS du quai (pour le soleil).
  await openSettings(page);
  await page.getByLabel('Fuseau horaire').selectOption('Europe/Paris');
  await page.getByRole('button', { name: 'Terminé' }).click();
  const dlg = await sequenceDetails(page, '1');
  await dlg.getByLabel('Coordonnées GPS', { exact: true }).fill('48.8566, 2.3522');

  await page.keyboard.press('ControlOrMeta+3');
  // Aucun jour : une ligne, un bouton ; les séquences attendent dans « Sans jour ». Le matériel de tout le tournage est à un clic.
  await expect(page.getByText('Aucun jour de tournage')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Sans jour' })).toContainText('Séq. 4 · Rue');
  await page.getByRole('button', { name: 'Matériel du tournage' }).click();
  const mat = page.getByRole('region', { name: 'Matériel' });
  await expect(mat).toContainText('Caméra A');
  await expect(mat).toContainText('Steadicam');

  await page.getByRole('button', { name: '+ Jour', exact: true }).first().click();
  await page.getByLabel('Date du jour de tournage').fill('2026-06-21');
  await pick(page, 'Ajouter une séquence au jour', '1 — EXT. QUAI DE GARE — JOUR');
  await pick(page, 'Ajouter une séquence au jour', '2 — INT. WAGON — JOUR');
  await expect(page.getByRole('heading', { level: 3 })).toHaveText('J1 — dimanche 21 juin 2026');
  const seqs = page.getByRole('region', { name: 'Séquences du jour' });
  await expect(seqs).toContainText('SÉQ. 1 — EXT. QUAI DE GARE — JOUR');
  // ⌥↑ / ⌥↓ sur une ligne la déplace (comme les plans du tableau).
  await seqs.getByRole('button', { name: 'Retirer la séquence 2 du jour' }).focus();
  await page.keyboard.press('Alt+ArrowUp');
  await expect(seqs.locator('.day-seq-h b')).toHaveText([/SÉQ\. 2/, /SÉQ\. 1/]);
  await page.keyboard.press('Alt+ArrowDown');
  await expect(seqs.locator('.day-seq-h b')).toHaveText([/SÉQ\. 1/, /SÉQ\. 2/]);
  // Ou en glissant la poignée : la séquence 2 lâchée en haut de la 1.
  await seqs.locator('.drag-handle').nth(1).dragTo(seqs.locator('.day-seq').first(), { targetPosition: { x: 40, y: 4 } });
  await expect(seqs.locator('.day-seq-h b')).toHaveText([/SÉQ\. 2/, /SÉQ\. 1/]);
  const second = (await seqs.locator('.day-seq').nth(1).boundingBox())!;
  await seqs.locator('.drag-handle').nth(0).dragTo(seqs.locator('.day-seq').nth(1), { targetPosition: { x: 40, y: second.height - 4 } });
  await expect(seqs.locator('.day-seq-h b')).toHaveText([/SÉQ\. 1/, /SÉQ\. 2/]);
  await expect(seqs.getByRole('button', { name: 'Ordre de tournage à établir (Installations)' }).first()).toBeVisible();
  // Le tableau des jours, au centre, suit : J1 avec ses deux séquences, la 1 n'est plus « sans jour ».
  const j1 = page.getByRole('region', { name: 'J1' });
  await expect(j1.locator('.board-group-h .lbl')).toHaveText(['Séq. 1 · Quai de gare', 'Séq. 2 · Wagon']);
  await expect(page.getByRole('region', { name: 'Sans jour' })).not.toContainText('Quai de gare');
  // Soleil à la date du jour (référence NREL SPA : lever 05:46:56, coucher 21:57:51).
  const sun = page.getByRole('region', { name: 'Soleil du jour' });
  await expect(sun).toContainText(/Quai de gare.*05:47.*21:58/);
  // Matériel du jour : focales des séquences 1 et 2.
  await expect(mat).toContainText(/300 mm/);
  await expect(mat).toContainText(/25 mm/);
  // Séquences sans jour : dans « À vérifier ».
  await page.locator('.verify-btn').click();
  const verif = page.getByRole('complementary', { name: 'À vérifier' });
  await expect(verif).toContainText('Séq. 3 · Appartement de Léa · aucun jour');
  await expect(verif).toContainText('Séq. 4 · Rue · aucun jour');
  // Une séquence sans jour mène à sa place dans le Tournage.
  await verif.getByRole('button', { name: /Séq\. 3/ }).click();
  await expect(page.getByRole('button', { name: 'Installations de la séquence 3' })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.verify-btn').click();
  // Les détails montrent alors les installations de la séquence 3 ; J1 se rouvre d'un clic.
  await expect(page.getByRole('complementary', { name: 'Détails du tournage' })).toContainText('SÉQ. 3');
  await page.getByRole('button', { name: 'Ouvrir J1' }).click();
  await page.screenshot({ path: 'test-results/24-jour.png' });

  // J2 : la séquence 2 continue → signalée sur les deux jours.
  await page.getByRole('button', { name: '+ Jour', exact: true }).click();
  await pick(page, 'Ajouter une séquence au jour', /^2 — INT\. WAGON — JOURdéjà au J1/);
  await expect(seqs).toContainText('aussi au J1');
  // Le tableau montre les jours de chaque séquence.
  await page.keyboard.press('ControlOrMeta+1');
  await expect(page.locator('.band .day-chip')).toHaveText(['J1', 'J1, J2']);

  // Export : l'option est proposée et cochée.
  await page.keyboard.press('ControlOrMeta+3');
  await share(page, 'Fichier');
  await expect(page.getByLabel(/Jours de tournage et matériel/)).toBeChecked();
});
