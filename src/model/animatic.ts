/**
 * Animatique (0.22) : les plans du découpage, dans l'ordre du film, chacun avec sa durée et son image
 * (sinon un carton), en timeline à ouvrir au montage : OpenTimelineIO pour DaVinci Resolve, FCPXML 1.9
 * pour Final Cut Pro. Chaque plan est un clip qui porte son numéro (« 1/2 »).
 *
 * Fichiers vérifiés avec les outils de référence : la bibliothèque OpenTimelineIO (relecture à
 * l'identique) et la DTD FCPXML 1.9 d'Apple (xmllint). Voir le doc des décisions, v0.22.0.
 */
import type { Id, ProjectDoc } from './types';
import { computeNumbers } from './numbering';
import { planDuration } from './duration';
import { coverImage } from './images';

/** Cadences proposées (images par seconde de la timeline), sans « drop frame ». */
export const ANIMATIC_RATES = [
  { id: '23.976', label: '23,976', fps: 24, num: 24000, den: 1001 },
  { id: '24', label: '24', fps: 24, num: 24, den: 1 },
  { id: '25', label: '25', fps: 25, num: 25, den: 1 },
  { id: '29.97', label: '29,97', fps: 30, num: 30000, den: 1001 },
  { id: '30', label: '30', fps: 30, num: 30, den: 1 },
] as const;
export type AnimaticRate = (typeof ANIMATIC_RATES)[number];

/** La cadence de la timeline, si celle des réglages du projet en fait partie. */
export function rateOf(fps: number): AnimaticRate | null {
  return ANIMATIC_RATES.find((r) => Math.abs(r.num / r.den - fps) < 0.005) ?? null;
}

/** Taille des images de l'animatique (timeline HD). */
export const FRAME = { width: 1920, height: 1080 } as const;

/** Format du film (« 1,85:1 », « 2.39 », « 16/9 ») ; null si absent ou illisible. */
export function parseAspect(text: string): number | null {
  const t = text.trim().replace(/,/g, '.').replace(/\s+/g, '');
  let m: RegExpMatchArray | null;
  let a: number;
  if ((m = t.match(/^(\d+(?:\.\d+)?)(?:[:/](\d+(?:\.\d+)?))?$/))) a = m[2] === undefined ? Number(m[1]) : Number(m[1]) / Number(m[2]);
  else return null;
  return Number.isFinite(a) && a >= 1 && a <= 3 ? a : null;
}

/** Zone de l'image dans le cadre HD, au format du film (bandes noires autour). */
export function pictureRect(aspect: number | null): { x: number; y: number; w: number; h: number } {
  const W = FRAME.width;
  const H = FRAME.height;
  if (!aspect || Math.abs(aspect - W / H) < 0.01) return { x: 0, y: 0, w: W, h: H };
  if (aspect > W / H) {
    const h = Math.round(W / aspect / 2) * 2;
    return { x: 0, y: (H - h) / 2, w: W, h };
  }
  const w = Math.round((H * aspect) / 2) * 2;
  return { x: (W - w) / 2, y: 0, w, h: H };
}

export interface AnimaticEvent {
  planId: Id;
  seqId: Id;
  code: string;
  action: string;
  seconds: number;
  /** Durée provisoire (le plan n'est pas minuté) : signalée sur l'image. */
  provisional: boolean;
  imageFile: string | null;
}

/**
 * Plans du film dans l'ordre, avec leur durée (celle de leur plan pour une reprise). Sans durée :
 * laissés de côté, ou mis avec la durée provisoire donnée.
 */
export function animaticEvents(doc: ProjectDoc, provisionalS: number | null): { events: AnimaticEvent[]; missing: { planId: Id; code: string }[] } {
  const numbers = computeNumbers(doc);
  const events: AnimaticEvent[] = [];
  const missing: { planId: Id; code: string }[] = [];
  for (const seq of doc.sequences)
    for (const p of seq.plans) {
      const code = numbers.get(p.id)?.code ?? '?';
      const d = planDuration(seq, p);
      if (d === null) missing.push({ planId: p.id, code });
      const seconds = d ?? provisionalS;
      if (seconds === null) continue;
      events.push({ planId: p.id, seqId: seq.id, code, action: p.action, seconds, provisional: d === null, imageFile: coverImage(p)?.file ?? null });
    }
  return { events, missing };
}

/** Nombre d'images d'un plan (une seconde = fps images, comme au montage). */
export function frames(seconds: number, rate: AnimaticRate): number {
  return seconds * rate.fps;
}

/** Nom du fichier image d'un plan : ordre dans le film puis numéro (« 0003 1-2B.png »). */
export function frameFileName(index: number, code: string): string {
  return `${String(index + 1).padStart(4, '0')} ${code.replace(/[\\/:*?"<>|]+/g, '-')}.png`;
}

/** Adresse file:// d'un chemin absolu (chaque partie encodée). */
export function fileUrl(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/');
  return 'file://' + (path.startsWith('/') ? '' : '/') + parts.map(encodeURIComponent).join('/');
}

