# Zemen ePOS VPS Deployment Guide

This guide deploys the current Zemen ePOS repository to a Linux VPS through an SSH terminal. It is written for Ubuntu 24.04 LTS (Ubuntu 22.04 is also suitable), Docker Compose, PostgreSQL on the same VPS, host-level Nginx, and HTTPS from Let's Encrypt.

The production request path will be:

```text
User browser
    |
    | HTTPS :443
    v
Host Nginx
    |
    | http://127.0.0.1:4999
    v
Web container (React + Nginx)
    |
    | /api/* -> api:4899
    v
API container (NestJS)
    |                |                  |
    v                v                  v
PostgreSQL         Redis              Vault
(Docker/VPS)     (Docker/VPS)       (Docker/VPS)
```

Only ports 22, 80, and 443 should be public. Docker Compose already binds the application, Vault, Redis, Prometheus, and Grafana host ports to `127.0.0.1`.

## Fast path: what you actually do

The detailed sections below explain every security and recovery decision. The practical process is shorter:

### First deployment (one time)

1. Buy an Ubuntu VPS and point `pos.example.com` to its IP.
2. SSH into it and install Docker, Git, Nginx, and Certbot using Sections 2–5.
3. Clone the repository into `/opt/zemen-epos` using Sections 6–7.
4. Copy the two example environment files and replace their placeholders:

   ```bash
   cd /opt/zemen-epos
   cp .env.example .env
   cp apps/api/.env.example apps/api/.env
   chmod 600 .env apps/api/.env
   nano .env
   nano apps/api/.env
   ```

5. Start the complete core system, including VPS PostgreSQL and daily backups:

   ```bash
   docker compose config --quiet
   docker compose build --pull api web
   docker compose up -d postgres redis vault vault-init backup api web
   docker compose ps
   ```

6. Configure Nginx and HTTPS using Sections 13–14.
7. Run the acceptance checks in Section 16.
8. Configure automatic deployment once using the CI/CD section below.

### Every later update

After CI/CD is configured, your normal work is:

```powershell
git add .
git commit -m "Describe the update"
git push origin your-feature-branch
```

Create and review a pull request into `main`. When it is merged, GitHub Actions tests the code, connects to the VPS over SSH, backs up PostgreSQL, pulls the new `main`, rebuilds API/web, runs Prisma migrations, recreates the services, and waits for health checks.

For a solo project you can push directly to `main`, but a reviewed pull request is safer because a production database migration can be irreversible.

## 1. Before starting

Prepare the following:

- A VPS with at least 2 vCPU, 4 GB RAM, 50 GB SSD, and Ubuntu LTS. For production with the complete observability stack, 4 vCPU and 8 GB RAM is safer.
- A non-root sudo user and SSH access.
- A domain or subdomain, for example `pos.example.com`.
- DNS access so an `A` record can point the domain to the VPS IPv4 address. Add an `AAAA` record only if IPv6 is configured correctly.
- Access to the private Git repository, normally through a deploy key.
- Enough SSD storage for PostgreSQL, uploads, logs, and backups. PostgreSQL runs privately in Docker on this VPS and uses a persistent named volume.
- SMTP credentials because signup, OTP, login verification, and password reset use email.
- Production MoR credentials and the INSA private key/certificate only when real MoR submission is being enabled.
- A secure password manager or secret manager. Never paste production secrets into Git, chat, screenshots, or deployment documentation.

Recommended DNS record:

```text
Type: A
Name: pos
Value: YOUR_VPS_PUBLIC_IPV4
TTL: 300
```

Wait until this returns the VPS IP from your own computer:

```bash
nslookup pos.example.com
```

## 2. Connect through SSH

From PowerShell on Windows:

```powershell
ssh your_vps_user@YOUR_VPS_IP
```

If an SSH key is required:

```powershell
ssh -i C:\path\to\your-private-key your_vps_user@YOUR_VPS_IP
```

After connecting, confirm the operating system, disk, memory, and time:

```bash
cat /etc/os-release
df -h
free -h
timedatectl
```

Set the correct timezone if required:

```bash
sudo timedatectl set-timezone Africa/Addis_Ababa
```

Update the VPS:

```bash
sudo apt update
sudo apt upgrade -y
sudo reboot
```

Reconnect after the reboot.

## 3. Basic SSH and firewall security

Do not disable password login until key-based SSH has been tested in a second terminal.

Install and configure the firewall:

