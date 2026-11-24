"use client";
/**
 * The app's branding in the sign-in drawer (ADR-0033): its logo, served by Sanctum, in the header in
 * place of Sanctum's mark (alt text: the app's display name), and its accent as a thin bar under the
 * header: a non-text indicator, where Sanctum checked 3:1 against the drawer's surfaces. The accent
 * is an SVG fill attribute, never an inline style, so a strict Content Security Policy needs nothing.
 */
import { createElement as h } from "react";
import { SanctumMark } from "./mark.ts";
import type { SignInKit } from "./sign-in-kit.ts";

/** The header's mark: the app's logo when its kit has one, Sanctum's otherwise. */
export function DrawerBrand({ kit }: { kit: SignInKit | null }) {
  const logo = kit?.branding?.logoUrl;
  if (!kit || !logo) return h("span", { className: "sanctum-drawer-mark" }, h(SanctumMark, { width: 24, height: 24 }));
  return h(
    "span",
    { className: "sanctum-drawer-mark" },
    h("img", {
      src: logo,
      alt: kit.branding?.displayName ?? kit.appName,
      width: 24,
      height: 24,
      className: "sanctum-drawer-logo",
      referrerPolicy: "no-referrer",
      decoding: "async",
    }),
  );
}

/** The app's accent under the header (decorative: hidden from assistive technology). */
export function DrawerAccent({ kit }: { kit: SignInKit | null }) {
  const accent = kit?.branding?.accentColor;
  if (!accent) return null;
  return h(
    "svg",
    { className: "sanctum-drawer-accent", width: "100%", height: 4, "aria-hidden": true, focusable: false },
    h("rect", { width: "100%", height: 4, rx: 2, fill: accent }),
  );
}
