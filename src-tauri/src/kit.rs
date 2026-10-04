//! « Mon matériel » : un fichier JSON dans le dossier de données de l'application, commun à
//! tous les projets. Son contenu est validé par l'interface (src/model/kit.ts) ; ici on garantit
//! l'écriture atomique et une copie de la version précédente (`materiel.json.bak`).

use std::fs;
use std::path::Path;

use crate::storage::{atomic_write, Result};

pub const KIT_FILE: &str = "materiel.json";
const KIT_BACKUP: &str = "materiel.json.bak";
/// Au-delà, ce n'est sûrement pas « Mon matériel » (quelques centaines d'éléments font quelques ko).
const MAX_BYTES: usize = 5 * 1024 * 1024;

/// Contenu du fichier, ou None s'il n'existe pas encore.
pub fn read(dir: &Path) -> Result<Option<String>> {
    match fs::read_to_string(dir.join(KIT_FILE)) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Lecture de « Mon matériel » impossible : {e}")),
    }
}

/// Remplace le fichier (la version précédente est gardée en copie).
pub fn write(dir: &Path, json: &str) -> Result<()> {
    if json.len() > MAX_BYTES {
        return Err("« Mon matériel » est trop volumineux".into());
    }
    serde_json::from_str::<serde_json::Value>(json).map_err(|e| format!("« Mon matériel » illisible : {e}"))?;
    fs::create_dir_all(dir).map_err(|e| format!("Création du dossier impossible : {e}"))?;
    let path = dir.join(KIT_FILE);
    if path.is_file() {
        fs::copy(&path, dir.join(KIT_BACKUP)).map_err(|e| format!("Copie de sauvegarde impossible : {e}"))?;
    }
    atomic_write(&path, json.as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("prepvis-kit-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        d
    }

    #[test]
    fn read_write_backup() {
        let d = tmp("rw");
        assert_eq!(read(&d).unwrap(), None);
        write(&d, r#"{"version":1}"#).unwrap();
        assert_eq!(read(&d).unwrap().as_deref(), Some(r#"{"version":1}"#));
        write(&d, r#"{"version":1,"x":2}"#).unwrap();
        assert_eq!(fs::read_to_string(d.join(KIT_BACKUP)).unwrap(), r#"{"version":1}"#);
        assert!(write(&d, "pas du json").is_err());
        assert_eq!(read(&d).unwrap().as_deref(), Some(r#"{"version":1,"x":2}"#));
        let _ = fs::remove_dir_all(&d);
    }
}
