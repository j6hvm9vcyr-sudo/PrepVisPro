/** Réglages › Mon matériel : ce qui est gardé sur ce Mac pour tous les projets. */
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import { addFromKit, inProject, kitLabel, removeFromKit, type KitKind } from '../model/kit';
import { updateKit, useKit } from '../platform/kit';
import { formatNumber, plural } from '../model/text';
import { TERM_CATEGORIES } from '../model/types';
import { itemDetail } from './KitControls';

const SECTIONS: [KitKind, string][] = [
  ['cameras', 'Caméras'],
  ['lenses', 'Optiques'],
  ['fixtures', 'Projecteurs'],
  ['reflectors', 'Matières de réflecteurs (mesurées)'],
];

const sameTerms = (a: Record<string, string[]>, b: Record<string, string[]>) => TERM_CATEGORIES.every((c) => (a[c] ?? []).join('\u0000') === (b[c] ?? []).join('\u0000'));

export function KitTab() {
  const doc = useApp(selectDoc);
  const { kit, status, error } = useKit();
  const st = useApp.getState;
  const run = async (fn: Parameters<typeof updateKit>[0], ok: string) => {
    const r = await updateKit(fn);
    st().setMessage(r.ok ? ok : r.error, r.ok ? undefined : 'warn');
  };
  const e = doc.settings.exposure;
  const termCount = (t: Record<string, string[]>) => TERM_CATEGORIES.reduce((n, c) => n + (t[c]?.length ?? 0), 0);

  return (
    <div className="kit">
      <p className="note" style={{ margin: 0 }}>
        Gardé sur ce Mac, commun à tous vos projets. Un élément ajouté à un projet y est copié : le modifier dans le projet ne change pas Mon matériel. Pour remplir
        cette liste : « Enregistrer dans mon matériel » dans Caméras, Optiques et l’onglet Lumière des plans au sol.
      </p>
      {status === 'error' && <p className="kit-error">{error}</p>}

      {SECTIONS.map(([kind, title]) => {
        const items = kit[kind];
        return (
          <section key={kind} className="kit-sec" aria-label={title}>
            <h4>
              {title} <span className="note">{items.length || ''}</span>
            </h4>
            {items.length === 0 && <p className="note kit-empty">Rien d’enregistré.</p>}
            {items.map((it) => {
              const here = inProject(doc, kind, it as never);
              return (
                <div key={it.id} className="kit-item">
                  <span className="kit-name">
                    {kitLabel(kind, it as never)}
                    <small>{itemDetail(kind, it)}</small>
                  </span>
                  {here ? (
                    <span className="note kit-here">Dans ce projet</span>
                  ) : (
                    <button
                      type="button"
                      className="linkbtn"
                      onClick={() => {
                        const r = addFromKit(selectDoc(st()), kind, it as never);
                        st().applyDoc(r.doc, `${kitLabel(kind, it as never)} ajouté au projet`);
                      }}
                    >
                      Ajouter au projet
                    </button>
                  )}
                  <button type="button" className="linkbtn danger" aria-label={`Retirer ${kitLabel(kind, it as never)} de mon matériel`} onClick={() => void run((k) => removeFromKit(k, kind, it.id), 'Retiré de Mon matériel')}>
                    Retirer
                  </button>
                </div>
              );
            })}
          </section>
        );
      })}

      <section className="kit-sec" aria-label="Réglages de départ des nouveaux projets">
        <h4>Réglages de départ des nouveaux projets</h4>
        <div className="kit-item">
          <span className="kit-name">
            Listes de termes
            <small>{kit.terms ? `les vôtres (${plural(termCount(kit.terms), 'terme', 'termes')})` : 'celles de l’application'}</small>
          </span>
          <button
            type="button"
            className="linkbtn"
            disabled={status !== 'ready' || (!!kit.terms && sameTerms(kit.terms, doc.settings.terms))}
            onClick={() => void run((k) => ({ ...k, terms: structuredClone(doc.settings.terms) }), 'Listes de termes de ce projet gardées pour les nouveaux projets')}
          >
            {kit.terms && sameTerms(kit.terms, doc.settings.terms) ? 'Identiques à ce projet ✓' : 'Prendre celles de ce projet'}
          </button>
          {kit.terms && (
            <button type="button" className="linkbtn danger" onClick={() => void run((k) => ({ ...k, terms: null }), 'Les nouveaux projets reprendront les listes de l’application')}>
              Revenir à celles de l’application
            </button>
          )}
        </div>
        <div className="kit-item">
          <span className="kit-name">
            Exposition (calcul des diaphs)
            <small>{kit.exposure ? `${formatNumber(kit.exposure.iso)} ISO · ${formatNumber(kit.exposure.fps)} i/s · ${formatNumber(kit.exposure.shutterDeg)}°` : 'celle de l’application (800 ISO · 24 i/s · 180°)'}</small>
          </span>
          <button
            type="button"
            className="linkbtn"
            disabled={status !== 'ready' || (!!kit.exposure && kit.exposure.iso === e.iso && kit.exposure.fps === e.fps && kit.exposure.shutterDeg === e.shutterDeg)}
            onClick={() => void run((k) => ({ ...k, exposure: { ...e } }), 'Exposition de ce projet gardée pour les nouveaux projets')}
          >
            {kit.exposure && kit.exposure.iso === e.iso && kit.exposure.fps === e.fps && kit.exposure.shutterDeg === e.shutterDeg ? 'Identique à ce projet ✓' : `Prendre celle de ce projet (${formatNumber(e.iso)} ISO · ${formatNumber(e.fps)} i/s · ${formatNumber(e.shutterDeg)}°)`}
          </button>
          {kit.exposure && (
            <button type="button" className="linkbtn danger" onClick={() => void run((k) => ({ ...k, exposure: null }), 'Les nouveaux projets reprendront l’exposition de l’application')}>
              Revenir à celle de l’application
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
