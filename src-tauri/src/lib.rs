//! Enveloppe macOS de PrepVisPro : fenêtre, menus natifs, accès aux fichiers du projet.
//! Toute la logique métier vit dans l'interface (TypeScript), testée séparément.

mod storage;

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
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

/// Autorise l'affichage des images du projet (protocole asset) pour ce dossier uniquement.
fn allow_project_assets(app: &AppHandle, dir: &Path) -> Result<(), String> {
    app.asset_protocol_scope()
        .allow_directory(dir.join(storage::IMAGES_DIR), true)
        .map_err(|e| format!("Accès aux images refusé : {e}"))
}

#[tauri::command]
fn project_create(app: AppHandle, dir: String, json: String) -> Result<String, String> {
    let dir = PathBuf::from(dir);
    storage::create_project(&dir, &json)?;
    allow_project_assets(&app, &dir)?;
    Ok(dir.to_string_lossy().into_owned())
}

/// Renvoie [dossier normalisé, contenu de project.json].
#[tauri::command]
fn project_load(app: AppHandle, path: String) -> Result<(String, String), String> {
    let dir = storage::project_dir_from_pick(Path::new(&path));
    let json = storage::load_project(&dir)?;
    // Une copie de sauvegarde à chaque ouverture : on peut toujours revenir à l'état d'avant.
    storage::backup_if_due(&dir, true, now_secs())?;
    allow_project_assets(&app, &dir)?;
    Ok((dir.to_string_lossy().into_owned(), json))
}

#[tauri::command]
fn project_save(dir: String, json: String, force_backup: bool) -> Result<(), String> {
    storage::save_project(Path::new(&dir), &json, force_backup)
}

/// Reçoit les octets bruts d'une image (sans passer par du JSON) ;
/// le dossier et le nom arrivent dans les en-têtes, encodés en pourcentage.
#[tauri::command]
fn image_write(request: Request<'_>) -> Result<String, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Image reçue dans un format inattendu".into());
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

/// Demande l'enregistrement à l'interface, avec une sécurité si elle ne répond pas.
fn request_quit(app: &AppHandle) {
    let _ = app.emit(QUIT_EVENT, ());
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(5));
        READY_TO_QUIT.store(true, Ordering::SeqCst);
        handle.exit(0);
    });
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![project_create, project_load, project_save, image_write, reveal_in_finder, quit_now])
        .setup(|app| {
            build_menu(app)?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Erreur au lancement de PrepVisPro");

    app.run(|app, event| match event {
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
