/**
 * Accès aux fichiers du projet. Deux implémentations :
 * - Tauri (application Mac) : vrais fichiers, via les commandes Rust (src-tauri/src/lib.rs) ;
 * - mémoire : navigateur et tests (rien n'est écrit sur disque).
 */
import { SCRIPT_EXTENSIONS, SCRIPT_FORMATS, type ScriptFile } from '../import/script';
import { isTauri } from './env';

export interface Backend {
  readonly kind: 'tauri' | 'memory';
  /** Boîte de dialogue « Nouveau projet » : renvoie le chemin du dossier .prepvis, ou null. */
  pickNew(defaultName: string): Promise<string | null>;
  /** Boîte de dialogue « Ouvrir » : renvoie le chemin choisi, ou null. */
  pickOpen(): Promise<string | null>;
  /** Renvoie le dossier créé et l'empreinte du fichier écrit. */
  create(dir: string, json: string): Promise<{ dir: string; fp: string }>;
  /** Renvoie le dossier normalisé, le contenu de project.json et son empreinte. */
  load(path: string): Promise<{ dir: string; json: string; fp: string }>;
  /**
   * Enregistre et renvoie la nouvelle empreinte. Si `expected` ne correspond plus au fichier
   * (modifié ailleurs), échoue avec une erreur commençant par CONFLICT_PREFIX.
   */
  save(dir: string, json: string, forceBackup: boolean, expected: string | null): Promise<string>;
  saveConflictCopy(dir: string, json: string): Promise<string>;
  writeImage(dir: string, name: string, bytes: Uint8Array): Promise<string>;
  imageUrl(dir: string, file: string): string;
  reveal(dir: string): Promise<void>;
  /** Octets d'une image du projet (pour les exports). */
  readImage(dir: string, file: string): Promise<Uint8Array>;
  /** Boîte de dialogue d'enregistrement d'un export ; renvoie le chemin, ou null. */
  pickExportPath(defaultName: string, ext: 'pdf' | 'xlsx' | 'csv' | 'png'): Promise<string | null>;
  writeExport(path: string, bytes: Uint8Array): Promise<void>;
  openFile(path: string): Promise<void>;
  /** Choisit et lit un scénario (Final Draft, Fountain, texte, Word, PDF) ; null si annulé. */
  pickScript(): Promise<ScriptFile | null>;
  alert(title: string, text: string): Promise<void>;
  confirm(title: string, text: string, ok: string, cancel: string): Promise<boolean>;
  quitNow(): Promise<void>;
  /** Versions nommées (dossier versions/ du projet). */
  versionCreate(dir: string, stamp: string, json: string): Promise<string>;
  versionList(dir: string): Promise<VersionInfo[]>;
  versionRead(dir: string, file: string): Promise<string>;
}

interface VersionInfo {
  file: string;
  name: string;
  note: string;
  createdAt: number;
}

const PROJECT_EXT = '.prepvis';
export const CONFLICT_PREFIX = 'CONFLIT:';

function withProjectExt(path: string): string {
  const p = path.replace(/[\\/]+$/, '');
  return p.toLowerCase().endsWith(PROJECT_EXT) ? p : p + PROJECT_EXT;
}

export function baseName(path: string): string {
  const p = path.replace(/[\\/]+$/, '');
  const name = p.split(/[\\/]/).pop() ?? p;
  return name.toLowerCase().endsWith(PROJECT_EXT) ? name.slice(0, -PROJECT_EXT.length) : name;
}

// ------------------------------------------------------------------ Tauri

class TauriBackend implements Backend {
  readonly kind = 'tauri' as const;

  private async core() {
    return import('@tauri-apps/api/core');
  }
  private async dialog() {
    return import('@tauri-apps/plugin-dialog');
  }

  async pickNew(defaultName: string) {
    const { save } = await this.dialog();
    const p = await save({ title: 'Nouveau projet', defaultPath: `${defaultName}${PROJECT_EXT}`, filters: [{ name: 'Projet PrepVisPro', extensions: ['prepvis'] }] });
    return p ? withProjectExt(p) : null;
  }

  async pickOpen() {
    const { open } = await this.dialog();
    const p = await open({
      title: 'Ouvrir un projet',
      multiple: false,
      directory: false,
      filters: [{ name: 'Projet PrepVisPro', extensions: ['prepvis', 'json'] }],
    });
    return typeof p === 'string' ? p : null;
  }

  async create(dir: string, json: string) {
    const { invoke } = await this.core();
    const [d, fp] = await invoke<[string, string]>('project_create', { dir, json });
    return { dir: d, fp };
  }

