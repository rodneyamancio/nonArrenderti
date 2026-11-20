#!/usr/bin/env bash
# Creates /opt/tenace/.env with random secrets (vg-segredos). Never overwrites.
#   APP_DOMAIN=tenace.amancio.family ADMIN_EMAIL=... ./setup-server-env.sh
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/tenace}"
DOMAIN="${APP_DOMAIN:?defina APP_DOMAIN}"
ENV_FILE="$APP_DIR/.env"
if [[ -f "$ENV_FILE" ]]; then echo ".env já existe — nada alterado."; exit 0; fi
mkdir -p "$APP_DIR"
umask 077
rand() { openssl rand -base64 "$1" | tr -d '\n/+=' | cut -c1-"$2"; }
cat > "$ENV_FILE" <<EOF
WEB_PORT=${WEB_PORT:-3310}
POSTGRES_USER=tenace
POSTGRES_PASSWORD=$(rand 36 40)
POSTGRES_DB=tenace
APP_WEB_URL=https://$DOMAIN
ENCRYPTION_KEY=$(openssl rand -base64 32)
SMTP_URL=
MAIL_FROM="Tenace <nao-responda@$DOMAIN>"
SEED_ADMIN_EMAIL=${ADMIN_EMAIL:-admin@$DOMAIN}
SEED_ADMIN_PASSWORD=$(rand 24 18)Tn7
EOF
chmod 600 "$ENV_FILE"
echo "✓ $ENV_FILE criado (600). Senha inicial do admin: SEED_ADMIN_PASSWORD nesse arquivo."
