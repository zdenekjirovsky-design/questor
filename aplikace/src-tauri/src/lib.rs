//! QUESTOR — desktopovy shell.
//!
//! Kostra Tauri 2: otevre okno s frontendem (React/Vite) a na pozadi
//! zkontroluje aktualizace na GitHub Releases (tauri-plugin-updater).
//! Kdyz najde novou verzi, stahne ji, nainstaluje a aplikaci restartuje.

#[cfg(desktop)]
use tauri_plugin_updater::UpdaterExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            #[cfg(desktop)]
            {
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    // Selhani aktualizace nesmi shodit aplikaci — jen tichy log.
                    if let Err(chyba) = zkontroluj_aktualizace(handle).await {
                        eprintln!("QUESTOR: kontrola aktualizaci selhala: {chyba}");
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("chyba pri spusteni aplikace QUESTOR");
}

/// Zkontroluje GitHub Releases; novou verzi stahne, nainstaluje a restartuje.
#[cfg(desktop)]
async fn zkontroluj_aktualizace(app: tauri::AppHandle) -> tauri_plugin_updater::Result<()> {
    if let Some(aktualizace) = app.updater()?.check().await? {
        aktualizace
            .download_and_install(|_stazeno, _celkem| {}, || {})
            .await?;
        app.restart();
    }
    Ok(())
}
