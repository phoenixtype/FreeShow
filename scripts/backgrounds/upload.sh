#!/usr/bin/env bash
# Uploads the rendered and cut videos to the R2 bucket behind
# project-media.scriptural.online. Files already there at the same size are
# skipped (sizes are remembered in ~/.scriptural/backgrounds/uploaded.txt).
# Stills, posters and library.json deploy with the site:
#   npx wrangler pages deploy site --project-name scriptural-project
set -euo pipefail
BUCKET=scriptural-project-media
DIR="$HOME/.scriptural/backgrounds/video"
DONE="$HOME/.scriptural/backgrounds/uploaded.txt"
touch "$DONE"
cd "$(dirname "$0")/../.."
for file in "$DIR"/*.mp4; do
    name=$(basename "$file")
    size=$(stat -f %z "$file")
    grep -qx "$name $size" "$DONE" && continue
    npx wrangler r2 object put "$BUCKET/$name" --file "$file" --content-type video/mp4 \
        --cache-control "public, max-age=604800" --remote >/dev/null
    grep -v "^$name " "$DONE" > "$DONE.tmp" || true
    echo "$name $size" >> "$DONE.tmp" && mv "$DONE.tmp" "$DONE"
    echo "uploaded $name"
done
