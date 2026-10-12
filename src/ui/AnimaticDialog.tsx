/**
 * Animatique pour le montage (0.22) : les plans minutés, bout à bout, avec leur image ; écrits dans un
 * dossier neuf (images + timeline) à ouvrir dans DaVinci Resolve ou Final Cut Pro.
 */
import { useMemo, useState } from 'react';
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import { ANIMATIC_RATES, animaticEvents, FRAME, parseAspect, rateOf, type AnimaticRate } from '../model/animatic';
import { formatDuration, parseDuration } from '../model/duration';
import { stripColors } from './strip';
import { imageStore } from '../platform/images';
import { getBackend } from '../platform/backend';
import type { AnimaticResult, AnimaticTarget } from '../export/animatic';
import { focusGrid, useDialogFocus } from './focus';
import { Info } from './Info';
import { Picker } from './Picker';

/** Largeur d'une seconde dans l'aperçu (px), réduite pour un long film. */
function pxPerSecond(total: number): number {
  return Math.max(3, Math.min(22, 1000 / Math.max(1, total)));
}

export function AnimaticDialog({ onClose }: { onClose: () => void }) {
  const doc = useApp(selectDoc);
  const st = useApp.getState;
  const dlg = useDialogFocus<HTMLDivElement>();
  const [target, setTarget] = useState<AnimaticTarget>('otio');
  const [rate, setRate] = useState<AnimaticRate | null>(() => rateOf(doc.settings.exposure.fps));
  const [withProvisional, setWithProvisional] = useState(false);
  const [provisionalText, setProvisionalText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<AnimaticResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parsed = parseDuration(provisionalText);
  const provisionalS = withProvisional && parsed.ok ? parsed.seconds : null;
  const provisionalError = withProvisional ? (!parsed.ok ? parsed.error : parsed.seconds === null ? 'Durée à donner' : null) : null;
  const { events, missing } = useMemo(() => animaticEvents(doc, provisionalS), [doc, provisionalS]);
  const total = events.reduce((n, e) => n + e.seconds, 0);
  const seqs = useMemo(() => new Map(doc.sequences.map((s) => [s.id, stripColors(s)])), [doc.sequences]);
  const aspect = parseAspect(doc.meta.aspectRatio);
  const px = pxPerSecond(total);
  const projectFps = doc.settings.exposure.fps;

  const close = () => {
    if (busy) return;
    onClose();
    focusGrid();
  };
  const run = async () => {
    if (!rate) return;
    setResult(null);
    setError(null);
    const parent = await (await getBackend()).pickFolder('Où créer l’animatique ?');
    if (!parent) return;
    setBusy('Préparation…');
    try {
      const { writeAnimatic } = await import('../export/animatic');
      const r = await writeAnimatic(doc, parent, { rate, target, provisionalS }, (done, n) => setBusy(`Image ${done} / ${n}`));
      setResult(r);
      st().setMessage(`Animatique créée : ${r.plans} plan${r.plans > 1 ? 's' : ''}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      ref={dlg}
      tabIndex={-1}
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Animatique pour le montage"
      onClick={close}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') close();
      }}
    >
      <div className="dialog animatic" onClick={(e) => e.stopPropagation()}>
        <div className="export-head">
          <h3>Animatique pour le montage</h3>
          <Info title="Animatique">
            <span>Les plans minutés, dans l’ordre du film, chacun avec sa durée et son image (repérage, sinon référence), au format du film ; sans image, un carton avec son numéro et son action.</span>
            <span>Un dossier neuf est créé : les images (1920×1080) dans « images », et la timeline à ouvrir au montage. Chaque clip porte le numéro du plan (1/2). Une reprise a la durée de son plan.</span>
            <span>DaVinci Resolve : Fichier › Importer › Timeline. Final Cut Pro : Fichier › Importer › XML. Gardez le dossier tel quel : la timeline y retrouve ses images.</span>
          </Info>
          <span className="spacer" />
          <span className="note">
            {events.length} plan{events.length > 1 ? 's' : ''} · {formatDuration(total)}
            {missing.length > 0 && ` · ${missing.length} sans durée`}
          </span>
          <button type="button" className="btn" onClick={close} disabled={!!busy}>
            Fermer
          </button>
        </div>

        <div className="anim-strip" aria-label="Aperçu de l’animatique">
          {events.length === 0 && <div className="empty-line">Aucun plan minuté : donnez une durée aux plans (colonne Durée), ou une durée provisoire.</div>}
          {events.map((ev) => {
            const url = ev.imageFile ? imageStore.url(ev.imageFile) : null;
            const strip = seqs.get(ev.seqId);
            return (
              <div key={ev.planId} className={`anim-clip ${ev.provisional ? 'provisional' : ''}`} style={{ width: Math.max(28, ev.seconds * px) }} title={`${ev.code} · ${formatDuration(ev.seconds)}${ev.provisional ? ' (provisoire)' : ''} — ${ev.action}`}>
                <i className="anim-band" style={{ background: strip?.fill, borderColor: strip?.edge }} />
                <span className="anim-pic" style={url ? { backgroundImage: `url("${url}")` } : undefined} />
                <span className="anim-label mono">{ev.code}</span>
              </div>
            );
          })}
        </div>

        <div className="anim-opts">
          <section className="sec" aria-label="Plans sans durée">
            <div className="sec-h">Plans sans durée</div>
            {missing.length === 0 ? (
              <span className="note">Tous les plans sont minutés.</span>
            ) : (
              <>
                <span className="note warn-text">{missing.map((m) => m.code).join(', ')}</span>
                <label className="check">
                  <input type="radio" name="anim-missing" checked={!withProvisional} onChange={() => setWithProvisional(false)} />
                  Laissés de côté
                </label>
                <label className="check">
                  <input type="radio" name="anim-missing" checked={withProvisional} onChange={() => setWithProvisional(true)} />
                  Durée provisoire
                  <input
                    type="text"
                    className="anim-sec"
                    aria-label="Durée provisoire"
                    placeholder="4"
                    value={provisionalText}
                    onFocus={() => setWithProvisional(true)}
                    onChange={(e) => setProvisionalText(e.target.value)}
                  />
                </label>
                {provisionalError ? <span className="note warn-text">{provisionalError}</span> : withProvisional && <span className="note">Marqués « durée à fixer » sur l’image.</span>}
              </>
            )}
          </section>
          <section className="sec" aria-label="Cadence">
            <div className="sec-h">Cadence de la timeline</div>
            <Picker label="Cadence de la timeline" value={rate?.id ?? ''} groups={[{ items: ANIMATIC_RATES.map((r) => ({ id: r.id, label: `${r.label} i/s` })) }]} onPick={(id) => setRate(ANIMATIC_RATES.find((r) => r.id === id) ?? null)}>
              {rate ? `${rate.label} i/s` : 'À choisir'}
            </Picker>
            <span className="note">{rateOf(projectFps) ? `Réglages du projet : ${String(projectFps).replace('.', ',')} i/s` : `Réglages du projet : ${String(projectFps).replace('.', ',')} i/s, pas une cadence de timeline`}</span>
          </section>
          <section className="sec" aria-label="Pour">
            <div className="sec-h">Pour</div>
            <label className="check">
              <input type="radio" name="anim-target" checked={target === 'otio'} onChange={() => setTarget('otio')} />
              DaVinci Resolve <span className="note">OpenTimelineIO (.otio)</span>
            </label>
            <label className="check">
              <input type="radio" name="anim-target" checked={target === 'fcpxml'} onChange={() => setTarget('fcpxml')} />
              Final Cut Pro <span className="note">FCPXML (.fcpxml)</span>
            </label>
          </section>
        </div>

        <div className="pub-foot">
          {error && (
            <div className="welcome-error" role="alert">
              Animatique impossible : {error}
            </div>
          )}
          {result && (
            <div className="pub-done" role="status">
              Animatique créée : {result.folder}
              {result.failedImages.length > 0 && <div className="warn-text">Images illisibles, remplacées par un carton : {result.failedImages.join(', ')}</div>}
              <button type="button" className="linkbtn" onClick={() => void getBackend().then((b) => b.openFile(result.folder))}>
                Ouvrir le dossier
              </button>
            </div>
          )}
          <span className="spacer" />
          <span className="note">
            {FRAME.width}×{FRAME.height} · {aspect ? `image ${doc.meta.aspectRatio.trim()}` : 'image 16/9 (format du film non renseigné)'}
          </span>
          {busy && <span className="note">{busy}</span>}
          <button type="button" className="btn primary" disabled={!!busy || !rate || events.length === 0 || !!provisionalError} onClick={() => void run()}>
            {busy ? 'Création…' : 'Créer l’animatique…'}
          </button>
        </div>
      </div>
    </div>
  );
}
