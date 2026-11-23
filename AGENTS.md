# SDK repository rules

This is the public SDK-only repository, not the private Sanctum Connect service
or Sanctum protocol. Never copy backend, migrations, infrastructure, application
UI, credentials or customer data into it.

- Preserve MIT licenses, third-party notices and separate brand terms.
- Use Node 26.13.1, npm workspaces and exact locked dependencies.
- Source, tests and handwritten configuration stay at or below 299 lines.
  Generated lockfiles are excluded from the authored-file limit.
- Separate SDK responsibilities; no duplicate identity or authorization authority.
- Sign-in, consent, delegation, wallet signing and spending stay separate.
- Add meaningful regression tests for behavior changes and independently review
  authentication, token, cryptographic and release-security changes.
- Run `npm run check` and isolated packed consumer verification before release.
  Record actual commands/results; local tests do not prove hosted acceptance.
- Use only dev, uat and prod branches. No automatic CI/CD or scheduled jobs.
  Workflows use `workflow_dispatch` only. Publishing requires explicit owner
  authorization, reviewed source and npm provenance; never silently omit it.
- No secrets in source, logs, screenshots or reports. Never copy `.npmrc`.
