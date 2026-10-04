import base from '../playwright.config';
export default { ...base, testDir: '.', reporter: 'line', timeout: 240_000 };
