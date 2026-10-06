/**
 * Bibliothèque d'icônes (plans au sol), commune à tous les projets.
 * - Icônes livrées avec l'app : PF_ICONES (libres de droit), dans public/pf-icones (index.json).
 * - Icônes importées : app Mac → dossier de données de l'application (src-tauri/src/icons.rs) ;
 *   navigateur / tests → en mémoire.
 * Les icônes sont réduites à l'import (grand côté 512 px) : légères à afficher et à exporter.
 */
import { create } from 'zustand';
import { isTauri } from './env';

export interface IconItem {
  id: string;
  category: string;
  name: string;
  /** Livrée avec l'app (ne peut pas être retirée). */
  builtin?: boolean;
}

/** Préfixe des icônes livrées avec l'app. */
export const BUILTIN_PREFIX = 'pf/';
const BUILTIN_DIR = '/pf-icones/';

/** Icônes livrées avec l'app (lues une fois). */
let builtins: Promise<IconItem[]> | null = null;
export function builtinIcons(): Promise<IconItem[]> {
  builtins ??= fetch(`${BUILTIN_DIR}index.json`)
    .then((r) => (r.ok ? r.json() : { items: [] }))
    .then((j: { items: { id: string; category: string; name: string }[] }) => j.items.map((i) => ({ id: i.id, category: i.category, name: i.name, builtin: true })))
    .catch(() => []);
  return builtins;
}

const isBuiltin = (id: string) => id.startsWith(BUILTIN_PREFIX);

/** Figures dessinées par défaut avec les icônes livrées (sens : rotation pour regarder vers le haut). */
export const DEFAULT_FIGURES = {
  camera: { id: 'pf/cam--cam', turn: 0 },
  actor: { id: 'pf/actors--person-a', turn: 180 },
  light: { id: 'pf/fresnels-tweenies-mole--fresnel', turn: 0 },
} as const;
const builtinUrl = (id: string) => `${BUILTIN_DIR}${id.slice(BUILTIN_PREFIX.length)}.png`;

/** Octets d'une icône (livrée ou importée). */
export async function readIcon(id: string): Promise<Uint8Array> {
  if (!isBuiltin(id)) return iconBackend().read(id);
  const r = await fetch(builtinUrl(id));
  if (!r.ok) throw new Error(`Icône introuvable : ${id}`);
  return new Uint8Array(await r.arrayBuffer());
}

interface SourceFile {
  rel: string;
  category: string;
  name: string;
}

interface Picked {
  files: SourceFile[];
  read(rel: string): Promise<Uint8Array>;
}

interface IconBackend {
  list(): Promise<{ dir: string; items: IconItem[] }>;
  pickFolder(): Promise<Picked | null>;
  store(category: string, name: string, png: Uint8Array): Promise<IconItem>;
  read(id: string): Promise<Uint8Array>;
  remove(ids: string[]): Promise<number>;
  url(dir: string, id: string): string;
}

class TauriIcons implements IconBackend {
  private core() {
    return import('@tauri-apps/api/core');
  }
  private convert: ((p: string) => string) | null = null;
  async list() {
    const { invoke, convertFileSrc } = await this.core();
    this.convert = convertFileSrc;
    return invoke<{ dir: string; items: IconItem[] }>('icons_list');
  }
  async pickFolder() {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const path = await open({ title: 'Dossier d’icônes', directory: true, multiple: false });
    if (typeof path !== 'string') return null;
    return this.scan(path);
  }
  /** Analyse un dossier (aussi utilisé par les tests de l'application réelle). */
  async scan(path: string): Promise<Picked> {
    const { invoke } = await this.core();
    const files = await invoke<SourceFile[]>('icons_scan', { path });
    return { files, read: async (rel) => new Uint8Array(await invoke<ArrayBuffer>('icons_read_source', { rel })) };
  }
  async store(category: string, name: string, png: Uint8Array) {
    const { invoke } = await this.core();
    return invoke<IconItem>('icons_store', png, { headers: { 'x-prepvis-category': encodeURIComponent(category), 'x-prepvis-name': encodeURIComponent(name) } });
  }
  async read(id: string) {
    const { invoke } = await this.core();
    return new Uint8Array(await invoke<ArrayBuffer>('icons_read', { id }));
  }
  async remove(ids: string[]) {
    const { invoke } = await this.core();
    return invoke<number>('icons_remove', { ids });
  }
  url(dir: string, id: string) {
    return this.convert ? this.convert(`${dir}/${id}`) : '';
  }
}

