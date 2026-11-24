/**
 * @sanctum.ai/connect-react: React bindings for @sanctum.ai/connect (React 19; no framework required).
 *
 *  - <SanctumProvider> discovers the issuer on the client and holds the signed-in session in
 *    memory only; <SignInButton> / useSignIn start sign-in (PKCE public client); the redirect URI's
 *    page renders <SignInCallback> / useSignInCallback, which finishes it once and cleans the URL.
 *  - useWalletSession + <SanctumWalletConnect> connect to a person's Sanctum wallet and send
 *    EIP-1193 requests the person approves in Sanctum.
 *  - Styles: import "@sanctum.ai/connect-react/styles.css"; theme with themeCss in your own CSS.
 *  - Headless: the reducers, useSignIn, useSignInCallback, useWalletSession, useSignInKit and
 *    useInjectedWallets drive your own controls; typed events via onEvent / subscribe.
 * Server rendering is safe: nothing touches browser APIs until effects or event handlers run.
 */
export {
  SanctumProvider,
  useSanctum,
  useSession,
  type SanctumConfig,
  type SanctumContextValue,
  type SanctumProviderProps,
  type SanctumSession,
  type SignInOptions,
} from "./provider.ts";
export { SignInButton, useSignIn, type SignInButtonProps } from "./sign-in.ts";
export { SignInCallback, useSignInCallback, type CallbackState } from "./callback.ts";
export {
  initialWalletState,
  useWalletSession,
  walletReducer,
  type WalletAction,
  type WalletSession,
  type WalletSessionOptions,
  type WalletState,
  type WalletStatus,
} from "./wallet.ts";
export { SanctumWalletConnect } from "./wallet-connect.ts";
export { SanctumSignInDrawer, SignInDrawerButton } from "./sign-in-drawer.ts";
export {
  drawerReducer,
  initialDrawerState,
  type DrawerAction,
  type DrawerState,
  type DrawerView,
} from "./drawer-state.ts";
export { parseKit, useSignInKit, type KitBranding, type KitMethod, type SignInKit } from "./sign-in-kit.ts";
export { useInjectedWallets } from "./use-injected-wallets.ts";
export { createEventHub, type SanctumEvent, type SanctumEventHub, type SanctumEventListener } from "./events.ts";
export { SanctumMark } from "./mark.ts";
export { qrPath, SanctumQrCode } from "./qr-code.ts";
export { themeCss, type SanctumTheme } from "./theme.ts";
export { describeError, SanctumReactError, type SanctumReactErrorCode } from "./errors.ts";
export { completeSignIn, sessionTransactionStore, type TransactionStore } from "./transactions.ts";
export {
  PROVIDER_ERRORS,
  ProviderRpcError,
  SanctumConnectError,
  searchWallets,
  WALLET_CATALOGUE,
  type CatalogueWallet,
  type InjectedWallet,
  type ProviderRpcErrorCode,
  type SanctumConnectErrorCode,
  type SignInHint,
} from "@sanctum.ai/connect";
