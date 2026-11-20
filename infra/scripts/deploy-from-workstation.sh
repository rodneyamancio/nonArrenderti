#!/usr/bin/env bash
# Deploy a partir da estação: empacota o commit atual (git archive), envia e roda o deploy.sh no servidor.
#   DEPLOY_SERVER=root@168.231.88.232 ./infra/scripts/deploy-from-workstation.sh
set -euo pipefail
SERVER="${DEPLOY_SERVER:-root@168.231.88.232}"
APP_DIR="${APP_DIR:-/opt/tenace}"
SITE_URL="${DEPLOY_SITE_URL:-https://tenace.amancio.family}"
cd "$(git rev-parse --show-toplevel)"

[[ -z "$(git status --porcelain)" ]] || { echo "ERRO: árvore com alterações não commitadas — a release precisa ser um commit." >&2; exit 1; }
SHA="$(git rev-parse HEAD)"
echo "=== Verificação local (typecheck + testes) — $SHA"
pnpm --filter @tenace/types --filter @tenace/rules build >/dev/null
(cd apps/api && npx tsc --noEmit -p tsconfig.json)
(cd apps/web && npx tsc --noEmit)
pnpm --filter @tenace/rules --filter @tenace/api test >/dev/null

echo "=== Enviando release"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
git archive --format=tar.gz -o "$TMP/release.tgz" HEAD
REL="$APP_DIR/releases/$SHA"
ssh "$SERVER" "mkdir -p '$REL' && rm -rf '$REL'/*"
scp -q "$TMP/release.tgz" "$SERVER:$REL/../$SHA.tgz"
ssh "$SERVER" "tar -xzf '$REL/../$SHA.tgz' -C '$REL' && rm '$REL/../$SHA.tgz' && echo '$SHA' > '$REL/REVISION' && install -m 755 '$REL/infra/scripts/deploy.sh' '$APP_DIR/deploy.sh'"

echo "=== Deploy no servidor"
ssh "$SERVER" "'$APP_DIR/deploy.sh' '$REL'"

echo "=== Verificação pública"
for path in /entrar /api/health; do
  code="$(curl -s -o /dev/null -w '%{http_code}' "$SITE_URL$path" || true)"
  echo "    $SITE_URL$path → $code"
done
