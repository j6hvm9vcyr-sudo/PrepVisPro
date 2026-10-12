//! Stockage du projet sur disque.
//!
//! Un projet est un dossier `Nom.topshot` (`Nom.prepvis` avant la 0.12) :
//!   project.json   — le document (validé côté interface avant chaque écriture)
//!   images/        — les images importées (noms générés, jamais réécrits)
//!   backups/       — copies horodatées de project.json
//!
//! Garanties :
//! - écriture atomique : on écrit un fichier temporaire, on le force sur le disque (fsync),
//!   puis on le renomme. En cas de coupure, l'ancien fichier reste intact ;
//! - avant d'écraser project.json, une copie de sauvegarde est faite (au plus une toutes
//!   les `BACKUP_INTERVAL_SECS`), et seules les `BACKUP_KEEP` plus récentes sont gardées ;
//! - aucun nom de fichier venant de l'interface ne peut sortir du dossier projet.

use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub const PROJECT_FILE: &str = "project.json";
pub const IMAGES_DIR: &str = "images";
pub const BACKUPS_DIR: &str = "backups";
pub const BACKUP_INTERVAL_SECS: u64 = 10 * 60;
pub const BACKUP_KEEP: usize = 60;
/// Taille maximale d'une image importée (200 Mo) : au-delà, c'est sûrement une erreur.
pub const MAX_IMAGE_BYTES: usize = 200 * 1024 * 1024;

pub type Result<T> = std::result::Result<T, String>;

fn err<E: std::fmt::Display>(context: &str) -> impl FnOnce(E) -> String + '_ {
    move |e| format!("{context} : {e}")
}

/// Écrit `bytes` dans `path` de façon atomique.
pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
    let dir = path.parent().ok_or("Chemin sans dossier parent")?;
    let name = path.file_name().ok_or("Chemin sans nom de fichier")?.to_string_lossy();
    let tmp = dir.join(format!(".{name}.tmp-{}", std::process::id()));
    {
        let mut f = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&tmp)
            .map_err(err("Création du fichier temporaire impossible"))?;
        f.write_all(bytes).map_err(err("Écriture impossible"))?;
        f.sync_all().map_err(err("Écriture sur le disque impossible"))?;
    }
    if let Err(e) = fs::rename(&tmp, path) {
        let _ = fs::remove_file(&tmp);
        return Err(format!("Remplacement du fichier impossible : {e}"));
    }
    // Rend le renommage durable (métadonnées du dossier).
    if let Ok(d) = File::open(dir) {
        let _ = d.sync_all();
    }
    Ok(())
}

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// Horodatage triable, en UTC : 20261004-134501.
pub fn stamp(secs: u64) -> String {
    let days = secs / 86_400;
    let rem = secs % 86_400;
    let (h, m, s) = (rem / 3600, (rem % 3600) / 60, rem % 60);
    // Conversion jours → date (algorithme de Howard Hinnant).
    let z = days as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let mo = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if mo <= 2 { y + 1 } else { y };
    format!("{y:04}{mo:02}{d:02}-{h:02}{m:02}{s:02}")
}

fn backups(dir: &Path) -> Vec<PathBuf> {
    let mut v: Vec<PathBuf> = fs::read_dir(dir.join(BACKUPS_DIR))
        .map(|rd| {
            rd.filter_map(|e| e.ok())
                .map(|e| e.path())
                .filter(|p| p.file_name().map(|n| n.to_string_lossy().starts_with("project-")).unwrap_or(false))
                .collect()
        })
        .unwrap_or_default();
    v.sort();
    v
}

fn last_backup_secs(dir: &Path) -> Option<u64> {
    backups(dir).last().and_then(|p| fs::metadata(p).ok()).and_then(|m| m.modified().ok()).and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_secs())
}

/// Copie project.json dans backups/ si la dernière sauvegarde est assez ancienne (ou si `force`).
pub fn backup_if_due(dir: &Path, force: bool, now: u64) -> Result<Option<PathBuf>> {
    let current = dir.join(PROJECT_FILE);
    if !current.exists() {
        return Ok(None);
    }
    let due = force || last_backup_secs(dir).map(|t| now.saturating_sub(t) >= BACKUP_INTERVAL_SECS).unwrap_or(true);
    if !due {
        return Ok(None);
    }
    let bdir = dir.join(BACKUPS_DIR);
    fs::create_dir_all(&bdir).map_err(err("Création du dossier de sauvegardes impossible"))?;
    let mut target = bdir.join(format!("project-{}.json", stamp(now)));
    let mut n = 1;
    while target.exists() {
        n += 1;
        target = bdir.join(format!("project-{}-{n}.json", stamp(now)));
    }
    let bytes = fs::read(&current).map_err(err("Lecture du projet impossible"))?;
    atomic_write(&target, &bytes)?;
    let all = backups(dir);
    if all.len() > BACKUP_KEEP {
        for old in &all[..all.len() - BACKUP_KEEP] {
            let _ = fs::remove_file(old);
        }
    }
    Ok(Some(target))
}

