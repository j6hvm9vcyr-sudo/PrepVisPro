/**
 * Jours de tournage et matériel déduit.
 *
 * Rien n'est saisi deux fois : le matériel d'un jour (ou de tout le tournage) se lit dans ce qui
 * existe déjà — caméras et focales du découpage, machinerie des plans et trajets du plan au sol,
 * projecteurs, gélatines et réflecteurs des plans feux, notes du dépouillement.
 */
import { produce } from 'immer';
import type { Id, ProjectDoc, Sequence, ShootingDay } from './types';
import type { FloorCamera, FloorPlan } from './floor';
import { computeNumbers } from './numbering';
import { newId } from './defaults';
import { inKit, lensLabel } from './lenses';
import { gelLabel } from './gels';
import { norm } from './text';
import { sunDay, type SunDay } from './sun';
import { projectTimeZone } from './sunPlan';

// ------------------------------------------------------------------ jours

/** « J1 », « J2 »… dans l'ordre de la liste. */
export function dayLabels(doc: ProjectDoc): Map<Id, string> {
  return new Map(doc.shootingDays.map((d, i) => [d.id, `J${i + 1}`]));
}

/** Jours où une séquence est tournée (elle peut s'étaler sur plusieurs jours). */
export function daysOfSequence(doc: ProjectDoc, seqId: Id): ShootingDay[] {
  return doc.shootingDays.filter((d) => d.sequenceIds.includes(seqId));
}

/** Séquences qui ne sont dans aucun jour. */
export function unscheduled(doc: ProjectDoc): Sequence[] {
  const used = new Set(doc.shootingDays.flatMap((d) => d.sequenceIds));
  return doc.sequences.filter((s) => !used.has(s.id));
}

export function addDay(doc: ProjectDoc): { doc: ProjectDoc; id: Id } {
  const id = newId('jt');
  return { doc: produce(doc, (d) => void d.shootingDays.push({ id, date: null, sequenceIds: [], note: '' })), id };
}

export function updateDay(doc: ProjectDoc, dayId: Id, fn: (d: ShootingDay) => void): ProjectDoc {
  return produce(doc, (d) => {
    const x = d.shootingDays.find((y) => y.id === dayId);
    if (x) fn(x);
  });
}

export function removeDay(doc: ProjectDoc, dayId: Id): ProjectDoc {
  return produce(doc, (d) => void (d.shootingDays = d.shootingDays.filter((x) => x.id !== dayId)));
}

export function moveDay(doc: ProjectDoc, dayId: Id, delta: -1 | 1): ProjectDoc {
  return produce(doc, (d) => {
    const i = d.shootingDays.findIndex((x) => x.id === dayId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= d.shootingDays.length) return;
    [d.shootingDays[i], d.shootingDays[j]] = [d.shootingDays[j]!, d.shootingDays[i]!];
  });
}

/** Trie les jours par date ; les jours sans date gardent leur ordre, à la fin. */
export function sortDaysByDate(doc: ProjectDoc): ProjectDoc {
  return produce(doc, (d) => {
    const dated = d.shootingDays.filter((x) => x.date).sort((a, b) => a.date!.localeCompare(b.date!));
    d.shootingDays = [...dated, ...d.shootingDays.filter((x) => !x.date)];
  });
}

/** Retire des jours les séquences supprimées. */
export function cleanupDays(doc: ProjectDoc): ProjectDoc {
  const ids = new Set(doc.sequences.map((s) => s.id));
  if (!doc.shootingDays.some((d) => d.sequenceIds.some((x) => !ids.has(x)))) return doc;
  return produce(doc, (d) => {
    for (const day of d.shootingDays) day.sequenceIds = day.sequenceIds.filter((x) => ids.has(x));
  });
}

// ------------------------------------------------------------------ soleil du jour

export interface DaySun {
  /** Décor (séquences qui y sont tournées ce jour-là). */
  location: string;
  sequences: string[];
  sun: SunDay;
}

