/** Lecture d'un en-tête de scène : « INT. CHAMBRE D'AXEL - NUIT ». */
import type { DayNight, IntExt } from '../model/types';
import { norm } from '../model/text';

export interface ParsedHeading {
  intExt: IntExt;
  location: string;
  dayNight: DayNight;
  /** Effet tel qu'écrit (« SOIR », « AUBE »…), si différent de JOUR/NUIT. */
  effect: string;
  /** Ce qui n'a pas pu être lu avec certitude (à vérifier dans l'aperçu). */
  doubts: string[];
}

const NIGHT = ['nuit', 'night', 'soir', 'soiree', 'crepuscule', 'tombee de la nuit', 'evening', 'dusk'];
const DAY = ['jour', 'day', 'matin', 'aube', 'midi', 'apres-midi', 'apres midi', 'morning', 'dawn', 'afternoon', 'continuous', 'continu', 'suite', 'plus tard', 'later'];

export function parseHeading(raw: string): ParsedHeading {
  const doubts: string[] = [];
  let t = raw.replace(/\s+/g, ' ').trim();
  // « SÉQUENCE 3 - » ou « 3. » en tête : retiré (le numéro est géré à part).
  t = t.replace(/^s[ée]quence\s+\S+\s*[-–—:.]\s*/i, '').replace(/^\d+[A-Z]?\s*[.)-]\s+/i, '');
  t = t.replace(/[.\s]+$/, '');

  let intExt: IntExt = 'INT';
  const m = t.match(/^(INT\.?\s*\/\s*EXT\.?|EXT\.?\s*\/\s*INT\.?|I\s*\/\s*E\.?|INT[ÉE]RIEUR|EXT[ÉE]RIEUR|INT\.?|EXT\.?|EST\.?)(\s*[-–—.]\s*|\s+|$)/i);
  if (m) {
    const k = norm(m[1]!).replace(/[.\s]/g, '');
    intExt = k.includes('/') ? 'INT/EXT' : k.startsWith('ext') || k.startsWith('est') ? 'EXT' : 'INT';
    t = t.slice(m[0].length).trim();
  } else {
    doubts.push('INT/EXT non précisé');
  }

  const isEffect = (w: string) => {
    const e = norm(w).replace(/[.]/g, '');
    return NIGHT.some((x) => e === x || e.startsWith(x + ' ')) || DAY.some((x) => e === x || e.startsWith(x + ' '));
  };
  // Effet : dernière partie après un tiret.
  let effect = '';
  const parts = t.split(/\s+[-–—]\s+/);
  if (parts.length > 1) {
    effect = parts.pop()!.trim();
    t = parts.join(' - ').trim();
  }
  // « INT. NUIT » sans décor.
  if (!effect && [...NIGHT, ...DAY].includes(norm(t).replace(/[.]/g, ''))) {
    effect = t;
    t = '';
  }
  // Ordre à la française : « INT. JOUR - CUISINE » ou « INT JOUR CUISINE » (effet avant le décor).
  if (!isEffect(effect)) {
    const lead = /^([A-ZÀ-Þa-zà-ÿ'’ -]+?)\s*(?:[-–—.,/]\s*|\s+)(.+)$/.exec(effect ? `${t} - ${effect}` : t);
    const firstWord = lead ? lead[1]!.trim() : '';
    if (lead && isEffect(firstWord) && firstWord.split(' ').length <= 3) {
      effect = firstWord;
      t = lead[2]!.replace(/^[-–—.,\s]+/, '').trim();
    } else {
      // « INT. CUISINE. NUIT » : effet après un point.
      const dot = /^(.+?)\.\s+([^.]+)$/.exec(effect ? `${t} - ${effect}` : t);
      if (dot && isEffect(dot[2]!)) {
        effect = dot[2]!.trim();
        t = dot[1]!.trim();
      }
    }
  }
  let dayNight: DayNight = 'JOUR';
  const e = norm(effect).replace(/[.]/g, '');
  if (NIGHT.some((w) => e === w || e.startsWith(w + ' '))) dayNight = 'NUIT';
  else if (DAY.some((w) => e === w || e.startsWith(w + ' '))) dayNight = 'JOUR';
  else {
    if (effect) {
      // Pas un effet reconnu : c'était sans doute une partie du décor.
      t = `${t} - ${effect}`;
      effect = '';
    }
    doubts.push('jour/nuit non précisé');
  }
  const eff = effect.toUpperCase();
  return { intExt, location: t, dayNight, effect: eff === 'JOUR' || eff === 'NUIT' ? '' : eff, doubts };
}
