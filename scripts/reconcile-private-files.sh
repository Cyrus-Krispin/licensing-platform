#!/bin/sh
set -eu
# Run with the backend stopped (or otherwise guarantee there are no active upload writers).
: "${FILE_STORAGE_PATH:?set FILE_STORAGE_PATH to the mounted private file root}"
: "${DATABASE_URL:?set DATABASE_URL for psql}"
root=${FILE_STORAGE_PATH%/}
objects="$root/objects"
staging="$root/staging"
mkdir -p "$objects" "$staging"
referenced=$(mktemp)
trap 'rm -f "$referenced"' EXIT
psql "$DATABASE_URL" --no-align --tuples-only --command 'select storage_key from evidence_upload' | sort -u > "$referenced"
find "$objects" -maxdepth 1 -type f -printf '%f\n' | sort -u | comm -23 - "$referenced" | while IFS= read -r orphan; do
  test -n "$orphan" && rm -- "$objects/$orphan"
done
# Staging files are never committed references. The no-active-writers precondition makes removal safe.
find "$staging" -maxdepth 1 -type f -name '*.part' -delete
