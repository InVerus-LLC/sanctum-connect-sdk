"use client";
/**
 * `<SanctumWalletConnect wallet={useWalletSession(…)} />`: the controls for a wallet session.
 * Waiting shows a QR code and a link that open Sanctum's pairing page (where the person checks this
 * app and approves with their own wallet), when the link stops working, Copy link and Cancel;
 * connected shows the account, the network and Disconnect. The link's address is never rendered
 * as text.
 */
import { createElement as h, useState } from "react";
import { SanctumQrCode } from "./qr-code.ts";
import type { WalletSession } from "./wallet.ts";

const NETWORKS: Record<string, string> = { "0x14a34": "Base Sepolia", "0xaa36a7": "Ethereum Sepolia" };
const shortAddress = (address: string) => (address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address);

export function SanctumWalletConnect({ wallet, className }: { wallet: WalletSession; className?: string }) {
  const { state } = wallet;
  const [copied, setCopied] = useState<string | null>(null);
  const classes = className ? `sanctum-wallet ${className}` : "sanctum-wallet";
  if (state.status === "proposing") return h("div", { className: classes, "data-sanctum-wallet": state.status }, h("p", { role: "status" }, "Preparing a connection link…"));
  if (state.status === "awaiting_approval" && state.pairingUri) {
    const uri = state.pairingUri;
    return h("div", { className: classes, "data-sanctum-wallet": state.status },
      h("p", { role: "status" }, "Scan the code with the phone where your Sanctum wallet is, or open the link on this device, and approve the connection there."),
      h(SanctumQrCode, { value: uri, label: "QR code that opens Sanctum to connect this app" }),
      state.pairingExpiresAt
        ? h("p", { className: "sanctum-note", "data-sanctum-pairing-expires": state.pairingExpiresAt.toISOString() },
          `The link works until ${state.pairingExpiresAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}.`)
        : null,
      h("div", { className: "sanctum-actions" },
        h("a", { className: "sanctum-button", href: uri, target: "_blank", rel: "noopener noreferrer", "data-sanctum-pairing": "" }, "Open Sanctum to connect"),
        h("button", {
          type: "button", className: "sanctum-secondary-button",
          onClick: () => void navigator.clipboard.writeText(uri).then(() => setCopied("Link copied."), () => setCopied("Copy failed. Use “Open Sanctum to connect” instead.")),
        }, "Copy link"),
        h("button", { type: "button", className: "sanctum-secondary-button", onClick: wallet.cancel }, "Cancel")),
      copied ? h("p", { className: "sanctum-note", role: "status" }, copied) : null);
  }
  if (state.status === "connected") {
    const account = state.accounts[0] ?? "";
    const network = state.chainId ? NETWORKS[state.chainId] ?? `chain ${Number.parseInt(state.chainId, 16)}` : "an unknown network";
    return h("div", { className: classes, "data-sanctum-wallet": state.status, "data-account": account },
      h("p", { role: "status" }, `Connected ${shortAddress(account)} on ${network}.`),
      h("button", { type: "button", className: "sanctum-secondary-button", onClick: wallet.disconnect }, "Disconnect"));
  }
  return h("div", { className: classes, "data-sanctum-wallet": state.status },
    state.error ? h("p", { className: "sanctum-error", role: "alert" }, state.error) : null,
    h("button", { type: "button", className: "sanctum-button", onClick: () => void wallet.connect() }, "Connect Sanctum wallet"));
}
