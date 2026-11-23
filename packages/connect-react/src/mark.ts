/**
 * The exact Sanctum Connect mark as inline SVG (takes the surrounding text colour). Decorative:
 * the product name is always written next to it, so it is hidden from assistive technology.
 */
import { createElement, type SVGProps } from "react";
import { MARK_PATH, MARK_VIEW_BOX } from "./mark-path.ts";

export function SanctumMark(props: Omit<SVGProps<SVGSVGElement>, "children" | "viewBox">) {
  return createElement("svg", { viewBox: MARK_VIEW_BOX, fill: "none", "aria-hidden": true, focusable: false, ...props },
    createElement("path", { fillRule: "evenodd", clipRule: "evenodd", d: MARK_PATH, fill: "currentColor" }));
}