```bash
sudo apt install -y ufw fail2ban
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status verbose
```

If `Nginx Full` is not available yet, use:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

Never open these ports publicly:

- `4899`: NestJS API
- `4999`: web container
- `6379` or `63790`: Redis
- `8200` or `18200`: Vault
- `9090`, `19090`, or `13000`: monitoring interfaces

After public-key login is confirmed, harden SSH in `/etc/ssh/sshd_config` or an included file:

```text
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
```

Validate before restarting SSH:

```bash
sudo sshd -t
sudo systemctl restart ssh
```

Keep the first SSH session open while testing a new login from a second terminal.

## 4. Install Docker Engine and Compose

Use Docker's official Ubuntu repository rather than an old distribution package. The canonical instructions are maintained at <https://docs.docker.com/engine/install/ubuntu/>.

Remove conflicting packages if present:

```bash
for pkg in docker.io docker-doc docker-compose podman-docker containerd runc; do sudo apt-get remove -y "$pkg"; done
```

Install Docker's repository key and source:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Test it:

```bash
sudo docker run --rm hello-world
sudo docker compose version
```

Allow the deployment user to run Docker:

```bash
sudo usermod -aG docker "$USER"
exit
```

Reconnect through SSH, then check:

```bash
docker version
docker compose version
```

Membership in the `docker` group is effectively root-level access. Only trusted deployment administrators should have it.

## 5. Install Nginx, Git, and supporting tools

```bash
sudo apt install -y nginx git openssl curl jq
sudo systemctl enable --now nginx
sudo systemctl status nginx --no-pager
```

Visiting `http://YOUR_VPS_IP` should show the default Nginx page.

## 6. Give the VPS access to the Git repository

For a private GitHub repository, create a dedicated read-only deploy key on the VPS:

```bash
ssh-keygen -t ed25519 -C "zemen-production-deploy" -f ~/.ssh/zemen_deploy
cat ~/.ssh/zemen_deploy.pub
```

Add the displayed public key in GitHub under repository **Settings -> Deploy keys -> Add deploy key**. Read-only access is sufficient for deployments.

Create an SSH host entry:

```bash
nano ~/.ssh/config
```

Add:

```text
Host github-zemen
    HostName github.com
    User git
    IdentityFile ~/.ssh/zemen_deploy
    IdentitiesOnly yes
```

Secure and test it:

```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/config ~/.ssh/zemen_deploy
chmod 644 ~/.ssh/zemen_deploy.pub
ssh -T github-zemen
```

GitHub normally replies that authentication succeeded but shell access is unavailable. That is expected.

## 7. Clone the application

Use `/opt/zemen-epos` as the production application directory:

```bash
sudo mkdir -p /opt/zemen-epos
sudo chown "$USER":"$USER" /opt/zemen-epos
git clone git@github-zemen:YOUR_GITHUB_OWNER/YOUR_REPOSITORY.git /opt/zemen-epos
cd /opt/zemen-epos
git status
git branch --show-current
git log -1 --oneline
```

Deploy a reviewed branch or tag. Do not deploy an unresolved feature branch directly to production.

## 8. Create production environment files

This repository uses two environment files for different purposes:

| File | Purpose |
|---|---|
| `/opt/zemen-epos/.env` | Docker Compose interpolation and variables explicitly passed by Compose |
| `/opt/zemen-epos/apps/api/.env` | NestJS/API secrets and feature settings loaded through `env_file` |

Both files are ignored by Git. Create them from the examples:

```bash
cd /opt/zemen-epos
cp .env.example .env
cp apps/api/.env.example apps/api/.env
chmod 600 .env apps/api/.env
```

Generate independent random secrets:

```bash
openssl rand -base64 48
openssl rand -base64 48
openssl rand -base64 32
```

Use different results for `JWT_SECRET`, `PUBLIC_LINK_SECRET`, and monitoring credentials. Do not reuse database, email, MoR, or administrator passwords.

### 8.1 Configure the root `.env`

Edit it:

```bash
nano /opt/zemen-epos/.env
```

Generate a URL-safe database password first:

```bash
openssl rand -hex 32
```

At minimum, set:

