#!/bin/sh
set -eu

storage_path=${FILE_STORAGE_PATH:-/var/lib/licensing/files}
mkdir -p "$storage_path"
chown app:app "$storage_path"
exec gosu app java -jar /app/app.jar
