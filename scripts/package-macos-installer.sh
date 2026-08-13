#!/bin/zsh
set -euo pipefail

ROOT_DIR="${0:A:h:h}"
APP_PATH="${1:-$ROOT_DIR/src-tauri/target/release/bundle/macos/Prism Player.app}"
OUTPUT_DIR="$ROOT_DIR/src-tauri/target/release/bundle/dmg"
VOLUME_NAME="${VOLUME_NAME:-Prism Player}"
DMG_PATH="$OUTPUT_DIR/Prism.Player.dmg"
ASSETS_DIR="$(mktemp -d /tmp/prism-player-dmg-assets.XXXXXX)"
PYTHON_BIN="${PYTHON_BIN:-python3}"

cleanup() { rm -rf "$ASSETS_DIR"; }
trap cleanup EXIT

if [[ ! -d "$APP_PATH" ]]; then
  print -u2 "Expected app bundle at: $APP_PATH"
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
sips -s format png "$ROOT_DIR/scripts/macos-installer-background.svg" --out "$ASSETS_DIR/background-v2.png" >/dev/null
rm -f "$DMG_PATH"
"$PYTHON_BIN" -m dmgbuild -s "$ROOT_DIR/scripts/dmgbuild-settings.py" \
  -D "application=$APP_PATH" -D "assets=$ASSETS_DIR" "$VOLUME_NAME" "$DMG_PATH"
print "$DMG_PATH"
