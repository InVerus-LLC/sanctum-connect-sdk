"use client";
/**
 * `<SanctumSignInDrawer>` and `<SignInDrawerButton>`: the embedded sign-in chooser (structure after
 * the Skiper 21 reference, independently implemented). A native <dialog>: modal, focus stays
 * inside, Escape or the backdrop closes it, and focus returns to the opener. The person picks a
 * method (or a wallet) here and finishes on Sanctum, which opens that way first: a passkey,
 * wallet signature or SSO is always proved on Sanctum's own origin, never in the app.
 */
import { createElement as h, Fragment, useEffect, useId, useReducer, useState, type MouseEvent } from "react";
import type { SignInHint } from "@inverus/connect";
import { DrawerAccent, DrawerBrand } from "./drawer-brand.ts";
import { drawerReducer, initialDrawerState } from "./drawer-state.ts";
import { MethodsView, WalletsView } from "./drawer-views.ts";
import { describeError } from "./errors.ts";
import { SanctumMark } from "./mark.ts";
import { useSanctum } from "./provider.ts";
import { useSignIn } from "./sign-in.ts";
import { useSignInKit } from "./sign-in-kit.ts";
import { useInjectedWallets } from "./use-injected-wallets.ts";

const icon = (d: string) => h("svg", { viewBox: "0 0 24 24", width: 18, height: 18, fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, focusable: false }, h("path", { d }));

export function SanctumSignInDrawer({ open, onClose, className }: { open: boolean; onClose: () => void; className?: string }) {
  // Elements held as state (callback refs), so render never reads a ref.
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  const [heading, setHeading] = useState<HTMLHeadingElement | null>(null);
  const [walletButton, setWalletButton] = useState<HTMLButtonElement | null>(null);
  const titleId = useId();
  const [state, dispatch] = useReducer(drawerReducer, initialDrawerState);
  const { config } = useSanctum();
  const { signIn, pending, error } = useSignIn();
  const kit = useSignInKit(open);
  const { wallets, searching } = useInjectedWallets(open && state.view === "wallets");

  useEffect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open, dialog]);

  useEffect(() => {
    if (state.direction === "forward") heading?.focus();
    else if (state.direction === "back") walletButton?.focus();
  }, [state.view, state.direction, heading, walletButton]);

  const choose = (hint: SignInHint | null) => void signIn(hint ? { hint } : undefined);
  const closed = () => { dispatch({ type: "reset" }); onClose(); };
  const backdrop = (event: MouseEvent<HTMLDialogElement>) => { if (event.target === event.currentTarget) event.currentTarget.close(); };
  const title = state.view === "wallets" ? "Choose a wallet" : kit.kit ? `Sign in to ${kit.kit.appName}` : "Sign in";
  let body;
  if (kit.status === "loading") body = h("p", { className: "sanctum-note", role: "status" }, "Loading sign-in options…");
  else if (!kit.kit) {
    body = h("div", { className: "sanctum-view-body" },
      h("p", { className: "sanctum-error", role: "alert" }, "Sign-in options couldn’t load."),
      h("div", { className: "sanctum-actions" },
        h("button", { type: "button", className: "sanctum-secondary-button", onClick: kit.retry }, "Try again"),
        h("button", { type: "button", className: "sanctum-button", onClick: () => choose(null) }, "Continue to Sanctum")));
  } else if (state.view === "methods") {
    body = h(MethodsView, { kit: kit.kit, choose, showWallets: () => dispatch({ type: "wallets" }), walletButtonRef: setWalletButton, issuerHost: new URL(config.issuer).host });
  } else {
    body = h(WalletsView, { kit: kit.kit, state, dispatch, installed: wallets, searching, choose });
  }
  return h("dialog", { ref: setDialog, className: className ? `sanctum-drawer ${className}` : "sanctum-drawer", "aria-labelledby": titleId, onClose: closed, onClick: backdrop },
    open ? h("div", { className: "sanctum-drawer-panel", "aria-busy": pending || undefined },
      h("header", { className: "sanctum-drawer-header" },
        state.view === "wallets"
          ? h("button", { type: "button", className: "sanctum-icon-button", "aria-label": "Back", onClick: () => dispatch({ type: "back" }) }, icon("M15 18l-6-6 6-6"))
          : h(DrawerBrand, { kit: kit.kit }),
        h("h2", { id: titleId, ref: setHeading, tabIndex: -1, className: "sanctum-drawer-title" }, title),
        h("button", { type: "button", className: "sanctum-icon-button", "aria-label": "Close", onClick: () => dialog?.close() }, icon("M18 6L6 18M6 6l12 12"))),
      h(DrawerAccent, { kit: kit.kit }),
      h("div", { key: state.view, className: state.direction ? `sanctum-view sanctum-view-${state.direction}` : "sanctum-view" }, body),
      pending ? h("p", { className: "sanctum-note", role: "status" }, "Opening Sanctum…") : null,
      error ? h("p", { className: "sanctum-error", role: "alert" }, describeError(error)) : null) : null);
}

/** "Continue with Sanctum" that opens the drawer (disabled until the issuer is discovered). */
export function SignInDrawerButton({ label = "Continue with Sanctum", className }: { label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const { status } = useSanctum();
  return h(Fragment, null,
    h("button", {
      type: "button", className: className ? `sanctum-button ${className}` : "sanctum-button", disabled: status !== "ready", "aria-haspopup": "dialog",
      onClick: () => setOpen(true),
    }, h(SanctumMark, { className: "sanctum-mark", width: 20, height: 20 }), h("span", null, label)),
    h(SanctumSignInDrawer, { open, onClose: () => setOpen(false) }));
}
