#!/usr/bin/env bash
set -euo pipefail

base_url=${BASE_URL:-http://localhost:8080}
cookie_jar=$(mktemp)
trap 'rm -f "$cookie_jar"' EXIT

status() {
  curl --silent --show-error --output /dev/null --write-out '%{http_code}' "$@"
}

csrf() {
  curl --fail --silent --show-error --cookie "$cookie_jar" --cookie-jar "$cookie_jar" \
    "$base_url/api/auth/csrf" |
    python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])'
}

login() {
  local username=$1 password=$2 token
  token=$(csrf)
  curl --fail --silent --show-error --output /dev/null \
    --cookie "$cookie_jar" --cookie-jar "$cookie_jar" \
    --header "X-XSRF-TOKEN: $token" \
    --data-urlencode "username=$username" --data-urlencode "password=$password" \
    "$base_url/api/auth/login"
}

logout() {
  local token
  token=$(csrf)
  curl --fail --silent --show-error --output /dev/null \
    --cookie "$cookie_jar" --cookie-jar "$cookie_jar" \
    --header "X-XSRF-TOKEN: $token" --request POST "$base_url/api/auth/logout"
}

# Login is a mutation and must reject a missing token.
test "$(status --data 'username=operator&password=bad' "$base_url/api/auth/login")" = 403

# Bad credentials with a valid token must be an authentication failure, not a CSRF failure.
token=$(csrf)
test "$(status --cookie "$cookie_jar" --cookie-jar "$cookie_jar" \
  --header "X-XSRF-TOKEN: $token" --data 'username=operator&password=bad' \
  "$base_url/api/auth/login")" = 401

for role in operator officer; do
  : >"$cookie_jar"
  login "$role" "local-$role-password"
  curl --fail --silent --show-error --cookie "$cookie_jar" "$base_url/api/auth/me" |
    grep --quiet "${role^^}"
  curl --fail --silent --show-error --cookie "$cookie_jar" "$base_url/api/workspaces/$role" |
    grep --quiet 'workspace'
  other=operator
  [[ $role == operator ]] && other=officer
  test "$(status --cookie "$cookie_jar" "$base_url/api/workspaces/$other")" = 403
  logout
  test "$(status --cookie "$cookie_jar" "$base_url/api/auth/me")" = 401
done

# A JDBC-backed session and unchanged seeded credentials must survive an ordinary backend restart.
: >"$cookie_jar"
login operator local-operator-password
before_hashes=$(docker compose exec -T db psql -U licensing -d licensing -Atc \
  'select username || chr(58) || password_hash from app_user order by username')
test "$(docker compose exec -T db psql -U licensing -d licensing -Atc \
  'select count(*) from app_user')" = 2
docker compose restart backend
docker compose up --wait --wait-timeout 120
curl --fail --silent --show-error --cookie "$cookie_jar" \
  "$base_url/api/workspaces/operator" | grep --quiet 'Operator workspace'
after_hashes=$(docker compose exec -T db psql -U licensing -d licensing -Atc \
  'select username || chr(58) || password_hash from app_user order by username')
test "$before_hashes" = "$after_hashes"
test "$(docker compose exec -T db psql -U licensing -d licensing -Atc \
  'select count(*) from app_user')" = 2
