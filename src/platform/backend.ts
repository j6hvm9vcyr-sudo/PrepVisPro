/**
 * Accès aux fichiers du projet. Deux implémentations :
 * - Tauri (application Mac) : vrais fichiers, via les commandes Rust (src-tauri/src/lib.rs) ;
 * - mémoire : navigateur et tests (rien n'est écrit sur disque).
 */
import { isTauri } from './env';

export interface Backend {
  readonly kind: 'tauri' | 'memory';
  /** Boîte de dialogue « Nouveau projet » : renvoie le chemin du dossier .prepvis, ou null. */
  pickNew(defaultName: string): Promise<string | null>;
  /** Boîte de dialogue « Ouvrir » : renvoie le chemin choisi, ou null. */
  pickOpen(): Promise<string | null>;
  create(dir: string, json: string): Promise<string>;
  /** Renvoie le dossier normalisé et le contenu de project.json. */
  load(path: string): Promise<{ dir: string; json: string }>;
  save(dir: string, json: string, forceBackup: boolean): Promise<void>;
  writeImage(dir: string, name: string, bytes: Uint8Array): Promise<string>;
  imageUrl(dir: string, file: string): string;
  reveal(dir: string): Promise<void>;
  /** Octets d'une image du projet (pour les exports). */
  readImage(dir: string, file: string): Promise<Uint8Array>;
  /** Boîte de dialogue d'enregistrement d'un export ; renvoie le chemin, ou null. */
  pickExportPath(defaultName: string, ext: 'pdf' | 'xlsx' | 'csv'): Promise<string | null>;
  writeExport(path: string, bytes: Uint8Array): Promise<void>;
  openFile(path: string): Promise<void>;
  alert(title: string, text: string): Promise<void>;
  confirm(title: string, text: string, ok: string, cancel: string): Promise<boolean>;
  quitNow(): Promise<void>;
}

export const PROJECT_EXT = '.prepvis';

export function withProjectExt(path: string): string {
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
    return invoke<string>('project_create', { dir, json });
  }

  async load(path: string) {
    const { invoke } = await this.core();
    const [dir, json] = await invoke<[string, string]>('project_load', { path });
    return { dir, json };
  }

  async save(dir: string, json: string, forceBackup: boolean) {
    const { invoke } = await this.core();
    await invoke('project_save', { dir, json, forceBackup });
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

  async pickExportPath(defaultName: string, ext: 'pdf' | 'xlsx' | 'csv') {
    const { save } = await this.dialog();
    const names = { pdf: 'Document PDF', xlsx: 'Classeur Excel', csv: 'Fichier CSV' };
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

  async pickNew() {
    return this.nextPick ? withProjectExt(this.nextPick) : null;
  }
  async pickOpen() {
    return this.nextPick;
  }
  async create(dir: string, json: string) {
    if (this.files.has(dir)) throw new Error(`« ${dir} » existe déjà. Choisissez un autre nom.`);
    this.files.set(dir, json);
    return dir;
  }
  async load(path: string) {
    const dir = path.endsWith('/project.json') ? path.slice(0, -'/project.json'.length) : path;
    const json = this.files.get(dir);
    if (json === undefined) throw new Error(`Aucun projet PrepVisPro dans « ${dir} ».`);
    return { dir, json };
  }
  async save(dir: string, json: string) {
    if (this.failNextSave) {
      const e = this.failNextSave;
      this.failNextSave = null;
      throw new Error(e);
    }
    if (!this.files.has(dir)) throw new Error(`Le projet « ${dir} » est introuvable (déplacé ou supprimé ?).`);
    this.files.set(dir, json);
    this.saves++;
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

export function backendNow(): Backend | null {
  return current;
}