/** Horaires du soleil du jour pour chaque décor qui a une position GPS. */
export function daySun(doc: ProjectDoc, day: ShootingDay): DaySun[] {
  if (!day.date) return [];
  const tz = projectTimeZone(doc);
  const out = new Map<string, DaySun>();
  for (const id of day.sequenceIds) {
    const s = doc.sequences.find((x) => x.id === id);
    if (!s?.gps) continue;
    const key = `${s.gps.lat.toFixed(4)},${s.gps.lon.toFixed(4)}`;
    const cur = out.get(key);
    if (cur) cur.sequences.push(s.number || '?');
    else {
      const sun = sunDay(day.date, tz, s.gps);
      if (sun) out.set(key, { location: s.location.trim() || 'Décor', sequences: [s.number || '?'], sun });
    }
  }
  return [...out.values()];
}

// ------------------------------------------------------------------ matériel

export interface Equipment {
  cameras: { label: string; body: string; mode: string; plans: string[] }[];
  /** Focales utilisées (début et fin des plans évolutifs), avec la série du projet qui les fournit. */
  focals: { focal: number; series: string[]; plans: string[]; offKit: boolean }[];
  /** Plans dont la focale n'est pas renseignée. */
  focalMissing: string[];
  grip: { term: string; plans: string[] }[];
  /** Trajets de caméra tracés sur les plans au sol (longueur mesurée ; null si le plan n'est pas à l'échelle). */
  moves: { plan: string; floorPlan: string; grip: string[]; lengthM: number | null }[];
  /** Projecteurs par modèle : nombre maximal sur un même plan au sol, et détail par plan. */
  fixtures: { name: string; watts: number | null; max: number; perPlan: { floorPlan: string; count: number }[] }[];
  undefinedLights: number;
  /** Gélatines LEE : nombre de projecteurs qui en portent, tous plans au sol confondus. */
  gels: { label: string; lights: number }[];
  reflectors: { name: string; size: string; max: number; perPlan: { floorPlan: string; count: number }[] }[];
  /** Puissance du plan au sol le plus gourmand (projecteurs dont la puissance est connue). */
  peakPower: { floorPlan: string; watts: number } | null;
  notes: { sequence: string; camera: string; grip: string; lighting: string; other: string }[];
  floorPlans: FloorPlan[];
}

const m2 = (v: number) => Math.round(v * 100) / 100;

