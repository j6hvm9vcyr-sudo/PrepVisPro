//! Enveloppe macOS de PrepVisPro : fenêtre, menus natifs, accès aux fichiers du projet.
//! Toute la logique métier vit dans l'interface (TypeScript), testée séparément.

mod icons;
mod kit;
mod storage;
mod versions;

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use tauri::ipc::{InvokeBody, Request};
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, RunEvent};

/// Commandes de menu transmises à l'interface.
const MENU_EVENT: &str = "menu";
/// Demande à l'interface d'enregistrer avant de quitter.
const QUIT_EVENT: &str = "quit-requested";

/// L'interface a confirmé que tout est enregistré : on peut quitter.
static READY_TO_QUIT: AtomicBool = AtomicBool::new(false);
/// L'interface a bien reçu la demande de fermeture (elle peut alors prendre son temps,
/// par exemple pour demander à l'utilisateur quoi faire si l'enregistrement échoue).
static QUIT_ACK: AtomicBool = AtomicBool::new(false);

/// Autorise l'affichage des images du projet (protocole asset) pour ce dossier uniquement.
fn allow_project_assets(app: &AppHandle, dir: &Path) -> Result<(), String> {
    app.asset_protocol_scope()
        .allow_directory(dir.join(storage::IMAGES_DIR), true)
        .map_err(|e| format!("Accès aux images refusé : {e}"))
}

#[tauri::command]
fn project_create(app: AppHandle, dir: String, json: String) -> Result<(String, String), String> {
    let dir = PathBuf::from(dir);
    storage::create_project(&dir, &json)?;
    allow_project_assets(&app, &dir)?;
    Ok((dir.to_string_lossy().into_owned(), storage::fingerprint(json.as_bytes()).to_string()))
}

/// Renvoie [dossier normalisé, contenu de project.json, empreinte].
#[tauri::command]
fn project_load(app: AppHandle, path: String) -> Result<(String, String, String), String> {
    let dir = storage::project_dir_from_pick(Path::new(&path));
    let json = storage::load_project(&dir)?;
    let fp = storage::fingerprint(json.as_bytes()).to_string();
    // Une copie de sauvegarde à chaque ouverture : on peut toujours revenir à l'état d'avant.
    storage::backup_if_due(&dir, true, now_secs())?;
    allow_project_assets(&app, &dir)?;
    Ok((dir.to_string_lossy().into_owned(), json, fp))
}

/// Enregistre ; `expected` (empreinte, en texte) protège contre l'écrasement d'une version
/// modifiée ailleurs. Renvoie la nouvelle empreinte.
#[tauri::command]
fn project_save(dir: String, json: String, force_backup: bool, expected: Option<String>) -> Result<String, String> {
    let exp = expected.and_then(|s| s.parse::<u64>().ok());
    storage::save_project_checked(Path::new(&dir), &json, force_backup, exp).map(|f| f.to_string())
}

/// Reçoit les octets bruts d'une image (sans passer par du JSON) ;
/// le dossier et le nom arrivent dans les en-têtes, encodés en pourcentage.
#[tauri::command]
fn image_write(request: Request<'_>) -> Result<String, String> {
    // Normalement des octets bruts ; si le canal rapide est indisponible, une liste JSON.
    let owned: Vec<u8>;
    let bytes: &[u8] = match request.body() {
        InvokeBody::Raw(b) => b,
        InvokeBody::Json(serde_json::Value::Array(a)) => {
            owned = a
                .iter()
                .map(|v| v.as_u64().filter(|n| *n <= 255).map(|n| n as u8))
                .collect::<Option<Vec<u8>>>()
                .ok_or("Image reçue dans un format inattendu")?;
            &owned
        }
        _ => return Err("Image reçue dans un format inattendu".into()),
    };
    let header = |k: &str| -> Result<String, String> {
        let v = request.headers().get(k).ok_or(format!("En-tête {k} manquant"))?;
        let v = v.to_str().map_err(|_| format!("En-tête {k} illisible"))?;
        percent_encoding::percent_decode_str(v)
            .decode_utf8()
            .map(|s| s.into_owned())
            .map_err(|_| format!("En-tête {k} illisible"))
    };
    let dir = header("x-prepvis-dir")?;
    let name = header("x-prepvis-name")?;
    storage::write_image(Path::new(&dir), &name, bytes)
}

