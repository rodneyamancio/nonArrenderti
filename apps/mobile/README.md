# Tenace — app (iOS / Android)

Expo SDK 58 + expo-router, talking to the same API as the portal (`https://tenace.amancio.family/api`,
`Authorization: Bearer`). Same screens, labels, colors and rules as the web portal.

## Run

```bash
pnpm install                      # at the repo root
pnpm dev                          # api :3311 + web :3310 (the app uses the web's /api proxy)
pnpm --filter @tenace/mobile start
```

Open with **Expo Go** (iOS/Android, SDK 58) by scanning the QR, or press `i` for the iOS simulator.
In development the app finds the API on the machine running Metro (`http://<metro-host>:3310/api`).
Point it elsewhere with `EXPO_PUBLIC_PORTAL_URL` / `EXPO_PUBLIC_API_URL` (run with `--clear` after
changing them). Without them, a release build uses production.

## Check

```bash
pnpm --filter @tenace/mobile typecheck
pnpm --filter @tenace/mobile test         # session, goal rules, links, parity with the portal
pnpm --filter @tenace/mobile export:ios   # proves the bundle compiles
```

## Publish

EAS project `@valiant-group-do-brasil/tenace` (already linked in `app.json`).

```bash
npx eas-cli@latest build --platform ios --profile production --auto-submit      # TestFlight (first time: Apple login)
npx eas-cli@latest build --platform android --profile preview                   # installable APK
```

## OTA update (JavaScript-only changes)

```bash
npx eas-cli@latest update --channel production --environment production --message "o que mudou"
```

Always pass `--environment` (it brings `EXPO_PUBLIC_PORTAL_URL`; without it the bundle could
carry a local `.env`). Reaches only builds with the same app `version`; native changes need a
new version and a store build. The app downloads in the background and shows “Atualizar”.
