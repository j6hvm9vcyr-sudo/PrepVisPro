import type { Page } from '@playwright/test';

/** Choix dans une liste à recherche (src/ui/Picker.tsx) : ouvre, filtre éventuellement, clique l'option. */
export async function pick(page: Page, label: string, option: string | RegExp | number, search?: string) {
  await page.getByRole('button', { name: label, exact: true }).click();
  const pop = page.locator('.pick-pop');
  if (search !== undefined) await pop.getByRole('textbox').fill(search);
  const opts = pop.getByRole('option');
  await (typeof option === 'number' ? opts.nth(option) : opts.filter({ hasText: option }).first()).click();
}
