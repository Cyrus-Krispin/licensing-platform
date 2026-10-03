#!/usr/bin/env bash
set -euo pipefail
base=http://localhost:8080
cookie=$(mktemp); trap 'rm -f "$cookie" "$cookie".*' EXIT
csrf(){ curl -fsS -c "$cookie" -b "$cookie" "$base/api/auth/csrf" | python3 -c 'import json,sys;print(json.load(sys.stdin)["token"])'; }
login(){ local user=$1 pass=$2 token; token=$(csrf); curl -fsS -o /dev/null -c "$cookie" -b "$cookie" -H "X-XSRF-TOKEN: $token" -d "username=$user&password=$pass" "$base/api/auth/login"; }
for role in operator officer; do : > "$cookie"; login "$role" "local-$role-password"; curl -fsS "$base/api/auth/me" | grep -q "${role^^}"; curl -fsS "$base/api/workspaces/$role" | grep -q 'workspace'; other=operator; [[ $role == operator ]] && other=officer; test "$(curl -sS -o /dev/null -w '%{http_code}' -b "$cookie" "$base/api/workspaces/$other")" = 403; token=$(csrf); curl -fsS -o /dev/null -b "$cookie" -H "X-XSRF-TOKEN: $token" -X POST "$base/api/auth/logout"; test "$(curl -sS -o /dev/null -w '%{http_code}' -b "$cookie" "$base/api/auth/me")" = 401; done
test "$(curl -sS -o /dev/null -w '%{http_code}' -d 'username=operator&password=bad' "$base/api/auth/login")" = 403
