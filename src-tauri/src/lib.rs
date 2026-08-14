use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use serde::Deserialize;

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

#[tauri::command]
fn update_discord_presence(presence: DiscordPresence) {
    let mut client = DiscordIpcClient::new(DISCORD_CLIENT_ID);
    if client.connect().is_err() {
        return;
    }

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

    let _ = client.set_activity(activity);
    let _ = client.close();
}

#[tauri::command]
fn clear_discord_presence() {
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