class MemoryIcons implements IconBackend {
  private items: IconItem[] = [];
  private data = new Map<string, { bytes: Uint8Array; url: string }>();
  private n = 0;
  async list() {
    return { dir: 'memoire', items: [...this.items] };
  }
  async pickFolder(): Promise<Picked | null> {
    // Navigateur : sélecteur de dossier.
    const files = await new Promise<File[] | null>((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      (input as HTMLInputElement & { webkitdirectory: boolean }).webkitdirectory = true;
      input.onchange = () => resolve(input.files ? Array.from(input.files) : null);
      input.oncancel = () => resolve(null);
      input.click();
    });
    if (!files) return null;
    const byRel = new Map<string, File>();
    const list: SourceFile[] = [];
    for (const f of files) {
      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
      if (!/\.(png|jpe?g|webp)$/i.test(rel) || rel.split('/').some((p) => p.startsWith('.'))) continue;
      const parts = rel.split('/');
      // Le premier élément est le dossier choisi ; la catégorie est le sous-dossier suivant.
      const category = parts.length > 2 ? parts[1]! : (parts[0] ?? 'Divers');
      byRel.set(rel, f);
      list.push({ rel, category, name: parts[parts.length - 1]!.replace(/\.[^.]+$/, '') });
    }
    return { files: list, read: async (rel) => new Uint8Array(await byRel.get(rel)!.arrayBuffer()) };
  }
  async store(category: string, name: string, png: Uint8Array) {
    const existing = this.items.find((i) => i.category === category && i.name === name);
    const id = existing?.id ?? `i-${++this.n}.png`;
    const url = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(new Blob([png as BlobPart], { type: 'image/png' })) : '';
    this.data.set(id, { bytes: png, url });
    const item = { id, category, name };
    if (!existing) this.items.push(item);
    return item;
  }
  async read(id: string) {
    const d = this.data.get(id);
    if (!d) throw new Error(`Icône introuvable : ${id}`);
    return d.bytes;
  }
  async remove(ids: string[]) {
    const before = this.items.length;
    this.items = this.items.filter((i) => !ids.includes(i.id));
    ids.forEach((id) => this.data.delete(id));
    return before - this.items.length;
  }
  url(_dir: string, id: string) {
    return this.data.get(id)?.url ?? '';
  }
}

let backend: IconBackend | null = null;
export function iconBackend(): IconBackend {
  backend ??= isTauri() ? new TauriIcons() : new MemoryIcons();
  return backend;
}

/** Réduit une image (grand côté `max` px), en PNG pour garder la transparence. */
async function shrinkToPng(bytes: Uint8Array, max = 512): Promise<Uint8Array> {
  const blob = new Blob([bytes as BlobPart]);
  const bmp = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, w, h);
    const out: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Conversion impossible'))), 'image/png'));
    return new Uint8Array(await out.arrayBuffer());
  } finally {
    bmp.close();
  }
}

interface IconsState {
  dir: string;
  items: IconItem[];
  loaded: boolean;
  /** Import en cours : « 12 / 194 ». */
  progress: string | null;
  error: string | null;
  load(): Promise<void>;
  /** Choisit un dossier et importe ses images. Renvoie le nombre d'icônes ajoutées (null si annulé). */
  importFolder(picked?: Picked | null): Promise<{ added: number; failed: string[] } | null>;
  remove(ids: string[]): Promise<void>;
  url(item: IconItem): string;
}

export const useIcons = create<IconsState>()((set, get) => ({
  dir: '',
  items: [],
  loaded: false,
  progress: null,
  error: null,
  async load() {
    const pf = await builtinIcons();
    try {
      const r = await iconBackend().list();
      set({ dir: r.dir, items: [...pf, ...r.items], loaded: true, error: null });
    } catch (e) {
      set({ items: pf, loaded: true, error: e instanceof Error ? e.message : String(e) });
    }
  },
  async importFolder(given) {
    const b = iconBackend();
    const picked = given === undefined ? await b.pickFolder() : given;
    if (!picked) return null;
    const failed: string[] = [];
    let added = 0;
    set({ progress: `0 / ${picked.files.length}`, error: null });
    try {
      for (const [i, f] of picked.files.entries()) {
        try {
          const png = await shrinkToPng(await picked.read(f.rel));
          await b.store(f.category, f.name, png);
          added++;
        } catch (e) {
          failed.push(`${f.rel} (${e instanceof Error ? e.message : String(e)})`);
        }
        set({ progress: `${i + 1} / ${picked.files.length}` });
      }
    } finally {
      set({ progress: null });
      await get().load();
    }
    return { added, failed };
  },
  async remove(ids) {
    const own = ids.filter((id) => !isBuiltin(id));
    if (own.length) await iconBackend().remove(own);
    await get().load();
  },
  url(item) {
    return isBuiltin(item.id) ? builtinUrl(item.id) : iconBackend().url(get().dir, item.id);
  },
}));
