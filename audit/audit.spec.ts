// Revue visuelle : une capture par écran (hors CI). npx playwright test -c audit/audit.config.ts
import { expect, test, type Page } from '@playwright/test';
import { pick } from '../e2e/pick';
import { resolve } from 'node:path';

const OUT = process.env.AUDIT_OUT ?? 'test-results/audit';
const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${name}.png` });

async function fullSample(page: Page) {
  await page.goto('/?exemple');
  await expect(page.getByRole('grid', { name: 'Découpage' })).toBeFocused();
}

test('audit', async ({ page }) => {
  // Accueil
  // Captures stables : pas de fondu ni de transition pendant la prise de vue.
  await page.emulateMedia({ reducedMotion: 'reduce' });
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
  // Carte Caméra modifiable sur place (0.11.1)
  await page.getByRole('region', { name: 'Caméra A' }).getByRole('button', { name: /^Axe : / }).click();
  await shot(page, '04b-carte-camera-edition');
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
  for (const tab of ['Projet', 'Caméras', 'Optiques', 'Listes de termes', 'Saisie des plans', 'Matériel']) {
    await page.getByRole('tab', { name: tab }).click();
    await shot(page, `10-reglages-${tab.replace(/ /g, '-')}`);
  }
  await page.getByRole('button', { name: 'Terminé' }).click();
  // Préférences de l'app
  await page.keyboard.press('ControlOrMeta+,');
  for (const tab of ['Saisie']) {
    await page.getByRole('tab', { name: tab }).click();
    await shot(page, `10-preferences-${tab}`);
  }
  await page.getByRole('button', { name: 'Terminé' }).click();
  // Plans au sol
  await page.keyboard.press('ControlOrMeta+3');
  await shot(page, '11-plans-au-sol-vide');
  await pick(page, 'Créer un plan au sol pour la séquence', 0);
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
  await page.getByRole('button', { name: 'Ajouter une gélatine ou une diffusion', exact: true }).click();
  await page.keyboard.type('ctb');
  await shot(page, '16b-liste-gelatines');
  await page.keyboard.press('Escape');
  await canvas.press('b');
  await page.mouse.click(at(850, 400).x, at(850, 400).y);
  await shot(page, '17-plan-reflecteur');
  await canvas.press('Escape');
  await canvas.press('Escape');
  await shot(page, '18-plan-rien-selectionne');
  await page.getByRole('tab', { name: 'Lumière' }).click();
  await shot(page, '18b-plan-lumiere');
  await page.getByRole('tab', { name: 'Plan' }).click();
  // Tournage
  await page.keyboard.press('ControlOrMeta+4');
  await shot(page, '19-tournage-vide');
  await page.getByRole('button', { name: 'Proposer un ordre' }).click();
  await shot(page, '20-tournage-propose');
  // Jours
  await page.keyboard.press('ControlOrMeta+5');
  await shot(page, '21-jours-vide');
  await page.getByRole('button', { name: '+ Jour', exact: true }).first().click();
  await pick(page, 'Ajouter une séquence au jour', 0);
  await shot(page, '22-jour');
  await page.getByRole('button', { name: '← Tous les jours' }).click();
  await page.getByRole('button', { name: '+ Jour', exact: true }).click();
  await pick(page, 'Ajouter une séquence au jour', 1);
  await page.getByRole('button', { name: '← Tous les jours' }).click();
  await shot(page, '22a-jours-tableau');
  // Images, tampons
  await page.keyboard.press('ControlOrMeta+6');
  await shot(page, '22b-images');
  await page.keyboard.press('ControlOrMeta+1');
  await page.getByRole('navigation', { name: 'Le film' }).getByRole('button', { name: '+ Tampon' }).click();
  await shot(page, '22c-tampon');
  await page.getByRole('dialog', { name: 'Tampon' }).getByRole('button', { name: 'TITRE', exact: true }).click();
  await page.keyboard.press('Escape');
  // À vérifier (0.9) : un seul relevé, à droite
  await page.locator('.verify-btn').click();
  await shot(page, '22d-a-verifier');
  await page.getByRole('button', { name: 'À propos : À vérifier' }).click();
  await shot(page, '22e-a-verifier-info');
  await page.getByRole('button', { name: 'Fermer À vérifier' }).click();
  await page.getByRole('button', { name: 'Fermer les détails' }).click();
  await shot(page, '22f-tableau-sans-details');
  await page.getByRole('button', { name: 'Détails' }).click();
  // Dialogues
  await page.getByRole('button', { name: 'Exporter…' }).last().click();
  await shot(page, '23-export');
  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+Shift+S');
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
});