```dotenv
POSTGRES_USER=zemen
POSTGRES_PASSWORD=PASTE_THE_GENERATED_HEX_VALUE
POSTGRES_DB=zemen
BACKUP_CRON=0 2 * * *
BACKUP_RETENTION_DAYS=14
PRISMA_MIGRATE_RETRIES=6

APP_PUBLIC_URL=https://pos.example.com
GOOGLE_OAUTH_REDIRECT_URI=https://pos.example.com/api/auth/google/callback
COOKIE_PATH=/api/auth
AUTH_ACCESS_TOKEN_TTL_SECONDS=3600

MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_SECURE=false
GMAIL_USER=your-production-mailbox@example.com
GMAIL_APP_PASSWORD=YOUR_APPLICATION_PASSWORD
AUTH_EMAIL_FROM=your-production-mailbox@example.com

METRICS_USER=CHANGE_THIS_METRICS_USER
METRICS_PASS=GENERATED_STRONG_PASSWORD
GRAFANA_ADMIN_USER=CHANGE_THIS_ADMIN_NAME
GRAFANA_ADMIN_PASSWORD=GENERATED_STRONG_PASSWORD

VITE_TURNSTILE_SITE_KEY=YOUR_PRODUCTION_TURNSTILE_SITE_KEY
```

Important database notes:

- Compose constructs `DATABASE_URL` internally from these three PostgreSQL values. Do not add a public PostgreSQL port.
- Use `openssl rand -hex 32`; a hexadecimal password is URL-safe for the generated connection URL.
- PostgreSQL data survives container recreation in the `postgres-data` named volume.
- The `backup` service creates an immediate dump and then a compressed dump each day at 02:00, retaining 14 days by default.
- Copy backups off the VPS as well. A backup stored only on the same failed disk is not disaster recovery.
- The API entrypoint automatically runs `prisma migrate deploy` before starting.

### 8.2 Configure `apps/api/.env`

Edit it:

```bash
nano /opt/zemen-epos/apps/api/.env
```

Essential production settings include:

```dotenv
JWT_SECRET=GENERATED_RANDOM_SECRET_1
PUBLIC_LINK_SECRET=GENERATED_RANDOM_SECRET_2

SEED_SUPER_ADMIN_EMAIL=your-admin@example.com
SEED_SUPER_ADMIN_PASSWORD=A_UNIQUE_TEMPORARY_STRONG_PASSWORD
SEED_DEMO_USERS=false

CORS_ORIGINS=https://pos.example.com
TRUSTED_PROXY_HOPS=2

MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_SECURE=false
GMAIL_USER=your-production-mailbox@example.com
GMAIL_APP_PASSWORD=YOUR_APPLICATION_PASSWORD
AUTH_EMAIL_FROM=your-production-mailbox@example.com
APP_PUBLIC_URL=https://pos.example.com
GOOGLE_OAUTH_REDIRECT_URI=https://pos.example.com/api/auth/google/callback

TURNSTILE_ENABLED=true
TURNSTILE_SECRET_KEY=YOUR_PRODUCTION_TURNSTILE_SECRET_KEY

NOTIFICATIONS_ENABLED=false
REPORTS_ENABLED=false
DRAFTS_ENABLED=false
EIRMS_LOG_PAYLOADS=0
```

`TRUSTED_PROXY_HOPS=2` matches this guide's two reverse proxies: host Nginx and the web container's Nginx. If a CDN or load balancer is added, recalculate and test the trusted proxy chain; do not simply trust every proxy.

Production rules:

- Never use the example super-admin password.
- Never enable `SEED_DEMO_USERS` in production.
- Change the temporary super-admin password immediately after first login.
- Keep `EIRMS_LOG_PAYLOADS=0`; invoice payloads can contain sensitive taxpayer data.
- Enable reports/notifications only after their email provider and queues have been tested.
- If Google login is enabled, register the redirect URI exactly as written, including `https` and `/api/auth/google/callback`.
- The Turnstile site key is browser-visible and belongs in the root `.env`; the secret key belongs only in `apps/api/.env`.

### 8.3 Configure MoR carefully

Put platform bootstrap MoR values only in `apps/api/.env`:

