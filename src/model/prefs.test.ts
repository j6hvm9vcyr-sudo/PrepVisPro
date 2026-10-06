import { describe, expect, it } from 'vitest';
import { adoptLegacy, defaultPrefs, legacyPrefsOf, mergeAliases, parsePrefs } from './prefs';
import { DEFAULT_CARRY, TERM_ALIASES } from './defaults';

const none = { size: false, axis: false, angle: false, focal: false, movement: false, grip: false };

describe('préférences de l’app', () => {
  it('par défaut : plan suivant = focale, mouvement, machinerie ; abréviations livrées', () => {
    expect(defaultPrefs()).toEqual({ version: 1, carryOver: DEFAULT_CARRY, aliases: TERM_ALIASES });
    expect(defaultPrefs().aliases).not.toBe(TERM_ALIASES);
  });

  it('relecture à l’identique ; fichier invalide ou plus récent refusé en bloc', () => {
    const p = { ...defaultPrefs(), carryOver: { ...none, axis: true } };
    expect(parsePrefs(JSON.parse(JSON.stringify(p)))).toEqual({ ok: true, prefs: p });
    expect(parsePrefs({ version: 1, carryOver: { size: 'oui' }, aliases: {} }).ok).toBe(false);
    expect(parsePrefs(null).ok).toBe(false);
    const r = parsePrefs({ version: 2, carryOver: none, aliases: {} });
    expect(!r.ok && r.error).toMatch(/plus récente/);
  });

  it('anciens projets (format 16 à 18) : leurs réglages sont lus avant la migration', () => {
    const settings = { carryOver: { ...none, size: true }, aliases: { Dolly: ['grué'] } };
    expect(legacyPrefsOf({ schemaVersion: 18, settings })).toEqual(settings);
    expect(legacyPrefsOf({ schemaVersion: 16, settings: { carryOver: settings.carryOver } })).toEqual({ carryOver: settings.carryOver, aliases: null });
    expect(legacyPrefsOf({ schemaVersion: 15, settings })).toBeNull();
    expect(legacyPrefsOf({ schemaVersion: 19, settings })).toBeNull();
    expect(legacyPrefsOf({ schemaVersion: 18, settings: { carryOver: 'x' } })).toBeNull();
  });

  it('fusion des abréviations : rien d’ambigu, rien en double', () => {
    const base = { Dolly: ['dol'], Steadicam: ['stead'] };
    const r = mergeAliases(base, { Dolly: ['DOL', 'chariot', 'Stead', ' '], Grue: ['grue', 'dolly', 'telescopique'] });
    expect(r.aliases).toEqual({ Dolly: ['dol', 'chariot'], Steadicam: ['stead'], Grue: ['telescopique'] });
    expect(r.added).toBe(2);
    expect(base).toEqual({ Dolly: ['dol'], Steadicam: ['stead'] });
  });

  it('premières préférences du Mac : celles du premier ancien projet ouvert, telles quelles', () => {
    const legacy = { carryOver: { ...none, size: true }, aliases: { Dolly: ['grué'] } };
    const r = adoptLegacy(defaultPrefs(), legacy, true);
    expect(r.prefs).toEqual({ version: 1, carryOver: legacy.carryOver, aliases: legacy.aliases });
    expect(r.changed).toBe(true);
    expect(adoptLegacy(defaultPrefs(), { carryOver: { ...DEFAULT_CARRY }, aliases: structuredClone(TERM_ALIASES) }, true).changed).toBe(false);
  });

  it('ensuite : seules les abréviations manquantes sont ajoutées ; le plan suivant ne change plus', () => {
    const prefs = { ...defaultPrefs(), carryOver: { ...none, grip: true } };
    const r = adoptLegacy(prefs, { carryOver: { ...none, size: true }, aliases: { Dolly: ['grué'] } }, false);
    expect(r.prefs.carryOver).toEqual(prefs.carryOver);
    expect(r.prefs.aliases.Dolly).toEqual([...(prefs.aliases.Dolly ?? []), 'grué']);
    expect(r.changed).toBe(true);
    expect(adoptLegacy(r.prefs, { carryOver: null, aliases: { Dolly: ['grué'] } }, false).changed).toBe(false);
  });
});
