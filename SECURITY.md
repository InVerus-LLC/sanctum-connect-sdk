# Security reports

The SDKs are alpha software. Package verification does not establish hosted-service
readiness, protocol certification or an external security audit.

Report potential vulnerabilities privately to **bobir@inverus.tech**. Include the
package/version, affected API, a minimal synthetic reproduction and expected impact.
Do not send passwords, access tokens, private keys or customer data. Avoid public
issue reports containing an exploit or sensitive configuration until coordinated
with the maintainer. No response-time guarantee is currently offered.

For ordinary bugs, use the repository's GitHub Issues.

## Integration responsibilities

Keep confidential-client credentials on the server. Register exact redirect URLs,
retain sign-in transactions only for the corresponding session/tab, and never log
tokens or pairing capabilities. Do not use email matches as account-linking authority.
Sign-in alone grants no application-resource, wallet-signing or payment permission.
Use only issuer URLs and receipt verification keys obtained from trusted configuration.

Published provenance identifies the source and build workflow; it is not a security
audit. Verify the version and provenance before adopting an alpha release.
