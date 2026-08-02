#!/usr/bin/env bash
# Regenerates the landing page's real-app footage: runs the staged capture
# scenes (apps/desktop/e2e/capture) against the mocked-bridge app, then
# assembles each frame sequence into a seamless webm loop + poster frame in
# apps/web/public/landing/. Requires ffmpeg with libvpx-vp9.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/apps/web/public/landing"

cd "$root/apps/desktop"
rm -rf capture-out
pnpm exec playwright test --config playwright.capture.config.ts

mkdir -p "$out"
for scene in loop comments scan; do
  ffmpeg -y -hide_banner -loglevel error \
    -f concat -safe 0 -i "capture-out/$scene/scene.ffconcat" \
    -vf "fps=30,format=yuv420p" \
    -c:v libvpx-vp9 -b:v 0 -crf 35 -row-mt 1 \
    "$out/$scene.webm"
  cp "capture-out/$scene/poster.png" "$out/$scene.png"
  echo "$scene: $(du -h "$out/$scene.webm" | cut -f1) webm, $(du -h "$out/$scene.png" | cut -f1) poster"
done

cp capture-out/hero/poster.png "$out/hero.png"
echo "hero: $(du -h "$out/hero.png" | cut -f1) poster"
