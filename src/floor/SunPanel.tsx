/**
 * Soleil du plan au sol : nord du plan, date et heure simulées, position du soleil,
 * événements de la journée et rapport avec chaque caméra.
 */
import { GpsField } from '../ui/Overlays';
import { TimeZoneSelect } from '../ui/Settings';
import { Explain } from '../ui/Explain';
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import type { FloorCamera, FloorPlan } from '../model/floor';
import { cameraLabel, updateFloorPlan } from '../model/floorOps';
import { computeNumbers } from '../model/numbering';
import { formatNumber } from '../model/text';
import { compassName, utcToLocal } from '../model/sun';
import { planLocation, planSun, projectTimeZone, shadowLength, sunForCamera } from '../model/sunPlan';
import { DecimalField } from '../ui/DecimalField';
import { dayLabels } from '../model/days';
import { produce } from 'immer';

const deg = (v: number) => `${formatNumber(Math.round(v))}°`;

function apply(fn: (d: ReturnType<typeof selectDoc>) => ReturnType<typeof selectDoc>, msg?: string, key?: string) {
  const st = useApp.getState();
  st.applyDoc(fn(selectDoc(st)), msg, key);
}

function todayIn(tz: string): string {
  return utcToLocal(Date.now(), tz).date;
}

function shortDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

const toMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h! * 60 + m!;
};
const fromMinutes = (n: number) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;

