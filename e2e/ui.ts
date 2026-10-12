import type { Page } from '@playwright/test';

/** Réglages du projet : dans le menu du projet (barre du haut, à gauche). */
export async function openSettings(page: Page) {
  await page.locator('.ibar .proj-menu').click();
  await page.getByRole('menuitem', { name: /^Réglages du projet/ }).click();
}

export type ShareTabName = 'Publier sur le drive' | 'Fichier' | 'Animatique' | 'Retours reçus';
const PANEL: Record<ShareTabName, string> = { 'Publier sur le drive': 'Publier', Fichier: 'Fichier', Animatique: 'Animatique', 'Retours reçus': 'Retours reçus' };

/** Partager (0.24) : ouvre la fenêtre si besoin, choisit la partie, et rend son contenu. */
export async function share(page: Page, tab: ShareTabName) {
  const dlg = page.getByRole('dialog', { name: 'Partager' });
  if (!(await dlg.isVisible())) await page.getByRole('banner', { name: 'Barre du haut' }).getByRole('button', { name: /^Partager/ }).click();
  await dlg.getByRole('tab', { name: new RegExp(`^${tab}`) }).click();
  return dlg.getByRole('tabpanel', { name: PANEL[tab] });
}

/** Détails d'une séquence (0.24) : clic sur son bandeau dans le tableau. */
export async function sequenceDetails(page: Page, n: string) {
  await page.getByRole('button', { name: `Séquence ${n} : détails` }).click();
  return page.getByRole('complementary', { name: 'Détails de la séquence' });
}

/** « ··· » du bandeau d'une séquence, puis une action. */
export async function sequenceAction(page: Page, n: string, action: string | RegExp) {
  await page.locator('.grid .band').getByRole('button', { name: `Séquence ${n} : plus d’actions` }).click();
  await page.getByRole('menu').getByRole('menuitem', { name: action }).click();
}

/** « + Nouveau ▾ » de la barre du tableau, puis un élément. */
export async function newItem(page: Page, item: string | RegExp) {
  await page.getByRole('button', { name: 'Nouveau', exact: true }).click();
  await page.getByRole('menu').getByRole('menuitem', { name: item }).click();
}
