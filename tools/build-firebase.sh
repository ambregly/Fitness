#!/bin/sh
# Reconstruit js/vendor/firebase.js (Firebase embarqué dans l'app : pas de CDN,
# fonctionne hors ligne). À lancer depuis la racine du dépôt.
set -e
FB_VERSION=12.19.0
TMP=$(mktemp -d)
cp tools/firebase-entry.js "$TMP/entry.js"
cd "$TMP"
npm init -y >/dev/null
npm install --silent firebase@$FB_VERSION esbuild@0.25 >/dev/null
npx esbuild entry.js --bundle --format=esm --minify --legal-comments=eof --target=safari15 --outfile=firebase.js
cd - >/dev/null
cp "$TMP/firebase.js" js/vendor/firebase.js
echo "js/vendor/firebase.js reconstruit (firebase@$FB_VERSION)"
