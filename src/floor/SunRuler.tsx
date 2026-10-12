/**
 * Réglette du soleil (0.19), en bas du plan au sol : la journée du décor, de minuit à minuit, avec la nuit,
 * le crépuscule, l'heure dorée et le jour. On fait glisser l'heure : le soleil bouge sur le plan.
 * Les moments viennent du même calcul que les horaires du soleil (NOAA, seuils de `sunDay`).
 */
import type { KeyboardEvent, PointerEvent } from 'react';
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import type { FloorPlan } from '../model/floor';
import { updateFloorPlan } from '../model/floorOps';
import { dayStrip, minutesToTime, planLocation, planSun, projectTimeZone } from '../model/sunPlan';
import { compassName, utcToLocal, type SunPhase } from '../model/sun';
import { formatNumber } from '../model/text';
import { dayLabels } from '../model/days';

const COLOR: Record<SunPhase, string> = { night: '#1E2A44', twilight: '#3C4F7A', golden: '#E9B872', day: '#FBF1D9' };
const PHASE_LABEL: Record<SunPhase, string> = { night: 'nuit', twilight: 'crépuscule', golden: 'heure dorée', day: 'jour' };
const STEP = 5;

const toMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h! * 60 + m!;
};

function shortDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function SunRuler({ fp }: { fp: FloorPlan }) {
  const doc = useApp(selectDoc);
  const tz = projectTimeZone(doc);
  const loc = planLocation(doc, fp);
  const at = fp.sunAt;
  if (!loc.ok || !at) return null;
  // 96 positions du soleil : assez rapide pour être recalculé à chaque rendu.
  const strip = dayStrip(at.date, tz, loc.point);
  const sun = planSun(doc, fp);
  const minute = toMinutes(at.time);
  const labels = dayLabels(doc);
  const shootDay = doc.shootingDays.find((d) => d.date === at.date && d.sequenceIds.some((id) => fp.sequenceIds.includes(id)));
  const t = (ms: number | null) => (ms === null ? null : utcToLocal(Math.round(ms / 60000) * 60000, tz).time);
  const pct = (m: number) => `${(m / 1440) * 100}%`;
  const setMinute = (m: number) => {
    const v = Math.max(0, Math.min(1440 - STEP, Math.round(m / STEP) * STEP));
    if (v === minute) return;
    const st = useApp.getState();
    st.applyDoc(updateFloorPlan(selectDoc(st), fp.id, (x) => void (x.sunAt = { ...x.sunAt!, time: minutesToTime(v) })), undefined, `sunruler-${fp.id}`);
  };
  const fromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setMinute(((e.clientX - r.left) / r.width) * 1440);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 60 : STEP;
    const map: Record<string, number> = { ArrowRight: minute + step, ArrowUp: minute + step, ArrowLeft: minute - step, ArrowDown: minute - step, Home: 0, End: 1440 - STEP, PageUp: minute + 60, PageDown: minute - 60 };
    const v = map[e.key];
    if (v === undefined) return;
    e.preventDefault();
    e.stopPropagation();
    setMinute(v);
  };
  // Dégradé par tranches nettes ; une heure qui n'existe pas (heure d'été) est hachurée.
  const w = 100 / strip.length;
  const stops = strip.map((s, i) => `${s.phase ? COLOR[s.phase] : '#C9CED6'} ${(i * w).toFixed(3)}% ${((i + 1) * w).toFixed(3)}%`).join(', ');
  const here = strip[Math.min(strip.length - 1, Math.floor(minute / (1440 / strip.length)))]?.phase ?? null;
  const day = sun.ok ? sun.day : null;
  const rise = day && !day.polar ? t(day.sunrise) : null;
  const set = day && !day.polar ? t(day.sunset) : null;

  return (
    <section className="sun-ruler glass-panel" aria-label="Heure du soleil">
      <div className="sr-head">
        <span className="sr-title">Soleil · {shootDay ? `${labels.get(shootDay.id)} ` : ''}{shortDay(at.date)}</span>
        <span className="spacer" />
        <b className="mono sr-time">{at.time}</b>
        <span className="sr-pos">
          {!sun.ok
            ? sun.reason === 'bad-time'
              ? 'heure qui n’existe pas ce jour-là'
              : ''
            : sun.pos.elevation > -0.833
              ? `${PHASE_LABEL[here ?? 'day']} · azimut ${formatNumber(Math.round(sun.pos.azimuth))}° (${compassName(sun.pos.azimuth)}) · hauteur ${formatNumber(Math.round(sun.pos.elevation))}°`
              : `${PHASE_LABEL[here ?? 'night']} · soleil couché`}
        </span>
      </div>
      <div
        className="sr-track"
        role="slider"
        tabIndex={0}
        aria-label="Heure de la journée"
        aria-valuemin={0}
        aria-valuemax={1440 - STEP}
        aria-valuenow={minute}
        aria-valuetext={at.time}
        title="Glisser pour changer l’heure · ← → 5 min, ⇧ 1 h"
        style={{ background: `linear-gradient(90deg, ${stops})` }}
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.focus();
          e.currentTarget.setPointerCapture(e.pointerId);
          fromPointer(e);
        }}
        onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && fromPointer(e)}
        onKeyDown={onKeyDown}
      >
        {Array.from({ length: 23 }, (_, i) => (
          <span key={i} className="sr-tick" style={{ left: pct((i + 1) * 60) }} aria-hidden />
        ))}
        {rise && (
          <span className="sr-mark" style={{ left: pct(toMinutes(rise)) }}>
            lever {rise}
          </span>
        )}
        {set && (
          <span className="sr-mark end" style={{ left: pct(toMinutes(set)) }}>
            coucher {set}
          </span>
        )}
        <span className="sr-head-mark" style={{ left: pct(minute) }} aria-hidden />
      </div>
      <div className="sr-hours" aria-hidden>
        {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => (
          <span key={h}>{h}h</span>
        ))}
      </div>
    </section>
  );
}
