import { describe, expect, it } from 'vitest';
import { getBackend } from './backend';

describe('getBackend', () => {
  it('deux appels simultanés obtiennent la même instance', async () => {
    const [a, b] = await Promise.all([getBackend(), getBackend()]);
    expect(a).toBe(b);
    expect(await getBackend()).toBe(a);
  });
});
