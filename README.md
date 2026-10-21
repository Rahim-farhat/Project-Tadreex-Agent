# Scenarios Platform

Clients design VR training scenarios with an AI assistant; admins review them. By Tadreex.

| Part | Stack | Path |
| --- | --- | --- |
| Web app (admin + client chat) | Next.js 16, React 18 | `client/` |
| API | Express, TypeScript, Groq via LangChain | `server/` |
| Database | PostgreSQL 17 | schema in `server/src/config/schema.ts` |
| Reverse proxy | Caddy (automatic HTTPS) | `deploy/Caddyfile` |

- **Admin**: `/admin` — projects, chat/scenario question fields, AI model settings, users.
- **Client**: `/chat/<token>` — the private link generated for each project.

The schema is applied automatically when the API starts (idempotent `CREATE … IF NOT EXISTS`).

## Deploy on a VPS (scenarios.tadreex.com)

Requirements: Docker with the Compose plugin, ports 80 and 443 free, and a DNS
`A` record for `scenarios.tadreex.com` pointing at the VPS.

**1. DNS.** Create an `A` record `scenarios` → the VPS IPv4. If tadreex.com is managed
at OVH: Web Cloud → Domain names → tadreex.com → DNS zone → Add an entry → A.
Check with `nslookup scenarios.tadreex.com` before going further (Let's Encrypt needs it).

**2. Prepare the VPS** (Ubuntu/Debian, as the `ubuntu` user):

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker
sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw --force enable
# VPS with 2 GB RAM or less: add swap so the Next.js build doesn't run out of memory
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile \
  && sudo swapon /swapfile && echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

If the OVH Network Firewall is enabled in the OVH control panel, allow 80 and 443 there too.

**3. Get the code and configure.** A private GitHub repo needs a
[deploy key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys)
or a personal access token to clone.

```bash
git clone https://github.com/Rahim-farhat/Project-Tadreex-Agent.git scenarios-platform
cd scenarios-platform
cp .env.example .env
openssl rand -hex 24   # → POSTGRES_PASSWORD
openssl rand -hex 64   # → JWT_SECRET
nano .env              # also GROQ_API_KEY and ADMIN_PASSWORD (8+ characters)
```

**4. Start.**

```bash
docker compose up -d --build
docker compose ps                 # db, server, client healthy; caddy running
docker compose logs -f caddy      # "certificate obtained successfully"
```

The site is live at https://scenarios.tadreex.com. Sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

### Import the existing MongoDB data (once)

In MongoDB Atlas → Network Access, allow the VPS IP. Set `MONGODB_URI` in `.env`, then:

```bash
docker compose up -d server      # reloads the env
docker compose exec server node dist/scripts/migrate-from-mongo.js
```

Existing IDs and client links are kept. Re-running skips rows that already exist.
If an account with `ADMIN_EMAIL` already exists in MongoDB, the one created from `.env`
takes precedence (the imported duplicate is skipped). Remove `MONGODB_URI` afterwards.

### Update

```bash
git pull && docker compose up -d --build
```

### Backup and restore

```bash
docker compose exec -T db pg_dump -U scenarios -Fc scenarios > backup-$(date +%F).dump
docker compose exec -T db pg_restore -U scenarios -d scenarios --clean < backup.dump
```

### VPS already runs nginx on 80/443?

Remove the `caddy` service from `docker-compose.yml`, publish the apps on localhost
(`server: ports: ["127.0.0.1:5000:5000"]`, `client: ports: ["127.0.0.1:3000:3000"]`)
and proxy from nginx:

```nginx
location /api/ { proxy_pass http://127.0.0.1:5000; proxy_read_timeout 120s; }
location /     { proxy_pass http://127.0.0.1:3000; }
```

## Local development

```bash
docker compose -f docker-compose.dev.yml up -d   # Postgres on localhost:5435
cp server/.env.example server/.env       # DATABASE_URL=postgres://scenarios:scenarios@localhost:5435/scenarios
cd server && npm install && npm run dev  # API on :5000
cd client && npm install && npm run dev  # web on :3000, proxies /api to :5000
```

`npm run migrate:mongo` (in `server/`) imports the old MongoDB data into the local database.
