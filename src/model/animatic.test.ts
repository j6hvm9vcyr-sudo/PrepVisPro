import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { ANIMATIC_RATES, animaticEvents, fileUrl, frameFileName, frames, parseAspect, pictureRect, rateOf, toFcpxml, toOtio, type AnimaticRate } from './animatic';
import { sampleProject } from './sample';

const rate = (id: string) => ANIMATIC_RATES.find((r) => r.id === id)! as AnimaticRate;
const opts = (id: string) => ({ name: 'Le Quai — animatique', rate: rate(id), imagePath: (i: number, ev: { code: string }) => `/Users/a/Le Quai — animatique/images/${frameFileName(i, ev.code)}` });

describe('Animatique', () => {
  it('format du film et zone de l’image dans le cadre HD', () => {
    expect(parseAspect('1,85:1')).toBeCloseTo(1.85);
    expect(parseAspect('2.39')).toBeCloseTo(2.39);
    expect(parseAspect('16/9')).toBeCloseTo(16 / 9);
    expect(parseAspect('4:3')).toBeCloseTo(4 / 3);
    expect(parseAspect('')).toBeNull();
    expect(parseAspect('Scope')).toBeNull();
    expect(parseAspect('0,5')).toBeNull();
    expect(pictureRect(1.85)).toEqual({ x: 0, y: 21, w: 1920, h: 1038 });
    expect(pictureRect(4 / 3)).toEqual({ x: 240, y: 0, w: 1440, h: 1080 });
    expect(pictureRect(null)).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
  });

  it('cadence : celle des réglages si elle convient', () => {
    expect(rateOf(25)!.id).toBe('25');
    expect(rateOf(23.976)!.id).toBe('23.976');
    expect(rateOf(48)).toBeNull();
    expect(frames(8, rate('23.976'))).toBe(192);
  });

  it('plans dans l’ordre du film ; reprise à la durée de son plan ; sans durée : de côté ou provisoire', () => {
    const doc = sampleProject();
    const { events, missing } = animaticEvents(doc, null);
    const all = doc.sequences.flatMap((s) => s.plans);
    expect(events.length + missing.length).toBe(all.length);
    expect(events.every((e) => !e.provisional && e.seconds > 0)).toBe(true);
    const reprise = events.find((e) => e.code === '1/2B')!;
    expect(reprise.seconds).toBe(events.find((e) => e.code === '1/2')!.seconds);
    const withProvisional = animaticEvents(doc, 3);
    expect(withProvisional.events).toHaveLength(all.length);
    expect(withProvisional.events.filter((e) => e.provisional).map((e) => e.code)).toEqual(missing.map((m) => m.code));
  });

  it('noms des images et adresses file://', () => {
    expect(frameFileName(2, '1/2B')).toBe('0003 1-2B.png');
    expect(fileUrl('/Users/a/Le Quai — animatique/images/0003 1-2B.png')).toBe('file:///Users/a/Le%20Quai%20%E2%80%94%20animatique/images/0003%201-2B.png');
  });

  it('OpenTimelineIO : un clip par plan, durées en images, début à 01:00:00:00', () => {
    const { events } = animaticEvents(sampleProject(), null);
    const tl = JSON.parse(toOtio(events, opts('25')));
    expect(tl.OTIO_SCHEMA).toBe('Timeline.1');
    expect(tl.global_start_time).toEqual({ OTIO_SCHEMA: 'RationalTime.1', rate: 25, value: 90000 });
    const clips = tl.tracks.children[0].children;
    expect(clips.map((c: { name: string }) => c.name)).toEqual(events.map((e) => e.code));
    expect(clips[0].source_range.duration.value).toBe(events[0]!.seconds * 25);
    expect(clips[0].media_references.DEFAULT_MEDIA.target_url).toMatch(/^file:\/\/\/Users\/a\/.*0001%201-1\.png$/);
    const ntsc = JSON.parse(toOtio(events, opts('23.976')));
    expect(ntsc.tracks.children[0].children[0].source_range.duration.rate).toBeCloseTo(23.976, 3);
  });

  it('FCPXML 1.9 : une image fixe par plan, bout à bout, texte échappé', () => {
    const doc = produce(sampleProject(), (d) => void (d.sequences[0]!.plans[0]!.action = 'Elle <attend> & "regarde"'));
    const { events } = animaticEvents(doc, null);
    const x = toFcpxml(events, opts('23.976'));
    expect(x).toContain('<fcpxml version="1.9">');
    expect(x).toContain('frameDuration="1001/24000s"');
    expect(x).toContain('<note>Elle &lt;attend&gt; &amp; &quot;regarde&quot;</note>');
    const offsets = [...x.matchAll(/<video ref="a\d+" offset="([^"]+)"/g)].map((m) => m[1]);
    expect(offsets).toHaveLength(events.length);
    expect(offsets[0]).toBe('18018/5s'); // 01:00:00:00 à 23,976 = 86 400 images
    expect(toFcpxml(events, opts('25'))).toContain('offset="3600s"');
  });

  // Fichiers d'exemple pour les outils de référence (OpenTimelineIO, xmllint + DTD FCPXML 1.9).
  it.runIf(!!process.env.ANIMATIC_OUT)('écrit des exemples', () => {
    const dir = process.env.ANIMATIC_OUT!;
    mkdirSync(dir, { recursive: true });
    const { events } = animaticEvents(sampleProject(), 4);
    for (const id of ['23.976', '25']) {
      writeFileSync(join(dir, `exemple-${id}.otio`), toOtio(events, opts(id)));
      writeFileSync(join(dir, `exemple-${id}.fcpxml`), toFcpxml(events, opts(id)));
    }
  });
});
