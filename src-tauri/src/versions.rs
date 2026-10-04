//! Versions nommées du projet (« V2 envoyée à la réalisation »…), dans le dossier versions/
//! du projet. Une version n'est jamais modifiée : on en crée une nouvelle.

use std::fs;
use std::path::Path;

use serde::Serialize;

use crate::storage::{atomic_write, Result, PROJECT_FILE};

pub const VERSIONS_DIR: &str = "versions";

#[derive(Serialize, Debug)]
pub struct VersionInfo {
    pub file: String,
    pub name: String,
    pub note: String,
    #[serde(rename = "createdAt")]
    pub created_at: u64,
}

fn safe_file(file: &str) -> Result<()> {
    let ok = file.len() <= 120 && file.ends_with(".json") && file.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.') && file.matches('.').count() == 1;
    if ok {
        Ok(())
    } else {
        Err(format!("Version inconnue : « {file} »"))
    }
}

/// Enregistre une version : `json` contient déjà nom, note, date et document (préparés par l'interface).
pub fn create(dir: &Path, stamp: &str, json: &str) -> Result<String> {
    if !dir.join(PROJECT_FILE).exists() {
        return Err("Projet introuvable".into());
    }
    let v: serde_json::Value = serde_json::from_str(json).map_err(|_| "Version illisible".to_string())?;
    if v.get("doc").is_none() || v.get("name").and_then(|n| n.as_str()).is_none() {
        return Err("Version incomplète".into());
    }
    let clean: String = stamp.chars().filter(|c| c.is_ascii_digit() || *c == '-').take(40).collect();
    let vdir = dir.join(VERSIONS_DIR);
    fs::create_dir_all(&vdir).map_err(|e| format!("Création du dossier des versions impossible : {e}"))?;
    let mut file = format!("v-{clean}.json");
    let mut n = 2;
    while vdir.join(&file).exists() {
        file = format!("v-{clean}-{n}.json");
        n += 1;
    }
    safe_file(&file)?;
    atomic_write(&vdir.join(&file), json.as_bytes())?;
    Ok(file)
}

/// Versions, de la plus récente à la plus ancienne. Un fichier illisible est ignoré (jamais supprimé).
pub fn list(dir: &Path) -> Vec<VersionInfo> {
    let Ok(rd) = fs::read_dir(dir.join(VERSIONS_DIR)) else { return Vec::new() };
    let mut out: Vec<VersionInfo> = rd
        .flatten()
        .filter_map(|e| {
            let file = e.file_name().to_string_lossy().into_owned();
            safe_file(&file).ok()?;
            let v: serde_json::Value = serde_json::from_slice(&fs::read(e.path()).ok()?).ok()?;
            Some(VersionInfo {
                name: v.get("name")?.as_str()?.to_string(),
                note: v.get("note").and_then(|n| n.as_str()).unwrap_or("").to_string(),
                created_at: v.get("createdAt").and_then(|n| n.as_u64()).unwrap_or(0),
                file,
            })
        })
        .collect();
    out.sort_by(|a, b| b.created_at.cmp(&a.created_at).then(b.file.cmp(&a.file)));
    out
}

pub fn read(dir: &Path, file: &str) -> Result<String> {
    safe_file(file)?;
    fs::read_to_string(dir.join(VERSIONS_DIR).join(file)).map_err(|_| format!("Version introuvable : « {file} »"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_list_read() {
        let dir = std::env::temp_dir().join(format!("prepvis-versions-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        assert!(create(&dir, "20261004-120000", r#"{"name":"V1","doc":{}}"#).is_err(), "pas de projet : refusé");
        fs::write(dir.join(PROJECT_FILE), "{}").unwrap();
        let a = create(&dir, "20261004-120000", r#"{"name":"V1","note":"","createdAt":1,"doc":{}}"#).unwrap();
        let b = create(&dir, "20261004-120000", r#"{"name":"V2","note":"réal","createdAt":2,"doc":{}}"#).unwrap();
        assert_ne!(a, b, "même seconde : deux fichiers distincts");
        assert!(create(&dir, "x", "pas du json").is_err());
        let l = list(&dir);
        assert_eq!(l.iter().map(|v| v.name.as_str()).collect::<Vec<_>>(), vec!["V2", "V1"]);
        assert!(read(&dir, &a).unwrap().contains("V1"));
        assert!(read(&dir, "../project.json").is_err());
    }
}
