//! Bibliothèque d'icônes personnelle (plans au sol), commune à tous les projets.
//!
//! Elle vit dans le dossier de données de l'application, jamais dans le dépôt ni dans
//! l'application elle-même : ce sont les icônes de l'utilisateur. Chaque icône placée sur un
//! plan est copiée dans le projet, qui reste ainsi complet par lui-même.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::storage::{atomic_write, Result};

pub const MANIFEST: &str = "bibliotheque.json";
const EXTS: [&str; 4] = ["png", "jpg", "jpeg", "webp"];
const MAX_FILES: usize = 3000;
const MAX_SOURCE_BYTES: u64 = 60 * 1024 * 1024;
const MAX_ICON_BYTES: usize = 8 * 1024 * 1024;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct IconItem {
    /// Identifiant stable (nom du fichier dans la bibliothèque).
    pub id: String,
    pub category: String,
    pub name: String,
}

#[derive(Serialize, Deserialize, Default)]
struct Manifest {
    items: Vec<IconItem>,
}

#[derive(Serialize, Debug, PartialEq)]
pub struct SourceFile {
    /// Chemin relatif au dossier choisi.
    pub rel: String,
    pub category: String,
    pub name: String,
}

fn read_manifest(dir: &Path) -> Manifest {
    fs::read(dir.join(MANIFEST)).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

fn write_manifest(dir: &Path, m: &Manifest) -> Result<()> {
    let json = serde_json::to_vec_pretty(m).map_err(|e| format!("Bibliothèque illisible : {e}"))?;
    atomic_write(&dir.join(MANIFEST), &json)
}

/// Icônes de la bibliothèque (seulement celles dont le fichier existe encore).
pub fn list(dir: &Path) -> Vec<IconItem> {
    read_manifest(dir).items.into_iter().filter(|i| safe_id(&i.id).is_ok() && dir.join(&i.id).is_file()).collect()
}

fn safe_id(id: &str) -> Result<()> {
    let ok = !id.is_empty() && id.len() <= 80 && id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '.') && id.matches('.').count() == 1 && id.ends_with(".png");
    if ok {
        Ok(())
    } else {
        Err(format!("Icône inconnue : « {id} »"))
    }
}

static COUNTER: AtomicU64 = AtomicU64::new(0);
fn new_id() -> String {
    let t = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let n = COUNTER.fetch_add(1, Ordering::SeqCst);
    format!("i-{t:x}-{n:x}.png")
}

/// Ajoute (ou remplace, même catégorie et même nom) une icône PNG déjà réduite par l'interface.
pub fn store(dir: &Path, category: &str, name: &str, png: &[u8]) -> Result<IconItem> {
    if png.len() < 8 || &png[..8] != b"\x89PNG\r\n\x1a\n" {
        return Err("Icône refusée : ce n'est pas une image PNG".into());
    }
    if png.len() > MAX_ICON_BYTES {
        return Err("Icône trop lourde".into());
    }
    let category = clean_label(category, "Divers");
    let name = clean_label(name, "Icône");
    fs::create_dir_all(dir).map_err(|e| format!("Création de la bibliothèque impossible : {e}"))?;
    let mut m = read_manifest(dir);
    let existing = m.items.iter().position(|i| i.category == category && i.name == name);
    let id = match existing {
        Some(k) => m.items[k].id.clone(),
        None => new_id(),
    };
    safe_id(&id)?;
    atomic_write(&dir.join(&id), png)?;
    let item = IconItem { id, category, name };
    match existing {
        Some(k) => m.items[k] = item.clone(),
        None => m.items.push(item.clone()),
    }
    write_manifest(dir, &m)?;
    Ok(item)
}

/// Retire des icônes de la bibliothèque (les projets gardent leurs copies).
pub fn remove(dir: &Path, ids: &[String]) -> Result<usize> {
    let mut m = read_manifest(dir);
    let before = m.items.len();
    m.items.retain(|i| !ids.contains(&i.id));
    for id in ids {
        if safe_id(id).is_ok() {
            let _ = fs::remove_file(dir.join(id));
        }
    }
    write_manifest(dir, &m)?;
    Ok(before - m.items.len())
}

/// Octets d'une icône de la bibliothèque.
pub fn read(dir: &Path, id: &str) -> Result<Vec<u8>> {
    safe_id(id)?;
    fs::read(dir.join(id)).map_err(|_| format!("Icône introuvable : « {id} »"))
}

fn clean_label(s: &str, fallback: &str) -> String {
    let t: String = s.chars().filter(|c| !c.is_control()).collect::<String>().trim().chars().take(80).collect();
    if t.is_empty() {
        fallback.to_string()
    } else {
        t
    }
}

