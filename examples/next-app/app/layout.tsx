/**
 * Root layout (a server component). <SanctumProvider> is a client component from the SDK; it sits
 * here so the in-memory session survives client navigation from /callback to /. Configuration comes
 * from NEXT_PUBLIC_ environment variables (README.md); nothing secret is needed: this is a public
 * client with PKCE.
 */
import type { ReactNode } from "react";
import { SanctumProvider } from "@inverus/connect-react";
import "@inverus/connect-react/styles.css";

export const metadata = { title: "Sanctum Connect: Next.js example" };

const issuer = process.env.NEXT_PUBLIC_SANCTUM_ISSUER ?? "http://localhost:4400";
const clientId = process.env.NEXT_PUBLIC_SANCTUM_CLIENT_ID ?? "REPLACE_WITH_YOUR_CLIENT_ID";
const redirectUri = process.env.NEXT_PUBLIC_SANCTUM_REDIRECT_URI ?? "http://127.0.0.1:5175/callback";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SanctumProvider issuer={issuer} clientId={clientId} redirectUri={redirectUri} allowInsecureLoopback>
          {children}
        </SanctumProvider>
      </body>
    </html>
  );
}
