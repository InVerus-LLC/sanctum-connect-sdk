# Alpha release verification

Both `@inverus/connect@0.1.0-alpha.0` and
`@inverus/connect-react@0.1.0-alpha.0` were published on 23 November 2026.

- [GitHub prerelease and artifacts](https://github.com/InVerus-LLC/sanctum-connect-sdk/releases/tag/v0.1.0-alpha.0)
- [TypeScript package](https://www.npmjs.com/package/@inverus/connect/v/0.1.0-alpha.0)
- [React package](https://www.npmjs.com/package/@inverus/connect-react/v/0.1.0-alpha.0)

## Source and build

Published source: `be84097f6dfdad41f9fe4c14bb9928de711875f8`.
The tag `v0.1.0-alpha.0` names that source. Subsequent documentation and release
maintenance commits do not change the published artifact bytes.

[Manual rehearsal](https://github.com/InVerus-LLC/sanctum-connect-sdk/actions/runs/45223900103)
and [manual publication](https://github.com/InVerus-LLC/sanctum-connect-sdk/actions/runs/45224279267)
completed successfully. Both provenance statements identify the reviewed source,
this public repository and `.github/workflows/release.yml` on `dev`.
There are no automatic push, pull-request or scheduled workflows.

## Checks performed

- 56 SDK unit tests, strict typechecks, tarball contents, exports and bundle budgets.
- Isolated packed consumers on Node 22.15.1 and 26.13.1, on macOS and Linux.
- React SSR, browser bundles and a Next.js 16.4.6 production build.
- The React README quick start type-checked against the packed public SDK.
- Fresh registry installation of both exact alpha versions, strict browser/Node
  declarations, ESM/SSR on Node 22/26 and browser example bundles.
- `npm audit signatures`: 16 package signatures and 10 attestations verified in
  the registry consumer, including the SDK provenance.
- Local, Linux-runner and registry tarballs compared byte for byte.

The GitHub release includes tarballs, `SHA256SUMS`, the build SBOM and a
machine-readable verification record. These checks do not establish hosted
provider, physical-device, native mobile or production service acceptance.

## Distribution tags

`next` points to `0.1.0-alpha.0` for both packages. During first-package processing,
npm also assigned `latest` to the alpha. The
[manual tag repair](https://github.com/InVerus-LLC/sanctum-connect-sdk/actions/runs/45226128467)
was rejected with HTTP 403; removing that alias requires the package owner's
interactive authentication. The packages and their verified bytes remain available.
Use `@next` or an exact alpha version while this cleanup is pending.

The repair source at `be4ed30a8b9c1809c2deaa18c60d9451ae25c485` passed
`npm run check` (60 tests, including four tests of the actual workflow script).
A separate internal reviewer checked its scope and permissions; there were no
blocking findings after adding final-state checks and documenting npm's lack of
atomic tag removal. This was not an external security audit.