/** Matériel des séquences données (un jour, ou tout le tournage). */
export function equipmentFor(doc: ProjectDoc, sequenceIds: readonly Id[]): Equipment {
  const scope = new Set(sequenceIds);
  const seqs = doc.sequences.filter((s) => scope.has(s.id));
  const numbers = computeNumbers(doc);
  const code = (planId: Id) => numbers.get(planId)?.code ?? '?';
  const lenses = doc.settings.lenses;

  const cams = new Map<Id, Set<string>>();
  const focals = new Map<number, Set<string>>();
  const focalMissing: string[] = [];
  const grip = new Map<string, { term: string; plans: Set<string> }>();
  const planGrip = new Map<Id, string[]>();
  for (const s of seqs)
    for (const p of s.plans) {
      const c = code(p.id);
      let anyFocal = false;
      const g = new Set<string>();
      for (const setup of p.cameras) {
        (cams.get(setup.cameraId) ?? cams.set(setup.cameraId, new Set()).get(setup.cameraId)!).add(c);
        for (const f of [setup.start.focalMm, setup.end?.focalMm ?? null]) {
          if (f === null || !(f > 0)) continue;
          anyFocal = true;
          (focals.get(f) ?? focals.set(f, new Set()).get(f)!).add(c);
        }
        for (const t of setup.grip) {
          if (!t.trim()) continue;
          g.add(t.trim());
          const k = norm(t);
          (grip.get(k) ?? grip.set(k, { term: t.trim(), plans: new Set() }).get(k)!).plans.add(c);
        }
      }
      planGrip.set(p.id, [...g]);
      if (!anyFocal) focalMissing.push(c);
    }

  const cameras = doc.settings.cameras
    .filter((c) => cams.has(c.id))
    .map((c) => ({ label: c.label, body: c.body, mode: c.mode, plans: [...cams.get(c.id)!] }));

  const focalList = [...focals.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([focal, plans]) => ({
      focal,
      series: lenses.filter((l) => (l.kind === 'primes' ? l.focals.some((x) => Math.abs(x - focal) < 0.01) : l.min !== null && l.max !== null && focal >= l.min - 0.01 && focal <= l.max + 0.01)).map((l) => (l.kind === 'primes' ? l.name || 'Fixes' : lensLabel(l))),
      plans: [...plans],
      offKit: !inKit(lenses, focal),
    }));

  // Plans au sol du périmètre : ceux qui concernent au moins une de ces séquences.
  const floorPlans = doc.floorPlans.filter((fp) => fp.sequenceIds.some((id) => scope.has(id)));
  const planIds = new Set(seqs.flatMap((s) => s.plans.map((p) => p.id)));
  const moves: Equipment['moves'] = [];
  const fixtures = new Map<Id, Equipment['fixtures'][number]>();
  const refl = new Map<string, Equipment['reflectors'][number]>();
  const gels = new Map<string, number>();
  let undefinedLights = 0;
  let peakPower: Equipment['peakPower'] = null;
  for (const fp of floorPlans) {
    const name = fp.name || 'Plan au sol';
    for (const e of fp.elements) {
      if (e.kind !== 'camera' || !e.planId || !planIds.has(e.planId) || !e.path.length) continue;
      const cam = e as FloorCamera;
      let len = 0;
      let prev = cam.at;
      for (const q of cam.path) {
        len += Math.hypot(q.x - prev.x, q.y - prev.y);
        prev = q;
      }
      moves.push({ plan: code(cam.planId!), floorPlan: name, grip: planGrip.get(cam.planId!) ?? [], lengthM: fp.scale ? m2(len * fp.scale.metersPerUnit) : null });
    }
    const counts = new Map<Id, number>();
    const rcounts = new Map<string, number>();
    let watts = 0;
    for (const e of fp.elements) {
      if (e.kind === 'light') {
        for (const g of e.gels) {
          const l = gelLabel(g);
          if (l) gels.set(l, (gels.get(l) ?? 0) + 1);
        }
        const f = doc.settings.fixtures.find((x) => x.id === e.fixtureId);
        if (!f) {
          undefinedLights++;
          continue;
        }
        counts.set(f.id, (counts.get(f.id) ?? 0) + 1);
        if (f.watts !== null) watts += f.watts;
      } else if (e.kind === 'reflector') {
        const mat = doc.settings.reflectors.find((x) => x.id === e.materialId);
        const size = `${m2(e.widthM).toLocaleString('fr-FR')} × ${m2(e.heightM).toLocaleString('fr-FR')} m`;
        const key = `${mat?.id ?? '?'}|${size}`;
        rcounts.set(key, (rcounts.get(key) ?? 0) + 1);
        if (!refl.has(key)) refl.set(key, { name: mat?.name || 'Réflecteur (matière non définie)', size, max: 0, perPlan: [] });
      }
    }
    for (const [id, n] of counts) {
      const f = doc.settings.fixtures.find((x) => x.id === id)!;
      const cur = fixtures.get(id) ?? fixtures.set(id, { name: f.name || 'Projecteur sans nom', watts: f.watts, max: 0, perPlan: [] }).get(id)!;
      cur.max = Math.max(cur.max, n);
      cur.perPlan.push({ floorPlan: name, count: n });
    }
    for (const [key, n] of rcounts) {
      const cur = refl.get(key)!;
      cur.max = Math.max(cur.max, n);
      cur.perPlan.push({ floorPlan: name, count: n });
    }
    if (watts > 0 && (!peakPower || watts > peakPower.watts)) peakPower = { floorPlan: name, watts };
  }

  const notes = seqs
    .map((s) => ({ sequence: s.number || '?', ...s.breakdown }))
    .filter((n) => n.camera.trim() || n.grip.trim() || n.lighting.trim() || n.other.trim());

  return {
    cameras,
    focals: focalList,
    focalMissing,
    grip: [...grip.values()].map((g) => ({ term: g.term, plans: [...g.plans] })),
    moves,
    fixtures: [...fixtures.values()],
    undefinedLights,
    gels: [...gels.entries()].map(([label, lights]) => ({ label, lights })).sort((a, b) => a.label.localeCompare(b.label, 'fr', { numeric: true })),
    reflectors: [...refl.values()],
    peakPower,
    notes,
    floorPlans,
  };
}

// ------------------------------------------------------------------ texte (exports)

