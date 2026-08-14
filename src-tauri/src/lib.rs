use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use serde::{Deserialize, Serialize};
use tauri::Emitter;

const DISCORD_CLIENT_ID: &str = "1537904664740364418";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiscordPresence {
    title: String,
    artist: String,
    album: Option<String>,
    playing: bool,
    started_at: Option<i64>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiscordPresenceStatus {
    state: &'static str,
    message: String,
}

#[tauri::command]
fn update_discord_presence(app: tauri::AppHandle, presence: DiscordPresence) {
    tauri::async_runtime::spawn_blocking(move || {
        let status = match publish_discord_presence(presence) {
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

fn publish_discord_presence(presence: DiscordPresence) -> Result<(), String> {
    let mut client = DiscordIpcClient::new(DISCORD_CLIENT_ID);
    client.connect().map_err(|error| error.to_string())?;

    let state = presence.album.filter(|album| !album.trim().is_empty()).map_or_else(
        || presence.artist.clone(),
        |album| format!("{} · {album}", presence.artist),
    );
    let details = if presence.playing {
        presence.title
    } else {
        format!("Paused · {}", presence.title)
    };
    let mut activity = activity::Activity::new()
        .details(details)
        .state(state)
        .assets(
            activity::Assets::new()
                .large_image("prism-player")
                .large_text("Prism Player"),
        );

    if presence.playing {
        if let Some(started_at) = presence.started_at {
            activity = activity.timestamps(activity::Timestamps::new().start(started_at));
        }
    }

    client.set_activity(activity).map_err(|error| error.to_string())?;
    let _ = client.close();
    Ok(())
}

#[tauri::command]
fn clear_discord_presence() {
    tauri::async_runtime::spawn_blocking(clear_discord_presence_in_background);
}

fn clear_discord_presence_in_background() {
    let mut client = DiscordIpcClient::new(DISCORD_CLIENT_ID);
    if client.connect().is_err() {
        return;
    }

    let _ = client.clear_activity();
    let _ = client.close();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![update_discord_presence, clear_discord_presence])
        .run(tauri::generate_context!())
        .expect("error while running Prism Player");
}
