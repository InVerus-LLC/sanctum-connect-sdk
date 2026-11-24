"use client";
/**
 * Sign-in (the drawer), the in-memory session with sign-out (tokens revoked, then Sanctum's own
 * session ended) and a Sanctum wallet session that signs "Hello Sanctum".
 */
import { useState } from "react";
import {
  describeError,
  SanctumWalletConnect,
  SignInDrawerButton,
  useSession,
  useWalletSession,
} from "@sanctum.ai/connect-react";

const HELLO = "0x48656c6c6f2053616e6374756d";

export function Account() {
  const { session, signOut } = useSession();
  const wallet = useWalletSession({ chains: ["eip155:84532"], methods: ["personal_sign"] });
  const [result, setResult] = useState<string | null>(null);
  const sign = async () => {
    try {
      await wallet.request({ method: "personal_sign", params: [HELLO, wallet.state.accounts[0]] });
      setResult("Signed.");
    } catch (error) {
      setResult(describeError(error));
    }
  };
  if (!session) return <SignInDrawerButton />;
  return (
    <section aria-labelledby="account-title">
      <h2 id="account-title">Account</h2>
      <p data-subject={session.subject}>Signed in.</p>
      <button
        type="button"
        className="sanctum-secondary-button"
        onClick={() => void signOut({ endSanctumSession: true, postLogoutRedirectUri: `${window.location.origin}/` })}
      >
        Sign out
      </button>
      <SanctumWalletConnect wallet={wallet} />
      {wallet.state.status === "connected" ? (
        <button type="button" className="sanctum-secondary-button" onClick={() => void sign()}>
          Sign “Hello Sanctum”
        </button>
      ) : null}
      {result ? <p role="status">{result}</p> : null}
    </section>
  );
}
