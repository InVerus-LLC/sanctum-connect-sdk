# SDK release-candidate verification

23 November 2026. Publication has not occurred. These results are local source
and packed-consumer evidence, not hosted identity-service acceptance.

- Independent review: a separate lifecycle/release reviewer inspected the
  allowlisted SDK export, public package mappings, source-map checks, retained
  licenses/brand terms and manual GitHub workflow. No blocking finding remained.
- `npm run check`: strict TypeScript, 54 unit tests and packed package checks
  passed. Both packages have deliberate exports and exact sibling dependencies.
- `npm run consumer -- <new external directory> --deps-from-workspace --next
  --node <Node-22.15.1>` passed: independent offline installation, declarations
  with library checking enabled, Node 22.15.1/26.13.1 ESM and SSR, browser bundles,
  and Next.js 16.4.6 App Router prerender of home and callback.
- Source/style/test/config line check: no handwritten file exceeded 299 lines.
  The npm lockfile and generated source hash inventory are exclusions.
- npm dependency install audit reported zero vulnerabilities at verification time.
  This is not a security audit or a guarantee of no vulnerabilities.

Initial standalone checks exposed missing test-only brand assets and external
TypeScript declaration resolution from the temporary package directory. The
canonical asset was included with brand terms; the builder now explicitly maps
its oauth4webapi declaration dependency while retaining strict library checking.
The full SDK consumer check subsequently passed.

Backend-dependent integration tests are not exported. Receipt tests reference
public receipt constants; no grant-service implementation was copied. SDK
runtime dependencies are jose, oauth4webapi and uqr; React is a peer dependency.

`SOURCE_EXPORT.json` fingerprints exported source and its original inputs. Git
identifies the reviewed release revision. The manual workflow requires that exact
SHA before validation or publication. Runner execution, npm authorization,
provenance attestation and post-publication registry consumers remain separate
release gates. No automatic workflow triggers are present.
