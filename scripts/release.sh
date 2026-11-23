#!/bin/sh
# Build Tembo.app for both Apple Silicon and Intel Macs and zip it, ready to
# attach to a GitHub Release:
#
#   npm run release
#
# The zip is src-tauri/target/Tembo-<version>.zip, with the version from
# src-tauri/tauri.conf.json. The app is signed ad hoc (bundle.macOS in
# tauri.conf.json), not with an Apple Developer ID, so the first time it is
# opened on another Mac its user has to allow it under System Settings →
# Privacy & Security → Open Anyway.
set -eu
cd "$(dirname "$0")/.."

rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm install --no-audit --no-fund
npx tauri build --bundles app --target universal-apple-darwin

version=$(node -p "JSON.parse(require('fs').readFileSync('src-tauri/tauri.conf.json', 'utf8')).version")
app=src-tauri/target/universal-apple-darwin/release/bundle/macos/Tembo.app
zip=src-tauri/target/Tembo-$version.zip
rm -f "$zip"
ditto -c -k --keepParent "$app" "$zip"

echo
echo "Built $zip"
echo "To publish it:  gh release create v$version $zip --title \"Tembo $version\""
