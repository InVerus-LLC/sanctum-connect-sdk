# Changelog

Changes to `@sanctum.ai/connect-react`. Versions move together with `@sanctum.ai/connect`.
Alpha APIs may change; review these notes before upgrading.

## 0.1.0-alpha.0 — Sanctum namespace (24 November 2026)

- Prevented late callbacks and refreshes from restoring sessions after sign-out, reconfiguration or unmount.
- Isolated callback exchanges by client, store, URL and provider lifetime; removed settled token caching.
- Coalesced simultaneous refreshes to avoid reusing rotating refresh tokens.
- Clarified browser-only quick start and Next.js provider placement.
- Expanded React and Next.js example setup, configuration and troubleshooting.
- Migrated package identity and examples to `@sanctum.ai`; GitHub remains under InVerus-LLC.
- Enforced ESLint, Prettier and the 299-line source limit.
- Simplified documentation and support links.

## Earlier @inverus release — 0.1.0-alpha.0 (23 November 2026)

First public alpha, published under `@inverus` with npm provenance.

### Sign-in and sessions

- React 19 provider, sign-in button, drawer, callback component and headless hooks.
- Tab-scoped PKCE transactions and one callback exchange under StrictMode.
- In-memory token handling, refresh, revocation and optional issuer logout.
- Typed events and errors without tokens in event payloads.

### Wallet controls

- Wallet picker with EIP-6963 discovery, search and chain filtering.
- QR pairing, approved signature requests, cancellation and disconnect controls.
- Session resume with an explicitly supplied store and session-end notifications.
- Theme tokens and the Sanctum brand component.

### Packaging

- ESM JavaScript with client directives, TypeScript declarations and source maps.
- Public entry points `.` and `./styles.css`; React 19 is a peer dependency.
- Packed React SSR and Next.js App Router consumer verification.
- MIT SDK code with separate brand terms and dependency notices.

[Release](https://github.com/InVerus-LLC/sanctum-connect-sdk/releases/tag/v0.1.0-alpha.0) ·
[Release process](https://github.com/InVerus-LLC/sanctum-connect-sdk/blob/dev/packages/connect/release/RELEASING.md)