#[tauri::command]
fn project_save_conflict_copy(dir: String, json: String) -> Result<String, String> {
    storage::save_conflict_copy(Path::new(&dir), &json).map(|p| p.to_string_lossy().into_owned())
}

/// Renvoie les octets d'une image du projet (sans passer par du JSON).
#[tauri::command]
fn image_read(dir: String, file: String) -> Result<tauri::ipc::Response, String> {
    storage::read_image(Path::new(&dir), &file).map(tauri::ipc::Response::new)
}

// ------------------------------------------------------------------ versions du projet

#[tauri::command]
fn version_create(dir: String, stamp: String, json: String) -> Result<String, String> {
    versions::create(Path::new(&dir), &stamp, &json)
}

#[tauri::command]
fn version_list(dir: String) -> Vec<versions::VersionInfo> {
    versions::list(Path::new(&dir))
}

#[tauri::command]
fn version_read(dir: String, file: String) -> Result<String, String> {
    versions::read(Path::new(&dir), &file)
}

// ------------------------------------------------------------------ bibliothèque d'icônes

/// Dossier analysé lors du dernier import d'icônes (seul dossier lisible par icons_read_source).
static ICON_SOURCE: Mutex<Option<PathBuf>> = Mutex::new(None);

fn icons_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| format!("Dossier de l'application introuvable : {e}"))?.join("icones");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Création de la bibliothèque impossible : {e}"))?;
    Ok(dir)
}

#[derive(serde::Serialize)]
struct IconLibrary {
    dir: String,
    items: Vec<icons::IconItem>,
}

/// Contenu de la bibliothèque, et autorisation d'afficher ses images.
#[tauri::command]
fn icons_list(app: AppHandle) -> Result<IconLibrary, String> {
    let dir = icons_dir(&app)?;
    app.asset_protocol_scope().allow_directory(&dir, false).map_err(|e| format!("Accès aux icônes refusé : {e}"))?;
    Ok(IconLibrary { dir: dir.to_string_lossy().into_owned(), items: icons::list(&dir) })
}

#[tauri::command]
fn icons_scan(path: String) -> Result<Vec<icons::SourceFile>, String> {
    let root = PathBuf::from(path);
    let files = icons::scan(&root)?;
    *ICON_SOURCE.lock().map_err(|_| "Bibliothèque occupée")? = Some(root);
    Ok(files)
}

#[tauri::command]
fn icons_read_source(rel: String) -> Result<tauri::ipc::Response, String> {
    let root = ICON_SOURCE.lock().map_err(|_| "Bibliothèque occupée")?.clone().ok_or("Aucun dossier d'icônes choisi")?;
    icons::read_source(&root, &rel).map(tauri::ipc::Response::new)
}

/// Ajoute une icône (PNG brut dans le corps ; catégorie et nom encodés dans les en-têtes).
#[tauri::command]
fn icons_store(app: AppHandle, request: Request<'_>) -> Result<icons::IconItem, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Icône reçue dans un format inattendu".into());
    };
    let header = |k: &str| -> String {
        request
            .headers()
            .get(k)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| percent_encoding::percent_decode_str(v).decode_utf8().ok())
            .map(|v| v.into_owned())
            .unwrap_or_default()
    };
    icons::store(&icons_dir(&app)?, &header("x-prepvis-category"), &header("x-prepvis-name"), bytes)
}

#[tauri::command]
fn icons_read(app: AppHandle, id: String) -> Result<tauri::ipc::Response, String> {
    icons::read(&icons_dir(&app)?, &id).map(tauri::ipc::Response::new)
}

#[tauri::command]
fn icons_remove(app: AppHandle, ids: Vec<String>) -> Result<usize, String> {
    icons::remove(&icons_dir(&app)?, &ids)
}

// ------------------------------------------------------------------ « Mon matériel »

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| format!("Dossier de l'application introuvable : {e}"))
}

#[tauri::command]
fn kit_read(app: AppHandle) -> Result<Option<String>, String> {
    kit::read(&data_dir(&app)?)
}

#[tauri::command]
fn kit_write(app: AppHandle, json: String) -> Result<(), String> {
    kit::write(&data_dir(&app)?, &json)
}

