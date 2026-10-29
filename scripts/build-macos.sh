#!/bin/bash
set -euo pipefail
if [[ "$(uname -s)" != Darwin ]]; then
  echo 'O instalador .dmg tem de ser compilado num Mac (macOS 13 ou superior).' >&2
  exit 1
fi
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"
if ! command -v npm >/dev/null 2>&1; then
  echo 'Instale Node.js 24 LTS para Apple Silicon em https://nodejs.org/ e volte a executar.' >&2
  exit 1
fi
if ! xcrun --find swiftc >/dev/null 2>&1; then
  echo 'Instale primeiro as ferramentas Apple: execute xcode-select --install no Terminal e aguarde a conclusão.' >&2
  exit 1
fi
node -e 'const [a,b]=process.versions.node.split(".").map(Number); if(a<22 || (a===22 && b<12)){console.error("É necessário Node.js >=22.12; recomenda-se 24 LTS.");process.exit(1)}'
npm ci
npm test
# Desktop bundles all assets; the wrapper serves them on its own stable loopback origin.
VITE_DESKTOP=1 npm run build
OUTPUT="$PROJECT_DIR/release"
mkdir -p "$OUTPUT"
STAGING="$(mktemp -d "${TMPDIR:-/tmp}/bosch-range.XXXXXX")"
trap 'rm -rf "$STAGING"' EXIT
APP="$STAGING/Bosch Range Lab.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/web"
cp -R dist/. "$APP/Contents/Resources/web/"
cp macos/Info.plist "$APP/Contents/Info.plist"
xcrun swiftc -swift-version 5 -O -target arm64-apple-macos13.0 \
  -framework Cocoa -framework WebKit -framework Network \
  macos/main.swift -o "$APP/Contents/MacOS/BoschRangeLab"
xcrun swift macos/create-icon.swift "$STAGING/AppIcon.iconset"
iconutil --convert icns --output "$APP/Contents/Resources/AppIcon.icns" "$STAGING/AppIcon.iconset"
rm -rf "$STAGING/AppIcon.iconset"
codesign --force --sign - "$APP"
codesign --verify --strict --verbose=2 "$APP"
ln -s /Applications "$STAGING/Applications"
cp macos/INSTALAR.txt "$STAGING/LEIA-ME.txt"
VERSION="$(node -p 'require("./package.json").version')"
DMG="$OUTPUT/Bosch-Range-Lab-$VERSION-Apple-Silicon.dmg"
hdiutil create -volname 'Bosch Range Lab' -srcfolder "$STAGING" -ov -format UDZO "$DMG"
hdiutil verify "$DMG"
shasum -a 256 "$DMG" > "$DMG.sha256"
echo "Instalador criado e verificado: $DMG"
open "$OUTPUT"
