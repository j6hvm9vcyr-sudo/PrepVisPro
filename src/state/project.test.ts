import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryBackend, setBackend } from '../platform/backend';
import { closeProject, flushSave, newProjectDialog, openPath, openSample, parseProject, recentProjects, resetForTests, saveAsDialog, saveNow, serializeProject, SAVE_DELAY_MS, useProject } from './project';
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
    expect(st.dir).toBe('/Films/Agnus Dei.topshot');
    expect(selectDoc(useApp.getState()).meta.title).toBe('Agnus Dei');

    vi.useFakeTimers();
    edit('Poitrine');
    expect(useProject.getState().status).toBe('pending');
    expect(mem.saves).toBe(0);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS + 10);
    expect(mem.saves).toBe(1);
    expect(useProject.getState().status).toBe('saved');
    const saved = parseProject(mem.files.get('/Films/Agnus Dei.topshot')!);
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
    expect(await openPath('/F.topshot/project.json')).toBe(true);
    expect(selectDoc(useApp.getState())).toEqual(before);
  });

  it('0.12 : un ancien projet .prepvis s’ouvre et devient .topshot, sans rien écraser', async () => {
    mem.nextPick = '/F';
    await newProjectDialog();
    edit('Taille');
    await flushSave();
    const json = mem.files.get('/F.topshot')!;
    await closeProject();
    mem.files.delete('/F.topshot');
    mem.files.set('/Films/Le Quai.prepvis', json);
    expect(await openPath('/Films/Le Quai.prepvis/project.json')).toBe(true);
    expect(useProject.getState().dir).toBe('/Films/Le Quai.topshot');
    expect(mem.files.has('/Films/Le Quai.prepvis')).toBe(false);
    expect(recentProjects()[0]).toBe('/Films/Le Quai.topshot');
    expect(recentProjects()).not.toContain('/Films/Le Quai.prepvis');
    expect(useApp.getState().message?.text).toMatch(/renommé « Le Quai\.topshot »/);
    // Un .topshot du même nom existe déjà : l'ancien garde son nom, les deux restent intacts.
    await closeProject();
    mem.files.set('/Films/Le Quai.prepvis', json);
    expect(await openPath('/Films/Le Quai.prepvis')).toBe(true);
    expect(useProject.getState().dir).toBe('/Films/Le Quai.prepvis');
    expect(mem.files.get('/Films/Le Quai.topshot')).toBe(json);
    expect(useApp.getState().message?.text).toMatch(/gardé en \.prepvis/);
  });

  it('refuse un fichier corrompu sans fermer le projet en cours', async () => {
    mem.nextPick = '/A';
    await newProjectDialog();
    mem.files.set('/B.topshot', '{"schemaVersion":1,');
    expect(await openPath('/B.topshot')).toBe(false);
    expect(useProject.getState().dir).toBe('/A.topshot');
    expect(useProject.getState().openError).toMatch(/illisible/);
  });

  it('refuse un fichier d’une version future', () => {
    const d = { ...newProject(), schemaVersion: 99 };
    const r = parseProject(JSON.stringify(d));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/plus récente/);
  });

  it('n’écrase jamais le fichier avec un document incohérent', async () => {
    mem.nextPick = '/F';
    await newProjectDialog();
    const good = mem.files.get('/F.topshot');
    // Simule un défaut logiciel : une caméra inconnue.
    useApp.getState().updateDoc((d) => {
      d.sequences[0]!.plans[0]!.cameras[0]!.cameraId = 'inexistante';
    });
    expect(await flushSave()).toBe(false);
    expect(useProject.getState().error).toMatch(/bloqué/);
    expect(mem.files.get('/F.topshot')).toBe(good);
  });

  it('l’exemple devient un vrai projet avec « Enregistrer sous », historique conservé', async () => {
    await openSample();
    expect(useProject.getState().mode).toBe('unsaved');
    edit('GP');
    mem.nextPick = '/Ex';
    expect(await saveAsDialog()).toBe(true);
    expect(useProject.getState()).toMatchObject({ mode: 'file', dir: '/Ex.topshot' });
    expect(useApp.getState().hist.past.length).toBeGreaterThan(0);
    const r = parseProject(mem.files.get('/Ex.topshot')!);
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
    expect(useProject.getState().dir).toBe('/F.topshot');
  });

  it('sérialisation stable', () => {
    const d = newProject('X');
    expect(serializeProject(d)).toBe(serializeProject(JSON.parse(serializeProject(d))));
  });
});

describe('modification faite ailleurs (synchronisation, autre ordinateur)', () => {
  it('ne l’écrase pas en silence : copie de sécurité, puis « garder ma version »', async () => {
    mem.nextPick = '/F';
    await newProjectDialog();
    // Un autre ordinateur modifie le fichier.
    const other = JSON.parse(mem.files.get('/F.topshot')!);
    other.meta.title = 'Version de l’autre ordinateur';
    mem.files.set('/F.topshot', JSON.stringify(other));
    edit('GP');
    await flushSave();
    expect(mem.conflictCopies).toHaveLength(1);
    expect(mem.conflictCopies[0]).toContain('"size": "GP"');
    const saved = parseProject(mem.files.get('/F.topshot')!);
    expect(saved.ok && saved.doc.sequences[0]!.plans[0]!.cameras[0]!.start.size).toBe('GP');
    expect(useProject.getState().status).toBe('saved');
  });

  it('« recharger la version du disque » : la version extérieure est ouverte, la nôtre est gardée en copie', async () => {
    mem.nextPick = '/F';
    await newProjectDialog();
    const other = JSON.parse(mem.files.get('/F.topshot')!);
    other.meta.title = 'Autre';
    mem.files.set('/F.topshot', JSON.stringify(other));
    mem.confirm = async () => false;
    edit('GP');
    await flushSave();
    expect(selectDoc(useApp.getState()).meta.title).toBe('Autre');
    expect(mem.conflictCopies).toHaveLength(1);
    // Ensuite les enregistrements reprennent normalement.
    edit('Taille');
    expect(await flushSave()).toBe(true);
  });
});
