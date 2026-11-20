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

## Publish (not done yet)

Needs the company Expo account: `npx eas-cli@latest init` (writes `extra.eas.projectId`), then
`eas build --profile preview --platform android` (APK) or `--profile production` for the stores.
Push notifications and OTA updates come after `eas init` (see `docs/spec.md` §8.9).
