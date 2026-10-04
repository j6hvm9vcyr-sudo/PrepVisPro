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
  /** Empreinte SHA-256 du contenu (null si le calcul n'est pas disponible). */
  hash: string | null;
}

/** Empreinte SHA-256 (hexadécimal) ; null si l'API de chiffrement n'est pas disponible. */
async function sha256Hex(bytes: Uint8Array): Promise<string | null> {
  try {
    if (typeof crypto === 'undefined' || !crypto.subtle) return null;
    const d = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
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
function imageExt(f: { name: string; type: string }): string | null {
  const fromName = f.name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (fromName && EXT_OK.includes(fromName)) return fromName === 'jpeg' ? 'jpg' : fromName === 'tiff' ? 'tif' : fromName;
  return MIME_EXT[f.type] ?? null;
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

  /**
   * Importe des images dans le projet. `known` : empreintes des images déjà importées ; une image
   * identique n'est pas réécrite, on renvoie le fichier existant.
   */
  async importFiles(files: File[], known: Map<string, { file: string; originalName: string }> = new Map()): Promise<StoredImage[]> {
    const out: StoredImage[] = [];
    for (const f of files) {
      const ext = imageExt(f);
      if (!ext) continue;
      const bytes = new Uint8Array(await f.arrayBuffer());
      const hash = await sha256Hex(bytes);
      const already = hash ? (known.get(hash) ?? out.find((o) => o.hash === hash)) : undefined;
      if (already) {
        out.push({ file: already.file, originalName: already.originalName, hash });
        continue;
      }
      const name = newImageName(ext);
      if (this.backend && this.dir) {
        const file = await this.backend.writeImage(this.dir, name, bytes);
        out.push({ file, originalName: f.name, hash });
      } else {
        const file = `images/${name}`;
        this.pending.set(file, { blob: f, url: URL.createObjectURL(f) });
        out.push({ file, originalName: f.name, hash });
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

  /** Octets d'une image (projet enregistré ou image encore en mémoire). */
  async readBytes(file: string): Promise<Uint8Array> {
    const p = this.pending.get(file);
    if (p) return new Uint8Array(await p.blob.arrayBuffer());
    if (!this.backend || !this.dir) throw new Error(`Image introuvable : ${file}`);
    return this.backend.readImage(this.dir, file);
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