```dotenv
EIRMS_BASE_URL=https://THE_OFFICIAL_MOR_HOST
EIRMS_CLIENT_ID=YOUR_CLIENT_ID
EIRMS_CLIENT_SECRET=YOUR_CLIENT_SECRET
EIRMS_API_KEY=YOUR_API_KEY
EIRMS_TIN=YOUR_TIN
EIRMS_SYSTEM_NUMBER=YOUR_SOURCE_SYSTEM_NUMBER
EIRMS_SYSTEM_TYPE=POS
EIRMS_SELLER_LEGAL_NAME=THE_EXACT_MOR_REGISTERED_LEGAL_NAME
EIRMS_SELLER_EMAIL=THE_EXACT_MOR_REGISTERED_EMAIL
EIRMS_SELLER_PHONE=THE_EXACT_MOR_REGISTERED_PHONE
EIRMS_SELLER_REGION=THE_OFFICIAL_REGION_CODE
EIRMS_SELLER_WEREDA=THE_OFFICIAL_WEREDA_CODE
EIRMS_SELLER_VAT_NUMBER=THE_OFFICIAL_VAT_NUMBER
EIRMS_SEED_DEFAULT_CREDENTIALS=false
```

The seller email, phone, TIN, legal name, region, and wereda must exactly match the enterprise data registered with MoR. A difference can produce `Seller details error: Mismatched fields`.

For this multi-tenant system, branch-specific MoR credentials should normally be entered through the authorized branch onboarding/configuration flow and stored in Vault. Do not turn on `EIRMS_SEED_DEFAULT_CREDENTIALS` unless deliberately provisioning or updating the legacy system-owner default branch.

Do not guess a production MoR URL or switch an HTTP test URL to HTTPS without official confirmation. Confirm the production endpoint, source-system activation, public-IP requirements, and certificate status with MoR.

## 9. Install the INSA signing material (when issued)

MoR login success alone does not prove invoice signing is production-ready. The production HTTPS integration requires the INSA-issued certificate and its matching private key.

Create a directory outside the Git repository:

```bash
sudo install -d -m 750 -o root -g 1000 /opt/zemen-epos-secrets/eirms
```

Transfer the files from your trusted workstation using SCP, not chat or Git:

```powershell
scp private_key.key certificate.pem your_vps_user@YOUR_VPS_IP:/tmp/
```

On the VPS:

```bash
sudo mv /tmp/private_key.key /opt/zemen-epos-secrets/eirms/private_key.key
sudo mv /tmp/certificate.pem /opt/zemen-epos-secrets/eirms/certificate.pem
sudo chown root:1000 /opt/zemen-epos-secrets/eirms/private_key.key /opt/zemen-epos-secrets/eirms/certificate.pem
sudo chmod 640 /opt/zemen-epos-secrets/eirms/private_key.key
sudo chmod 644 /opt/zemen-epos-secrets/eirms/certificate.pem
```

Verify that the key and certificate match without printing the private key:

```bash
openssl pkey -in /opt/zemen-epos-secrets/eirms/private_key.key -pubout -outform pem | sha256sum
openssl x509 -in /opt/zemen-epos-secrets/eirms/certificate.pem -pubkey -noout -outform pem | sha256sum
openssl x509 -in /opt/zemen-epos-secrets/eirms/certificate.pem -noout -subject -issuer -serial -dates
```

The first two SHA-256 results must be identical. Add this to the root `.env`:

```dotenv
EIRMS_CERT_DIR=/opt/zemen-epos-secrets/eirms
```

Compose mounts that directory read-only and maps the expected filenames to:

```text
/etc/zemen/private_key.key
/etc/zemen/certificate.pem
```

If no certificate has been issued yet, leave `EIRMS_CERT_DIR` empty and do not claim that production invoice registration is complete.

## 10. Prepare persistent directories

The following host directories contain production state and must survive upgrades:

```bash
cd /opt/zemen-epos
mkdir -p exports uploads/inventory legal-documents backups
mkdir -p vault/data vault/audit vault/approle
mkdir -p observability/prometheus/data observability/loki/data observability/grafana/data
```

The one-shot `vault-permissions` and `observability-init` services apply container ownership. Do not manually delete `vault/data/init.json`, `vault/approle/role-id`, or `vault/approle/secret-id`. Losing or mixing these files can seal Vault or cause `invalid role or secret ID` errors.

## 11. Validate the configuration before starting

Run:

```bash
cd /opt/zemen-epos
docker compose config --quiet
```

If it succeeds silently, inspect service names and resolved images without publishing the output because resolved configuration can contain secrets:

```bash
docker compose config --services
```

Never post the full output of `docker compose config` publicly; it can expand credentials from environment files.

Check for accidental tracked secrets:

```bash
git status --short
git check-ignore -v .env apps/api/.env
```

Both environment files should be ignored.

## 12. First deployment

### 12.1 Pull images and build the application

