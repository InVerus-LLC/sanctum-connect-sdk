/**
 * Type-check fixture for a browser/React consumer of the PACKED SDK tarballs (copied into the
 * consumer project by consumer-smoke.ts; never compiled against the workspace source). Built with
 * skipLibCheck off, so the SDK's own declarations are checked too. It proves: every public entry
 * point resolves through the exports map, internals and source do not, the typed error codes and
 * events are closed unions, and the components, hooks and AbortSignal options have the documented
 * shapes.
 */
import {
  PROVIDER_ERRORS,
  ProviderRpcError,
  SanctumConnect,
  SanctumConnectError,
  type ProviderRpcErrorCode,
  type SanctumConnectErrorCode,
  type SignInResult,
  type WalletProviderEvents,
} from "@sanctum.ai/connect";
import { searchWallets, watchInjectedWallets, type InjectedWallet } from "@sanctum.ai/connect/wallets";
import { qrModules } from "@sanctum.ai/connect/qr";
import {
  describeError,
  SanctumProvider,
  SanctumQrCode,
  SanctumWalletConnect,
  SignInCallback,
  SignInDrawerButton,
  themeCss,
  useInjectedWallets,
  useSanctum,
  useSession,
  useSignInKit,
  useWalletSession,
  type SanctumEvent,
  type SanctumReactErrorCode,
} from "@sanctum.ai/connect-react";
import "@sanctum.ai/connect-react/styles.css";
// @ts-expect-error: internals are not exported (no deep imports)
import type { SanctumConnectError as Internal } from "@sanctum.ai/connect/esm/errors.js";
// @ts-expect-error: nor is the workspace source
import type { SanctumProvider as Source } from "@sanctum.ai/connect-react/src/index.ts";

function sentence(code: SanctumConnectErrorCode): string {
  switch (code) {
    case "configuration":
    case "discovery":
      return "setup";
    case "access_denied":
    case "login_required":
    case "consent_required":
      return "person";
    case "invalid_response":
    case "token_failed":
    case "expired":
      return "protocol";
    case "aborted":
      return "cancelled";
    default: {
      const unreachable: never = code;
      return unreachable;
    }
  }
}

function track(event: SanctumEvent): string {
  switch (event.type) {
    case "ready":
      return event.issuer;
    case "sign_in_started":
      return event.method ?? "chooser";
    case "signed_in":
    case "refreshed":
      return event.subject;
    case "signed_out":
      return String(event.endSanctumSession);
    case "error":
      return `${event.during}:${event.error.code satisfies SanctumReactErrorCode}`;
    default: {
      const unreachable: never = event;
      return unreachable;
    }
  }
}

const limit: ProviderRpcErrorCode = PROVIDER_ERRORS.limitExceeded;
const onDisconnect = (...[error]: WalletProviderEvents["disconnect"]) => error.code === PROVIDER_ERRORS.disconnected;

export async function headless(signal: AbortSignal): Promise<SignInResult | null> {
  const sanctum = await SanctumConnect.discover(
    { issuer: "https://id.example.com", clientId: "c", redirectUri: "https://app.example.com/cb" },
    { signal },
  );
  const { url, transaction } = await sanctum.startSignIn({ hint: { method: "wallet", wallet: "io.metamask" } });
  try {
    return await sanctum.finishSignIn(url, transaction, { signal });
  } catch (error) {
    if (error instanceof SanctumConnectError) sentence(error.code);
    if (error instanceof ProviderRpcError && error.code === limit) return null;
    return null;
  }
}

export function listWallets(found: InjectedWallet[]): number {
  const stop = watchInjectedWallets(() => undefined);
  stop();
  return searchWallets({ query: "meta", family: "evm", installed: found }).other.length + qrModules("x").length;
}

function Account() {
  const { session, signOut } = useSession();
  const { subscribe } = useSanctum();
  const kit = useSignInKit(true);
  const { wallets } = useInjectedWallets(true);
  const wallet = useWalletSession({ chains: ["eip155:84532"], methods: ["personal_sign"], pollMs: 1000 });
  void subscribe((event) => {
    track(event);
  });
  return (
    <section>
      {session ? (
        <button type="button" onClick={() => void signOut({ endSanctumSession: true })}>
          Sign out
        </button>
      ) : (
        <SignInDrawerButton label="Sign in" />
      )}
      <SanctumWalletConnect wallet={wallet} className="wallet" />
      <SanctumQrCode value="https://id.example.com/wallet-link#x" label="QR" size={128} />
      <p>
        {kit.status} {wallets.length} {describeError(new ProviderRpcError(PROVIDER_ERRORS.internal, "x"))}
      </p>
    </section>
  );
}

export function App() {
  return (
    <SanctumProvider
      issuer="https://id.example.com"
      clientId="c"
      redirectUri="https://app.example.com/callback"
      onEvent={(event) => void track(event)}
    >
      <Account />
      <SignInCallback onSignedIn={(session) => void session.subject} />
    </SanctumProvider>
  );
}

export const theme = themeCss({ accent: "#4EAFFF", radius: "12px" }, ".app");
export const checks = [onDisconnect];
export type Unreachable = [Internal, Source];
