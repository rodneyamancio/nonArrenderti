# Tenace — mobile app (Expo)

Read the root `AGENTS.md` and `docs/spec.md` first; they win over this file. Skill: `vg-mobile`.

- Expo SDK 58 + expo-router (routes in `src/app`). Install native deps with `npx expo install`, never
  plain `pnpm add` (keeps SDK-compatible versions). Expo changes every SDK: check the versioned docs at
  `https://docs.expo.dev/versions/v58.0.0/` before using an Expo API from memory.
- The app is one more face of the API: no business rule or permission lives only here. Week math comes
  from `@tenace/rules`, contracts from `@tenace/types`, transport/errors from `@tenace/api-client`
  (Metro reads their `src` through the `react-native` field — no build step).
- Pure logic (no React Native imports) lives in `src/session/session.ts`, `src/lib/*`, `src/navigation/*`,
  `src/features/*/logic.ts` and is tested in Node: `pnpm --filter @tenace/mobile test`.
- Parity with the portal is enforced by `test/parity.test.mjs` (tokens, labels, formats, goal rules).
  Changed one side? Change the other in the same PR.
- Token only in SecureStore (keys with dots). Only a 401 signs out; no network keeps the session.
- No custom native module. Expo Go must keep working.
- Before done: `pnpm --filter @tenace/mobile typecheck && pnpm --filter @tenace/mobile test` and
  `npx expo export --platform ios` (proves the bundle closes).
