#!/bin/sh
set -eu
repo=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/files/objects" "$tmp/files/staging"
current=11111111-1111-4111-8111-111111111111
history=22222222-2222-4222-8222-222222222222
orphan=33333333-3333-4333-8333-333333333333
mkdir -p "$tmp/files/staging/validate-isolated-proof/cache"
touch "$tmp/files/objects/$current" "$tmp/files/objects/$history" "$tmp/files/objects/$orphan" "$tmp/files/staging/active.part" "$tmp/files/staging/validate-isolated-proof/input" "$tmp/files/staging/validate-isolated-proof/cache/page"
cat > "$tmp/bin/psql" <<SCRIPT
#!/bin/sh
[ "\${PSQL_FAIL:-}" != yes ] || exit 1
printf '%s\\n' '$current' '$history'
SCRIPT
chmod +x "$tmp/bin/psql"
run() { PATH="$tmp/bin:$PATH" FILE_STORAGE_PATH="$tmp/files" DATABASE_URL=test BACKEND_OFFLINE_CONFIRMED=yes "$repo/scripts/reconcile-private-files.sh"; }
PSQL_FAIL=yes; export PSQL_FAIL
if run; then echo "query failure unexpectedly succeeded" >&2; exit 1; fi
[ -f "$tmp/files/objects/$orphan" ] && [ -f "$tmp/files/staging/active.part" ]
[ -f "$tmp/files/staging/validate-isolated-proof/input" ] && [ -f "$tmp/files/staging/validate-isolated-proof/cache/page" ]
unset PSQL_FAIL
run
[ -f "$tmp/files/objects/$current" ] && [ -f "$tmp/files/objects/$history" ]
[ ! -e "$tmp/files/objects/$orphan" ] && [ ! -e "$tmp/files/staging/active.part" ]
[ ! -e "$tmp/files/staging/validate-isolated-proof" ]
if FILE_STORAGE_PATH="$tmp/files" DATABASE_URL=test "$repo/scripts/reconcile-private-files.sh"; then
  echo "offline confirmation was not enforced" >&2; exit 1
fi
echo "Reconciliation failure-closed and retention checks passed"
