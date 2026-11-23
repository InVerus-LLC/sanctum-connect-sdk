"use client";
/**
 * The drawer's two views. Methods: only what the app's kit offers (passkeys and new accounts
 * always). Wallets: Ethereum wallets this browser announced (EIP-6963; names and icons untrusted,
 * icons drawn only as data-URI <img>), then catalogue wallets — Ethereum ones link to their
 * reviewed home page (they can't sign in until installed), Bitcoin ones sign a BIP-322 message on
 * Sanctum. Search is case- and accent-insensitive; arrow keys move between rows.
 */
import { createElement as h, useId, type KeyboardEvent, type ReactNode } from "react";
import { searchWallets, type ChainFamily, type InjectedWallet, type SignInHint } from "@inverus/connect";
import type { DrawerAction, DrawerState } from "./drawer-state.ts";
import type { SignInKit } from "./sign-in-kit.ts";

type Choose = (hint: SignInHint | null) => void;

const row = (props: Record<string, unknown>, label: ReactNode, detail: ReactNode, end: ReactNode = null) =>
  h(props.href ? "a" : "button", { ...(props.href ? {} : { type: "button" }), className: "sanctum-row", "data-wallet-row": "", ...props },
    h("span", { className: "sanctum-row-text" }, h("span", { className: "sanctum-row-label" }, label), detail ? h("span", { className: "sanctum-row-detail" }, detail) : null), end);

/** Arrow keys move focus between the rows of a list. */
function moveFocus(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  const rows = [...event.currentTarget.querySelectorAll<HTMLElement>("[data-wallet-row]")];
  const index = rows.indexOf(document.activeElement as HTMLElement);
  const next = rows[index + (event.key === "ArrowDown" ? 1 : -1)];
  if (next) { event.preventDefault(); next.focus(); }
}

export function MethodsView({ kit, choose, showWallets, walletButtonRef, issuerHost }: {
  kit: SignInKit; choose: Choose; showWallets: () => void; walletButtonRef: (element: HTMLButtonElement | null) => void; issuerHost: string;
}) {
  const wallets = kit.methods.has("evm_wallet") || kit.methods.has("bitcoin");
  return h("div", { className: "sanctum-view-body", "data-sanctum-view": "methods" },
    h("div", { className: "sanctum-rows", onKeyDown: moveFocus },
      kit.passkey ? row({ onClick: () => choose({ method: "passkey" }) }, "Continue with a passkey", "Face, fingerprint or device PIN") : null,
      wallets ? row({ ref: walletButtonRef, onClick: showWallets }, "Continue with a wallet", "Ethereum or Bitcoin") : null,
      kit.methods.has("sso") ? row({ onClick: () => choose({ method: "sso" }) }, "Sign in with SSO", "Your organization’s identity provider") : null,
      kit.methods.has("providers") ? row({ onClick: () => choose({ method: "providers" }) }, "Continue with another account", "Accounts this Sanctum connects to") : null),
    kit.passkey ? h("button", { type: "button", className: "sanctum-text-button", onClick: () => choose({ method: "signup" }) }, "Create a Sanctum account") : null,
    h("p", { className: "sanctum-fine-print" }, `You’ll finish on ${issuerHost}.`));
}

const FAMILIES: { id: ChainFamily | "all"; label: string }[] = [{ id: "all", label: "All" }, { id: "evm", label: "Ethereum" }, { id: "bitcoin", label: "Bitcoin" }];

export function WalletsView({ kit, state, dispatch, installed, searching, choose }: {
  kit: SignInKit; state: DrawerState; dispatch: (action: DrawerAction) => void; installed: InjectedWallet[]; searching: boolean; choose: Choose;
}) {
  const id = useId();
  const evm = kit.methods.has("evm_wallet");
  const bitcoin = kit.methods.has("bitcoin");
  const family = evm && bitcoin ? state.family : evm ? "evm" : "bitcoin";
  const found = searchWallets({ query: state.query, family, installed: evm ? installed : [] });
  const other = found.other.filter((wallet) => wallet.families.some((candidate) => (candidate === "evm" ? evm : bitcoin)));
  const nothing = found.installed.length === 0 && other.length === 0;
  const clear = () => { dispatch({ type: "search", query: "" }); document.getElementById(`${id}-search`)?.focus(); };
  return h("div", { className: "sanctum-view-body", "data-sanctum-view": "wallets" },
    h("div", { className: "sanctum-search" },
      h("label", { htmlFor: `${id}-search`, className: "sanctum-visually-hidden" }, "Search wallets"),
      h("input", {
        id: `${id}-search`, type: "search", className: "sanctum-search-input", placeholder: "Search wallets", value: state.query, autoComplete: "off", spellCheck: false,
        onChange: (event: { target: HTMLInputElement }) => dispatch({ type: "search", query: event.target.value }),
      }),
      state.query ? h("button", { type: "button", className: "sanctum-text-button sanctum-clear", onClick: clear }, "Clear") : null),
    evm && bitcoin ? h("fieldset", { className: "sanctum-segments" },
      h("legend", { className: "sanctum-visually-hidden" }, "Chain"),
      FAMILIES.map((option) => h("label", { key: option.id, className: "sanctum-segment" },
        h("input", {
          type: "radio", name: `${id}-family`, value: option.id, checked: family === option.id, className: "sanctum-segment-input",
          onChange: () => dispatch({ type: "family", family: option.id }),
        }), option.label))) : null,
    h("p", { className: "sanctum-visually-hidden", role: "status" }, state.query ? `${found.installed.length + other.length} wallets found` : ""),
    h("div", { className: "sanctum-rows", onKeyDown: moveFocus },
      family !== "bitcoin" && evm ? h("h3", { className: "sanctum-section" }, "In this browser") : null,
      family !== "bitcoin" && evm && found.installed.length === 0 && !state.query
        ? h("p", { className: "sanctum-note", role: "status" }, searching ? "Looking for wallets in this browser…" : "No Ethereum wallet was found in this browser.") : null,
      found.installed.map((wallet) => row(
        { key: wallet.uuid, onClick: () => choose(wallet.rdns ? { method: "wallet", wallet: wallet.rdns } : { method: "wallet" }), "data-installed-wallet": wallet.name },
        wallet.name, "Detected in this browser", wallet.icon ? h("img", { src: wallet.icon, alt: "", width: 28, height: 28, className: "sanctum-wallet-icon" }) : null)),
      other.length ? h("h3", { className: "sanctum-section" }, "Other wallets") : null,
      other.map((wallet) => (wallet.families.includes("bitcoin")
        ? row({ key: wallet.id, onClick: () => choose({ method: "bitcoin" }), "data-catalogue-wallet": wallet.name }, wallet.name, "Signs a message on Sanctum (BIP-322)")
        : row({ key: wallet.id, href: wallet.homepage, target: "_blank", rel: "noopener noreferrer", "data-catalogue-wallet": wallet.name },
          `Get ${wallet.name}`, `Not in this browser · ${new URL(wallet.homepage).host}`))),
      nothing && state.query ? h("p", { className: "sanctum-note" }, `No wallets match “${state.query}”.`) : null),
    h("button", { type: "button", className: "sanctum-text-button", onClick: () => choose({ method: "signup" }) }, "I don’t have a wallet"));
}