/// Images d'un dossier choisi par l'utilisateur : catégorie = sous-dossier de premier niveau.
pub fn scan(root: &Path) -> Result<Vec<SourceFile>> {
    if !root.is_dir() {
        return Err("Dossier introuvable".into());
    }
    let root_name = root.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "Divers".into());
    let mut out = Vec::new();
    walk(root, root, 0, &root_name, &mut out)?;
    out.sort_by(|a, b| (a.category.to_lowercase(), a.name.to_lowercase()).cmp(&(b.category.to_lowercase(), b.name.to_lowercase())));
    Ok(out)
}

fn walk(root: &Path, dir: &Path, depth: usize, root_name: &str, out: &mut Vec<SourceFile>) -> Result<()> {
    if depth > 3 {
        return Ok(());
    }
    let mut entries: Vec<_> = fs::read_dir(dir).map_err(|e| format!("Lecture du dossier impossible : {e}"))?.flatten().collect();
    entries.sort_by_key(|e| e.file_name());
    for e in entries {
        let name = e.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let path = e.path();
        let Ok(meta) = fs::symlink_metadata(&path) else { continue };
        if meta.file_type().is_symlink() {
            continue;
        }
        if meta.is_dir() {
            walk(root, &path, depth + 1, root_name, out)?;
            continue;
        }
        let ext = path.extension().map(|x| x.to_string_lossy().to_lowercase()).unwrap_or_default();
        if !EXTS.contains(&ext.as_str()) || meta.len() == 0 || meta.len() > MAX_SOURCE_BYTES {
            continue;
        }
        let Ok(rel) = path.strip_prefix(root) else { continue };
        let category = rel.components().next().filter(|_| rel.components().count() > 1).map(|c| c.as_os_str().to_string_lossy().into_owned()).unwrap_or_else(|| root_name.to_string());
        let stem = path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
        out.push(SourceFile { rel: rel.to_string_lossy().into_owned(), category, name: stem });
        if out.len() >= MAX_FILES {
            return Err(format!("Dossier trop volumineux (plus de {MAX_FILES} images) : choisissez le dossier des icônes seulement"));
        }
    }
    Ok(())
}

/// Lit un fichier du dossier analysé, sans jamais sortir de ce dossier.
pub fn read_source(root: &Path, rel: &str) -> Result<Vec<u8>> {
    let path: PathBuf = root.join(rel);
    let real = path.canonicalize().map_err(|_| "Fichier introuvable".to_string())?;
    let base = root.canonicalize().map_err(|_| "Dossier introuvable".to_string())?;
    if !real.starts_with(&base) {
        return Err("Fichier hors du dossier choisi".into());
    }
    let meta = fs::metadata(&real).map_err(|_| "Fichier introuvable".to_string())?;
    if meta.len() > MAX_SOURCE_BYTES {
        return Err("Image trop lourde".into());
    }
    fs::read(&real).map_err(|e| format!("Lecture impossible : {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("prepvis-icons-{name}-{}", new_id()));
        fs::create_dir_all(&d).unwrap();
        d
    }
    const PNG: &[u8] = b"\x89PNG\r\n\x1a\nxxxx";

    #[test]
    fn scan_categories_and_skips() {
        let root = tmp("scan").join("PF_ICONES");
        fs::create_dir_all(root.join("Cam")).unwrap();
        fs::create_dir_all(root.join(".cache")).unwrap();
        fs::write(root.join("Cam/Camera 2.png"), PNG).unwrap();
        fs::write(root.join("Cam/notes.txt"), b"x").unwrap();
        fs::write(root.join(".cache/a.png"), PNG).unwrap();
        fs::write(root.join("Seule.png"), PNG).unwrap();
        let s = scan(&root).unwrap();
        assert_eq!(s, vec![
            SourceFile { rel: "Cam/Camera 2.png".into(), category: "Cam".into(), name: "Camera 2".into() },
            SourceFile { rel: "Seule.png".into(), category: "PF_ICONES".into(), name: "Seule".into() },
        ]);
        assert!(read_source(&root, "Cam/Camera 2.png").is_ok());
        assert!(read_source(&root, "../x").is_err());
    }

    #[test]
    fn store_list_replace_remove() {
        let dir = tmp("lib");
        let a = store(&dir, "Cam", "Tripod", PNG).unwrap();
        let b = store(&dir, "Cam", "Tripod", PNG).unwrap();
        assert_eq!(a.id, b.id, "même catégorie et même nom : remplacée, pas dupliquée");
        store(&dir, "Lumière", "Fresnel", PNG).unwrap();
        assert_eq!(list(&dir).len(), 2);
        assert!(store(&dir, "X", "Y", b"GIF89a").is_err());
        assert!(read(&dir, "../bibliotheque.json").is_err());
        assert_eq!(remove(&dir, &[a.id.clone()]).unwrap(), 1);
        assert_eq!(list(&dir).len(), 1);
        assert!(read(&dir, &a.id).is_err());
    }
}