  async load(path: string) {
    const { invoke } = await this.core();
    const [dir, json, fp] = await invoke<[string, string, string]>('project_load', { path });
    return { dir, json, fp };
  }

  async save(dir: string, json: string, forceBackup: boolean, expected: string | null) {
    const { invoke } = await this.core();
    return invoke<string>('project_save', { dir, json, forceBackup, expected });
  }

  async saveConflictCopy(dir: string, json: string) {
    const { invoke } = await this.core();
    return invoke<string>('project_save_conflict_copy', { dir, json });
  }

  async writeImage(dir: string, name: string, bytes: Uint8Array) {
    const { invoke } = await this.core();
    return invoke<string>('image_write', bytes, {
      headers: { 'x-prepvis-dir': encodeURIComponent(dir), 'x-prepvis-name': encodeURIComponent(name) },
    });
  }

  private convert: ((p: string) => string) | null = null;
  imageUrl(dir: string, file: string) {
    // convertFileSrc est synchrone : chargé à l'avance par init().
    return this.convert ? this.convert(`${dir}/${file}`) : '';
  }
  async init() {
    const { convertFileSrc } = await this.core();
    this.convert = convertFileSrc;
  }

  async reveal(dir: string) {
    const { invoke } = await this.core();
    await invoke('reveal_in_finder', { path: dir });
  }

  async readImage(dir: string, file: string) {
    const { invoke } = await this.core();
    const buf = await invoke<ArrayBuffer>('image_read', { dir, file });
    return new Uint8Array(buf);
  }

  async pickExportPath(defaultName: string, ext: 'pdf' | 'xlsx' | 'csv' | 'png') {
    const { save } = await this.dialog();
    const names = { pdf: 'Document PDF', xlsx: 'Classeur Excel', csv: 'Fichier CSV', png: 'Image PNG' };
    const p = await save({ title: 'Exporter', defaultPath: defaultName, filters: [{ name: names[ext], extensions: [ext] }] });
    if (!p) return null;
    return p.toLowerCase().endsWith(`.${ext}`) ? p : `${p}.${ext}`;
  }

  async writeExport(path: string, bytes: Uint8Array) {
    const { invoke } = await this.core();
    await invoke('export_write', bytes, { headers: { 'x-prepvis-path': encodeURIComponent(path) } });
  }

  async openFile(path: string) {
    const { invoke } = await this.core();
    await invoke('open_file', { path });
  }

  async pickScript() {
    const { open } = await this.dialog();
    const p = await open({ title: 'Importer un scénario', multiple: false, directory: false, filters: [{ name: `Scénario (${SCRIPT_FORMATS})`, extensions: SCRIPT_EXTENSIONS }] });
    if (typeof p !== 'string') return null;
    const { invoke } = await this.core();
    const bytes = new Uint8Array(await invoke<ArrayBuffer>('script_read', { path: p }));
    return { name: p.split('/').pop() ?? p, bytes };
  }

  async alert(title: string, text: string) {
    const { message } = await this.dialog();
    await message(text, { title, kind: 'error' });
  }

  async confirm(title: string, text: string, ok: string, cancel: string) {
    const { ask } = await this.dialog();
    return ask(text, { title, kind: 'warning', okLabel: ok, cancelLabel: cancel });
  }

  async quitNow() {
    const { invoke } = await this.core();
    await invoke('quit_now');
  }

  async versionCreate(dir: string, stamp: string, json: string) {
    const { invoke } = await this.core();
    return invoke<string>('version_create', { dir, stamp, json });
  }
  async versionList(dir: string) {
    const { invoke } = await this.core();
    return invoke<VersionInfo[]>('version_list', { dir });
  }
  async versionRead(dir: string, file: string) {
    const { invoke } = await this.core();
    return invoke<string>('version_read', { dir, file });
  }
}

// ------------------------------------------------------------------ mémoire

export class MemoryBackend implements Backend {
  readonly kind = 'memory' as const;
  files = new Map<string, string>();
  images = new Map<string, string>();
  /** Pour les tests : prochaine réponse des boîtes de dialogue. */
  nextPick: string | null = null;
  failNextSave: string | null = null;
  saves = 0;
  versions = new Map<string, Map<string, string>>();
  async versionCreate(dir: string, stamp: string, json: string) {
    const m = this.versions.get(dir) ?? new Map<string, string>();
    let file = `v-${stamp}.json`;
    for (let n = 2; m.has(file); n++) file = `v-${stamp}-${n}.json`;
    m.set(file, json);
    this.versions.set(dir, m);
    return file;
  }
  async versionList(dir: string) {
    return [...(this.versions.get(dir) ?? new Map<string, string>()).entries()]
      .map(([file, json]) => {
        const v = JSON.parse(json) as { name: string; note?: string; createdAt?: number };
        return { file, name: v.name, note: v.note ?? '', createdAt: v.createdAt ?? 0 };
      })
      .sort((a, b) => b.createdAt - a.createdAt || b.file.localeCompare(a.file));
  }
  async versionRead(dir: string, file: string) {
    const j = this.versions.get(dir)?.get(file);
    if (!j) throw new Error(`Version introuvable : ${file}`);
    return j;
  }

