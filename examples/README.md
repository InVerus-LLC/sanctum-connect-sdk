# Sanctum Connect examples

Choose the example closest to your application. Each guide includes setup,
configuration, commands and a walkthrough using your own Sanctum Connect issuer.

| Example | Client type | Local address | Start here |
| --- | --- | --- | --- |
| Browser TypeScript | Public, PKCE | `http://127.0.0.1:5173/` | [Guide](browser-ts/README.md) |
| React 19 | Public, PKCE | `http://127.0.0.1:5174/` | [Guide](react-app/README.md) |
| Next.js App Router | Public, PKCE | `http://127.0.0.1:5175/` | [Guide](next-app/README.md) |
| Node.js server | Confidential | `http://127.0.0.1:4430/` | [Guide](node-server/README.md) |
| Agent runtime | Public-key authentication | Terminal | [Guide](agent-claim/README.md) |

## Before running an example

Install Node.js 26.13.1 and run `npm ci --ignore-scripts` from the repository root.
The browser examples import the workspace SDK source; the
[isolated consumer check](../CONTRIBUTING.md#local-setup) tests built npm tarballs.

Obtain access to a compatible issuer separately. The examples use
`http://localhost:4400` for local development; change that to your issuer's origin
when necessary. The public product page is not an issuer endpoint.

Register callback and post-logout URLs exactly as shown in the selected guide.
`localhost` and `127.0.0.1` are different origins: do not switch between them
mid-flow. Browser clients never receive a client secret. Keep server credentials
in a local ignored environment file or your secret manager.

## What to expect

Sign-in redirects to the issuer and returns to the registered callback. Browser
sessions live in memory; a reload signs the client out. The Node example also uses
an in-memory store and is intended for local learning, not production deployment.

Wallet pairing and agent registration require their own issuer configuration.
Claiming an agent grants no resource access until its owner creates a delegation.
None of these examples executes a real payment.

## Using the published SDKs

In your own application, install `@inverus/connect@next` and, for React,
`@inverus/connect-react@next`. The [TypeScript](../packages/connect/README.md) and
[React](../packages/connect-react/README.md) guides describe the public APIs.
