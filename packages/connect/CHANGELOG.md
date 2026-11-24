# Changelog

Changes to `@sanctum.ai/connect`. Both Sanctum SDK packages use coordinated versions.
Alpha APIs may change; review these notes before upgrading.

## 0.1.0-alpha.0 — Sanctum namespace (24 November 2026)

- Clarified installation, callback handling and cancellation documentation.
- Expanded browser, Node.js and agent example setup and troubleshooting.
- Migrated package identity and examples to `@sanctum.ai`; GitHub remains under InVerus-LLC.
- Enforced ESLint, Prettier and the 299-line source limit.
- Simplified public documentation and support links.

## Earlier @inverus release — 0.1.0-alpha.0 (23 November 2026)

First public alpha, published under `@inverus` with npm provenance.

### Authentication

- OpenID Connect authorization code flow with S256 PKCE, state and nonce.
- Issuer, audience and ID-token signature validation.
- UserInfo, refresh-token rotation, token revocation and logout URL helpers.
- Typed errors, injected fetch and AbortSignal support.

### Wallets

- EIP-6963 discovery, wallet search and separate QR encoding entry point.
- Sanctum-owned wallet sessions, session resume, event subscriptions and cancellation.
- EIP-1193 provider errors, pending requests and per-request signing approval.
- Readable-text and off-chain typed-data requests; transaction execution is not
  provided by the wallet-session API.

### Agents and receipts

- Agent registration and owner claim, signed client assertions and scoped tokens.
- DPoP helpers and narrowed token exchange.
- Workload token helper for existing trusts and delegations.
- Signed receipt export verification using caller-supplied trusted issuer keys.
- Payment proposal/status helpers for the separate payments resource; these do
  not establish a live payment service or authorize spending through sign-in.

### Packaging

- ESM JavaScript, TypeScript declarations and self-contained source maps.
- Entry points: `.`, `./wallets`, `./qr`, `./receipts` and `./workloads`.
- Node.js 22.15.1 minimum; verified packed consumers on Node 22 and 26.
- MIT SDK license with retained third-party notices.

[Release](https://github.com/InVerus-LLC/sanctum-connect-sdk/releases/tag/v0.1.0-alpha.0) ·
[Release process](https://github.com/InVerus-LLC/sanctum-connect-sdk/blob/dev/packages/connect/release/RELEASING.md)
