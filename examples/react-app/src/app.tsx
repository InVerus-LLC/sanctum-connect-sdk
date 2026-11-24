/**
 * A small independent app that embeds @sanctum.ai/connect-react (bundled with esbuild, no framework):
 * "Continue with Sanctum" opening the sign-in drawer (methods and wallet picker), the callback on /callback, the in-memory session with Sign
 * out, and a Sanctum wallet session that asks the person to sign "Hello Sanctum". Runs in
 * StrictMode, so effects run twice in development, as React apps commonly do. The SDK's typed
 * events (no tokens in them) are listed under "Events". Configuration comes from data attributes
 * on #root; README.md says how to run it against the local stack.
 */
import { StrictMode, useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  SanctumProvider,
  SanctumWalletConnect,
  SignInCallback,
  SignInDrawerButton,
  useSession,
  useWalletSession,
  type SanctumEvent,
} from "@sanctum.ai/connect-react";
import "@sanctum.ai/connect-react/styles.css";

const HELLO = "0x48656c6c6f2053616e6374756d"; // "Hello Sanctum"

function Wallet() {
  const wallet = useWalletSession({ chains: ["eip155:84532"], methods: ["personal_sign"], pollMs: 300 });
  const [signature, setSignature] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const sign = async () => {
    setFailure(null);
    try {
      setSignature(
        String(await wallet.request({ method: "personal_sign", params: [HELLO, wallet.state.accounts[0]] })),
      );
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Signing failed");
    }
  };
  return (
    <section aria-labelledby="wallet-title">
      <h2 id="wallet-title">Wallet</h2>
      <SanctumWalletConnect wallet={wallet} />
      {wallet.state.status === "connected" ? (
        <button type="button" className="sanctum-secondary-button" onClick={() => void sign()}>
          Sign “Hello Sanctum”
        </button>
      ) : null}
      {signature ? <p data-signature={signature}>Signed.</p> : null}
      {failure ? <p role="alert">{failure}</p> : null}
    </section>
  );
}

function Account() {
  const { session, signOut } = useSession();
  return (
    <section aria-labelledby="account-title">
      <h2 id="account-title">Account</h2>
      {session ? (
        <>
          <p data-subject={session.subject}>Signed in.</p>
          <button type="button" className="sanctum-secondary-button" onClick={() => void signOut()}>
            Sign out
          </button>
        </>
      ) : (
        <SignInDrawerButton />
      )}
    </section>
  );
}

function App() {
  const [path, setPath] = useState(window.location.pathname);
  return (
    <main>
      <h1>Example app</h1>
      {path === "/callback" ? (
        // The SDK has already removed the code and state from the callback entry; Back returns to a clean /callback.
        <SignInCallback
          onSignedIn={() => {
            window.history.pushState(null, "", "/");
            setPath("/");
          }}
        />
      ) : (
        <>
          <Account />
          <Wallet />
        </>
      )}
    </main>
  );
}

/** One word per event, for people reading the page and for the Chrome test (data-sdk-events). */
const label = (event: SanctumEvent) => (event.type === "error" ? `error:${event.during}` : event.type);

function Root({ issuer, clientId, redirectUri }: { issuer: string; clientId: string; redirectUri: string }) {
  const [events, setEvents] = useState<string[]>([]);
  const onEvent = useCallback((event: SanctumEvent) => setEvents((seen) => [...seen, label(event)]), []);
  return (
    <SanctumProvider
      issuer={issuer}
      clientId={clientId}
      redirectUri={redirectUri}
      allowInsecureLoopback
      onEvent={onEvent}
    >
      <App />
      <section aria-labelledby="events-title">
        <h2 id="events-title">Events</h2>
        <ol data-sdk-events={events.join(" ")}>
          {events.map((event, index) => (
            <li key={index}>{event}</li>
          ))}
        </ol>
      </section>
    </SanctumProvider>
  );
}

const root = document.getElementById("root")!;
createRoot(root).render(
  <StrictMode>
    <Root issuer={root.dataset.issuer!} clientId={root.dataset.clientId!} redirectUri={root.dataset.redirectUri!} />
  </StrictMode>,
);
