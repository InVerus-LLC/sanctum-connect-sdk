# Sanctum Connect SDKs

MIT TypeScript and React SDK source for Sanctum Connect.

- [`@inverus/connect`](packages/connect/README.md): OIDC/PKCE sign-in, wallet sessions,
  scoped agent tokens, workload federation and signed receipt verification.
- [`@inverus/connect-react`](packages/connect-react/README.md): React 19 bindings,
  sign-in controls and wallet picker.

Version `0.1.0-alpha.0` is an alpha release candidate, not a production-readiness
claim. Consult npm for publication status. Configure an issuer and registered
client you operate or have been granted access to; this repository does not
provision a hosted identity service. Native mobile and Reown transport are absent.
Wallet connection never grants payment authority.

## Develop

Use Node 26.13.1 and the committed npm lockfile:

```sh
npm ci --ignore-scripts
npm run check
npm run build
npm run consumer -- /tmp/a-new-sdk-consumer --deps-from-workspace --next
```

The consumer directory must not already exist. Checks cover strict declarations,
SDK unit behavior, packed artifacts, dependency boundaries and bundle budgets.
Consumer checks install tarballs outside this checkout, run ESM/SSR checks and
build browser and Next.js examples. These checks do not establish real-provider,
physical-device, accessibility or hosted backend acceptance.

Examples: [browser](examples/browser-ts), [React](examples/react-app),
[Next.js](examples/next-app), [server](examples/node-server),
[agent](examples/agent-claim).

## Release and licensing

Only the manually dispatched [release workflow](.github/workflows/release.yml)
can perform the prepared provenance release. Pushes and pull requests trigger
no workflows. See [release instructions](packages/connect/release/RELEASING.md).
Both SDKs share a version and use the `next` tag while in alpha.

The [MIT license](LICENSE) covers SDK code. Third-party notices and separate
brand terms apply; no trademark ownership is granted.

This repository was exported using an explicit SDK-only file selection.
`SOURCE_EXPORT.json` records source and initial export hashes; later reviewed
release edits are tracked in Git. Private backend, migrations, infrastructure,
production data and application UI are not included.
