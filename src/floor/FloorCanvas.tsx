import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import { bearing, computeScale, distance, normalizeDeg, type FloorElement, type FloorPlan, type Point } from '../model/floor';
import { addElements, deleteElements, moveElements, updateElement, updateFloorPlan } from '../model/floorOps';
import { computeNumbers } from '../model/numbering';
import { newId } from '../model/defaults';
import { imageStore } from '../platform/images';
import { formatNumber } from '../model/text';
import { ACTOR_COLORS, useFloor, type Viewport } from './floorStore';
import { FloorMarkers, FloorScene } from './FloorScene';
import { useLateFocus } from '../ui/focus';


type Drag =
  | { kind: 'move'; ids: string[]; start: Point; base: ReturnType<typeof selectDoc>; key: string; moved: boolean }
  | { kind: 'rotate'; id: string; base: ReturnType<typeof selectDoc>; key: string }
  | { kind: 'pan'; startClient: Point; startVp: Viewport };

function fitViewport(fp: FloorPlan, w: number, h: number): Viewport {
  let x0 = 0;
  let y0 = 0;
  let x1 = 1000;
  let y1 = 700;
  if (fp.background) {
    x1 = fp.background.width;
    y1 = fp.background.height;
  } else if (fp.elements.length) {
    const xs = fp.elements.map((e) => e.at.x);
    const ys = fp.elements.map((e) => e.at.y);
    x0 = Math.min(...xs) - 200;
    y0 = Math.min(...ys) - 200;
    x1 = Math.max(...xs) + 200;
    y1 = Math.max(...ys) + 200;
  }
  const zoom = Math.min(w / (x1 - x0), h / (y1 - y0)) * 0.92;
  return { zoom, x: x0 - (w / zoom - (x1 - x0)) / 2, y: y0 - (h / zoom - (y1 - y0)) / 2 };
}

/** Barre d'échelle : longueur ronde (0,5 / 1 / 2 / 5 / 10… m) proche de 120 px. */
function scaleBar(metersPerUnit: number, zoom: number): { px: number; label: string } {
  const mPerPx = metersPerUnit / zoom;
  const target = 120 * mPerPx;
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
  const m = steps.find((s) => s >= target * 0.6) ?? 500;
  return { px: m / mPerPx, label: `${formatNumber(m)} m` };
}

