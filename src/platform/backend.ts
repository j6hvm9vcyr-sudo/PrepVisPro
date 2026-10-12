/**
 * Accès aux fichiers du projet. Deux implémentations :
 * - Tauri (application Mac) : vrais fichiers, via les commandes Rust (src-tauri/src/lib.rs) ;
 * - mémoire : navigateur et tests (rien n'est écrit sur disque).
 */
import { SCRIPT_EXTENSIONS, SCRIPT_FORMATS, type ScriptFile } from '../import/script';
import { isTauri } from './env';

export interface Backend {
  readonly kind: 'tauri' | 'memory';
  /** Boîte de dialogue « Nouveau projet » : renvoie le chemin du dossier .topshot, ou null. */
  pickNew(defaultName: string): Promise<string | null>;
  /** Boîte de dialogue « Ouvrir » : renvoie le chemin choisi, ou null. */
  pickOpen(): Promise<string | null>;
  /** Renvoie le dossier créé et l'empreinte du fichier écrit. */
  create(dir: string, json: string): Promise<{ dir: string; fp: string }>;
  /** Renvoie le dossier normalisé, le contenu de project.json et son empreinte. */
  load(path: string): Promise<{ dir: string; json: string; fp: string }>;
  /** Ancien projet `.prepvis` renommé en `.topshot` ; null s'il garde son nom (rien n'est écrasé). */
  renameLegacy(dir: string): Promise<string | null>;
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
  /** Publier : choix du dossier de diffusion ; renvoie son chemin, ou null. */
  pickFolder(title: string): Promise<string | null>;
  /** Animatique (0.22) : crée un dossier neuf « nom » (ou « nom (2) »…) avec son sous-dossier « images » ; renvoie son chemin. */
  animaticDir(parent: string, name: string): Promise<string>;
  /** Publier : réécrit un fichier du dossier de diffusion sur place (le lien partagé reste bon). */
  publishWrite(path: string, bytes: Uint8Array): Promise<void>;
  /** Retours (0.21) : crée le sous-dossier « Retours » du dossier de diffusion s'il manque. */
  publishRetoursDir(folder: string): Promise<void>;
  /** Fichiers de retours déposés dans « Retours » (nom et contenu). */
  listRetours(folder: string): Promise<{ name: string; text: string }[]>;
  /** Choisit et lit un fichier de retours ; null si annulé. */
  pickRetours(): Promise<{ name: string; text: string } | null>;
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

/** Extension des projets (un dossier « paquet »). Les projets d'avant la 0.12 (PrepVisPro) portent `.prepvis`. */
export const PROJECT_EXT = '.topshot';
export const LEGACY_EXT = '.prepvis';
export const CONFLICT_PREFIX = 'CONFLIT:';

function withProjectExt(path: string): string {
  const p = path.replace(/[\\/]+$/, '');
  return p.toLowerCase().endsWith(PROJECT_EXT) ? p : p + PROJECT_EXT;
}

export function baseName(path: string): string {
  const p = path.replace(/[\\/]+$/, '');
  const name = p.split(/[\\/]/).pop() ?? p;
  const low = name.toLowerCase();
  for (const ext of [PROJECT_EXT, LEGACY_EXT]) if (low.endsWith(ext)) return name.slice(0, -ext.length);
  return name;
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
    const p = await save({ title: 'Nouveau projet', defaultPath: `${defaultName}${PROJECT_EXT}`, filters: [{ name: 'Projet Topshot', extensions: ['topshot'] }] });
    return p ? withProjectExt(p) : null;
  }