fn ensure_layout(dir: &Path) -> Result<()> {
    fs::create_dir_all(dir.join(IMAGES_DIR)).map_err(err("Création du dossier images impossible"))?;
    fs::create_dir_all(dir.join(BACKUPS_DIR)).map_err(err("Création du dossier de sauvegardes impossible"))?;
    Ok(())
}

/// Crée un nouveau projet. Refuse d'écraser un dossier existant non vide.
pub fn create_project(dir: &Path, json: &str) -> Result<()> {
    if dir.exists() {
        let non_empty = fs::read_dir(dir).map(|mut r| r.next().is_some()).unwrap_or(true);
        if non_empty {
            return Err(format!("« {} » existe déjà. Choisissez un autre nom.", dir.display()));
        }
    }
    fs::create_dir_all(dir).map_err(err("Création du dossier projet impossible"))?;
    ensure_layout(dir)?;
    atomic_write(&dir.join(PROJECT_FILE), json.as_bytes())
}

/// Lit project.json. Le contenu est validé par l'interface, qui refuse un fichier invalide.
pub fn load_project(dir: &Path) -> Result<String> {
    let path = dir.join(PROJECT_FILE);
    if !path.exists() {
        return Err(format!("Aucun projet Topshot dans « {} ».", dir.display()));
    }
    let s = fs::read_to_string(&path).map_err(err("Lecture du projet impossible"))?;
    ensure_layout(dir)?;
    Ok(s)
}

/// Empreinte d'un contenu (pour détecter une modification faite ailleurs).
pub fn fingerprint(bytes: &[u8]) -> u64 {
    // FNV-1a 64 bits : simple, stable, suffisant pour détecter un changement.
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in bytes {
        h ^= *b as u64;
        h = h.wrapping_mul(0x0100_0000_01b3);
    }
    h
}

/// Préfixe des erreurs « modifié ailleurs », reconnu par l'interface.
pub const CONFLICT_PREFIX: &str = "CONFLIT:";

/// Enregistre le projet (sauvegarde horodatée si due, puis écriture atomique).
/// `expected` : empreinte du fichier tel que l'application l'a lu ou écrit la dernière fois.
/// Si le fichier a changé entre-temps (autre ordinateur, synchronisation), on n'écrase pas.
pub fn save_project_checked(dir: &Path, json: &str, force_backup: bool, expected: Option<u64>) -> Result<u64> {
    let path = dir.join(PROJECT_FILE);
    if let Some(exp) = expected {
        if let Ok(current) = fs::read(&path) {
            if fingerprint(&current) != exp {
                return Err(format!("{CONFLICT_PREFIX}Le projet a été modifié en dehors de Topshot (autre ordinateur, synchronisation…)."));
            }
        }
    }
    save_project(dir, json, force_backup)?;
    Ok(fingerprint(json.as_bytes()))
}

/// Enregistre le projet (sauvegarde horodatée si due, puis écriture atomique).
pub fn save_project(dir: &Path, json: &str, force_backup: bool) -> Result<()> {
    if !dir.join(PROJECT_FILE).exists() {
        return Err(format!("Le projet « {} » est introuvable (déplacé ou supprimé ?).", dir.display()));
    }
    ensure_layout(dir)?;
    backup_if_due(dir, force_backup, now_secs())?;
    atomic_write(&dir.join(PROJECT_FILE), json.as_bytes())
}

/// Garde une copie de la version de l'application quand le fichier a été modifié ailleurs :
/// rien n'est perdu, quel que soit le choix de l'utilisateur.
pub fn save_conflict_copy(dir: &Path, json: &str) -> Result<PathBuf> {
    let bdir = dir.join(BACKUPS_DIR);
    fs::create_dir_all(&bdir).map_err(err("Création du dossier de sauvegardes impossible"))?;
    let target = bdir.join(format!("conflit-{}.json", stamp(now_secs())));
    atomic_write(&target, json.as_bytes())?;
    Ok(target)
}

