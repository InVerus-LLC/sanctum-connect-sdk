/**
 * Browser wallets for sign-in pickers, with no dependency on the OAuth code (also exported as
 * "@sanctum.ai/connect/wallets", so pages that only list wallets don't load it).
 *
 *  - `watchInjectedWallets`: EIP-6963 discovery. Subscribes before asking wallets to announce
 *    themselves, keeps listening for wallets that load late, and ignores a second announcement of
 *    the same UUID with the same provider; one with a new provider (the extension reloaded) replaces
 *    the provider in place, keeping the first name and icon, and is reported again, so work started with
 *    the old provider can be abandoned (the hosted pages do). Announced metadata is untrusted: the name is plain text (control and bidi
 *    characters removed), the icon is kept only as a constrained data-URI image (render it with
 *    <img>, never as HTML), and the reverse-DNS id is a hint, not proof of who made the wallet.
 *  - `WALLET_CATALOGUE`: wallets Sanctum lists by name, with their reviewed home pages (checked
 *    on 15 November 2026). Being listed doesn't make a wallet a sign-in path: Ethereum wallets
 *    sign in only when this browser has them; Bitcoin wallets sign a BIP-322 message on Sanctum.
 *  - `searchWallets`: case-insensitive name/alias search, a chain-family filter and stable order.
 */
export type ChainFamily = "evm" | "bitcoin";

interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

export interface InjectedWallet {
  uuid: string;
  name: string;
  /** A data-URI image, or null when the announced icon isn't one. */
  icon: string | null;
  /** Announced reverse-DNS id (EIP-6963); null when malformed. Not proof of identity. */
  rdns: string | null;
  provider: Eip1193Provider;
}

export interface CatalogueWallet {
  id: string;
  name: string;
  aliases: readonly string[];
  families: readonly ChainFamily[];
  /** Reverse-DNS ids its extension announces, used only to avoid listing an installed wallet twice. */
  rdns: readonly string[];
  homepage: string;
}

export const WALLET_RDNS = /^(?=.{3,100}$)[a-z0-9-]+(\.[a-z0-9-]+)+$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const SAFE_ICON = /^data:image\/(png|svg\+xml|webp|jpeg);base64,[A-Za-z0-9+/=]{1,200000}$/u;
const UNSAFE_TEXT = /[\p{Cc}\p{Cf}]/gu;

const CATALOGUE: CatalogueWallet[] = [
  {
    id: "metamask",
    name: "MetaMask",
    aliases: ["meta mask"],
    families: ["evm"],
    rdns: ["io.metamask"],
    homepage: "https://metamask.io",
  },
  {
    id: "coinbase",
    name: "Coinbase Wallet",
    aliases: ["coinbase", "base wallet"],
    families: ["evm"],
    rdns: ["com.coinbase.wallet"],
    homepage: "https://www.coinbase.com/wallet",
  },
  {
    id: "rabby",
    name: "Rabby",
    aliases: ["rabby wallet"],
    families: ["evm"],
    rdns: ["io.rabby"],
    homepage: "https://rabby.io",
  },
  {
    id: "rainbow",
    name: "Rainbow",
    aliases: [],
    families: ["evm"],
    rdns: ["me.rainbow"],
    homepage: "https://rainbow.me",
  },
  {
    id: "phantom",
    name: "Phantom",
    aliases: [],
    families: ["evm"],
    rdns: ["app.phantom"],
    homepage: "https://phantom.com",
  },
  {
    id: "trust",
    name: "Trust Wallet",
    aliases: ["trust"],
    families: ["evm"],
    rdns: ["com.trustwallet.app"],
    homepage: "https://trustwallet.com",
  },
  {
    id: "brave",
    name: "Brave Wallet",
    aliases: ["brave"],
    families: ["evm"],
    rdns: ["com.brave.wallet"],
    homepage: "https://brave.com/wallet/",
  },
  {
    id: "zerion",
    name: "Zerion",
    aliases: [],
    families: ["evm"],
    rdns: ["io.zerion.wallet"],
    homepage: "https://zerion.io",
  },
  { id: "xverse", name: "Xverse", aliases: [], families: ["bitcoin"], rdns: [], homepage: "https://www.xverse.app" },
  {
    id: "leather",
    name: "Leather",
    aliases: ["hiro"],
    families: ["bitcoin"],
    rdns: [],
    homepage: "https://leather.io",
  },
  {
    id: "unisat",
    name: "UniSat",
    aliases: ["unisat wallet"],
    families: ["bitcoin"],
    rdns: [],
    homepage: "https://unisat.io",
  },
];
export const WALLET_CATALOGUE: readonly CatalogueWallet[] = Object.freeze(
  CATALOGUE.map((wallet) => Object.freeze(wallet)),
);

