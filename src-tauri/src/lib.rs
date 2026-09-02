use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{Emitter, Manager, PhysicalPosition};

const DISCORD_CLIENT_ID: &str = "1537904664740364418";
const KEYRING_SERVICE: &str = "com.kylejschultz.prism-player";
const NAVIDROME_PASSWORD_ACCOUNT: &str = "navidrome-password";

fn navidrome_password_entry() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, NAVIDROME_PASSWORD_ACCOUNT).map_err(|error| error.to_string())
}

#[tauri::command]
fn get_navidrome_password() -> Result<Option<String>, String> {
    match navidrome_password_entry()?.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn set_navidrome_password(password: String) -> Result<(), String> {
    navidrome_password_entry()?
        .set_password(&password)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn clear_navidrome_password() -> Result<(), String> {
    match navidrome_password_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn get_native_architecture() -> &'static str {
    match std::env::consts::ARCH {
        "aarch64" => "arm64",
        "x86_64" => "x64",
        _ => "unknown",
    }
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiscordPresence {
    title: String,
    artist: String,
    station: Option<String>,
    playing: bool,
    started_at: Option<i64>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiscordPresenceStatus {
    state: &'static str,
    message: String,
}

#[derive(Default)]
struct DiscordPresenceClient {
    client: Mutex<Option<DiscordIpcClient>>,
}

#[tauri::command]
fn update_discord_presence(app: tauri::AppHandle, presence: DiscordPresence) {
    tauri::async_runtime::spawn_blocking(move || {
        let status = match publish_discord_presence(&app, presence) {
            Ok(()) => DiscordPresenceStatus {
                state: "connected",
                message: "Connected to Discord.".to_string(),
            },
            Err(error) => DiscordPresenceStatus {
                state: "unavailable",
                message: format!("Discord unavailable: {error}"),
            },
        };

        let _ = app.emit("discord-presence-status", status);
    });
}

fn publish_discord_presence(app: &tauri::AppHandle, presence: DiscordPresence) -> Result<(), String> {
    let state = app.state::<DiscordPresenceClient>();
    let mut client = state.client.lock().map_err(|_| "Discord IPC lock failed".to_string())?;
    if client.is_none() {
        let mut new_client = DiscordIpcClient::new(DISCORD_CLIENT_ID);
        new_client.connect().map_err(|error| error.to_string())?;
        *client = Some(new_client);
    }

    if client.as_mut().expect("Discord client is connected").set_activity(build_discord_activity(presence.clone())).is_err() {
        let mut replacement = DiscordIpcClient::new(DISCORD_CLIENT_ID);
        replacement.connect().map_err(|error| error.to_string())?;
        replacement.set_activity(build_discord_activity(presence)).map_err(|error| error.to_string())?;
        *client = Some(replacement);
    }

    Ok(())
}

fn build_discord_activity(presence: DiscordPresence) -> activity::Activity<'static> {
    let station = presence.station.filter(|station| !station.trim().is_empty());
    let title = presence.title;
    // Discord uses `details` for the compact activity line in the online list.
    // Include the artist there so it identifies the song without relying on the
    // expanded profile card's secondary line.
    let track_details = format!("{title} · {}", presence.artist);
    let details = if presence.playing {
        track_details
    } else {
        format!("Paused · {track_details}")
    };
    let mut activity = activity::Activity::new()
        .activity_type(activity::ActivityType::Listening)
        .status_display_type(activity::StatusDisplayType::Details)
        .details(details)
        .buttons(vec![
            activity::Button::new("Get Prism", "https://prismplayer.app"),
            activity::Button::new("Join the Discord", "https://discord.gg/hzeAqu7EwF"),
        ])
        .assets(
            activity::Assets::new()
                .large_image("prism-player")
                .large_text("Prism Player"),
        );

    if let Some(station) = station {
        activity = activity.state(format!("Live on {station}"));
    }

    if presence.playing {
        if let Some(started_at) = presence.started_at {
            activity = activity.timestamps(activity::Timestamps::new().start(started_at));
        }
    }

    activity
}

#[tauri::command]
fn clear_discord_presence(app: tauri::AppHandle) {
    tauri::async_runtime::spawn_blocking(move || clear_discord_presence_in_background(&app));
}

fn clear_discord_presence_in_background(app: &tauri::AppHandle) {
    let state = app.state::<DiscordPresenceClient>();
    let Ok(mut client) = state.client.lock() else {
        return;
    };

    if let Some(active_client) = client.as_mut() {
        if active_client.clear_activity().is_err() {
            *client = None;
        }
    }
}

/// Window-state considers any corner on any display as visible. That leaves a
/// restored window effectively stranded at a display edge after a monitor
/// layout changes. Keep a saved placement only when at least half of the
/// window is actually visible; otherwise center it on the most-visible display.
fn ensure_main_window_is_visible(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let (Ok(position), Ok(size), Ok(monitors)) = (
        window.outer_position(),
        window.outer_size(),
        window.available_monitors(),
    ) else {
        return;
    };

    let window_area = i64::from(size.width) * i64::from(size.height);
    if window_area == 0 {
        return;
    }

    let mut best_monitor = None;
    let mut best_visible_area = 0_i64;
    for monitor in monitors {
        let monitor_position = monitor.position();
        let monitor_size = monitor.size();
        let overlap_width = (position.x + size.width as i32)
            .min(monitor_position.x + monitor_size.width as i32)
            .saturating_sub(position.x.max(monitor_position.x));
        let overlap_height = (position.y + size.height as i32)
            .min(monitor_position.y + monitor_size.height as i32)
            .saturating_sub(position.y.max(monitor_position.y));
        let visible_area = i64::from(overlap_width) * i64::from(overlap_height);

        if visible_area > best_visible_area {
            best_visible_area = visible_area;
            best_monitor = Some(monitor);
        }
    }

    if best_visible_area * 2 >= window_area {
        return;
    }

    let monitor = best_monitor
        .or_else(|| window.primary_monitor().ok().flatten())
        .or_else(|| window.current_monitor().ok().flatten());
    let Some(monitor) = monitor else {
        return;
    };

    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let x = monitor_position.x + (monitor_size.width.saturating_sub(size.width) / 2) as i32;
    let y = monitor_position.y + (monitor_size.height.saturating_sub(size.height) / 2) as i32;
    let _ = window.set_position(PhysicalPosition::new(x, y));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|_app| {
            #[cfg(target_os = "macos")]
            {
                let main_webview = _app
                    .get_webview_window("main")
                    .expect("main Prism webview should exist during setup");
                main_webview.with_webview(|webview| unsafe {
                    let view: &objc2_web_kit::WKWebView = &*webview.inner().cast();
                    // WebKit's native history gesture slides the entire app
                    // surface, which feels like moving the window rather than
                    // navigating Prism. Keep navigation in Prism's controls.
                    view.setAllowsBackForwardNavigationGestures(false);
                })?;
            }

            Ok(())
        })
        .manage(DiscordPresenceClient::default())
        .invoke_handler(tauri::generate_handler![
            update_discord_presence,
            clear_discord_presence,
            get_navidrome_password,
            set_navidrome_password,
            clear_navidrome_password,
            get_native_architecture
        ])
        .build(tauri::generate_context!())
        .expect("error while building Prism Player")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Ready) {
                ensure_main_window_is_visible(app);
            }
        });
}
