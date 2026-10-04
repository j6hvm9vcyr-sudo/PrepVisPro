/** Parcours d'import d'un scénario, depuis l'interface. */
import { produce } from 'immer';
import { getBackend } from '../platform/backend';
import { useApp } from '../state/appStore';
import { newProject } from '../model/defaults';
import { newProjectWithDoc } from '../state/project';
import { parseScriptFile, type ScriptFile } from './script';
import { applyImport, planImport } from './merge';

/** Importer dans le projet ouvert : ouvre l'aperçu, rien n'est modifié avant validation. */
export async function startScriptImport(): Promise<void> {
  const b = await getBackend();
  let picked: ScriptFile | null;
  try {
    picked = await b.pickScript();
  } catch (e) {
    await b.alert('Import impossible', e instanceof Error ? e.message : String(e));
    return;
  }
  if (!picked) return;
  const r = await parseScriptFile(picked);
  if (!r.ok) {
    await b.alert('Import impossible', `« ${picked.name} » : ${r.error}`);
    useApp.getState().setMessage(`Import impossible : ${r.error}`, 'warn');
    return;
  }
  useApp.getState().setImporting({ name: picked.name, scenes: r.scenes });
}

/** Nouveau projet à partir d'un scénario : une séquence par scène, prête à découper. */
export async function newProjectFromScript(): Promise<void> {
  const b = await getBackend();
  const picked = await b.pickScript().catch(async (e) => {
    await b.alert('Import impossible', e instanceof Error ? e.message : String(e));
    return null;
  });
  if (!picked) return;
  const r = await parseScriptFile(picked);
  if (!r.ok) {
    await b.alert('Import impossible', `« ${picked.name} » : ${r.error}`);
    return;
  }
  const title = r.title || picked.name.replace(/\.[a-z0-9]+$/i, '');
  const empty = produce(newProject(title), (d) => {
    d.sequences = [];
  });
  const plan = planImport(empty, r.scenes);
  const { doc } = applyImport(empty, plan, { include: new Set(r.scenes.map((s) => s.number)), updateHeadings: true });
  await newProjectWithDoc(doc, title);
}
