import { beforeEach, describe, expect, it } from 'vitest';
import { adoptFromProject, getPrefs, loadPrefs, prefsWritten, resetPrefs, updatePrefs, usePrefs } from './prefs';
import { defaultPrefs } from '../model/prefs';
import { parseProject } from './project';
import { newProject } from '../model/defaults';

const KEY = 'prepvispro.prefs';
const none = { size: false, axis: false, angle: false, focal: false, movement: false, grip: false };
const stored = () => JSON.parse(localStorage.getItem(KEY) ?? 'null') as unknown;

beforeEach(() => {
  localStorage.clear();
  usePrefs.setState({ prefs: defaultPrefs(), status: 'default', error: null });
});

describe('préférences enregistrées sur le Mac', () => {
  it('aucun fichier : valeurs par défaut, rien n’est écrit tant que rien ne change', async () => {
    await loadPrefs();
    expect(usePrefs.getState().status).toBe('fresh');
    expect(getPrefs()).toEqual(defaultPrefs());
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('une modification est enregistrée aussitôt et relue au lancement suivant', async () => {
    await loadPrefs();
    updatePrefs((p) => void (p.carryOver.size = true));
    await prefsWritten();
    usePrefs.setState({ prefs: defaultPrefs(), status: 'default' });
    await loadPrefs();
    expect(usePrefs.getState().status).toBe('loaded');
    expect(getPrefs().carryOver.size).toBe(true);
  });

  it('fichier illisible : valeurs par défaut, le fichier n’est pas écrasé sans le demander', async () => {
    localStorage.setItem(KEY, '{"version":1,"carryOver":');
    await loadPrefs();
    expect(usePrefs.getState().status).toBe('broken');
    expect(updatePrefs((p) => void (p.carryOver.size = true))).toBe(false);
    expect(adoptFromProject({ carryOver: none, aliases: { Dolly: ['grué'] } })).toBe(false);
    await prefsWritten();
    expect(localStorage.getItem(KEY)).toBe('{"version":1,"carryOver":');
    resetPrefs();
    await prefsWritten();
    expect(stored()).toEqual(defaultPrefs());
    expect(updatePrefs((p) => void (p.carryOver.size = true))).toBe(true);
  });

  it('premier ancien projet ouvert : ses réglages deviennent les préférences ; le suivant n’ajoute que des abréviations', async () => {
    await loadPrefs();
    const p = newProject('A');
    const { timeZone, ...rest } = p.settings;
    const old = (carryOver: object, aliases: object) => JSON.stringify({ ...p, schemaVersion: 18, settings: { ...rest, carryOver, aliases, timeZone } });
    expect(parseProject(old({ ...none, axis: true }, { Dolly: ['grué'] })).ok).toBe(true);
    await prefsWritten();
    expect(getPrefs()).toEqual({ version: 1, carryOver: { ...none, axis: true }, aliases: { Dolly: ['grué'] } });
    expect(stored()).toEqual(getPrefs());
    expect(parseProject(old({ ...none, size: true }, { Dolly: ['chariot'], Steadicam: ['grué'] })).ok).toBe(true);
    await prefsWritten();
    expect(getPrefs()).toEqual({ version: 1, carryOver: { ...none, axis: true }, aliases: { Dolly: ['grué', 'chariot'] } });
    expect(stored()).toEqual(getPrefs());
  });

  it('un projet au format actuel ne touche pas aux préférences', async () => {
    await loadPrefs();
    expect(parseProject(JSON.stringify(newProject('A'))).ok).toBe(true);
    await prefsWritten();
    expect(usePrefs.getState().status).toBe('fresh');
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