/**
 * Liste de plans compacte : les plans consécutifs d'une séquence deviennent une plage
 * (« 2/1–2/5, 2/7, 1/2B »). Les reprises restent écrites en entier.
 */
export function compactPlans(codes: readonly string[]): string {
  const out: string[] = [];
  let run: { seq: string; from: number; to: number } | null = null;
  const flush = () => {
    if (!run) return;
    out.push(run.from === run.to ? `${run.seq}/${run.from}` : run.to === run.from + 1 ? `${run.seq}/${run.from}, ${run.seq}/${run.to}` : `${run.seq}/${run.from}–${run.seq}/${run.to}`);
    run = null;
  };
  for (const c of codes) {
    const m = /^(.+)\/(\d+)$/.exec(c);
    if (!m) {
      flush();
      out.push(c);
      continue;
    }
    const n = Number(m[2]);
    if (run && run.seq === m[1] && n === run.to + 1) run.to = n;
    else {
      flush();
      run = { seq: m[1]!, from: n, to: n };
    }
  }
  flush();
  return out.join(', ');
}

const fr = (v: number) => v.toLocaleString('fr-FR');

/** Matériel en lignes de texte, par département (exports PDF et Excel). */
export function equipmentLines(eq: Equipment): { section: string; lines: string[] }[] {
  const out: { section: string; lines: string[] }[] = [];
  const push = (section: string, lines: string[]) => lines.length && out.push({ section, lines });
  push(
    'Caméra',
    eq.cameras.map((c) => `Caméra ${c.label}${[c.body, c.mode].filter(Boolean).length ? ` : ${[c.body, c.mode].filter(Boolean).join(' · ')}` : ''} (${compactPlans(c.plans)})`),
  );
  push('Optiques', [
    ...eq.focals.map((f) => `${fr(f.focal)} mm${f.offKit ? ' — hors des optiques du projet' : f.series.length ? ` — ${f.series.join(' ou ')}` : ''} (${compactPlans(f.plans)})`),
    ...(eq.focalMissing.length ? [`Focale non renseignée : ${compactPlans(eq.focalMissing)}`] : []),
  ]);
  push('Machinerie', [
    ...eq.grip.map((g) => `${g.term} (${compactPlans(g.plans)})`),
    ...eq.moves.map((m) => `Trajet caméra ${m.plan}${m.grip.length ? ` (${m.grip.join(', ')})` : ''} : ${m.lengthM !== null ? `${fr(m.lengthM)} m` : 'plan non mis à l’échelle'} — ${m.floorPlan}`),
  ]);
  push('Lumière', [
    ...eq.fixtures.map((f) => `${f.max} × ${f.name}${f.watts !== null ? ` · ${fr(f.watts)} W` : ''}${f.perPlan.length > 1 ? ` (${f.perPlan.map((p) => `${p.floorPlan} : ${p.count}`).join(' · ')})` : ''}`),
    ...(eq.undefinedLights ? [`${eq.undefinedLights} projecteur(s) sans modèle`] : []),
    ...(eq.peakPower ? [`Puissance du plan le plus gourmand : ${fr(eq.peakPower.watts)} W (${eq.peakPower.floorPlan}, ${fr(Math.round((eq.peakPower.watts / 230) * 10) / 10)} A à 230 V)`] : []),
  ]);
  push(
    'Gélatines et diffusion',
    eq.gels.map((g) => `${g.label} — sur ${g.lights} projecteur${g.lights > 1 ? 's' : ''}`),
  );
  push(
    'Réflecteurs',
    eq.reflectors.map((r) => `${r.max} × ${r.name} ${r.size}${r.perPlan.length > 1 ? ` (${r.perPlan.map((p) => `${p.floorPlan} : ${p.count}`).join(' · ')})` : ''}`),
  );
  push(
    'Dépouillement',
    eq.notes.map(
      (n) =>
        `Séq. ${n.sequence} — ${[
          ['Caméra', n.camera],
          ['Machinerie', n.grip],
          ['Lumière', n.lighting],
          ['Autre', n.other],
        ]
          .filter(([, v]) => v!.trim())
          .map(([k, v]) => `${k} : ${v!.trim()}`)
          .join(' · ')}`,
    ),
  );
  return out;
}