/// Écrit un export ; chemin dans l'en-tête (encodé), octets bruts dans le corps.
#[tauri::command]
fn export_write(request: Request<'_>) -> Result<(), String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Export reçu dans un format inattendu".into());
    };
    let path = request
        .headers()
        .get("x-prepvis-path")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| percent_encoding::percent_decode_str(v).decode_utf8().ok())
        .ok_or("Chemin d'export manquant")?
        .into_owned();
    storage::write_export(Path::new(&path), bytes)
}

#[tauri::command]
fn script_read(path: String) -> Result<tauri::ipc::Response, String> {
    storage::read_script(Path::new(&path)).map(tauri::ipc::Response::new)
}

/// Ouvre un fichier avec l'application par défaut (Aperçu, Excel…).
#[tauri::command]
fn open_file(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg(&path).spawn().map_err(|e| format!("Ouverture impossible : {e}"))?;
    }
    #[cfg(not(target_os = "macos"))]
    let _ = path;
    Ok(())
}

#[tauri::command]
fn reveal_in_finder(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Impossible d'ouvrir le Finder : {e}"))?;
    }
    #[cfg(not(target_os = "macos"))]
    let _ = path;
    Ok(())
}

/// Projets ouverts depuis le Finder (double-clic) avant que l'interface soit prête.
static PENDING_OPEN: Mutex<Vec<String>> = Mutex::new(Vec::new());
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
const OPEN_EVENT: &str = "open-path";

/// L'interface récupère, au démarrage, le projet demandé par le Finder.
#[tauri::command]
fn take_pending_open() -> Vec<String> {
    PENDING_OPEN.lock().map(|mut v| std::mem::take(&mut *v)).unwrap_or_default()
}

/// L'interface accuse réception d'une demande de fermeture.
#[tauri::command]
fn quit_ack() {
    QUIT_ACK.store(true, Ordering::SeqCst);
}

