import { defineConfig } from '@playwright/test';

// Dans le conteneur de dev, Chromium est préinstallé ; en CI, Playwright installe le sien.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;
// Sans locale UTF-8, Chromium sous Linux remplace un nom de téléchargement accentué par « download ».
const env = { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } as Record<string, string>;

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  // En CI : chaque échec devient une annotation lisible, et un test instable est rejoué une fois
  // (signalé comme « flaky » dans le rapport, jamais masqué).
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1440, height: 900 },
    launchOptions: executablePath ? { executablePath, env } : { env },
  },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
