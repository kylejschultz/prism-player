#!/usr/bin/env python3
"""Drive synthetic Secret Service prompts on a disposable X display/bus only."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

TESTS = [
    ('first_save_creates_persistent_default_and_reuses_it', 'accept'),
    ('cancelling_first_setup_reports_error_and_keeps_storage_absent', 'cancel'),
]

def call(*args):
    return subprocess.check_output(args, text=True, stderr=subprocess.DEVNULL).strip()

def session(binary, test, mode):
    # Invoked inside dbus-run-session. All home/runtime paths are disposable.
    log = Path(os.environ['HOME']) / 'keyring-daemon.log'
    with log.open('w') as output:
        daemon = subprocess.Popen(['gnome-keyring-daemon', '--foreground', '--components=secrets',
                                   '--control-directory=' + os.environ['XDG_RUNTIME_DIR'] + '/keyring'], stdout=output, stderr=subprocess.STDOUT)
    try:
        time.sleep(1)
        process = subprocess.Popen([binary, '--ignored', '--exact', 'linux_credentials::tests::' + test, '--nocapture'])
        handled = set()
        deadline = time.monotonic() + 75
        while process.poll() is None and time.monotonic() < deadline:
            result = subprocess.run(['xdotool', 'search', '--onlyvisible', '--class', 'Gcr-prompter'], capture_output=True, text=True)
            # GCR uses gcr-prompter/Gcr-prompter depending on its toolkit version.
            if not result.stdout.strip():
                result = subprocess.run(['xdotool', 'search', '--onlyvisible', '--name', 'keyring'], capture_output=True, text=True)
            for window in result.stdout.split():
                title = call('xdotool', 'getwindowname', window)
                identity = (window, title)
                if identity in handled:
                    continue
                handled.add(identity)
                print('Native fixture prompt:', title, flush=True)
                call('xdotool', 'windowfocus', '--sync', window)
                if mode == 'cancel':
                    call('xdotool', 'key', 'Escape')
                else:
                    call('xdotool', 'key', 'ctrl+a')
                    call('xdotool', 'type', '--clearmodifiers', 'PrismFixtureOnly-2026')
                    if 'unlock' not in title.lower():
                        call('xdotool', 'key', 'Tab')
                        call('xdotool', 'type', '--clearmodifiers', 'PrismFixtureOnly-2026')
                    call('xdotool', 'key', 'Return')
            time.sleep(0.25)
        if process.poll() is None:
            print(call('xwininfo', '-root', '-tree'), flush=True)
            process.terminate()
            process.wait(timeout=5)
            raise RuntimeError('Timed out waiting for a synthetic keyring dialog')
        if process.returncode:
            print(log.read_text(), flush=True)
            raise RuntimeError('Native keyring test failed')
    finally:
        daemon.terminate()
        daemon.wait(timeout=5)

def main():
    if len(sys.argv) == 5 and sys.argv[1] == '--session':
        session(sys.argv[2], sys.argv[3], sys.argv[4])
        return
    binary = str(Path(sys.argv[1]).resolve())
    if Path('/tmp/.X11-unix/X97').exists():
        raise RuntimeError('Fixture display :97 is in use')
    display = subprocess.Popen(['Xvfb', ':97', '-screen', '0', '1280x900x24', '-ac'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        time.sleep(1)
        for test, mode in TESTS:
            with tempfile.TemporaryDirectory(prefix='prism-keyring-fixture-') as home:
                env = os.environ.copy()
                for name in ['DBUS_SESSION_BUS_ADDRESS', 'GNOME_KEYRING_CONTROL', 'GNOME_KEYRING_PID', 'SSH_AUTH_SOCK', 'XAUTHORITY']:
                    env.pop(name, None)
                env.update(HOME=home, DISPLAY=':97', XDG_RUNTIME_DIR=home + '/runtime', XDG_DATA_HOME=home + '/data', XDG_CONFIG_HOME=home + '/config', PRISM_TEST_DISPOSABLE_KEYRING='1')
                Path(env['XDG_RUNTIME_DIR']).mkdir(mode=0o700)
                subprocess.run(['dbus-run-session', '--', sys.executable, __file__, '--session', binary, test, mode], env=env, check=True, timeout=90)
    finally:
        display.terminate()
        display.wait(timeout=5)

if __name__ == '__main__':
    main()