  async pickNew() {
    return this.nextPick ? withProjectExt(this.nextPick) : null;
  }
  async pickOpen() {
    return this.nextPick;
  }
  conflictCopies: string[] = [];
  private fp(json: string) {
    let h = 0;
    for (let i = 0; i < json.length; i++) h = (Math.imul(h, 31) + json.charCodeAt(i)) | 0;
    return `${json.length}:${h}`;
  }
  async create(dir: string, json: string) {
    if (this.files.has(dir)) throw new Error(`« ${dir} » existe déjà. Choisissez un autre nom.`);
    this.files.set(dir, json);
    return { dir, fp: this.fp(json) };
  }
  async load(path: string) {
    const dir = path.endsWith('/project.json') ? path.slice(0, -'/project.json'.length) : path;
    const json = this.files.get(dir);
    if (json === undefined) throw new Error(`Aucun projet PrepVisPro dans « ${dir} ».`);
    return { dir, json, fp: this.fp(json) };
  }
  async save(dir: string, json: string, _force: boolean, expected: string | null) {
    if (this.failNextSave) {
      const e = this.failNextSave;
      this.failNextSave = null;
      throw new Error(e);
    }
    const current = this.files.get(dir);
    if (current === undefined) throw new Error(`Le projet « ${dir} » est introuvable (déplacé ou supprimé ?).`);
    if (expected !== null && this.fp(current) !== expected) throw new Error(`${CONFLICT_PREFIX}Le projet a été modifié en dehors de PrepVisPro.`);
    this.files.set(dir, json);
    this.saves++;
    return this.fp(json);
  }
  async saveConflictCopy(dir: string, json: string) {
    this.conflictCopies.push(json);
    return `${dir}/backups/conflit.json`;
  }
  async writeImage(dir: string, name: string, bytes: Uint8Array) {
    const file = `images/${name}`;
    const type = name.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const url = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(new Blob([bytes as BlobPart], { type })) : `mem:${dir}/${file}`;
    this.images.set(`${dir}/${file}`, url);
    return file;
  }
  imageUrl(dir: string, file: string) {
    return this.images.get(`${dir}/${file}`) ?? '';
  }
  async reveal() {}
  exports = new Map<string, Uint8Array>();
  async readImage(dir: string, file: string) {
    const url = this.images.get(`${dir}/${file}`);
    if (!url) throw new Error(`Image introuvable : ${file}`);
    return new Uint8Array(await (await fetch(url)).arrayBuffer());
  }
  async pickExportPath(defaultName: string) {
    return this.nextPick ?? defaultName;
  }
  async writeExport(path: string, bytes: Uint8Array) {
    this.exports.set(path, bytes);
    // Dans un navigateur, l'export est proposé en téléchargement.
    if (typeof document !== 'undefined' && typeof URL.createObjectURL === 'function' && import.meta.env.MODE !== 'test') {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([bytes as BlobPart]));
      a.download = path.split('/').pop() ?? path;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(a.href);
      }, 1000);
    }
  }
  async openFile() {}
  /** Pour les tests : prochain scénario « choisi ». */
  nextScript: { name: string; text: string } | null = null;
  async pickScript(): Promise<ScriptFile | null> {
    if (this.nextScript) return { name: this.nextScript.name, bytes: new TextEncoder().encode(this.nextScript.text) };
    // Navigateur : sélecteur de fichier classique.
    return new Promise<ScriptFile | null>((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = SCRIPT_EXTENSIONS.map((e) => `.${e}`).join(',');
      input.onchange = async () => {
        const f = input.files?.[0];
        resolve(f ? { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) } : null);
      };
      input.click();
    });
  }
  async alert() {}
  async confirm() {
    return true;
  }
  async quitNow() {}
}

let current: Backend | null = null;

export async function getBackend(): Promise<Backend> {
  if (current) return current;
  if (isTauri()) {
    const b = new TauriBackend();
    await b.init();
    current = b;
  } else {
    current = new MemoryBackend();
  }
  return current;
}

/** Pour les tests. */
export function setBackend(b: Backend) {
  current = b;
}