/// Nom d'image sûr : lettres minuscules, chiffres, tirets, un seul point d'extension connue.
pub fn safe_image_name(name: &str) -> Result<String> {
    let ok_chars = name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '.');
    let parts: Vec<&str> = name.split('.').collect();
    let exts = ["jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "tif", "tiff"];
    if !ok_chars || parts.len() != 2 || parts[0].is_empty() || parts[0].len() > 64 || !exts.contains(&parts[1]) {
        return Err(format!("Nom d'image refusé : « {name} »"));
    }
    Ok(name.to_string())
}

/// Écrit une image importée dans images/. Ne remplace jamais une image existante.
pub fn write_image(dir: &Path, name: &str, bytes: &[u8]) -> Result<String> {
    let name = safe_image_name(name)?;
    if bytes.is_empty() {
        return Err("Image vide".into());
    }
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err("Image trop lourde (plus de 200 Mo)".into());
    }
    if !dir.join(PROJECT_FILE).exists() {
        return Err("Projet introuvable pour enregistrer l'image".into());
    }
    let target = dir.join(IMAGES_DIR).join(&name);
    if target.exists() {
        return Err(format!("Une image « {name} » existe déjà"));
    }
    fs::create_dir_all(dir.join(IMAGES_DIR)).map_err(err("Création du dossier images impossible"))?;
    atomic_write(&target, bytes)?;
    Ok(format!("{IMAGES_DIR}/{name}"))
}

/// Lit une image du projet (pour les exports).
pub fn read_image(dir: &Path, file: &str) -> Result<Vec<u8>> {
    let name = file.strip_prefix(&format!("{IMAGES_DIR}/")).ok_or("Chemin d'image invalide")?;
    let name = safe_image_name(name)?;
    fs::read(dir.join(IMAGES_DIR).join(name)).map_err(err("Lecture de l'image impossible"))
}

/// Écrit un fichier exporté (PDF, Excel, CSV) à l'emplacement choisi par l'utilisateur.
pub fn write_export(path: &Path, bytes: &[u8]) -> Result<()> {
    let ext = path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    if !["pdf", "xlsx", "csv", "png"].contains(&ext.as_str()) {
        return Err(format!("Type de fichier d'export refusé : « {} »", path.display()));
    }
    if path.parent().map(|p| !p.is_dir()).unwrap_or(true) {
        return Err("Le dossier de destination n'existe pas".into());
    }
    atomic_write(path, bytes)
}

/// Publier (0.20) : réécrit un fichier du dossier de diffusion **sur place** (même fichier, contenu
/// remplacé), comme un enregistrement ordinaire. Un remplacement par renommage créerait un autre
/// fichier pour certains drive (nouvel identifiant), et le lien partagé ne mènerait plus à la
/// dernière version. Le contenu est vérifié après écriture.
pub fn write_in_place(path: &Path, bytes: &[u8]) -> Result<()> {
    let ext = path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    if !["pdf", "xlsx", "csv", "html"].contains(&ext.as_str()) {
        return Err(format!("Type de fichier refusé : « {} »", path.display()));
    }
    if path.parent().map(|p| !p.is_dir()).unwrap_or(true) {
        return Err("Le dossier de diffusion est introuvable (déplacé, renommé, ou drive déconnecté ?)".into());
    }
    if path.is_dir() {
        return Err(format!("« {} » est un dossier", path.display()));
    }
    {
        let mut f = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(path)
            .map_err(err("Écriture dans le dossier de diffusion impossible"))?;
        f.write_all(bytes).map_err(err("Écriture impossible"))?;
        f.sync_all().map_err(err("Écriture sur le disque impossible"))?;
    }
    let written = fs::read(path).map_err(err("Relecture du fichier publié impossible"))?;
    if written != bytes {
        return Err(format!("Le fichier « {} » n'a pas été écrit en entier", path.display()));
    }
    Ok(())
}

/// Retours (0.21) : sous-dossier où l'équipe dépose ses fichiers de retours, à côté des fichiers publiés.
pub const RETOURS_DIR: &str = "Retours";
pub const RETOURS_EXT: &str = "topshot-retours";
const RETOURS_MAX: u64 = 2 * 1024 * 1024;

