#!/bin/sh
# Restore only to a NEW, empty database on the Compose server. Never replaces current data.
set -eu
if [ "$#" -ne 2 ]; then printf 'Usage: scripts/restore.sh backups/file.dump mynab_restore_YYYYMMDD\n' >&2; exit 1; fi
archive=$1
restore_db=$2
case "$restore_db" in mynab_restore_[a-zA-Z0-9_]*) ;; *) printf 'Destination must start with mynab_restore_\n' >&2; exit 1;; esac
case "$restore_db" in *[!a-zA-Z0-9_]*) printf 'Invalid destination name\n' >&2; exit 1;; esac
[ -f "$archive" ] || { printf 'Archive not found\n' >&2; exit 1; }
docker compose exec -T db sh -c 'createdb -U "$POSTGRES_USER" "$1"' sh "$restore_db"
docker compose exec -T db sh -c 'pg_restore --exit-on-error --single-transaction --no-owner --no-acl -U "$POSTGRES_USER" -d "$1"' sh "$restore_db" < "$archive"
printf 'Restored into %s. Validate in an isolated app before switching DATABASE_URL.\n' "$restore_db"
