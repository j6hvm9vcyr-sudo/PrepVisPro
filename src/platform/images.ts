/**
 * Stockage des images. L'interface est la même partout ; l'implémentation change :
 * - navigateur / tests : en mémoire (perdu à la fermeture) ;
 * - application Mac : copiées dans le dossier du projet (étape « fichier projet »).
 */
export interface StoredImage {
  /** Chemin relatif dans le projet, ex. « images/ab12cd.jpg ». */
  file: string;
  originalName: string;
}

export interface ImageStore {
  importFiles(files: File[]): Promise<StoredImage[]>;
  /** URL affichable, ou null si l'image est introuvable. */
  url(file: string): string | null;
  /** Enregistre une image déjà connue sous forme d'URL (données d'exemple). */
  registerUrl(file: string, url: string): void;
}

const ACCEPTED = /^image\/(jpeg|png|webp|gif|heic|heif|tiff)$/;

export function isAcceptedImage(f: File): boolean {
  return ACCEPTED.test(f.type) || /\.(jpe?g|png|webp|gif|heic|heif|tiff?)$/i.test(f.name);
}

export class MemoryImageStore implements ImageStore {
  private urls = new Map<string, string>();

  async importFiles(files: File[]): Promise<StoredImage[]> {
    const out: StoredImage[] = [];
    for (const f of files) {
      if (!isAcceptedImage(f)) continue;
      const ext = (f.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'jpg').toLowerCase();
      const file = `images/${crypto.randomUUID()}.${ext}`;
      this.urls.set(file, URL.createObjectURL(f));
      out.push({ file, originalName: f.name });
    }
    return out;
  }

  url(file: string): string | null {
    return this.urls.get(file) ?? null;
  }

  registerUrl(file: string, url: string): void {
    this.urls.set(file, url);
  }
}

export const imageStore: ImageStore = new MemoryImageStore();
