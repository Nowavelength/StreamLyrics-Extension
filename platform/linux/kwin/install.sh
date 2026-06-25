#!/usr/bin/env bash
# StreamLyrics KWin PiP keep-above installer
# Copies the KWin script to the user's local KWin scripts directory,
# enables it in kwinrc, and reloads KWin.

set -euo pipefail

SCRIPT_ID="streamlyrics-pip-keep-above"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE="${SCRIPT_DIR}/${SCRIPT_ID}"

TARGET_DIR="${HOME}/.local/share/kwin/scripts/${SCRIPT_ID}"

if [ ! -d "${SOURCE}" ]; then
    echo "ERROR: Source directory not found: ${SOURCE}" >&2
    exit 1
fi

echo "Installing ${SCRIPT_ID} to ${TARGET_DIR} ..."
rm -rf "${TARGET_DIR}"
mkdir -p "${TARGET_DIR}"
cp -r "${SOURCE}/"* "${TARGET_DIR}/"

# Enable the script in kwinrc
CONFIG_FILE="${HOME}/.config/kwinrc"

# Ensure [Plugins] section exists and the script is enabled
if [ -f "${CONFIG_FILE}" ]; then
    # Remove any existing entry for this script
    sed -i "/^${SCRIPT_ID}Enabled=/d" "${CONFIG_FILE}"
    # Check if [Plugins] section exists
    if grep -q '^\[Plugins\]' "${CONFIG_FILE}"; then
        # Add after [Plugins] header
        sed -i "/^\[Plugins\]/a ${SCRIPT_ID}Enabled=true" "${CONFIG_FILE}"
    else
        # Append [Plugins] section
        printf '\n[Plugins]\n%sEnabled=true\n' "${SCRIPT_ID}" >> "${CONFIG_FILE}"
    fi
else
    mkdir -p "$(dirname "${CONFIG_FILE}")"
    printf '[Plugins]\n%sEnabled=true\n' "${SCRIPT_ID}" > "${CONFIG_FILE}"
fi

echo "Enabled in kwinrc."

# Reconfigure KWin to pick up changes (works on both X11 and Wayland)
if command -v qdbus6 &>/dev/null; then
    qdbus6 org.kde.KWin /KWin reconfigure 2>/dev/null || true
elif command -v qdbus &>/dev/null; then
    qdbus org.kde.KWin /KWin reconfigure 2>/dev/null || true
elif command -v dbus-send &>/dev/null; then
    dbus-send --session --dest=org.kde.KWin --type=method_call \
        /KWin org.kde.KWin.reconfigure 2>/dev/null || true
else
    echo "WARN: Could not find qdbus or dbus-send — restart KWin manually or log out/in." >&2
fi

echo "Done. ${SCRIPT_ID} is installed and enabled."
