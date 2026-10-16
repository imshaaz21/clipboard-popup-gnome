set -eu

if [ "${1:-}" = --session ]; then
    gnome-shell --headless --wayland --wayland-display "$WAYLAND_DISPLAY" --no-x11 --virtual-monitor 1280x800 &
    shell_pid=$!
    for attempt in $(seq 1 100); do
        [ ! -S "$XDG_RUNTIME_DIR/$WAYLAND_DISPLAY" ] || break
        sleep 0.1
    done
    for lib in /usr/lib*/gnome-shell; do
        [ -d "$lib" ] || continue
        export GI_TYPELIB_PATH="$lib/girepository-1.0:$lib${GI_TYPELIB_PATH:+:$GI_TYPELIB_PATH}"
        export LD_LIBRARY_PATH="$lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
    done
    GDK_BACKEND=wayland gjs -m tests/client.js &
    client_pid=$!
    trap 'kill "$client_pid" 2>/dev/null || true' EXIT
    wait "$shell_pid"
    exit $?
fi

root=$(mktemp -d "${TMPDIR:-/tmp}/clipboard-popup-shell-XXXXXX")
trap 'sleep 1; rm -rf --one-file-system "$root"' EXIT
export XDG_DATA_HOME="$root/data"
export XDG_CONFIG_HOME="$root/config"
export XDG_CACHE_HOME="$root/cache"
export XDG_RUNTIME_DIR="$root/runtime"
mkdir -m 700 "$XDG_RUNTIME_DIR"
export GSETTINGS_BACKEND=keyfile
export GNOME_SHELL_SLOWDOWN_FACTOR=0
export GTK_A11Y=none
unset DISPLAY WAYLAND_DISPLAY
uuid=clipboard-popup@imshaaz21.github.com
driver=clipboard-popup-test@local
mkdir -p "$XDG_DATA_HOME/gnome-shell/extensions/$uuid" "$XDG_DATA_HOME/gnome-shell/extensions/$driver"
cp -r extension/. "$XDG_DATA_HOME/gnome-shell/extensions/$uuid/"
glib-compile-schemas "$XDG_DATA_HOME/gnome-shell/extensions/$uuid/schemas"
cp tests/shell-driver.js "$XDG_DATA_HOME/gnome-shell/extensions/$driver/extension.js"
printf '%s\n' '{"uuid":"clipboard-popup-test@local","name":"Clipboard smoke test","description":"Isolated test driver","shell-version":["45","46","47","48","49","50"]}' > "$XDG_DATA_HOME/gnome-shell/extensions/$driver/metadata.json"
gsettings set org.gnome.shell enabled-extensions "['$uuid', '$driver']"
gsettings set org.gnome.shell welcome-dialog-last-shown-version "$(gnome-shell --version | awk '{print $3}')"
export WAYLAND_DISPLAY="clipboard-popup-test-$$"
export CLIPBOARD_TEST_EXTENSION="$XDG_DATA_HOME/gnome-shell/extensions/$uuid"
timeout 60s dbus-run-session -- bash tests/shell-smoke.sh --session
test -f "$XDG_CACHE_HOME/smoke-passed"
