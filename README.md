<p align="center"><img src="docs/brand/tenace-mark.svg" width="72" alt="Tenace"></p>

# Tenace — *non arrenderti*

Metas semanais com um empurrãozinho do grupo. Crie um grupo, defina as metas (ex.: ler 10
páginas por dia, academia 3× por semana) e o valor de cada cota (ex.: R$ 5). A semana começa
no negativo; cada atividade cumprida paga uma cota. Cumpriu tudo, fecha no zero. O que faltar
vai para o caixa do grupo.

- Vários grupos por pessoa, com dono/admins que decidem quem entra
- Conta corrente por membro (extrato) e caixa do grupo (a receber, recebido, gasto)
- Registro com foto opcional, reações e contestação
- PIX copia-e-cola/QR gerado localmente para pagar as multas (o app só registra os valores)
- Web responsiva (PWA) e app iOS/Android (Expo) na mesma API — ver `apps/mobile/README.md`

Produção: https://tenace.amancio.family

## Desenvolvimento

```bash
pnpm install
pnpm setup          # .env com segredos aleatórios
pnpm infra:up       # postgres + redis (docker)
pnpm db:migrate
pnpm --filter @tenace/api build && pnpm db:seed   # admin + grupo de demonstração
pnpm dev            # api :3311 · web :3310
pnpm --filter @tenace/mobile start   # app no Expo Go / simulador
```

Logins de demonstração: `ana@demo.tenace`, `bruno@demo.tenace`, `carla@demo.tenace` — senha =
`SEED_ADMIN_PASSWORD` do `.env`.

```bash
pnpm typecheck
pnpm test           # regras, api-client, app (lógica + paridade) e API (integração)
```

## Deploy

```bash
DEPLOY_SERVER=root@168.231.88.232 ./infra/scripts/deploy-from-workstation.sh
```

Detalhes em `docs/spec.md` §14. Arquitetura, regras de dinheiro e permissões: `docs/spec.md`.
