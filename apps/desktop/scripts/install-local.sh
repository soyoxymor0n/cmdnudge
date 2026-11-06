#!/bin/sh
# Build cmdnudge, sign it with the local Apple Development identity (no provisioning
# profile, no notarization) and install it to /Applications. Same approach as MMF NG's
# local builds. A stable identity keeps the Input Monitoring / Accessibility grants
# across rebuilds; an ad-hoc signature would make macOS forget them every time.
set -eu
cd "$(dirname "$0")/.."
[ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"

IDENTITY="${APPLE_SIGNING_IDENTITY:-$(security find-identity -v -p codesigning | awk -F'"' '/Apple Development|Developer ID Application/ {print $2; exit}')}"
if [ -z "$IDENTITY" ]; then
  echo "No code signing identity found; signing ad-hoc (permissions reset on every rebuild)." >&2
  IDENTITY="-"
fi
echo "Signing with: $IDENTITY"

(cd ../.. && node packages/library/tools/generate.mjs)
APPLE_SIGNING_IDENTITY="$IDENTITY" npx tauri build --bundles app

APP="src-tauri/target/release/bundle/macos/cmdnudge.app"
codesign --verify --deep --strict "$APP"

if pgrep -x cmdnudge >/dev/null; then
  osascript -e 'tell application "cmdnudge" to quit' >/dev/null 2>&1 || true
  sleep 1
  pkill -x cmdnudge 2>/dev/null || true
fi
rm -rf /Applications/cmdnudge.app
ditto --noextattr --noacl "$APP" /Applications/cmdnudge.app
codesign --verify --deep --strict /Applications/cmdnudge.app
echo "Installed /Applications/cmdnudge.app"
[ "${NO_OPEN:-}" = 1 ] || open /Applications/cmdnudge.app