/// Appelée par l'interface une fois l'enregistrement terminé.
#[tauri::command]
fn quit_now(app: AppHandle) {
    READY_TO_QUIT.store(true, Ordering::SeqCst);
    app.exit(0);
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn build_menu(app: &tauri::App) -> tauri::Result<()> {
    let item = |id: &str, label: &str, accel: &str| MenuItemBuilder::with_id(id, label).accelerator(accel).build(app);
    let plain = |id: &str, label: &str| MenuItemBuilder::with_id(id, label).build(app);

    let app_menu = SubmenuBuilder::new(app, "PrepVisPro")
        .about(None)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        // « Quitter » passe par l'interface pour enregistrer d'abord.
        .item(&item("app_quit", "Quitter PrepVisPro", "CmdOrCtrl+Q")?)
        .build()?;

    let file_menu = SubmenuBuilder::new(app, "Fichier")
        .item(&item("file_new", "Nouveau projet…", "CmdOrCtrl+N")?)
        .item(&item("file_open", "Ouvrir…", "CmdOrCtrl+O")?)
        .separator()
        .item(&item("file_save", "Enregistrer", "CmdOrCtrl+S")?)
        .item(&plain("file_reveal", "Afficher dans le Finder")?)
        .separator()
        .item(&item("file_import_script", "Importer un scénario…", "CmdOrCtrl+Shift+I")?)
        .item(&item("file_versions", "Versions…", "CmdOrCtrl+Shift+S")?)
        .item(&item("file_export", "Exporter…", "CmdOrCtrl+E")?)
        .separator()
        .item(&item("file_close", "Fermer le projet", "CmdOrCtrl+Shift+W")?)
        .build()?;

    // Annuler / Rétablir passent par l'historique du projet, pas par le système.
    let edit_menu = SubmenuBuilder::new(app, "Édition")
        .item(&item("undo", "Annuler", "CmdOrCtrl+Z")?)
        .item(&item("redo", "Rétablir", "CmdOrCtrl+Shift+Z")?)
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    let plan_menu = SubmenuBuilder::new(app, "Plan")
        .item(&item("plan_new", "Nouveau plan", "CmdOrCtrl+Enter")?)
        .item(&item("plan_reprise", "Reprise du plan", "CmdOrCtrl+Shift+Enter")?)
        .item(&item("plan_camera", "Ajouter une caméra", "CmdOrCtrl+Shift+C")?)
        .separator()
        // Sans raccourci de menu : ⌥↑, ⌥↓ et ⌘⌫ doivent garder leur rôle dans les champs de texte.
        .item(&plain("plan_up", "Monter le plan  (⌥↑)")?)
        .item(&plain("plan_down", "Descendre le plan  (⌥↓)")?)
        .separator()
        .item(&plain("plan_delete", "Supprimer le plan  (⌘⌫)")?)
        .build()?;

    let view_menu = SubmenuBuilder::new(app, "Présentation")
        .item(&item("view_table", "Tableau", "CmdOrCtrl+1")?)
        .item(&item("view_cards", "Fiches", "CmdOrCtrl+2")?)
        .item(&item("view_floor", "Plans au sol", "CmdOrCtrl+3")?)
        .item(&item("view_shooting", "Tournage (installations)", "CmdOrCtrl+4")?)
        .item(&item("view_days", "Jours de tournage et matériel", "CmdOrCtrl+5")?)
        .item(&item("view_library", "Bibliothèque d’images", "CmdOrCtrl+6")?)
        .separator()
        .item(&item("view_inspector", "Afficher / masquer Détails", "CmdOrCtrl+I")?)
        .item(&item("view_settings", "Réglages du projet…", "CmdOrCtrl+,")?)
        .separator()
        .fullscreen()
        .build()?;

    let window_menu = SubmenuBuilder::new(app, "Fenêtre").minimize().maximize().build()?;

    let help_menu = SubmenuBuilder::new(app, "Aide").item(&plain("help_shortcuts", "Raccourcis clavier")?).build()?;

    let menu = MenuBuilder::new(app)
        .items(&[&app_menu, &file_menu, &edit_menu, &plan_menu, &view_menu, &window_menu, &help_menu])
        .build()?;
    app.set_menu(menu)?;
    app.on_menu_event(|app, event| {
        let _ = app.emit(MENU_EVENT, event.id().0.clone());
    });
    Ok(())
}

/// Demande l'enregistrement à l'interface. Sécurité : si l'interface ne répond pas du tout
/// (bloquée), on quitte quand même après quelques secondes pour ne pas rester coincé.
fn request_quit(app: &AppHandle) {
    QUIT_ACK.store(false, Ordering::SeqCst);
    let _ = app.emit(QUIT_EVENT, ());
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(5));
        if !QUIT_ACK.load(Ordering::SeqCst) {
            READY_TO_QUIT.store(true, Ordering::SeqCst);
            handle.exit(0);
        }
    });
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![project_create, project_load, project_save, image_write, reveal_in_finder, quit_ack, quit_now, take_pending_open, image_read, export_write, open_file, script_read, project_save_conflict_copy, icons_list, icons_scan, icons_read_source, icons_store, icons_read, icons_remove, kit_read, kit_write, version_create, version_list, version_read])
        .setup(|app| {
            build_menu(app)?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Erreur au lancement de PrepVisPro");

    app.run(|app, event| match event {
        // Double-clic sur un projet .prepvis dans le Finder.
        #[cfg(any(target_os = "macos", target_os = "ios"))]
        RunEvent::Opened { urls } => {
            let paths: Vec<String> = urls
                .iter()
                .filter_map(|u| u.to_file_path().ok())
                .map(|p| p.to_string_lossy().into_owned())
                .collect();
            if let Ok(mut v) = PENDING_OPEN.lock() {
                v.extend(paths.iter().cloned());
            }
            for p in paths {
                let _ = app.emit(OPEN_EVENT, p);
            }
        }
        // Fermeture de la fenêtre : l'interface enregistre, puis appelle quit_now.
        RunEvent::WindowEvent { event: tauri::WindowEvent::CloseRequested { api, .. }, .. } => {
            if !READY_TO_QUIT.load(Ordering::SeqCst) {
                api.prevent_close();
                request_quit(app);
            }
        }
        // Quitter depuis le Dock ou à la fermeture de session.
        RunEvent::ExitRequested { api, code, .. } => {
            if code.is_none() && !READY_TO_QUIT.load(Ordering::SeqCst) {
                api.prevent_exit();
                request_quit(app);
            }
        }
        _ => {}
    });
}
