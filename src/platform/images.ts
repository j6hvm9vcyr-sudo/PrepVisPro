/**
 * Images du projet.
 * - Projet enregistré : chaque image importée est copiée tout de suite dans le dossier images/
 *   du projet (nom généré, jamais réécrit).
 * - Projet non enregistré (exemple, navigateur) : gardée en mémoire ; copiée sur disque
 *   au moment de « Enregistrer sous… ».
 */
import type { Backend } from './backend';

export interface StoredImage {
  /** Chemin relatif dans le projet, ex. « images/ab12cd.jpg ». */
  file: string;
  originalName: string;
}

const EXT_OK = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'tif', 'tiff'];
const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/tiff': 'tif',
};

/** Extension sûre d'un fichier image, ou null s'il n'est pas reconnu. */
export function imageExt(f: { name: string; type: string }): string | null {
  const fromName = f.name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (fromName && EXT_OK.includes(fromName)) return fromName === 'jpeg' ? 'jpg' : fromName === 'tiff' ? 'tif' : fromName;
  return MIME_EXT[f.type] ?? null;
}

export function isAcceptedImage(f: { name: string; type: string }): boolean {
  return imageExt(f) !== null;
}

function newImageName(ext: string): string {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${id.toLowerCase()}.${ext}`;
}

class ProjectImageStore {
  private backend: Backend | null = null;
  private dir: string | null = null;
  /** Images non encore écrites sur disque (projet non enregistré). */
  private pending = new Map<string, { blob: Blob; url: string }>();
  private urlCache = new Map<string, string>();
  private listeners = new Set<() => void>();

  /** Rattache le stockage à un projet enregistré (dir) ou à aucun (null). */
  attach(backend: Backend | null, dir: string | null) {
    this.backend = backend;
    this.dir = dir;
    this.urlCache.clear();
    if (dir === null) {
      for (const p of this.pending.values()) URL.revokeObjectURL?.(p.url);
      this.pending.clear();
    }
    this.listeners.forEach((l) => l());
  }

  get projectDir() {
    return this.dir;
  }

  async importFiles(files: File[]): Promise<StoredImage[]> {
    const out: StoredImage[] = [];
    for (const f of files) {
      const ext = imageExt(f);
      if (!ext) continue;
      const name = newImageName(ext);
      if (this.backend && this.dir) {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const file = await this.backend.writeImage(this.dir, name, bytes);
        out.push({ file, originalName: f.name });
      } else {
        const file = `images/${name}`;
        this.pending.set(file, { blob: f, url: URL.createObjectURL(f) });
        out.push({ file, originalName: f.name });
      }
    }
    return out;
  }

  url(file: string): string | null {
    const p = this.pending.get(file);
    if (p) return p.url;
    if (!this.backend || !this.dir) return null;
    let u = this.urlCache.get(file);
    if (!u) {
      u = this.backend.imageUrl(this.dir, file);
      this.urlCache.set(file, u);
    }
    return u || null;
  }

  /** Copie les images en mémoire dans un projet qui vient d'être créé sur disque. */
  async flushPendingTo(backend: Backend, dir: string, used: Set<string>): Promise<void> {
    for (const [file, p] of this.pending) {
      if (!used.has(file)) continue;
      const name = file.replace(/^images\//, '');
      await backend.writeImage(dir, name, new Uint8Array(await p.blob.arrayBuffer()));
    }
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export const imageStore = new ProjectImageStore();
