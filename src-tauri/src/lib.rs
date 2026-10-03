//! Enveloppe macOS de PrepVisPro : fenêtre, menus natifs, accès aux fichiers.
//! Toute la logique métier vit dans l'interface (TypeScript), testée séparément.

use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::Emitter;

/// Identifiants des commandes de menu transmises à l'interface.
const MENU_EVENT: &str = "menu";

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let item = |id: &str, label: &str, accel: &str| {
                MenuItemBuilder::with_id(id, label).accelerator(accel).build(app)
            };

            let app_menu = SubmenuBuilder::new(app, "PrepVisPro")
                .about(None)
                .separator()
                .services()
                .separator()
                .hide()
                .hide_others()
                .show_all()
                .separator()
                .quit()
                .build()?;

            // Annuler / Rétablir sont gérés par l'application (historique du projet),
            // pas par le système : sinon ⌘Z n'annulerait que le texte en cours.
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
                // Sans raccourci de menu : ⌥↑, ⌥↓ et ⌘⌫ doivent garder leur rôle dans les champs
                // de texte. L'interface les gère elle-même quand le tableau a le focus.
                .item(&MenuItemBuilder::with_id("plan_up", "Monter le plan  (⌥↑)").build(app)?)
                .item(&MenuItemBuilder::with_id("plan_down", "Descendre le plan  (⌥↓)").build(app)?)
                .separator()
                .item(&MenuItemBuilder::with_id("plan_delete", "Supprimer le plan  (⌘⌫)").build(app)?)
                .build()?;

            let view_menu = SubmenuBuilder::new(app, "Présentation")
                .item(&item("view_table", "Tableau", "CmdOrCtrl+1")?)
                .item(&item("view_cards", "Fiches", "CmdOrCtrl+2")?)
                .separator()
                .item(&item("view_inspector", "Afficher / masquer Détails", "CmdOrCtrl+I")?)
                .separator()
                .fullscreen()
                .build()?;

            let window_menu = SubmenuBuilder::new(app, "Fenêtre")
                .minimize()
                .maximize()
                .separator()
                .close_window()
                .build()?;

            let help_menu = SubmenuBuilder::new(app, "Aide")
                .item(&MenuItemBuilder::with_id("help_shortcuts", "Raccourcis clavier").build(app)?)
                .build()?;

            let menu = MenuBuilder::new(app)
                .items(&[&app_menu, &edit_menu, &plan_menu, &view_menu, &window_menu, &help_menu])
                .build()?;
            app.set_menu(menu)?;

            app.on_menu_event(|app, event| {
                let _ = app.emit(MENU_EVENT, event.id().0.clone());
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Erreur au lancement de PrepVisPro");
}