```bash
cd /opt/zemen-epos
docker compose pull postgres redis vault vault-init vault-permissions backup
docker compose build --pull api web
```

### 12.2 Start PostgreSQL, Redis, Vault, and backup first

```bash
docker compose up -d postgres redis vault vault-init backup
docker compose ps
docker compose logs --tail=100 postgres backup vault-permissions vault vault-init
```

Expected one-shot results:

- `vault-permissions` exits with code `0` after fixing bind-mount ownership.
- `vault-init` exits with code `0` after initializing/unsealing Vault and creating AppRole files.
- `vault` remains running and healthy.
- `redis` remains running and healthy.
- `postgres` remains running and healthy on the private Compose network.
- `backup` remains running after creating its first compressed database dump.

Confirm the initial database dump exists:

```bash
ls -lh backups/eirms-*.sql.gz
```

Confirm AppRole files exist without displaying their contents:

```bash
test -s vault/approle/role-id && echo "role-id exists"
test -s vault/approle/secret-id && echo "secret-id exists"
```

If `vault-permissions` fails, inspect:

```bash
docker compose logs vault-permissions
ls -ld vault vault/data vault/audit vault/approle
```

Do not work around it with `chmod -R 777`. The current service is designed to assign the expected Vault UID/GID.

### 12.3 Start API and web

```bash
docker compose up -d api web
docker compose ps
docker compose logs --tail=150 api web
```

The API performs Prisma migrations automatically before starting. A migration failure prevents the API from becoming healthy, which is safer than running against an outdated schema.

Test from the VPS:

```bash
curl -fsS http://127.0.0.1:4899/livez
curl -fsS http://127.0.0.1:4899/healthz
curl -fsS http://127.0.0.1:4999/healthz
curl -I http://127.0.0.1:4999/
```

If `/healthz` reports an external dependency problem, inspect the API logs and its JSON response. `/livez` answers whether the process itself is alive; it is not proof that database, Redis, Vault, SMTP, or MoR are ready.

## 13. Configure host Nginx

Create a site:

```bash
sudo nano /etc/nginx/sites-available/zemen-epos
```

