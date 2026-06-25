#!/usr/bin/env bash
# Queries KWin for any window with "StreamLyrics" in the caption and checks
# keepAbove status. Run this with a StreamLyrics PiP window open.
#
# Usage:  bash scripts/check-kwin-pip.sh

set -euo pipefail

TMPJS=$(mktemp /tmp/kwin_check_XXXXXX.js)
trap 'rm -f "$TMPJS"' EXIT

cat > "$TMPJS" << 'KWINEOF'
(function() {
    var windows = workspace.windowList();
    var found = false;
    for (var i = 0; i < windows.length; i++) {
        var w = windows[i];
        if (w.caption && w.caption.indexOf("StreamLyrics") !== -1) {
            print("STREAMLYRICS_PIP caption=" + w.caption + " keepAbove=" + w.keepAbove + " width=" + w.width + " height=" + w.height);
            found = true;
        }
    }
    if (!found) {
        print("STREAMLYRICS_PIP_NOT_FOUND — open a StreamLyrics PiP window first");
    }
})();
KWINEOF

SCRIPT_ID=$(dbus-send --session --dest=org.kde.KWin --print-reply --type=method_call \
    /Scripting org.kde.kwin.Scripting.loadScript \
    string:"$TMPJS" string:"streamlyrics-check-$(date +%s)" 2>&1 \
    | grep int32 | awk '{print $2}')

if [ -z "$SCRIPT_ID" ]; then
    echo "ERROR: Could not load KWin query script" >&2
    exit 1
fi

dbus-send --session --dest=org.kde.KWin --print-reply --type=method_call \
    /Scripting org.kde.kwin.Scripting.start 2>/dev/null || true

sleep 1

# Check journal for our output
journalctl --user -t kwin_wayland --since "3 seconds ago" --no-pager 2>/dev/null \
    | grep "STREAMLYRICS_PIP" || echo "No output found in journal — check manually"
