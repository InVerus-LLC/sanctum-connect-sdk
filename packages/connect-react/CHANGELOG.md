# Changelog: @inverus/connect-react

Versions follow [Semantic Versioning](https://semver.org/) and move together with `@inverus/connect`; while the major
version is 0 a minor release may break the API. See
[packages/connect/release/RELEASING.md](../connect/release/RELEASING.md).

## 0.1.0-alpha.0 — release candidate

### Packaging

- Public packages are `@inverus/connect` and `@inverus/connect-react`. Emitted JavaScript, declarations and sibling dependencies use public names; workspace identities remain unchanged. Original sources remain embedded in source maps.

### Licensing

- Owner selected MIT for SDK code on 23 November 2026. Both license files and package metadata now record MIT. Publication remains locked until final reviewed publication under the owner-selected `@inverus` scope; third-party notices and brand-asset terms are unchanged.

### Added

- `useWalletSession` returns to idle with a message when the connected session ends on Sanctum's side (the person
  disconnected, the app was withdrawn, it expired), noticed by the provider's polling; new reducer actions `resumed`
  and `ended`. With the new `store` (and `storeKey`) options a connection is resumed on mount and survives a reload;
  unmounting then only stops listening. Without a store, unmounting still ends the session.
- A message for the new wallet-session code 4902.

## 0.1.0-alpha.0 (prepared 17 November 2026; not published)

First packaged pre-release. Nothing has been published to a registry.

### Added

- Built package: ESM JavaScript with `"use client"` kept on the client modules, `.d.ts` declarations, source maps
  (sources embedded) and `styles.css`; exports `.` and `./styles.css` only; `sideEffects: ["*.css"]`; depends on
  `@inverus/connect` 0.1.0-alpha.0; React ≥ 19 as a peer.
- Typed events: `SanctumEvent` (`ready`, `sign_in_started`, `signed_in`, `refreshed`, `signed_out`, `error` with
  `during`), the `onEvent` prop of `<SanctumProvider>` and `subscribe` in `useSanctum()`; each outcome once under
  StrictMode; no tokens in events. `createEventHub` for tests and custom providers.
- Headless exports `useSignInKit` and `useInjectedWallets` (the drawer's data hooks).
- `describeError` sentences for every typed wallet error code and for `aborted`.
- Re-exports `PROVIDER_ERRORS`, `ProviderRpcErrorCode` and `SanctumConnectErrorCode`.
- LICENSE (MIT) and THIRD_PARTY_NOTICES.md (brand mark provenance, the independent drawer).

### Breaking (against the unpublished workspace 0.0.0)

- `SanctumContextValue` has the new member `subscribe`; code that builds its own context value needs it.

### Known gaps

- No manual screen-reader or zoom pass recorded; Chrome only in automated runs.
- MIT selected; publication remains locked until the reviewed public release.