Before obtaining HTTPS, use:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name pos.example.com;

    client_max_body_size 6m;

    location / {
        proxy_pass http://127.0.0.1:4999;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 120s;
    }
}
```

Replace `pos.example.com`, then enable and test:

```bash
sudo ln -s /etc/nginx/sites-available/zemen-epos /etc/nginx/sites-enabled/zemen-epos
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
curl -I http://pos.example.com
```

The host Nginx forwards everything to the web container. The web container serves React and forwards `/api/*` to the API container, stripping the `/api` prefix as expected by the backend routes.

## 14. Enable HTTPS with Let's Encrypt

Install Certbot:

```bash
sudo apt install -y certbot python3-certbot-nginx
```

Request the certificate only after DNS points to the VPS and port 80 is reachable:

```bash
sudo certbot --nginx -d pos.example.com
```

Choose the redirect from HTTP to HTTPS. Then verify:

```bash
sudo nginx -t
sudo systemctl reload nginx
curl -I https://pos.example.com
sudo certbot renew --dry-run
systemctl status certbot.timer --no-pager
```

Use an SSL test service to check the public configuration after deployment. Do not expose Vault directly to obtain TLS; Vault traffic currently stays inside Docker's private network.

## 15. Start optional observability only if the VPS has capacity

The core application needs `postgres`, `redis`, `vault`, `vault-init`, `backup`, `api`, and `web`. Loki, Promtail, Prometheus, Grafana, Redis Exporter, and cAdvisor are optional and consume additional memory and disk.

To start them:

```bash
cd /opt/zemen-epos
docker compose up -d observability-init loki promtail prometheus grafana redis_exporter cadvisor
docker compose ps
```

Grafana is bound to `127.0.0.1:13000`; keep it private. Access it through an SSH tunnel when needed:

```powershell
ssh -L 13000:127.0.0.1:13000 your_vps_user@YOUR_VPS_IP
```

Then open `http://127.0.0.1:13000` locally. If Grafana was already started once, changing `GRAFANA_ADMIN_PASSWORD` in `.env` does not automatically change its stored password.

## 16. Production acceptance checks

Complete these checks before real merchant data is used:

### Infrastructure

```bash
docker compose ps
docker compose logs --since=10m api web vault redis
curl -fsS https://pos.example.com/healthz
curl -fsS https://pos.example.com/api/livez
curl -fsS https://pos.example.com/api/healthz
```

### Application

1. Sign in as the seeded super admin and immediately change the temporary password.
2. Confirm OTP email delivery and expiry behavior.
3. Create or approve a controlled test merchant.
4. Confirm tenant and branch access restrictions with separate test users.
5. Upload and retrieve a small inventory image and legal document.
6. Confirm audit events are written for authentication and administrative actions.
7. Confirm a refresh/login cookie is marked `Secure`, `HttpOnly`, and uses path `/api/auth` in the browser.
8. Confirm a non-administrator cannot call administrator endpoints.
9. Confirm error responses do not expose stack traces or credentials.

### MoR

1. Confirm the VPS can reach the official MoR host over outbound TCP 443.
2. Confirm the VPS public IP is approved if MoR uses allow-listing.
3. Run branch connection/authentication testing.
4. Check that the MoR seller profile exactly matches enterprise registration.
5. Confirm certificate validity and signing readiness.
6. Issue only a formally approved controlled test invoice.
7. Record the document number, local invoice ID, IRN, MoR response, time, and tester.
8. Verify it through the application's `/invoices/{localInvoiceId}/verify` path.
9. Test cancellation only with an approved test invoice and valid reason.

Authentication success proves credentials work; it does not by itself prove that certificate signing, invoice validation, registration, receipt handling, verification, and cancellation are production-approved.

## 17. Backups and recovery

Back up four separate areas:

1. PostgreSQL data through the database provider's backups/PITR and periodic tested exports.
2. Vault state: `vault/data`, `vault/approle`, and the unseal material. This backup is highly sensitive.
3. Application files: `uploads`, `legal-documents`, and any retained `exports`.
4. Configuration: root `.env`, `apps/api/.env`, Nginx configuration, and INSA signing material, stored encrypted and separately from ordinary backups.

Never copy an active Vault backup into another environment without a recovery plan. Never commit backup archives or secret material to Git.

Example application-data backup (run during an approved maintenance process):

```bash
sudo install -d -m 700 /var/backups/zemen-epos
sudo tar --xattrs --acls -czf /var/backups/zemen-epos/app-data-$(date +%F-%H%M%S).tar.gz -C /opt/zemen-epos uploads legal-documents exports
```

Use encrypted off-server backup storage and define retention. A backup is not complete until restoration has been tested on an isolated environment.

## 18. Configure automatic CI/CD updates

The repository now includes:

- `.github/workflows/deploy-production.yml`: tests every production revision and opens the SSH deployment connection.
- `scripts/deploy.sh`: runs on the VPS, takes a pre-deployment PostgreSQL dump, fast-forwards Git, builds the images, applies migrations through the API entrypoint, starts services, and checks health.

No `.env`, database password, MoR credential, or INSA private key is sent through GitHub Actions. Those remain only on the VPS. GitHub stores only a restricted SSH key used to run the deployment script.

### 18.1 Create a dedicated CI deployment key

On your trusted local computer—not on a shared computer—create a separate key:

```powershell
ssh-keygen -t ed25519 -C "github-actions-zemen-production" -f .\zemen_ci_vps
```

This produces:

```text
zemen_ci_vps       private key — goes into a protected GitHub secret
zemen_ci_vps.pub   public key — goes into the VPS user's authorized_keys
```

Copy only the public key to the VPS:

```powershell
Get-Content .\zemen_ci_vps.pub | ssh your_vps_user@YOUR_VPS_IP "umask 077; mkdir -p ~/.ssh; cat >> ~/.ssh/authorized_keys"
```

Test the private key:

```powershell
ssh -i .\zemen_ci_vps your_vps_user@YOUR_VPS_IP "cd /opt/zemen-epos && git log -1 --oneline"
```

The deployment user requires Docker access and write access to `/opt/zemen-epos`, but it should not be root and should not have unrestricted passwordless sudo.

### 18.2 Capture the authentic VPS SSH host key

On the VPS, display its Ed25519 public host key:

```bash
sudo cat /etc/ssh/ssh_host_ed25519_key.pub
```

Create the known-hosts line by placing the VPS hostname or IP before that output:

```text
YOUR_VPS_IP ssh-ed25519 AAAAC3...rest-of-the-key
```

If `VPS_HOST` will be `pos.example.com`, use that exact hostname at the beginning instead. Obtain this value from the VPS itself or a separately verified channel; do not blindly trust the result of an unverified network scan.

### 18.3 Add GitHub production secrets

Open the GitHub repository and go to:

```text
Settings -> Environments -> New environment -> production
```

Optionally require approval before a production job can run. Add these environment secrets:

| Secret | Value |
|---|---|
| `VPS_HOST` | VPS IP or deployment hostname, without `https://` |
| `VPS_USER` | Non-root Linux deployment username |
| `VPS_SSH_KEY` | Entire contents of the private `zemen_ci_vps` key |
| `VPS_HOST_KEY` | Complete verified known-hosts line from the preceding step |

Do not add the key passphrase unless you deliberately adapt the non-interactive workflow to use an SSH agent. A dedicated key with no passphrase is acceptable only when it is restricted to this deployment purpose and protected as an environment secret.

### 18.4 Protect `main`

In GitHub branch protection/rulesets for `main`:

- Require a pull request before merging.
- Require the build check to pass.
- Prevent force pushes and deletion.
- Require approval for production environment deployment if another trusted operator is available.

### 18.5 First CI/CD test

The VPS must already have completed one manual deployment, because the workflow invokes the deployment script from the existing clone.

You can manually test the server-side script first:

```bash
cd /opt/zemen-epos
bash scripts/deploy.sh
```

If already current, it exits successfully with `already current`.

Then open GitHub:

```text
Actions -> Deploy production VPS -> Run workflow
```

Watch both the build and deploy steps. On the VPS, verify:

```bash
cd /opt/zemen-epos
git log -1 --oneline
docker compose ps
ls -lh backups | tail
curl -fsS https://pos.example.com/api/healthz
```

### 18.6 Normal local-to-VPS update workflow

Work locally on a feature branch:

```powershell
git switch -c feature/short-description
# edit and test the code
git add .
git commit -m "Implement short description"
git push -u origin feature/short-description
```

Create a pull request to `main`, review it, wait for checks, and merge it. The production workflow triggers only after the commit reaches `main`.

If deployment health fails, the workflow stops and prints API/web status and logs. It does not automatically reverse database migrations because automatic database rollback can destroy data. Use the pre-deployment dump and the rollback plan only after understanding the failed migration.

## 19. Deploy an application update manually

First inspect what will change:

```bash
cd /opt/zemen-epos
git status
git fetch --prune
git log --oneline HEAD..origin/main
```

Do not pull over uncommitted production changes. Environment files and persistent data should remain ignored.

Deploy the reviewed revision:

```bash
git pull --ff-only origin main
docker compose build --pull api web
docker compose up -d api web
docker compose ps
docker compose logs --tail=150 api web
curl -fsS https://pos.example.com/api/healthz
```

`docker compose up -d api web` recreates only changed services and preserves bind-mounted data and named volumes. Never use `docker compose down -v` in production; `-v` deletes named volumes, including Redis data.

Record the deployed commit:

```bash
git rev-parse HEAD
```

### Rollback planning

Application rollback and database rollback are different. Prisma migrations are applied automatically and may not be backward-compatible. Before every release:

- Review migration files.
- Take/verify a database restore point.
- Know whether the previous image can run on the new schema.
- Prefer a corrective forward migration over improvising a destructive database rollback.
- Keep the previous Git commit or release tag documented.

## 20. Routine operations

Useful commands:

```bash
cd /opt/zemen-epos
docker compose ps
docker compose logs -f --tail=100 api
docker compose logs -f --tail=100 web
docker compose logs --since=30m vault vault-init
docker compose restart api
docker stats
df -h
sudo journalctl -u nginx --since "30 minutes ago"
sudo nginx -t
```

Inspect recent container failures:

```bash
docker compose ps -a
docker inspect --format '{{.Name}} restart={{.RestartCount}} status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{end}}' $(docker compose ps -q)
```

Do not print environment variables or Vault secret files while troubleshooting.

## 21. Troubleshooting

### `POSTGRES_USER`, `POSTGRES_PASSWORD`, or `POSTGRES_DB` must be set

One of the required private VPS PostgreSQL settings is missing from `/opt/zemen-epos/.env`.

```bash
cd /opt/zemen-epos
grep -E '^POSTGRES_(USER|PASSWORD|DB)=' .env | sed 's/=.*/=[REDACTED]/'
docker compose config --quiet
```

### API is unhealthy after deployment

```bash
docker compose logs --tail=200 api
docker compose ps
```

Common causes are failed Prisma migration, PostgreSQL not healthy, mismatched database values after the volume was initialized, Redis/Vault not healthy, or unreadable signing files.

### `Vault auth/approle/login failed (400): invalid role or secret ID`

Check initialization logs and file presence:

```bash
docker compose logs --tail=200 vault vault-init
test -s vault/approle/role-id && echo OK
test -s vault/approle/secret-id && echo OK
```

The current bootstrap validates saved AppRole credentials and rotates stale ones. Restart the initialization flow safely:

```bash
docker compose up -d vault
docker compose up --force-recreate vault-init
docker compose restart api
```

Do not delete Vault data or `init.json` casually. If Vault state was independently replaced or lost, stop and follow a deliberate secret-recovery procedure.

### `vault-permissions` exits with code 2

```bash
docker compose logs vault-permissions
ls -ld vault/data vault/audit vault/approle
file vault/permissions/entrypoint.sh
```

On Linux, confirm the directories are writable by root and the script has Unix LF line endings. The service runs an Alpine shell and applies UID/GID ownership for the Vault image. Avoid `777` permissions.

### Browser shows 502 Bad Gateway

Check both proxy layers:

```bash
curl -I http://127.0.0.1:4999
docker compose ps web api
docker compose logs --tail=100 web api
sudo tail -n 100 /var/log/nginx/error.log
```

### Login works locally but fails on the domain

Confirm:

```dotenv
APP_PUBLIC_URL=https://pos.example.com
CORS_ORIGINS=https://pos.example.com
COOKIE_PATH=/api/auth
TRUSTED_PROXY_HOPS=2
```

Recreate the API after environment changes:

```bash
docker compose up -d --force-recreate api
```

Clear stale site cookies and test again. Do not weaken cookie security to work around an incorrect proxy/domain configuration.

### MoR returns seller detail mismatch

Compare branch/enterprise values with MoR's registered record, especially phone and email formatting. The application must send the exact registered legal identity; changing validation or suppressing the error is not a legitimate fix.

### MoR requests time out

Check DNS and outbound connectivity without exposing credentials:

```bash
getent hosts THE_OFFICIAL_MOR_HOST
curl -Iv --connect-timeout 10 https://THE_OFFICIAL_MOR_HOST/
```

Then verify MoR IP allow-listing, TLS requirements, VPS clock, certificate validity, and whether the test or production gateway is being used.

## 22. Security checklist before launch

- [ ] SSH root login and password authentication are disabled after key login is tested.
- [ ] UFW exposes only SSH, HTTP, and HTTPS.
- [ ] Docker, Ubuntu, Nginx, and dependencies receive scheduled security updates.
- [ ] Root and API environment files have mode `600` and are not tracked by Git.
- [ ] PostgreSQL has no public host port, and off-server backups/restores are tested.
- [ ] Demo users are disabled and the initial administrator password is changed.
- [ ] JWT, public-link, monitoring, database, and email secrets are all unique.
- [ ] Turnstile uses production keys.
- [ ] SMTP/notification providers use restricted application credentials.
- [ ] Vault, Redis, API, Grafana, and Prometheus are not public.
- [ ] Vault state, AppRole credentials, and unseal material are backed up securely.
- [ ] INSA private keys are outside Git, mounted read-only, and access-restricted.
- [ ] MoR seller identity matches the registered enterprise exactly.
- [ ] MoR test and production environments are clearly separated.
- [ ] Invoice payload logging is disabled in production.
- [ ] Tenant and RBAC isolation tests have passed.
- [ ] Audit logging and log retention have been verified.
- [ ] File upload size/type validation and persistent storage have been tested.
- [ ] Monitoring alerts and disk-capacity alerts are configured.
- [ ] A documented recovery and incident-response procedure exists.

## 23. Minimal command sequence summary

This is only a reminder after completing the detailed preparation above:

```bash
ssh your_vps_user@YOUR_VPS_IP
cd /opt/zemen-epos
docker compose config --quiet
docker compose build --pull api web
docker compose up -d postgres redis vault vault-init backup
docker compose logs --tail=100 vault-permissions vault vault-init
docker compose up -d api web
docker compose ps
curl -fsS http://127.0.0.1:4999/healthz
curl -fsS https://pos.example.com/api/healthz
```

Do not use the short sequence until DNS, secrets, PostgreSQL, Nginx, HTTPS, Vault persistence, file permissions, backups, and production acceptance checks have been completed.
