# Contributing

This repository owns Sanctum Connect's public TypeScript and React SDKs.
Start with [AGENTS.md](AGENTS.md) and the relevant package README. The identity
service, private application UI and infrastructure are maintained separately.

## Local setup

Use Node 26.13.1 from `.nvmrc` and npm with the committed lockfile:

```sh
npm ci --ignore-scripts
npm run check
npm run consumer -- /tmp/sanctum-sdk-consumer-new --deps-from-workspace --next
```

Choose a fresh consumer directory. To check the minimum supported Node runtime,
append `--node /path/to/node-22.15.1` to the consumer command.
The consumer suite installs packed SDKs outside the checkout, verifies declarations
without `skipLibCheck`, renders React without browser globals and builds examples.
It does not start a hosted identity service.

## Code quality

TypeScript uses strict mode, checked indexed access and exact optional properties.
ESLint checks maintained TypeScript and examples, with typed promise checks for SDK
source. Prettier and EditorConfig define formatting; `npm run check:lines` enforces
299 physical lines for handwritten source and configuration. Generated npm lockfiles
and ignored build output are not handwritten source.

Run `npm run format` after editing, then `npm run check`. The combined check includes
lint (zero warnings), formatting, source length, typechecks, tests and packed-package
validation. Do not add suppressions or raise limits to hide failures. Keep domain
logic, public types, transport helpers and presentation responsibilities separate.

## Changes and review

- Keep features within existing public entry points and responsibility boundaries.
- Include a regression test for behavior changes and explain compatibility impact.
- Keep handwritten files at or below 299 physical lines; split by responsibility.
- Preserve cancellation, callback validation, explicit consent and token handling.
- Never add credentials, real customer data, private service files or premium UI blocks.
- Authentication, cryptographic and release-security changes need independent review.
- Include exact commands and outcomes in your change description; distinguish local
  tests from actual provider or device acceptance.

Submit changes for review against `dev`. Maintainers promote reviewed releases
through the permitted branches. Do not add automatic CI/CD; release workflows are
manual only. Do not publish packages or deploy infrastructure as part of a change
without the owner's explicit release instruction.

Contributions are covered by this repository's MIT license; preserve third-party
notices and the separate brand terms. Use GitHub Issues for reproducible bugs and
email bobir@inverus.tech privately for sensitive vulnerability reports.
