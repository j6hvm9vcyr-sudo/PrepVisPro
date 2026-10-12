/** Un plan au sol en PNG ou en PDF (Partager › Fichier, 0.24). */
import { useState } from 'react';
import { useApp } from '../state/appStore';
import { selectDoc } from '../state/store';
import type { FloorPlan } from '../model/floor';

export function FloorExportButtons({ fp }: { fp: FloorPlan }) {
  const [busy, setBusy] = useState<'png' | 'pdf' | null>(null);
  const empty = !fp.background && fp.elements.length === 0;
  const run = async (ext: 'png' | 'pdf') => {
    setBusy(ext);
    const st = useApp.getState();
    const doc = selectDoc(st);
    try {
      const svc = await import('../export/service');
      const built = ext === 'png' ? { bytes: (await svc.floorPng(doc, fp)).bytes, failedFloors: [] as string[] } : await svc.buildFloorPdf(doc, [fp]);
      if (built.failedFloors?.length) throw new Error(built.failedFloors[0]);
      const path = await svc.saveFloorExport(doc, ext, built.bytes, `Plan au sol ${fp.name.replace(/[\\/:*?"<>|]+/g, '-')}`);
      if (path) st.setMessage(`Plan exporté : ${path.split('/').pop()}`);
    } catch (e) {
      st.setMessage(`Export du plan impossible : ${e instanceof Error ? e.message : String(e)}`, 'warn');
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="seg" role="group" aria-label="Exporter ce plan au sol">
      <button type="button" disabled={!!busy || empty} onClick={() => void run('png')} aria-label="Plan au sol en PNG" title="Exporter ce plan en image PNG">
        {busy === 'png' ? 'Export…' : 'PNG'}
      </button>
      <button type="button" disabled={!!busy || empty} onClick={() => void run('pdf')} aria-label="Plan au sol en PDF" title="Exporter ce plan en PDF (avec la légende des caméras)">
        {busy === 'pdf' ? 'Export…' : 'PDF'}
      </button>
    </div>
  );
}

