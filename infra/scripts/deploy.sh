#!/usr/bin/env bash
#
# Deploy de produção — roda NO SERVIDOR (VGStack / vg-deploy, modelo release empacotada).
#
#   /opt/tenace/deploy.sh <release-dir>
#
# A release é um `git archive` do commit, extraída em releases/<sha> pelo
# deploy-from-workstation.sh. Ordem: trava → build → backup → migrate → up → saúde.
# Falhou antes do "up": o sistema anterior continua no ar.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/tenace}"
RELEASE="${1:?uso: deploy.sh <diretório da release>}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-180}"

step() { printf '\n=== %s — %s\n' "$(date -u '+%H:%M:%S')" "$*"; }
fail() { printf '\nERRO: %s\n' "$*" >&2; exit 1; }

exec 9>"$APP_DIR/.deploy.lock"
flock -n 9 || fail "já existe um deploy em andamento"

[[ -d "$RELEASE" ]] || fail "release não encontrada: $RELEASE"
[[ -f "$APP_DIR/.env" ]] || fail ".env não encontrado em $APP_DIR (rode setup-server-env.sh)"
SHA="$(cat "$RELEASE/REVISION" 2>/dev/null || basename "$RELEASE")"
export BUILD_SHA="$SHA" IMAGE_TAG="${SHA:0:12}"

COMPOSE=(docker compose -p tenace -f "$RELEASE/infra/compose/compose.prod.yaml" --env-file "$APP_DIR/.env")

step "Validando configuração"
set -a; source "$APP_DIR/.env"; set +a
grep -q "__generated__\|change-me" "$APP_DIR/.env" && fail ".env ainda tem placeholder"
[[ "${APP_WEB_URL:-}" == https://* ]] || fail "APP_WEB_URL precisa ser https"
"${COMPOSE[@]}" config -q

step "Build das imagens ($IMAGE_TAG)"
"${COMPOSE[@]}" build api web

step "Banco e Redis"
"${COMPOSE[@]}" up -d postgres redis
for _ in $(seq 1 30); do "${COMPOSE[@]}" exec -T postgres pg_isready -U "$POSTGRES_USER" >/dev/null 2>&1 && break; sleep 2; done

step "Backup antes da migration"
mkdir -p "$APP_DIR/backups"
BACKUP="$APP_DIR/backups/pre-deploy-$(date -u +%Y%m%dT%H%M%SZ)-${IMAGE_TAG}.sql.gz"
"${COMPOSE[@]}" exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip > "$BACKUP" || fail "backup falhou — deploy abortado antes do banco"
chmod 600 "$BACKUP"
echo "    $BACKUP ($(du -h "$BACKUP" | cut -f1))"
ls -1t "$APP_DIR"/backups/pre-deploy-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -f

step "Migrations + seed idempotente"
"${COMPOSE[@]}" --profile tools run --rm migrate || fail "migration falhou — versão anterior continua no ar; backup em $BACKUP"

step "Subindo api e web (recriar, nunca restart)"
"${COMPOSE[@]}" up -d --remove-orphans api web

step "Saúde"
deadline=$(( $(date +%s) + HEALTH_TIMEOUT ))
until curl -fsS "http://127.0.0.1:${WEB_PORT:-3310}/api/ready" >/dev/null 2>&1 && curl -fsS -o /dev/null "http://127.0.0.1:${WEB_PORT:-3310}/entrar"; do
  (( $(date +%s) > deadline )) && { "${COMPOSE[@]}" logs --tail 60 api web; fail "não ficou saudável em ${HEALTH_TIMEOUT}s"; }
  sleep 3
done
running="$(curl -fsS "http://127.0.0.1:${WEB_PORT:-3310}/api/health")"
[[ "$running" == *"$SHA"* ]] || fail "a API no ar não é deste commit: $running"

ln -sfn "$RELEASE" "$APP_DIR/current"
# Mantém as 5 releases mais novas (nunca a atual).
ls -1dt "$APP_DIR"/releases/*/ 2>/dev/null | tail -n +6 | while read -r d; do [[ "$(readlink -f "$APP_DIR/current")/" == "$(readlink -f "$d")/" ]] || rm -rf "$d"; done

step "OK — $SHA no ar"