export interface TimelineOpts {
  name: string;
  rate: AnimaticRate;
  /** Chemin absolu de l'image de chaque plan. */
  imagePath: (index: number, ev: AnimaticEvent) => string;
}

/** Début de la timeline à 01:00:00:00 (usage du montage). */
const START_HOURS = 1;

// ------------------------------------------------------------------ OpenTimelineIO

const rt = (value: number, rate: number) => ({ OTIO_SCHEMA: 'RationalTime.1', rate, value });
const range = (start: number, dur: number, rate: number) => ({ OTIO_SCHEMA: 'TimeRange.1', duration: rt(dur, rate), start_time: rt(start, rate) });

/** Timeline OpenTimelineIO (JSON .otio), comme l'écrit la bibliothèque de référence. */
export function toOtio(events: AnimaticEvent[], o: TimelineOpts): string {
  const rate = o.rate.num / o.rate.den;
  const clips = events.map((ev, i) => {
    const n = frames(ev.seconds, o.rate);
    return {
      OTIO_SCHEMA: 'Clip.2',
      metadata: { topshot: { planId: ev.planId, sequenceId: ev.seqId, action: ev.action, provisional: ev.provisional } },
      name: ev.code,
      source_range: range(0, n, rate),
      effects: [],
      markers: [],
      enabled: true,
      media_references: {
        DEFAULT_MEDIA: { OTIO_SCHEMA: 'ExternalReference.1', metadata: {}, name: frameFileName(i, ev.code), available_range: range(0, n, rate), target_url: fileUrl(o.imagePath(i, ev)) },
      },
      active_media_reference_key: 'DEFAULT_MEDIA',
    };
  });
  const timeline = {
    OTIO_SCHEMA: 'Timeline.1',
    metadata: { topshot: { kind: 'animatique' } },
    name: o.name,
    global_start_time: rt(START_HOURS * 3600 * o.rate.fps, rate),
    tracks: {
      OTIO_SCHEMA: 'Stack.1',
      metadata: {},
      name: 'tracks',
      source_range: null,
      effects: [],
      markers: [],
      enabled: true,
      children: [{ OTIO_SCHEMA: 'Track.1', metadata: {}, name: 'V1', source_range: null, effects: [], markers: [], enabled: true, children: clips, kind: 'Video' }],
    },
  };
  return JSON.stringify(timeline, null, 4) + '\n';
}

// ------------------------------------------------------------------ FCPXML 1.9

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a;
}

/** Durée FCPXML (fraction de secondes) : « 8s », « 1001/24000s ». */
function t(n: number, d: number): string {
  if (n === 0) return '0s';
  const g = gcd(n, d);
  return d / g === 1 ? `${n / g}s` : `${n / g}/${d / g}s`;
}

function esc(s: string): string {
  // Caractères de contrôle interdits en XML 1.0 (sauf tabulation, retour à la ligne) : retirés.
  const clean = [...s].filter((c) => c.charCodeAt(0) >= 0x20 || c === '\t' || c === '\n' || c === '\r').join('');
  return clean.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Projet Final Cut Pro (FCPXML 1.9) : une image fixe par plan dans le scénario principal. Une image
 * fixe est un élément `video` qui renvoie à son fichier, au format sans cadence (comme Final Cut Pro).
 */
export function toFcpxml(events: AnimaticEvent[], o: TimelineOpts): string {
  const { num, den } = o.rate;
  const time = (frameCount: number) => t(frameCount * den, num);
  const start = START_HOURS * 3600 * o.rate.fps;
  const assets = events.map((ev, i) => `    <asset id="a${i + 1}" name="${esc(frameFileName(i, ev.code).replace(/\.png$/, ''))}" start="0s" duration="0s" hasVideo="1" format="r2" videoSources="1">\n      <media-rep kind="original-media" src="${esc(fileUrl(o.imagePath(i, ev)))}"/>\n    </asset>`);
  let offset = start;
  const clips = events.map((ev, i) => {
    const n = frames(ev.seconds, o.rate);
    const line = `          <video ref="a${i + 1}" offset="${time(offset)}" name="${esc(ev.code)}" duration="${time(n)}">${ev.action ? `\n            <note>${esc(ev.action)}</note>\n          ` : ''}</video>`;
    offset += n;
    return line;
  });
  const total = offset - start;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.9">
  <resources>
    <format id="r1" frameDuration="${t(den, num)}" width="${FRAME.width}" height="${FRAME.height}"/>
    <format id="r2" width="${FRAME.width}" height="${FRAME.height}"/>
${assets.join('\n')}
  </resources>
  <library>
    <event name="${esc(o.name)}">
      <project name="${esc(o.name)}">
        <sequence format="r1" duration="${time(total)}" tcStart="${time(start)}" tcFormat="NDF">
          <spine>
${clips.join('\n')}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
`;
}