  async pickOpen() {
    const { open } = await this.dialog();
    const p = await open({
      title: 'Ouvrir un projet',
      multiple: false,
      directory: false,
      filters: [{ name: 'Projet Topshot', extensions: ['topshot', 'prepvis', 'json'] }],
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

  async renameLegacy(dir: string) {
    const { invoke } = await this.core();
    return invoke<string | null>('project_rename_legacy', { dir });
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

  async pickFolder(title: string) {
    const { open } = await this.dialog();
    const p = await open({ title, multiple: false, directory: true });
    return typeof p === 'string' ? p : null;
  }

  async animaticDir(parent: string, name: string) {
    const { invoke } = await this.core();
    return invoke<string>('animatic_dir', { parent, name });
  }

  async publishWrite(path: string, bytes: Uint8Array) {
    const { invoke } = await this.core();
    await invoke('publish_write', bytes, { headers: { 'x-prepvis-path': encodeURIComponent(path) } });
  }

  async publishRetoursDir(folder: string) {
    const { invoke } = await this.core();
    await invoke('retours_dir', { folder });
  }

  async listRetours(folder: string) {
    const { invoke } = await this.core();
    const list = await invoke<[string, string][]>('retours_list', { folder });
    return list.map(([name, text]) => ({ name, text }));
  }

  async pickRetours() {
    const { open } = await this.dialog();
    const p = await open({ title: 'Importer des retours', multiple: false, directory: false, filters: [{ name: 'Retours Topshot', extensions: ['topshot-retours'] }] });
    if (typeof p !== 'string') return null;
    const { invoke } = await this.core();
    const text = await invoke<string>('retours_read', { path: p });
    return { name: p.split(/[\\/]/).pop() ?? p, text };
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
    if (json === undefined) throw new Error(`Aucun projet Topshot dans « ${dir} ».`);
    return { dir, json, fp: this.fp(json) };
  }
  async renameLegacy(dir: string) {
    if (!dir.toLowerCase().endsWith(LEGACY_EXT)) return null;
    const to = dir.slice(0, -LEGACY_EXT.length) + PROJECT_EXT;
    const json = this.files.get(dir);
    if (json === undefined || this.files.has(to)) return null;
    this.files.delete(dir);
    this.files.set(to, json);
    for (const [k, v] of [...this.images]) {
      if (!k.startsWith(`${dir}/`)) continue;
      this.images.delete(k);
      this.images.set(to + k.slice(dir.length), v);
    }
    const vs = this.versions.get(dir);
    if (vs) {
      this.versions.delete(dir);
      this.versions.set(to, vs);
    }
    return to;
  }
  async save(dir: string, json: string, _force: boolean, expected: string | null) {
    if (this.failNextSave) {
      const e = this.failNextSave;
      this.failNextSave = null;
      throw new Error(e);
    }
    const current = this.files.get(dir);
    if (current === undefined) throw new Error(`Le projet « ${dir} » est introuvable (déplacé ou supprimé ?).`);
    if (expected !== null && this.fp(current) !== expected) throw new Error(`${CONFLICT_PREFIX}Le projet a été modifié en dehors de Topshot.`);
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
  /** Publier, sans disque : le dossier « choisi », les dossiers disparus, les fichiers publiés (écritures comptées). */
  nextFolder: string | null = '/Drive/Le Quai/Image';
  missingFolders = new Set<string>();
  published = new Map<string, { bytes: Uint8Array; writes: number }>();
  async pickFolder() {
    return this.nextFolder;
  }
  /** Animatique, sans disque : dossiers créés (un nom déjà pris reçoit « (2) »…). */
  animaticFolders: string[] = [];
  async animaticDir(parent: string, name: string) {
    let path = `${parent}/${name}`;
    for (let n = 2; this.animaticFolders.includes(path); n++) path = `${parent}/${name} (${n})`;
    this.animaticFolders.push(path);
    return path;
  }
  async publishWrite(path: string, bytes: Uint8Array) {
    if (this.missingFolders.has(path.slice(0, path.lastIndexOf('/')))) throw new Error('Le dossier de diffusion est introuvable (déplacé, renommé, ou drive déconnecté ?)');
    this.published.set(path, { bytes, writes: (this.published.get(path)?.writes ?? 0) + 1 });
  }
  /** Retours déposés (dossier → fichiers), et le prochain fichier « choisi ». */
  retours = new Map<string, { name: string; text: string }[]>();
  nextRetours: { name: string; text: string } | null = null;
  async publishRetoursDir(folder: string) {
    if (!this.retours.has(folder)) this.retours.set(folder, []);
  }
  async listRetours(folder: string) {
    return [...(this.retours.get(folder) ?? [])];
  }
  async pickRetours() {
    return this.nextRetours;
  }
  async writeExport(path: string, bytes: Uint8Array) {
    this.exports.set(path, bytes);
    // Dans un navigateur, l'export est proposé en téléchargement (pas les fichiers d'une animatique).
    if (!this.animaticFolders.some((f) => path.startsWith(`${f}/`)) && typeof document !== 'undefined' && typeof URL.createObjectURL === 'function' && import.meta.env.MODE !== 'test') {
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

let current: Promise<Backend> | null = null;

/**
 * Le même accès au système pour toute l'application. On garde la promesse (pas seulement le
 * résultat) : deux appels simultanés au démarrage obtiennent la même instance, et non deux.
 */
export function getBackend(): Promise<Backend> {
  current ??= (async () => {
    if (!isTauri()) {
      const m = new MemoryBackend();
      // Navigateur (tests de l'interface) : ce qui a été publié se lit ici.
      if (typeof window !== 'undefined') (window as unknown as { __prepvisMemory?: MemoryBackend }).__prepvisMemory = m;
      return m;
    }
    const b = new TauriBackend();
    await b.init();
    return b;
  })();
  return current;
}

/** Pour les tests. */
export function setBackend(b: Backend) {
  current = Promise.resolve(b);
}
