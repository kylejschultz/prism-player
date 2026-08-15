use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{Emitter, Manager};

const DISCORD_CLIENT_ID: &str = "1537904664740364418";

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiscordPresence {
    title: String,
    artist: String,
    album: Option<String>,
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
    let state = if let Some(station) = station {
        format!("{} · Live on {station}", presence.artist)
    } else {
        presence
            .album
            .filter(|album| !album.trim().is_empty())
            .map_or_else(|| presence.artist.clone(), |album| format!("{} · {album}", presence.artist))
    };
    let title = presence.title;
    let details = if presence.playing {
        title.clone()
    } else {
        format!("Paused · {title}")
    };
    let mut activity = activity::Activity::new()
        .activity_type(activity::ActivityType::Listening)
        .status_display_type(activity::StatusDisplayType::State)
        .details(details)
        .state(state)
        .buttons(vec![
            activity::Button::new("Get Prism", "https://prismplayer.app"),
            activity::Button::new("Join the Discord", "https://discord.gg/hzeAqu7EwF"),
        ])
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(DiscordPresenceClient::default())
        .invoke_handler(tauri::generate_handler![update_discord_presence, clear_discord_presence])
        .run(tauri::generate_context!())
        .expect("error while running Prism Player");
}
