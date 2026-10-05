//! Ancien « Mon matériel » (v0.8.0 à 0.8.2) : un fichier JSON dans le dossier de données de
//! l'application. Le matériel appartient désormais au projet ; ce fichier est seulement lu, pour
//! le reprendre dans un projet (contenu validé par src/model/equipment.ts). Il n'est plus écrit.

use std::fs;
use std::path::Path;

use crate::storage::Result;

pub const KIT_FILE: &str = "materiel.json";

/// Contenu du fichier, ou None s'il n'existe pas encore.
pub fn read(dir: &Path) -> Result<Option<String>> {
    match fs::read_to_string(dir.join(KIT_FILE)) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Lecture de « Mon matériel » impossible : {e}")),
    }
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
    fn read_absent_then_present() {
        let d = tmp("r");
        assert_eq!(read(&d).unwrap(), None);
        fs::create_dir_all(&d).unwrap();
        fs::write(d.join(KIT_FILE), r#"{"version":1}"#).unwrap();
        assert_eq!(read(&d).unwrap().as_deref(), Some(r#"{"version":1}"#));
        let _ = fs::remove_dir_all(&d);
    }
}