/** Soleil du plan au sol (section de l'onglet Lumière). */
export function SunSection({ fp }: { fp: FloorPlan }) {
  const doc = useApp(selectDoc);
  const tz = projectTimeZone(doc);
  const loc = planLocation(doc, fp);
  const sun = planSun(doc, fp);
  const setPlan = (fn: (x: FloorPlan) => void, key: string) => apply((d) => updateFloorPlan(d, fp.id, fn), undefined, `${key}-${fp.id}`);
  const t = (ms: number | null) => (ms === null ? '—' : utcToLocal(Math.round(ms / 60000) * 60000, tz).time);
  const numbers = computeNumbers(doc);
  const cams = fp.elements.filter((e): e is FloorCamera => e.kind === 'camera');
  // Jours de tournage datés où ce décor est tourné : la date se reprend sans la ressaisir.
  const labels = dayLabels(doc);
  const shootDays = doc.shootingDays.filter((d) => d.date && d.sequenceIds.some((id) => fp.sequenceIds.includes(id)));

  const seqs = doc.sequences.filter((x) => fp.sequenceIds.includes(x.id));
  const gps = seqs.find((x) => x.gps)?.gps ?? null;
  return (
    <>

      <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
        <div className="field small">
          Nord du plan
          <DecimalField
            label="Direction du nord sur le plan en degrés"
            unit="°"
            width={60}
            min={0}
            max={360}
            value={fp.northDeg}
            onChange={(v) => setPlan((x) => void (x.northDeg = v === null ? null : v % 360), 'north')}
          />
        </div>
        <button type="button" className="btn ghost" onClick={() => setPlan((x) => void (x.northDeg = 0), 'north')} title="Vue satellite ou plan orienté : le nord est en haut">
          Nord en haut
        </button>
      </div>
      {fp.northDeg === null && <p className="note" style={{ margin: 0 }}>Sans nord, le soleil n’est pas dessiné (0° = haut du plan).</p>}

      {seqs.length > 0 ? (
        <GpsField
          label={seqs.length > 1 ? `Coordonnées GPS du décor (séq. ${seqs.map((x) => x.number || '?').join(', ')})` : 'Coordonnées GPS du décor'}
          value={gps}
          onChange={(g) =>
            apply(
              (d) =>
                produce(d, (x) => {
                  for (const q of x.sequences) if (fp.sequenceIds.includes(q.id)) q.gps = g ? { ...g } : null;
                }),
              undefined,
              `gps-${fp.id}`,
            )
          }
        />
      ) : (
        <p className="note" style={{ margin: 0 }}>Plan rattaché à aucune séquence : pas de position, pas de soleil.</p>
      )}
      {!loc.ok ? (
        loc.reason === 'none' ? null : (
          <p className="note" style={{ margin: 0, color: 'var(--warn-text)' }}>Les séquences de ce plan ont des positions GPS différentes : le soleil n’est pas calculé. Saisissez la position ci-dessus pour les accorder.</p>
        )
      ) : !fp.sunAt ? (
        <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setPlan((x) => void (x.sunAt = { date: shootDays[0]?.date ?? todayIn(tz), time: '12:00' }), 'sun')}>
          Simuler le soleil{shootDays[0] ? ` (${labels.get(shootDays[0].id)})` : ''}
        </button>
      ) : (
        <>
          <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
            <label className="field">
              Date
              <input type="date" aria-label="Date simulée" value={fp.sunAt.date} required onChange={(e) => e.target.value && setPlan((x) => void (x.sunAt = { ...x.sunAt!, date: e.target.value }), 'sundate')} />
            </label>
            <label className="field small">
              Heure
              <input type="time" aria-label="Heure simulée" value={fp.sunAt.time} required onChange={(e) => e.target.value && setPlan((x) => void (x.sunAt = { ...x.sunAt!, time: e.target.value.slice(0, 5) }), 'suntime')} />
            </label>
          </div>
          {shootDays.length > 0 && (
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {shootDays.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className="btn ghost"
                  aria-pressed={fp.sunAt?.date === d.date}
                  title="Date de ce jour de tournage"
                  onClick={() => setPlan((x) => void (x.sunAt = { ...x.sunAt!, date: d.date! }), 'sundate')}
                >
                  {labels.get(d.id)} · {shortDay(d.date!)}
                </button>
              ))}
            </div>
          )}
          <input
            type="range"
            aria-label="Heure de la journée"
            min={0}
            max={1435}
            step={5}
            value={toMinutes(fp.sunAt.time)}
            onChange={(e) => setPlan((x) => void (x.sunAt = { ...x.sunAt!, time: fromMinutes(Number(e.target.value)) }), 'suntime')}
          />
          {!sun.ok ? (
            sun.reason === 'bad-time' && <p className="note" style={{ margin: 0, color: 'var(--warn-text)' }}>Cette heure n’existe pas ce jour-là (passage à l’heure d’été).</p>
          ) : (
            <>
              <div className="light-readings" aria-label="Position du soleil">
                {sun.pos.elevation > -0.833 ? (
                  <>
                    <div className="reading">
                      <span>Direction</span>
                      <b>
                        {deg(sun.pos.azimuth)} ({compassName(sun.pos.azimuth)})
                      </b>
                    </div>
                    <div className="reading">
                      <span>Hauteur</span>
                      <b>{deg(sun.pos.elevation)}</b>
                    </div>
                    {shadowLength(1.8, sun.pos.elevation) !== null && (
                      <div className="reading">
                        <span>Ombre d’une personne de 1,80 m</span>
                        <b>{formatNumber(Math.round(shadowLength(1.8, sun.pos.elevation)! * 10) / 10)} m</b>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="reading">
                    <span>Soleil couché</span>
                    <b>{deg(sun.pos.elevation)} sous l’horizon</b>
                  </div>
                )}
              </div>
              {sun.day && (
                <div className="light-readings" aria-label="Journée du soleil">
                  {sun.day.polar ? (
                    <div className="reading">
                      <span>{sun.day.polar === 'day' ? 'Soleil levé toute la journée' : 'Soleil couché toute la journée'}</span>
                    </div>
                  ) : (
                    <>
                      <div className="reading">
                        <span>Lever · coucher</span>
                        <b>
                          {t(sun.day.sunrise)} · {t(sun.day.sunset)}
                        </b>
                      </div>
                      <div className="reading">
                        <span>Midi solaire</span>
                        <b>
                          {t(sun.day.noon)} · {deg(sun.day.noonElevation)}
                        </b>
                      </div>
                      <div className="reading">
                        <span>Heure dorée du matin</span>
                        <b>
                          {t(sun.day.goldenMorning[0])} – {t(sun.day.goldenMorning[1])}
                        </b>
                      </div>
                      <div className="reading">
                        <span>Heure dorée du soir</span>
                        <b>
                          {t(sun.day.goldenEvening[0])} – {t(sun.day.goldenEvening[1])}
                        </b>
                      </div>
                      <div className="reading">
                        <span>Aube · crépuscule civils</span>
                        <b>
                          {t(sun.day.dawn)} · {t(sun.day.dusk)}
                        </b>
                      </div>
                    </>
                  )}
                </div>
              )}
              {sun.planBearing !== null && cams.length > 0 && sun.pos.elevation > 0 && (
                <div className="light-readings" aria-label="Soleil et caméras">
                  {cams.map((c) => {
                    const rel = sunForCamera(c.rotation, sun.planBearing!, sun.pos.elevation);
                    if (!rel) return null;
                    const lab = c.planId ? cameraLabel(doc, c.planId, c.setupId, numbers).code : 'Caméra';
                    return (
                      <div key={c.id} className="reading">
                        <span className="mono">{lab}</span>
                        <b>{rel}</b>
                      </div>
                    );
                  })}
                </div>
              )}
              <label className="field">
                Fuseau horaire
                <TimeZoneSelect />
              </label>
              <Explain id="sun-calc" label="Heures, limites et précision">
                Heures de {tz.replace(/_/g, ' ')}. Horizon dégagé : relief et bâtiments ne sont pas pris en compte. Heure dorée : soleil entre 6° et −4°. Calcul
                NOAA, vérifié contre la référence NREL SPA (moins de 0,05°, moins d’une minute).
              </Explain>
            </>
          )}
        </>
      )}
    </>
  );
}