export function FloorCanvas({ fp }: { fp: FloorPlan }) {
  const doc = useApp(selectDoc);
  const ui = useFloor();
  const wrap = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 900, h: 600 });
  const [hover, setHover] = useState<Point | null>(null);
  const [scaleInput, setScaleInput] = useState<string | null>(null);
  const drag = useRef<Drag | null>(null);
  const numbers = useMemo(() => computeNumbers(doc), [doc]);
  const vp = ui.viewports[fp.id] ?? fitViewport(fp, size.w, size.h);
  const k = 1 / vp.zoom;
  const setVp = useCallback((v: Viewport) => useFloor.getState().set({ viewports: { ...useFloor.getState().viewports, [fp.id]: v } }), [fp.id]);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    wrap.current?.focus({ preventScroll: true });
  }, [fp.id]);

  const world = (clientX: number, clientY: number): Point => {
    const r = svg.current!.getBoundingClientRect();
    return { x: vp.x + (clientX - r.left) / vp.zoom, y: vp.y + (clientY - r.top) / vp.zoom };
  };

  const apply = (next: ReturnType<typeof selectDoc>, message?: string, key?: string) => useApp.getState().applyDoc(next, message, key);
  const docNow = () => selectDoc(useApp.getState());

  const bgUrl = fp.background ? imageStore.url(fp.background.file) : null;

  // ---------------------------------------------------------------- création d'éléments
  const place = (p: Point) => {
    const st = useFloor.getState();
    let el: FloorElement | null = null;
    if (st.tool === 'camera' || st.placing) {
      el = { id: newId('fe'), kind: 'camera', at: p, rotation: 0, planId: st.placing?.planId ?? null, setupId: st.placing?.setupId ?? null, showFov: true, path: [] };
    } else if (st.tool === 'actor') {
      const n = fp.elements.filter((e) => e.kind === 'actor').length;
      el = { id: newId('fe'), kind: 'actor', at: p, rotation: 180, name: `Personnage ${n + 1}`, color: ACTOR_COLORS[n % ACTOR_COLORS.length]!, path: [] };
    } else if (st.tool === 'text') {
      el = { id: newId('fe'), kind: 'text', at: p, rotation: 0, text: 'Texte', size: 14 };
    }
    if (!el) return;
    apply(addElements(docNow(), fp.id, [el]), el.kind === 'camera' ? 'Caméra placée' : el.kind === 'actor' ? 'Personnage ajouté' : 'Texte ajouté');
    st.set({ selection: [el.id], tool: 'select', placing: null });
  };

  // ---------------------------------------------------------------- souris / trackpad
  const onPointerDown = (e: RPointerEvent) => {
    wrap.current?.focus({ preventScroll: true });
    if (e.button === 1 || (e.button === 0 && e.altKey && !e.shiftKey)) {
      drag.current = { kind: 'pan', startClient: { x: e.clientX, y: e.clientY }, startVp: vp };
      (e.target as Element).setPointerCapture?.(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    const p = world(e.clientX, e.clientY);
    const st = useFloor.getState();
    const target = (e.target as Element).closest('[data-el]');
    const handle = (e.target as Element).closest('[data-rotate]');

    if (st.tool === 'scale' || st.tool === 'measure') {
      const draft = st.draft.length >= 2 ? [p] : [...st.draft, p];
      st.set({ draft });
      if (st.tool === 'scale' && draft.length === 2) setScaleInput(fp.scale ? formatNumber(fp.scale.meters) : '');
      return;
    }
    if (st.tool === 'path' && st.pathFor) {
      const id = st.pathFor;
      apply(
        updateElement(docNow(), fp.id, id, (el) => {
          if ('path' in el) el.path.push(p);
        }),
        undefined,
        `path-${id}`,
      );
      return;
    }
    if (st.tool !== 'select' || st.placing) {
      place(p);
      return;
    }
    if (handle) {
      const id = handle.getAttribute('data-rotate')!;
      drag.current = { kind: 'rotate', id, base: docNow(), key: `rot-${id}-${Date.now()}` };
      (e.target as Element).setPointerCapture?.(e.pointerId);
      return;
    }
    if (target) {
      const id = target.getAttribute('data-el')!;
      let selection = st.selection;
      if (e.shiftKey) selection = selection.includes(id) ? selection.filter((x) => x !== id) : [...selection, id];
      else if (!selection.includes(id)) selection = [id];
      st.set({ selection });
      if (selection.includes(id)) {
        drag.current = { kind: 'move', ids: selection, start: p, base: docNow(), key: `move-${Date.now()}`, moved: false };
        (e.target as Element).setPointerCapture?.(e.pointerId);
      }
      return;
    }
    // Fond : on désélectionne, et on fait glisser la vue.
    st.set({ selection: [] });
    drag.current = { kind: 'pan', startClient: { x: e.clientX, y: e.clientY }, startVp: vp };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: RPointerEvent) => {
    const p = world(e.clientX, e.clientY);
    setHover(p);
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'pan') {
      setVp({ ...d.startVp, x: d.startVp.x - (e.clientX - d.startClient.x) / vp.zoom, y: d.startVp.y - (e.clientY - d.startClient.y) / vp.zoom });
    } else if (d.kind === 'move') {
      const dx = p.x - d.start.x;
      const dy = p.y - d.start.y;
      if (!d.moved && Math.hypot(dx, dy) * vp.zoom < 3) return;
      d.moved = true;
      apply(moveElements(d.base, fp.id, d.ids, dx, dy), undefined, d.key);
    } else if (d.kind === 'rotate') {
      const el = d.base.floorPlans.find((x) => x.id === fp.id)?.elements.find((x) => x.id === d.id);
      if (!el) return;
      let deg = bearing(el.at, p);
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      apply(
        updateElement(d.base, fp.id, d.id, (x) => {
          x.rotation = normalizeDeg(Math.round(deg));
        }),
        undefined,
        d.key,
      );
    }
  };

  const onPointerUp = () => {
    drag.current = null;
  };

  // Défilement à deux doigts : déplacer ; pincer (ou ⌘ + molette) : zoomer autour du pointeur.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cur = useFloor.getState().viewports[fp.id] ?? vp;
      if (e.ctrlKey || e.metaKey) {
        const r = svg.current!.getBoundingClientRect();
        const mx = cur.x + (e.clientX - r.left) / cur.zoom;
        const my = cur.y + (e.clientY - r.top) / cur.zoom;
        const zoom = Math.min(40, Math.max(0.02, cur.zoom * Math.exp(-e.deltaY * 0.01)));
        setVp({ zoom, x: mx - (e.clientX - r.left) / zoom, y: my - (e.clientY - r.top) / zoom });
      } else {
        setVp({ ...cur, x: cur.x + e.deltaX / cur.zoom, y: cur.y + e.deltaY / cur.zoom });
      }
    };
    // Safari (app Mac) : le pincement du trackpad arrive en « gesture », pas en molette + ctrl.
    let last = 1;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      last = 1;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const g = e as Event & { scale: number; clientX: number; clientY: number };
      const cur = useFloor.getState().viewports[fp.id] ?? vp;
      const f = g.scale / last;
      last = g.scale;
      if (!(f > 0) || !Number.isFinite(f)) return;
      const r = svg.current!.getBoundingClientRect();
      const cx = g.clientX ?? r.left + r.width / 2;
      const cy = g.clientY ?? r.top + r.height / 2;
      const mx = cur.x + (cx - r.left) / cur.zoom;
      const my = cur.y + (cy - r.top) / cur.zoom;
      const zoom = Math.min(40, Math.max(0.02, cur.zoom * f));
      setVp({ zoom, x: mx - (cx - r.left) / zoom, y: my - (cy - r.top) / zoom });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('gesturestart', onGestureStart, { passive: false } as AddEventListenerOptions);
    el.addEventListener('gesturechange', onGestureChange, { passive: false } as AddEventListenerOptions);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('gesturestart', onGestureStart);
      el.removeEventListener('gesturechange', onGestureChange);
    };
  }, [fp.id, vp, setVp]);

  const zoomBy = (f: number) => {
    const cx = vp.x + size.w / vp.zoom / 2;
    const cy = vp.y + size.h / vp.zoom / 2;
    const zoom = Math.min(40, Math.max(0.02, vp.zoom * f));
    setVp({ zoom, x: cx - size.w / zoom / 2, y: cy - size.h / zoom / 2 });
  };

  // ---------------------------------------------------------------- clavier
  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    const st = useFloor.getState();
    const meta = e.metaKey || e.ctrlKey;
    const sel = st.selection;
    if (e.key === 'Escape') {
      e.preventDefault();
      if (st.tool !== 'select' || st.placing || st.draft.length) st.set({ tool: 'select', placing: null, draft: [], pathFor: null });
      else st.set({ selection: [] });
      setScaleInput(null);
      return;
    }
    // Texte sélectionné : la frappe va dans le texte (y compris juste après l'avoir posé).
    const only = sel.length === 1 ? fp.elements.find((x) => x.id === sel[0]) : undefined;
    if (only?.kind === 'text' && e.key.length === 1 && !meta && !e.altKey) {
      e.preventDefault();
      const base = only.text === 'Texte' ? '' : only.text;
      apply(updateElement(docNow(), fp.id, only.id, (x) => void (x.kind === 'text' && (x.text = base + e.key))), undefined, `text-${only.id}`);
      requestAnimationFrame(() => {
        const input = document.querySelector<HTMLInputElement>('[data-floor-text]');
        if (input) {
          input.focus({ preventScroll: true });
          input.setSelectionRange(input.value.length, input.value.length);
        }
      });
      return;
    }
    if (e.key === 'Enter' && st.tool === 'path') {
      e.preventDefault();
      st.set({ tool: 'select', pathFor: null });
      return;
    }
    if ((e.key === 'Backspace' || e.key === 'Delete') && sel.length) {
      e.preventDefault();
      apply(deleteElements(docNow(), fp.id, sel), `${sel.length} élément${sel.length > 1 ? 's' : ''} supprimé${sel.length > 1 ? 's' : ''} · ⌘Z pour annuler`);
      st.set({ selection: [] });
      return;
    }
    if (e.key.startsWith('Arrow') && sel.length) {
      e.preventDefault();
      const step = (e.shiftKey ? 10 : 1) / vp.zoom;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      apply(moveElements(docNow(), fp.id, sel, dx, dy), undefined, `nudge-${sel.join()}`);
      return;
    }
    if (meta && e.key.toLowerCase() === 'd' && sel.length) {
      e.preventDefault();
      const src = fp.elements.filter((x) => sel.includes(x.id));
      const off = 24 / vp.zoom;
      const copies = src.map((x) => {
        const c = structuredClone(x) as FloorElement;
        c.id = newId('fe');
        c.at = { x: x.at.x + off, y: x.at.y + off };
        if ('path' in c) c.path = c.path.map((q) => ({ x: q.x + off, y: q.y + off }));
        if (c.kind === 'camera') {
          c.planId = null;
          c.setupId = null;
        }
        return c;
      });
      apply(addElements(docNow(), fp.id, copies), 'Dupliqué');
      st.set({ selection: copies.map((c) => c.id) });
      return;
    }
    if (meta || e.altKey) return;
    if ((e.key === 'r' || e.key === 'R') && sel.length) {
      e.preventDefault();
      let d = docNow();
      for (const id of sel) d = updateElement(d, fp.id, id, (x) => void (x.rotation = normalizeDeg(x.rotation + (e.shiftKey ? -15 : 15))));
      apply(d, undefined, `rot-key-${sel.join()}`);
      return;
    }
    const tools: Record<string, typeof st.tool> = { v: 'select', c: 'camera', p: 'actor', t: 'text', e: 'scale', m: 'measure' };
    const t = tools[e.key.toLowerCase()];
    if (t) {
      e.preventDefault();
      st.set({ tool: t, draft: [], placing: null });
      return;
    }
    // « 0 » : sur un clavier AZERTY la touche donne « à » sans Maj.
    if (e.key === '0' || e.code === 'Digit0' || e.code === 'Numpad0') {
      e.preventDefault();
      setVp(fitViewport(fp, size.w, size.h));
    }
    if (e.key === '+' || e.key === '=') zoomBy(1.25);
    if (e.key === '-') zoomBy(0.8);
  };

  // ---------------------------------------------------------------- dessin
  // Outils échelle / mesure.
  const draftLine = (() => {
    if (ui.tool !== 'scale' && ui.tool !== 'measure') return null;
    const a = ui.draft[0];
    const b = ui.draft[1] ?? hover;
    if (!a || !b) return null;
    const m = fp.scale ? distance(a, b) * fp.scale.metersPerUnit : null;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    return (
      <g pointerEvents="none">
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#E5484D" strokeWidth={2 * k} />
        <circle cx={a.x} cy={a.y} r={4 * k} fill="#E5484D" />
        <circle cx={b.x} cy={b.y} r={4 * k} fill="#E5484D" />
        {ui.tool === 'measure' && (
          <text x={mid.x} y={mid.y - 8 * k} fontSize={13 * k} fontWeight={700} textAnchor="middle" fill="#E5484D" stroke="#fff" strokeWidth={3 * k} paintOrder="stroke">
            {m !== null ? `${formatNumber(Math.round(m * 100) / 100)} m` : 'mettez le plan à l’échelle (E)'}
          </text>
        )}
      </g>
    );
  })();

  const bar = fp.scale ? scaleBar(fp.scale.metersPerUnit, vp.zoom) : null;
  const cursor = ui.tool === 'select' && !ui.placing ? 'default' : 'crosshair';

  return (
    <div ref={wrap} className="floor-canvas" tabIndex={0} onKeyDown={onKeyDown} aria-label="Plan au sol" role="application" style={{ cursor }}>
      <svg
        ref={svg}
        width="100%"
        height="100%"
        viewBox={`${vp.x} ${vp.y} ${size.w / vp.zoom} ${size.h / vp.zoom}`}
        onPointerDown={onPointerDown}
        // Le focus est déjà donné au plan (ou au champ qui vient d'apparaître) : le navigateur ne doit pas le reprendre.
        onMouseDown={(e) => e.preventDefault()}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setHover(null)}
        onDoubleClick={() => {
          if (useFloor.getState().tool === 'path') useFloor.getState().set({ tool: 'select', pathFor: null });
        }}
      >
        <defs>
          <pattern id="grid" width={50} height={50} patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" style={{ stroke: 'var(--border-soft)' }} strokeWidth={1 * k} />
          </pattern>
          <FloorMarkers />
        </defs>
        <rect x={vp.x} y={vp.y} width={size.w / vp.zoom} height={size.h / vp.zoom} style={{ fill: fp.background ? 'var(--thumb)' : 'url(#grid)' }} />
        {fp.background && bgUrl && <image href={bgUrl} x={0} y={0} width={fp.background.width} height={fp.background.height} opacity={fp.background.opacity} />}
        <FloorScene doc={doc} fp={fp} k={k} numbers={numbers} selection={ui.selection} urlFor={(f) => imageStore.url(f)} />
        {draftLine}
      </svg>

      {bar && (
        <div className="floor-scalebar" aria-label={`Échelle : ${bar.label}`}>
          <div style={{ width: bar.px }} />
          <span>{bar.label}</span>
        </div>
      )}
      <div className="floor-zoom">
        <button type="button" onClick={() => zoomBy(0.8)} aria-label="Dézoomer">
          −
        </button>
        <button type="button" onClick={() => setVp(fitViewport(fp, size.w, size.h))} aria-label="Tout afficher" title="Tout afficher (0)">
          ⤢
        </button>
        <button type="button" onClick={() => zoomBy(1.25)} aria-label="Zoomer">
          +
        </button>
      </div>

      {scaleInput !== null && ui.draft.length === 2 && (
        <form
          className="floor-pop"
          onSubmit={(e) => {
            e.preventDefault();
            const m = Number(scaleInput.replace(',', '.'));
            const s = computeScale(ui.draft[0]!, ui.draft[1]!, m);
            if (!s) return;
            apply(updateFloorPlan(docNow(), fp.id, (x) => void (x.scale = s)), `Plan mis à l’échelle : ${formatNumber(m)} m`);
            setScaleInput(null);
            useFloor.getState().set({ tool: 'select', draft: [] });
            wrap.current?.focus();
          }}
        >
          <label>
            Distance réelle entre les deux points
            <span className="row" style={{ alignItems: 'center', gap: 6 }}>
              <ScaleField value={scaleInput} onChange={setScaleInput} />
              m
            </span>
          </label>
          <div className="row">
            <button type="button" className="btn" onClick={() => (setScaleInput(null), useFloor.getState().set({ draft: [] }))}>
              Annuler
            </button>
            <button type="submit" className="btn primary" disabled={!(Number(scaleInput.replace(',', '.')) > 0)}>
              Valider
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function ScaleField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useLateFocus<HTMLInputElement>(null, true);
  return <input ref={ref} value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" aria-label="Distance en mètres" style={{ width: 90 }} />;
}