/// Crée « Retours » dans le dossier de diffusion s'il manque (le dossier lui-même doit exister).
pub fn retours_dir(folder: &Path) -> Result<()> {
    if !folder.is_dir() {
        return Err("Le dossier de diffusion est introuvable (déplacé, renommé, ou drive déconnecté ?)".into());
    }
    let d = folder.join(RETOURS_DIR);
    if d.is_dir() {
        return Ok(());
    }
    fs::create_dir(&d).map_err(err("Création du dossier « Retours » impossible"))
}

/// Lit un fichier de retours (taille limitée, texte UTF-8).
pub fn read_retours(path: &Path) -> Result<String> {
    let ext = path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    if ext != RETOURS_EXT {
        return Err("Ce n'est pas un fichier de retours Topshot".into());
    }
    let meta = fs::metadata(path).map_err(err("Fichier de retours introuvable"))?;
    if meta.len() > RETOURS_MAX {
        return Err("Fichier trop lourd pour des retours".into());
    }
    let bytes = fs::read(path).map_err(err("Lecture du fichier de retours impossible"))?;
    String::from_utf8(bytes).map_err(|_| "Fichier de retours illisible (pas du texte)".to_string())
}

/// Fichiers de retours déposés dans « Retours » (nom, contenu), dans l'ordre des noms ; les
/// fichiers illisibles sont passés (un drive peut montrer un fichier pas encore téléchargé).
pub fn list_retours(folder: &Path) -> Result<Vec<(String, String)>> {
    let d = folder.join(RETOURS_DIR);
    if !d.is_dir() {
        return Ok(vec![]);
    }
    let mut out = vec![];
    for e in fs::read_dir(&d).map_err(err("Lecture du dossier « Retours » impossible"))?.flatten() {
        let p = e.path();
        let name = e.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') || !p.is_file() {
            continue;
        }
        if let Ok(text) = read_retours(&p) {
            out.push((name, text));
        }
    }
    out.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(out)
}

/// Formats de scénario acceptés à l'import.
pub const SCRIPT_EXTENSIONS: [&str; 7] = ["fdx", "xml", "fountain", "txt", "md", "docx", "pdf"];

/// Lit un scénario choisi par l'utilisateur (octets bruts, décodés côté interface selon le format).
/// Taille limitée à 50 Mo (un PDF de scénario avec images reste bien en dessous).
pub fn read_script(path: &Path) -> Result<Vec<u8>> {
    let ext = path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    if !SCRIPT_EXTENSIONS.contains(&ext.as_str()) {
        return Err("Format de scénario non pris en charge (Final Draft, Fountain, texte, Word ou PDF)".into());
    }
    let meta = fs::metadata(path).map_err(err("Scénario introuvable"))?;
    if meta.len() > 50 * 1024 * 1024 {
        return Err("Fichier trop lourd pour un scénario".into());
    }
    fs::read(path).map_err(err("Lecture du scénario impossible"))
}

/// Normalise le chemin choisi : un fichier project.json désigne son dossier.
/// Extension des projets d'avant la 0.12 (PrepVisPro).
pub const LEGACY_EXT: &str = "prepvis";
pub const PROJECT_EXT: &str = "topshot";

/// Projet `Nom.prepvis` : renommé en `Nom.topshot` (même dossier, contenu intact).
/// Renvoie le nouveau chemin, ou `None` si le nom est gardé (pas un ancien projet, ou un
/// `Nom.topshot` existe déjà à côté : rien n'est jamais écrasé).
pub fn rename_legacy(dir: &Path) -> Result<Option<PathBuf>> {
    let legacy = dir.extension().map(|e| e.eq_ignore_ascii_case(LEGACY_EXT)).unwrap_or(false);
    if !legacy || !dir.join(PROJECT_FILE).is_file() {
        return Ok(None);
    }
    let target = dir.with_extension(PROJECT_EXT);
    if target.exists() {
        return Ok(None);
    }
    fs::rename(dir, &target).map_err(|e| format!("Renommage de « {} » impossible : {e}", dir.display()))?;
    Ok(Some(target))
}

