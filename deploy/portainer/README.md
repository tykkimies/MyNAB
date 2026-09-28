# Portainer deployment on 192.168.1.7

Target URL: **https://plexmanager.duckdns.org/mynab**.
Images are built for Linux amd64 and the `/mynab` base path. This path is compiled into
the client assets; changing it requires rebuilding both images.

## 1. Add the stack

In Portainer, choose the Docker environment for **192.168.1.7**, then **Stacks → Add stack**.
Name it **mynab**. Upload `deploy/portainer/stack.yml` or paste its contents into Web editor.

Under **Environment variables**, use **Load variables from .env file** and select the
private `.local/portainer-mynab.env` file prepared in this workspace. It contains two
independently generated secrets: `POSTGRES_PASSWORD` and `SECRET_ENCRYPTION_KEY`.
Keep a copy in a password manager. Do not commit or share this file.

The stack embeds `APP_ORIGIN=https://plexmanager.duckdns.org` and `APP_BASE_PATH=/mynab`.
Do **not** put `/mynab` in APP_ORIGIN. No separate DATABASE_URL entry is needed.

Deploy the stack after both images have been built on the Linux host. Do not enable forced image pulls/re-pulls: `mynab:0.3.19` and
`mynab-tools:0.3.19` are local images, not published to Docker Hub.

Expected services:

- `db`: healthy PostgreSQL, named persistent volume, no published port.
- `migrate`: **Exited (0)** after migrations; this is normal.
- `app`: healthy web app at **192.168.1.7:3107**, reachable through nginx at `/mynab`.
- `worker`: healthy background worker. It runs automatic bank sync every
  `SYNC_INTERVAL_HOURS` (default 6), enters due scheduled transactions, and performs daily
  cleanup. Scheduled entries await approval; stopping the worker pauses automation.
- SimpleFIN Bridge bank sync (about $15/year, up to 25 banks; the only bank
  provider since Plaid was removed): subscribe at https://bridge.simplefin.org, add your banks there, then
  create a setup token for MyNAB and paste it on Bank sync → Connect with
  SimpleFIN. The token is claimed once and stored encrypted. No
  stack variable is needed (`SIMPLEFIN=off` hides it). SimpleFIN updates about
  once a day and allows roughly 24 requests a day, so keep
  `SYNC_INTERVAL_HOURS` at 6 or more. Plaid variables left in an older stack
  are ignored; existing Plaid connections show as retired, keep their history,
  and their accounts move to SimpleFIN with "Move here".
- Bank sign-in problems: when a bank inside SimpleFIN needs a new sign-in, Bank sync
  shows SimpleFIN's message; fix it on bridge.simplefin.org. If SimpleFIN refuses
  the connection (access revoked or subscription lapsed), paste a new setup token
  on that connection.
- `admin`: small idle container for interactive setup/recovery through Portainer Console.

The stack does not create a user or install example financial data.

## 2. nginx Proxy Manager

Edit the existing **plexmanager.duckdns.org** Proxy Host. Add a Custom location:

| Field                 | Value         |
| --------------------- | ------------- |
| Location              | `/mynab`      |
| Scheme                | `http`        |
| Forward Hostname / IP | `192.168.1.7` |
| Forward Port          | `3107`        |

Preserve the entire `/mynab/...` request path when proxying. Do not add a rewrite that
strips `/mynab`, and do not forward requests to the backend root `/`.
Use the existing valid certificate and HTTPS settings for this host.

For an explicit alternative, `nginx-location.conf` contains two location blocks to paste
in the host's **Advanced** tab. Use either that snippet OR a Custom location, not both.
The snippet uses `proxy_pass http://192.168.1.7:3107;` without a trailing slash so nginx
preserves the full path. No changes to your other locations are required.

## 3. Create your owner account

In Portainer, open the stack's **admin** container → **Console** → `/bin/sh` → Connect.
Run:

```sh
npm run owner:create
```

Choose your username and a passphrase of at least 15 characters. Password input is hidden.
Then visit **https://plexmanager.duckdns.org/mynab** and sign in.

To recover access later, use the same console:

```sh
npm run owner:reset
```

This revokes all existing sessions. The admin container can be stopped after setup
and started again when recovery is needed. It has no published ports.

## Upgrading an existing stack

Development happens on an arm64 Mac with no Docker, so images can only be built on the
amd64 host. `npm run release` does that end to end: it refuses a dirty tree, refuses a
version that already exists on the host, uploads the committed revision to
`/home/plex/mynab/releases/<version>/`, builds both images with `APP_BASE_PATH` compiled
in on a builder capped at 2 CPUs and 2 GB, stops the builder afterwards, and prints what
to do next. Add `--prune` to clear the build cache when the host disk is tight. It never
modifies the running stack; steps 3 to 6 below stay manual and yours.

The images are local to the Docker host and are **not** in any registry. Never enable
"re-pull image" or `pull_policy: always`; Portainer would look on Docker Hub and fail.
Upgrading means pointing the stack at a newer local tag.

1. Confirm the new images exist on the host:
   `docker images | grep mynab` should list the new tag for both `mynab` and `mynab-tools`.
2. **Back up the database first.** Migrations are irreversible, and the previous release
   cannot read a newer schema. See "Checks and backups" below.
   **Replace the whole editor contents with the current `stack.yml`** rather than editing
   only the image tags. A release can add environment variables, and Compose passes through
   only what the YAML declares, so editing tags alone leaves new settings unset with no
   error: 0.3.0 added `PLAID_CLIENT_ID`, `PLAID_SECRET` and `PLAID_ENV` this way, and bank
   sync silently reported itself unconfigured.
3. In Portainer open **Stacks → mynab → Editor** and paste the current
   `deploy/portainer/stack.yml`, which carries the new tag and all environment settings.
4. Choose **Update the stack** with **re-pull image disabled**.
5. `migrate` runs first and must reach **Exited (0)**. `app` then starts and becomes
   healthy. Readiness returns 503 until every expected migration is recorded, so a
   persistent 503 means the migration step did not finish; read its logs before retrying.
6. To roll back, set the image lines back to the previous tag and update again. This only
   works if the database has not been migrated; restore the backup first if it has.

Old image tags are kept on the host on purpose. Remove them only when you are confident
in the new release, and never with `docker image prune -a`, which would delete the local
images this stack depends on.

## Checks and backups

- Readiness: `https://plexmanager.duckdns.org/mynab/api/health/ready`.
- If login produces Forbidden, check the exact public scheme/host against APP_ORIGIN.
- If assets or login redirects lose `/mynab`, verify the image tag and remove nginx rewrites.
- The database persists in the stack's `postgres-data` volume. Never remove it during updates.
- The repository's backup scripts can target this stack from the SSH release folder by
  setting `COMPOSE_PROJECT_NAME=mynab`, `COMPOSE_FILE=deploy/portainer/stack.yml`, and supplying
  the same two secrets as environment variables. Keep those secrets out of shell history.
- Preserve the encryption key separately from DB backups. Test restoration into a fresh DB.

Build artifacts and validation results are recorded in the main DEVELOPMENT_LOG.md.

Portainer references: https://docs.portainer.io/user/docker/stacks/add
Next.js subpath behavior: https://nextjs.org/docs/pages/api-reference/config/next-config-js/basePath
nginx path preservation: https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass
