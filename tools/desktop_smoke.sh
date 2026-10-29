#!/usr/bin/env bash
set -euo pipefail

godot_bin="$1"
project_path="$2"
log_path="$3"
screenshot_dir="$4"
mkdir -p "$screenshot_dir" /tmp/isla-godot-test-data
cd "$project_path"
if [[ "$(basename "$godot_bin")" == IslaPrimordial* ]]; then
	XDG_DATA_HOME=/tmp/isla-godot-test-data "$godot_bin" >"$log_path" 2>&1 &
else
	XDG_DATA_HOME=/tmp/isla-godot-test-data "$godot_bin" --path . >"$log_path" 2>&1 &
fi
game_pid=$!
finish() {
	kill "$game_pid" 2>/dev/null || true
	wait "$game_pid" 2>/dev/null || true
}
trap finish EXIT

window_id=""
for attempt in $(seq 1 40); do
	window_id="$(xdotool search --name "Isla Primordial" 2>/dev/null | head -n 1 || true)"
	if [[ -n "$window_id" ]]; then break; fi
	sleep 0.5
done
if [[ -z "$window_id" ]]; then
	cat "$log_path"
	exit 1
fi

sleep 10
xwd -silent -id "$window_id" -out "$screenshot_dir/menu.xwd"
convert "$screenshot_dir/menu.xwd" "$screenshot_dir/menu.png"
xdotool mousemove --sync --window "$window_id" 640 252 click 1
sleep 5
xwd -silent -id "$window_id" -out "$screenshot_dir/game.xwd"
convert "$screenshot_dir/game.xwd" "$screenshot_dir/game.png"
xdotool key Tab
sleep 1
xwd -silent -id "$window_id" -out "$screenshot_dir/inventory.xwd"
convert "$screenshot_dir/inventory.xwd" "$screenshot_dir/inventory.png"
xdotool key Escape
sleep 0.5
xdotool key m
sleep 0.5
xdotool key Escape
sleep 0.5
xdotool key Escape
sleep 0.5
xdotool key Escape
xdotool keydown w
sleep 1
xdotool keyup w
sleep 1
finish
trap - EXIT

if grep -E "SCRIPT ERROR|Parse Error|ERROR:|Invalid access|Failed to load" "$log_path"; then
	exit 1
fi
printf 'DESKTOP_SMOKE: PASS (menú, partida, mochila, mapa, pausa, movimiento)\n'
printf 'Capturas: %s\n' "$screenshot_dir"
