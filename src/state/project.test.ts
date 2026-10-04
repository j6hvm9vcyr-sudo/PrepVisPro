import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryBackend, setBackend } from '../platform/backend';
import { closeProject, flushSave, newProjectDialog, openPath, openSample, parseProject, resetForTests, saveAsDialog, saveNow, serializeProject, SAVE_DELAY_MS, useProject } from './project';
import { useApp } from './appStore';
import { selectDoc } from './store';
import { newProject } from '../model/defaults';

let mem: MemoryBackend;

beforeEach(() => {
  mem = new MemoryBackend();
  setBackend(mem);
  resetForTests(mem);
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
});

const edit = (text: string) => {
  const st = useApp.getState();
  st.startEdit('');
  st.setEditText(text);
  st.commitEdit('stay');
};

describe('fichier projet', () => {
  it('crée un projet, l’enregistre automatiquement après un court délai', async () => {
    mem.nextPick = '/Films/Agnus Dei';
    expect(await newProjectDialog()).toBe(true);
    const st = useProject.getState();
    expect(st.mode).toBe('file');
    expect(st.dir).toBe('/Films/Agnus Dei.prepvis');
    expect(selectDoc(useApp.getState()).meta.title).toBe('Agnus Dei');

    vi.useFakeTimers();
    edit('Poitrine');
    expect(useProject.getState().status).toBe('pending');
    expect(mem.saves).toBe(0);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS + 10);
    expect(mem.saves).toBe(1);
    expect(useProject.getState().status).toBe('saved');
    const saved = parseProject(mem.files.get('/Films/Agnus Dei.prepvis')!);
    expect(saved.ok && saved.doc.sequences[0]!.plans[0]!.cameras[0]!.start.size).toBe('Poitrine');
  });

  it('regroupe les modifications rapprochées en un seul enregistrement', async () => {
    mem.nextPick = '/F';
    await newProjectDialog();
    vi.useFakeTimers();
    edit('gp');
    await vi.advanceTimersByTimeAsync(200);
    edit('poi');
    await vi.advanceTimersByTimeAsync(200);
    edit('ens');
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS + 10);
    expect(mem.saves).toBe(1);
  });

  it('un échec d’enregistrement est signalé, puis réessayé', async () => {
    mem.nextPick = '/F';
    await newProjectDialog();
    mem.failNextSave = 'Disque plein';
    edit('gp');
    expect(await flushSave()).toBe(false);
    expect(useProject.getState()).toMatchObject({ status: 'error', error: 'Disque plein' });
    edit('poi');
    expect(await flushSave()).toBe(true);
    expect(useProject.getState().status).toBe('saved');
  });

  it('rouvre un projet enregistré à l’identique', async () => {
    mem.nextPick = '/F';
    await newProjectDialog();
    edit('Taille');
    await flushSave();
    const before = selectDoc(useApp.getState());
    await closeProject();
    expect(useProject.getState().mode).toBe('none');
    expect(await openPath('/F.prepvis/project.json')).toBe(true);
    expect(selectDoc(useApp.getState())).toEqual(before);
  });

  it('refuse un fichier corrompu sans fermer le projet en cours', async () => {
    mem.nextPick = '/A';
    await newProjectDialog();
    mem.files.set('/B.prepvis', '{"schemaVersion":1,');
    expect(await openPath('/B.prepvis')).toBe(false);
    expect(useProject.getState().dir).toBe('/A.prepvis');
    expect(useProject.getState().openError).toMatch(/illisible/);
  });

  it('refuse un fichier d’une version future', () => {
    const d = { ...newProject(), schemaVersion: 7 };
    const r = parseProject(JSON.stringify(d));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/plus récente/);
  });

  it('n’écrase jamais le fichier avec un document incohérent', async () => {
    mem.nextPick = '/F';
    await newProjectDialog();
    const good = mem.files.get('/F.prepvis');
    // Simule un défaut logiciel : une caméra inconnue.
    useApp.getState().updateDoc((d) => {
      d.sequences[0]!.plans[0]!.cameras[0]!.cameraId = 'inexistante';
    });
    expect(await flushSave()).toBe(false);
    expect(useProject.getState().error).toMatch(/bloqué/);
    expect(mem.files.get('/F.prepvis')).toBe(good);
  });

  it('l’exemple devient un vrai projet avec « Enregistrer sous », historique conservé', async () => {
    await openSample();
    expect(useProject.getState().mode).toBe('unsaved');
    edit('GP');
    mem.nextPick = '/Ex';
    expect(await saveAsDialog()).toBe(true);
    expect(useProject.getState()).toMatchObject({ mode: 'file', dir: '/Ex.prepvis' });
    expect(useApp.getState().hist.past.length).toBeGreaterThan(0);
    const r = parseProject(mem.files.get('/Ex.prepvis')!);
    expect(r.ok && r.doc.meta.title).toBe('Exemple — Le Quai');
  });

  it('⌘S sur un projet non enregistré propose d’enregistrer', async () => {
    await openSample();
    mem.nextPick = '/S';
    await saveNow();
    expect(useProject.getState().mode).toBe('file');
  });

  it('création refusée si le dossier existe déjà', async () => {
    mem.nextPick = '/F';
    await newProjectDialog();
    expect(await newProjectDialog()).toBe(false);
    expect(useProject.getState().dir).toBe('/F.prepvis');
  });

  it('sérialisation stable', () => {
    const d = newProject('X');
    expect(serializeProject(d)).toBe(serializeProject(JSON.parse(serializeProject(d))));
  });
});
