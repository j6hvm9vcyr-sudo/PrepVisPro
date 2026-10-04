import { useMemo } from 'react';
import { useApp } from '../state/appStore';
import { selectCursor, selectDoc } from '../state/store';
import { computeNumbers } from '../model/numbering';
import { missingFields } from '../model/completeness';
import { coverImage } from '../model/images';
import { displayText } from '../model/entry';
import { imageStore } from '../platform/images';
import { sequenceTitle, stripColors } from './strip';
import { filmFlow } from '../model/stamps';
import { StampBand } from './StampBand';

export function CardsView() {
  const doc = useApp(selectDoc);
  const cursor = useApp(selectCursor);
  const onlyIncomplete = useApp((s) => s.onlyIncomplete);
  const numbers = useMemo(() => computeNumbers(doc), [doc]);
  const st = useApp.getState;
  return (
    <div className="cards">
      {filmFlow(doc).map((it) => {
        if (it.kind === 'stamp') return onlyIncomplete ? null : <StampBand key={it.stamp.id} stamp={it.stamp} />;
        const s = it.seq;
        const c = stripColors(s);
        const plans = onlyIncomplete ? s.plans.filter((p) => missingFields(p, doc.settings).length) : s.plans;
        if (!plans.length) return null;
        return (
          <section key={s.id}>
            <div className="grp-h">
              <span className="strip wide" style={{ background: c.fill, borderColor: c.edge }} />
              <b className="mono">SÉQ. {s.number || '?'}</b>
              <span style={{ fontWeight: 600 }}>{sequenceTitle(s)}</span>
            </div>
            <div className="grid-cards">
              {plans.map((p) => {
                const cov = coverImage(p);
                const url = cov ? imageStore.url(cov.file) : null;
                const miss = missingFields(p, doc.settings).length > 0;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`card ${cursor?.planId === p.id ? 'sel' : ''}`}
                    onClick={() => st().setCursor({ planId: p.id, setupId: p.cameras[0]!.id, col: cursor?.col ?? 'size' })}
                    onDoubleClick={() => st().setView('table')}
                  >
                    <span className="pic">{url ? <img src={url} alt="" draggable={false} /> : 'Pas encore d’image'}</span>
                    <span className="body">
                      <span className="h">
                        <span className="dot" style={{ background: miss ? 'var(--warn)' : 'var(--ok)', width: 7, height: 7 }} />
                        <b className="mono">{numbers.get(p.id)!.code}</b>
                        <span className="mono" style={{ fontSize: 11, color: 'var(--text3)' }}>
                          n° {numbers.get(p.id)!.global}
                        </span>
                      </span>
                      <span className="act">{p.action || '—'}</span>
                      {p.cameras.map((cs) => {
                        const label = doc.settings.cameras.find((k) => k.id === cs.cameraId)?.label;
                        const bits = (['size', 'axis', 'angle', 'focal', 'movement', 'grip'] as const).map((f) => displayText(f, cs)).filter(Boolean);
                        return (
                          <span className="sum mono" key={cs.id}>
                            {p.cameras.length > 1 ? `${label} · ` : ''}
                            {bits.join(' · ') || '—'}
                          </span>
                        );
                      })}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
