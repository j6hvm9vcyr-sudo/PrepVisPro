// Revue visuelle : une capture par écran (hors CI). npx playwright test -c audit/audit.config.ts
import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';

const OUT = process.env.AUDIT_OUT ?? 'test-results/audit';
const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${name}.png` });

async function fullSample(page: Page) {
  await page.goto('/?exemple');
  await expect(page.getByRole('grid', { name: 'Découpage' })).toBeFocused();
}

test('audit', async ({ page }) => {
  // Accueil
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'PrepVisPro' })).toBeVisible();
  await shot(page, '01-accueil');
  await page.getByRole('button', { name: 'Projet vierge' }).click();
  await shot(page, '02-projet-vierge');

  await fullSample(page);
  await shot(page, '03-tableau');
  await page.keyboard.press('Enter');
  await shot(page, '04-tableau-edition');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Shift+ArrowDown');
  await shot(page, '05-tableau-selection');
  await page.keyboard.press('Escape');
  await page.locator('.line').nth(1).click({ button: 'right' });
  await shot(page, '06-menu-contextuel');
  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+i');
  await shot(page, '07-tableau-sans-details');
  await page.keyboard.press('ControlOrMeta+i');
  await page.getByRole('button', { name: 'Modifier la séquence 1' }).click();
  await shot(page, '08-fiche-sequence');
  await page.getByRole('dialog', { name: /Séquence/ }).getByRole('button', { name: 'Terminé' }).click();
  await page.keyboard.press('ControlOrMeta+2');
  await shot(page, '09-fiches');
  // Réglages
  await page.getByRole('button', { name: 'Réglages' }).click();
  for (const tab of ['Projet', 'Caméras', 'Optiques', 'Listes de termes', 'Plan complet', 'Apparence']) {
    await page.getByRole('tab', { name: tab }).click();
    await shot(page, `10-reglages-${tab.replace(/ /g, '-')}`);
  }
  await page.getByRole('button', { name: 'Terminé' }).click();
  // Plans au sol
  await page.keyboard.press('ControlOrMeta+3');
  await shot(page, '11-plans-au-sol-vide');
  await page.getByLabel('Créer un plan au sol pour la séquence').selectOption({ index: 1 });
  await shot(page, '12-plan-sans-fond');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Importer un fond…' }).click();
  await (await chooser).setFiles(resolve('e2e/plan-decor.png'));
  await page.waitForTimeout(500);
  await shot(page, '13-plan-avec-fond');
  const canvas = page.getByRole('application', { name: 'Plan au sol' });
  const img = (await page.locator('.floor-canvas image').boundingBox())!;
  const at = (x: number, y: number) => ({ x: img.x + (x / 1200) * img.width, y: img.y + (y / 800) * img.height });
  await canvas.press('e');
  await page.mouse.click(at(100, 100).x, at(100, 100).y);
  await page.mouse.click(at(1100, 100).x, at(1100, 100).y);
  await page.getByLabel('Distance en mètres').fill('10');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: /^1\/1/ }).click();
  await page.mouse.click(at(300, 600).x, at(300, 600).y);
  await shot(page, '14-plan-camera');
  await canvas.press('p');
  await page.mouse.click(at(600, 400).x, at(600, 400).y);
  await shot(page, '15-plan-personnage');
  await canvas.press('l');
  await page.mouse.click(at(350, 300).x, at(350, 300).y);
  await shot(page, '16-plan-projecteur');
  await canvas.press('b');
  await page.mouse.click(at(850, 400).x, at(850, 400).y);
  await shot(page, '17-plan-reflecteur');
  await canvas.press('Escape');
  await canvas.press('Escape');
  await shot(page, '18-plan-rien-selectionne');
  // Tournage
  await page.keyboard.press('ControlOrMeta+4');
  await shot(page, '19-tournage-vide');
  await page.getByRole('button', { name: 'Proposer un ordre' }).click();
  await shot(page, '20-tournage-propose');
  // Jours
  await page.keyboard.press('ControlOrMeta+5');
  await shot(page, '21-jours-vide');
  await page.getByRole('button', { name: '+ Jour de tournage' }).click();
  await page.getByLabel('Ajouter une séquence au jour').selectOption({ index: 1 });
  await shot(page, '22-jour');
  // Dialogues
  await page.getByRole('button', { name: 'Exporter…' }).last().click();
  await shot(page, '23-export');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Versions' }).click();
  await shot(page, '24-versions');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Raccourcis clavier' }).click();
  await shot(page, '25-raccourcis');
  await page.keyboard.press('Escape');
  // Petite fenêtre
  await page.setViewportSize({ width: 1180, height: 760 });
  await page.keyboard.press('ControlOrMeta+1');
  await shot(page, '26-petite-fenetre-tableau');
  await page.keyboard.press('ControlOrMeta+3');
  await shot(page, '27-petite-fenetre-plan');
  // Sombre
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.keyboard.press('ControlOrMeta+1');
  await shot(page, '28-sombre-tableau');
  await page.keyboard.press('ControlOrMeta+3');
  await shot(page, '29-sombre-plan');
});