/** A wallet's announcement, or null when it doesn't meet the checks. */
function announced(event: Event): InjectedWallet | null {
  const detail = (event as CustomEvent).detail as
    | { info?: { uuid?: unknown; name?: unknown; icon?: unknown; rdns?: unknown }; provider?: Eip1193Provider }
    | undefined;
  const info = detail?.info;
  if (!info || typeof info.uuid !== "string" || !UUID.test(info.uuid)) return null;
  const name = typeof info.name === "string" ? info.name.replace(UNSAFE_TEXT, "").trim() : "";
  if (name.length < 1 || name.length > 64) return null;
  if (!detail?.provider || typeof detail.provider.request !== "function") return null;
  return {
    uuid: info.uuid.toLowerCase(),
    name,
    icon: typeof info.icon === "string" && SAFE_ICON.test(info.icon) ? info.icon : null,
    rdns: typeof info.rdns === "string" && WALLET_RDNS.test(info.rdns) ? info.rdns : null,
    provider: detail.provider,
  };
}

/** EIP-6963 discovery in a browser window; returns the function that stops listening. `target` is for tests. */
export function watchInjectedWallets(
  onChange: (wallets: InjectedWallet[]) => void,
  target: EventTarget = globalThis as unknown as EventTarget,
): () => void {
  const found = new Map<string, InjectedWallet>();
  const onAnnounce = (event: Event) => {
    const wallet = announced(event);
    const known = wallet && found.get(wallet.uuid);
    if (!wallet || known?.provider === wallet.provider) return;
    found.set(wallet.uuid, known ? { ...known, provider: wallet.provider } : wallet);
    onChange([...found.values()]);
  };
  target.addEventListener("eip6963:announceProvider", onAnnounce);
  target.dispatchEvent(new Event("eip6963:requestProvider"));
  return () => target.removeEventListener("eip6963:announceProvider", onAnnounce);
}

export interface WalletSearchResult {
  /** Wallets this browser announced (Ethereum), by name. */
  installed: InjectedWallet[];
  /** Catalogue wallets not already installed, by name. */
  other: CatalogueWallet[];
}

const fold = (text: string) => text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().trim();
const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, "en", { sensitivity: "base" });

/** Filters by a case- and accent-insensitive query over names and aliases, and by chain family. */
export function searchWallets(input: {
  query: string;
  family: ChainFamily | "all";
  installed: readonly InjectedWallet[];
  catalogue?: readonly CatalogueWallet[];
}): WalletSearchResult {
  const query = fold(input.query);
  const matches = (names: readonly string[]) => query === "" || names.some((name) => fold(name).includes(query));
  const installedRdns = new Set(
    input.installed.map((wallet) => wallet.rdns).filter((rdns): rdns is string => rdns !== null),
  );
  const installed =
    input.family === "bitcoin" ? [] : input.installed.filter((wallet) => matches([wallet.name])).sort(byName);
  const other = (input.catalogue ?? WALLET_CATALOGUE)
    .filter(
      (wallet) =>
        (input.family === "all" || wallet.families.includes(input.family)) &&
        !wallet.rdns.some((rdns) => installedRdns.has(rdns)),
    )
    .filter((wallet) => matches([wallet.name, ...wallet.aliases]))
    .sort(byName);
  return { installed, other };
}
