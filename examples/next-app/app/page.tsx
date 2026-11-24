/**
 * Home (a server component): the mark renders on the server; the account controls are a client
 * component. Server rendering touches no browser API: the controls are inert until the client
 * discovers the issuer.
 */
import { SanctumMark } from "@sanctum.ai/connect-react";
import { Account } from "./account";

export default function Home() {
  return (
    <main>
      <h1>
        <SanctumMark width={24} height={24} /> Next.js example
      </h1>
      <Account />
    </main>
  );
}