pub fn project_dir_from_pick(p: &Path) -> PathBuf {
    if p.file_name().map(|n| n == PROJECT_FILE).unwrap_or(false) {
        if let Some(parent) = p.parent() {
            return parent.to_path_buf();
        }
    }
    p.to_path_buf()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmpdir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("prepvis-test-{tag}-{}-{}", std::process::id(), now_secs()));
        let _ = fs::remove_dir_all(&d);
        d
    }

    #[test]
    fn publier_sur_place() {
        let d = tmpdir("publier");
        fs::create_dir_all(&d).unwrap();
        let f = d.join("Le Quai — découpage.pdf");
        write_in_place(&f, b"%PDF-1").unwrap();
        #[cfg(unix)]
        let ino = {
            use std::os::unix::fs::MetadataExt;
            fs::metadata(&f).unwrap().ino()
        };
        write_in_place(&f, b"%PDF-2, plus long").unwrap();
        assert_eq!(fs::read(&f).unwrap(), b"%PDF-2, plus long");
        write_in_place(&f, b"%PDF-3").unwrap();
        assert_eq!(fs::read(&f).unwrap(), b"%PDF-3");
        // Le même fichier (même inode) : le drive y voit une nouvelle version, pas un autre fichier.
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            assert_eq!(fs::metadata(&f).unwrap().ino(), ino);
        }
        assert!(write_in_place(&d.join("x.json"), b"{}").is_err());
        assert!(write_in_place(&d.join("absent").join("a.pdf"), b"x").is_err());
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn retours_deposes() {
        let d = tmpdir("retours");
        fs::create_dir_all(&d).unwrap();
        assert!(list_retours(&d).unwrap().is_empty());
        retours_dir(&d).unwrap();
        retours_dir(&d).unwrap();
        let r = d.join(RETOURS_DIR);
        fs::write(r.join("Margaux.topshot-retours"), "{\"a\":1}").unwrap();
        fs::write(r.join("autre.txt"), "x").unwrap();
        fs::write(r.join(".cache.topshot-retours"), "x").unwrap();
        fs::write(r.join("binaire.topshot-retours"), [0xff, 0xfe, 0x00]).unwrap();
        let l = list_retours(&d).unwrap();
        assert_eq!(l, vec![("Margaux.topshot-retours".to_string(), "{\"a\":1}".to_string())]);
        assert!(read_retours(&r.join("autre.txt")).is_err());
        assert!(retours_dir(&d.join("absent")).is_err());
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn horodatage() {
        assert_eq!(stamp(0), "19700101-000000");
        assert_eq!(stamp(1_791_067_098), "20261003-223818");
        assert_eq!(stamp(951_782_400), "20000229-000000");
    }

    #[test]
    fn creer_lire_enregistrer() {
        let d = tmpdir("crud").join("Film.prepvis");
        create_project(&d, "{\"a\":1}").unwrap();
        assert_eq!(load_project(&d).unwrap(), "{\"a\":1}");
        assert!(d.join(IMAGES_DIR).is_dir());
        save_project(&d, "{\"a\":2}", false).unwrap();
        assert_eq!(load_project(&d).unwrap(), "{\"a\":2}");
        // Une sauvegarde de la version précédente a été faite.
        let b = backups(&d);
        assert_eq!(b.len(), 1);
        assert_eq!(fs::read_to_string(&b[0]).unwrap(), "{\"a\":1}");
        // Pas de nouvelle sauvegarde dans l'intervalle…
        save_project(&d, "{\"a\":3}", false).unwrap();
        assert_eq!(backups(&d).len(), 1);
        // …sauf si on la force.
        save_project(&d, "{\"a\":4}", true).unwrap();
        assert_eq!(backups(&d).len(), 2);
        // Aucun fichier temporaire ne traîne.
        let leftovers: Vec<_> = fs::read_dir(&d).unwrap().filter_map(|e| e.ok()).filter(|e| e.file_name().to_string_lossy().contains(".tmp-")).collect();
        assert!(leftovers.is_empty());
        fs::remove_dir_all(d.parent().unwrap()).unwrap();
    }

    #[test]
    fn refuse_d_ecraser_un_dossier_existant() {
        let d = tmpdir("exists").join("Film.prepvis");
        create_project(&d, "{}").unwrap();
        assert!(create_project(&d, "{}").is_err());
        fs::remove_dir_all(d.parent().unwrap()).unwrap();
    }

    #[test]
    fn enregistrer_un_projet_disparu_echoue() {
        let d = tmpdir("gone").join("Film.prepvis");
        assert!(save_project(&d, "{}", false).is_err());
        assert!(load_project(&d).is_err());
    }

    #[test]
    fn rotation_des_sauvegardes() {
        let d = tmpdir("rot").join("Film.prepvis");
        create_project(&d, "{}").unwrap();
        for i in 0..(BACKUP_KEEP + 5) {
            backup_if_due(&d, true, 1_000_000 + i as u64).unwrap();
        }
        assert_eq!(backups(&d).len(), BACKUP_KEEP);
        fs::remove_dir_all(d.parent().unwrap()).unwrap();
    }

    #[test]
    fn noms_d_images_surs() {
        assert!(safe_image_name("ab12-cd.jpg").is_ok());
        assert!(safe_image_name("../x.jpg").is_err());
        assert!(safe_image_name("a/b.jpg").is_err());
        assert!(safe_image_name("x.exe").is_err());
        assert!(safe_image_name("X.JPG").is_err());
        assert!(safe_image_name("a.b.jpg").is_err());
        assert!(safe_image_name(".jpg").is_err());
    }

    #[test]
    fn ecrire_une_image() {
        let d = tmpdir("img").join("Film.prepvis");
        create_project(&d, "{}").unwrap();
        assert_eq!(write_image(&d, "abc.png", b"\x89PNG").unwrap(), "images/abc.png");
        assert!(write_image(&d, "abc.png", b"x").is_err(), "jamais d'écrasement");
        assert!(write_image(&d, "vide.png", b"").is_err());
        fs::remove_dir_all(d.parent().unwrap()).unwrap();
    }

    #[test]
    fn exports_et_lecture_d_image() {
        let d = tmpdir("exp");
        fs::create_dir_all(&d).unwrap();
        write_export(&d.join("a.pdf"), b"%PDF").unwrap();
        assert!(write_export(&d.join("a.sh"), b"x").is_err());
        assert!(write_export(&d.join("absent/a.pdf"), b"x").is_err());
        let p = d.join("F.prepvis");
        create_project(&p, "{}").unwrap();
        write_image(&p, "x.png", b"123").unwrap();
        assert_eq!(read_image(&p, "images/x.png").unwrap(), b"123");
        assert!(read_image(&p, "../project.json").is_err());
        assert!(read_image(&p, "images/../project.json").is_err());
        fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn detecte_une_modification_exterieure() {
        let d = tmpdir("conflict").join("F.prepvis");
        create_project(&d, "{\"v\":1}").unwrap();
        let fp = fingerprint(b"{\"v\":1}");
        let fp2 = save_project_checked(&d, "{\"v\":2}", false, Some(fp)).unwrap();
        // Quelqu'un d'autre modifie le fichier…
        atomic_write(&d.join(PROJECT_FILE), b"{\"v\":99}").unwrap();
        let e = save_project_checked(&d, "{\"v\":3}", false, Some(fp2)).unwrap_err();
        assert!(e.starts_with(CONFLICT_PREFIX));
        assert_eq!(load_project(&d).unwrap(), "{\"v\":99}", "rien n'est écrasé");
        // Écraser volontairement reste possible.
        save_project_checked(&d, "{\"v\":3}", false, None).unwrap();
        fs::remove_dir_all(d.parent().unwrap()).unwrap();
    }

    #[test]
    fn choix_de_project_json() {
        assert_eq!(project_dir_from_pick(Path::new("/a/F.topshot/project.json")), PathBuf::from("/a/F.topshot"));
        assert_eq!(project_dir_from_pick(Path::new("/a/F.prepvis/project.json")), PathBuf::from("/a/F.prepvis"));
        assert_eq!(project_dir_from_pick(Path::new("/a/F.prepvis")), PathBuf::from("/a/F.prepvis"));
    }

    #[test]
    fn ancien_projet_renomme_sans_rien_ecraser() {
        let base = tmpdir("legacy");
        let old = base.join("Le Quai.prepvis");
        create_project(&old, "{\"a\":1}").unwrap();
        let new = rename_legacy(&old).unwrap().expect("renommé");
        assert_eq!(new, base.join("Le Quai.topshot"));
        assert!(!old.exists());
        assert_eq!(load_project(&new).unwrap(), "{\"a\":1}");
        // Déjà en .topshot : rien à faire.
        assert_eq!(rename_legacy(&new).unwrap(), None);
        // Un Nom.topshot existe déjà : l'ancien garde son nom.
        let old2 = base.join("Le Quai.prepvis");
        create_project(&old2, "{\"b\":2}").unwrap();
        assert_eq!(rename_legacy(&old2).unwrap(), None);
        assert_eq!(load_project(&old2).unwrap(), "{\"b\":2}");
        assert_eq!(load_project(&new).unwrap(), "{\"a\":1}");
        // Pas un projet : rien n'est renommé.
        let empty = base.join("Vide.prepvis");
        fs::create_dir_all(&empty).unwrap();
        assert_eq!(rename_legacy(&empty).unwrap(), None);
    }
}
