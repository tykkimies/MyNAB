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

Deploy the stack. Do not enable forced image pulls/re-pulls: `mynab:0.1.1` and
`mynab-tools:0.1.1` are local images, not published to Docker Hub.

Expected services:

- `db`: healthy PostgreSQL, named persistent volume, no published port.
- `migrate`: **Exited (0)** after migrations; this is normal.
- `app`: healthy web app at **192.168.1.7:3107**, reachable through nginx at `/mynab`.
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
