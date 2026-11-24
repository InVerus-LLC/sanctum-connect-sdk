# Manual SDK releases

The owner authorized public MIT SDK source in
`InVerus-LLC/sanctum-connect-sdk` and alpha publication under `@sanctum.ai`. The earlier `@inverus` release
remains immutable; this is a new package identity, not an npm rename.
No push, PR, tag or schedule triggers a workflow. The only trigger is
`workflow_dispatch`, and the workflow only accepts the `dev` branch in this repo.
This SDK policy does not promote the private service or deploy infrastructure.

## Candidate

Both `sanctumPublish.version` fields are `0.1.0-alpha.0`. Workspace manifests are
private source packages; only built manifests are publishable. The generated
repository URL matches this public repository, with package directories.
Keep generated packages on the `next` tag. Never move an alpha to `latest`.

## Verify and review

1. Install the pinned Node 26.13.1 toolchain and run `npm ci --ignore-scripts`.
2. Run `npm run check`. Lint, formatting, physical line limits, strict typechecks, unit tests and packed package checks
   must pass. No skipped or weakened security assertions.
3. Run `npm run consumer -- <new outside-directory> --deps-from-workspace --next
--node <Node-22.15.1-executable>`. It installs packed SDKs outside the checkout,
   checks declarations, browser bundles, ESM/SSR and Next.js prerendering.
4. Independently review source, license notices, export boundaries and workflow.
   Record the exact reviewed commit SHA before dispatch.
5. Manually run the workflow with that full SHA and `publish=false` to verify
   the runner and inspect the uploaded tarballs, checksums and build SBOM.
6. Set up npm release authentication, then explicitly dispatch the same reviewed
   revision with `publish=true`. The workflow publishes those checked tarballs
   with `--provenance --access public --tag next`.

## npm authentication and first publication

The workflow requires GitHub OIDC provenance. A local login alone does not make
local publication eligible. Do not disable provenance to bypass this gate.

Prefer npm trusted publishing bound to this exact public repository and
`release.yml`. npm currently configures trusted publishers through package
settings, so a new package may require a bootstrap credential. If needed, the
owner supplies a short-lived, narrowly scoped npm publish credential through
GitHub's encrypted `NPM_BOOTSTRAP_TOKEN` repository secret. Never put its value in
source, command history, chat or reports. Remove it after successful bootstrap
and configure trusted publishing for each package. New trusted-publisher
configurations must be exercised before npm's documented expiry.

npm account signup, email verification and CLI authorization are separate from
publish access and publishing 2FA. A bootstrap token must grant package write
access and satisfy npm publishing 2FA requirements. Complete credential entry
on npm and GitHub themselves; never paste a token into chat or documentation.

Do not use npm staged publishing merely to get around first-publish setup: it
creates a publicly visible placeholder version for a new package. That would be
a separate release path, not evidence of the requested provenance alpha release.

## Post-publication

Check both exact versions, `next` tags, registry integrity and provenance against
the reviewed public commit and uploaded artifacts. Install exact registry versions
in a fresh consumer; verify declarations, ESM/SSR and browser imports plus registry
signatures. Record publication and consumer results separately from local tests.

npm may report an accepted upload before publish-time scanning makes it downloadable.
Wait for the exact registry version; do not republish to work around a transient 404.
Check distribution tags after processing: the first alpha publication was assigned
both `next` and `latest` by the registry despite `--tag next`. After enabling account
2FA and completing interactive authentication, removal of `latest` was rejected
with HTTP 400. Do not retry the old deletion flow or claim the alias is gone.
The manual `alpha-tags.yml` workflow now verifies both packages without credentials
or registry writes. It accepts the initial alias while explicitly reporting alpha
status; it rejects tags that identify unexpected versions. See
[npm CLI issue #8490](https://github.com/npm/cli/issues/8490) and
[npm's publish-time scanning notice](https://github.blog/changelog/2026-07-28-npm-publish-time-malware-scanning-and-dual-use-metadata/).

If one package publishes and the other fails, inspect the registry before retrying.
Do not overwrite or delete a published version. Do not claim that both succeeded.
A corrective release needs a new coordinated version if the artifact changes.

Official references (reviewed 23 November 2026):
[npm provenance](https://docs.npmjs.com/generating-provenance-statements/),
[trusted publishing](https://docs.npmjs.com/trusted-publishers/),
[staged publishing](https://docs.npmjs.com/staged-publishing/).
