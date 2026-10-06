//! Préférences de l'app (`preferences.json`, dossier de données de PrepVisPro sur ce Mac).
//! Le contenu est validé côté interface (src/model/prefs.ts) ; ici : lecture, et écriture
//! atomique (jamais un fichier à moitié écrit).

use std::fs;
use std::path::Path;

use crate::storage::{atomic_write, Result};

pub const PREFS_FILE: &str = "preferences.json";

/// Taille maximale acceptée : des préférences ne pèsent que quelques kilo-octets.
const MAX_BYTES: usize = 1 << 20;

/// Contenu du fichier, ou None s'il n'existe pas encore.
pub fn read(dir: &Path) -> Result<Option<String>> {
    match fs::read_to_string(dir.join(PREFS_FILE)) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Lecture des préférences impossible : {e}")),
    }
}

pub fn write(dir: &Path, json: &str) -> Result<()> {
    if json.len() > MAX_BYTES {
        return Err("Préférences trop volumineuses".into());
    }
    fs::create_dir_all(dir).map_err(|e| format!("Dossier des préférences impossible à créer : {e}"))?;
    atomic_write(&dir.join(PREFS_FILE), json.as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("prepvis-prefs-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        d
    }

    #[test]
    fn absent_then_written_then_replaced() {
        let d = tmp("rw");
        assert_eq!(read(&d).unwrap(), None);
        write(&d, r#"{"version":1}"#).unwrap();
        assert_eq!(read(&d).unwrap().as_deref(), Some(r#"{"version":1}"#));
        write(&d, r#"{"version":1,"x":2}"#).unwrap();
        assert_eq!(read(&d).unwrap().as_deref(), Some(r#"{"version":1,"x":2}"#));
        // Aucun fichier temporaire laissé derrière.
        assert_eq!(fs::read_dir(&d).unwrap().count(), 1);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn refuses_oversized() {
        let d = tmp("big");
        assert!(write(&d, &"x".repeat(MAX_BYTES + 1)).is_err());
        assert_eq!(read(&d).unwrap(), None);
        let _ = fs::remove_dir_all(&d);
    }
}
