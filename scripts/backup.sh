#!/bin/sh
# Compose database backup. Run from repository root; output is never under public/.
set -eu
umask 077
mkdir -p backups
chmod 700 backups
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_path="backups/mynab-${stamp}-$$.dump"
trap 'rm -f "$backup_path.partial"' EXIT HUP INT TERM
docker compose exec -T db sh -c 'pg_dump --format=custom --no-owner --no-acl -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$backup_path.partial"
# Verify the archive directory is readable before publishing the backup filename.
docker compose exec -T db pg_restore --list < "$backup_path.partial" > /dev/null
mv "$backup_path.partial" "$backup_path"
printf 'Backup created: %s\nEncrypt before transferring off-host; preserve encryption keys separately.\n' "$backup_path"
