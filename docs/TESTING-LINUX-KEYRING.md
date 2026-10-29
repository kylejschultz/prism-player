# Linux first-use credential test

Prism uses the desktop Secret Service for password storage. On the first explicit connection save, it requests a persistent default collection if one is absent. The desktop displays its standard password dialog. Cancelling keeps the connection form open and saves no app configuration; existing and locked keyrings are reused. No temporary session collection or plaintext fallback is used.

The native regression cases run against a real GNOME Keyring daemon on a private D-Bus session and Xvfb display. They use a disposable home and synthetic credentials. They never connect to the desktop user's credential service. Do not run the ignored tests directly against your login session.

On a Linux development system, install the test-only tools:

```sh
sudo apt-get install dbus-x11 gnome-keyring xvfb xdotool
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib --no-run
```

Cargo prints the test executable path (under `src-tauri/target/debug/deps/prism_player_lib-...`). Pass that exact executable to:

```sh
python3 scripts/test-linux-keyring.py /absolute/path/to/prism_player_lib-EXACT_HASH
```

The driver requires display `:97` to be unused and does not interact with the real desktop. It exercises first creation, a stored synthetic credential, replacement, default-collection reuse, a locked-keyring unlock prompt and cancelled creation. The frontend connection/retry case is covered separately by `npm run test:browser -- tests/connection-errors.spec.mjs`.

Linux distributions still need a functioning desktop Secret Service provider. If that service fails, Prism reports the credential error and does not silently save the password elsewhere.
