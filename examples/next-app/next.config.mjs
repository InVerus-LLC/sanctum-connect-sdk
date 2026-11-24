/**
 * Next.js App Router example for @sanctum.ai/connect-react. Inside this repository the SDK packages
 * resolve to their TypeScript source, so Next transpiles them; with the published packages
 * (compiled ESM) the setting is harmless.
 * @type {import("next").NextConfig}
 */
const config = { reactStrictMode: true, transpilePackages: ["@sanctum.ai/connect", "@sanctum.ai/connect-react"] };
export default config;
