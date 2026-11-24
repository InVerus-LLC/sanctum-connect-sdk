/**
 * `<SanctumQrCode value label>`: a QR code as one SVG path (dark modules) on a white square with a
 * four-module quiet zone, always dark on light so scanners read it in any theme. No HTML is
 * generated or injected and no inline style is used, so it works under a strict CSP.
 */
import { createElement as h, useMemo } from "react";
import { qrModules } from "@sanctum.ai/connect/qr";

const QUIET = 4;

/** Dark runs of each row as path segments ("M x y h width v1 h -width z"). */
export function qrPath(modules: boolean[][]): string {
  const parts: string[] = [];
  modules.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      if (!row[x]) continue;
      const start = x;
      while (x + 1 < row.length && row[x + 1]) x += 1;
      parts.push(`M${start + QUIET} ${y + QUIET}h${x - start + 1}v1h-${x - start + 1}z`);
    }
  });
  return parts.join("");
}

export function SanctumQrCode({
  value,
  label,
  size = 192,
  className,
}: {
  value: string;
  label: string;
  size?: number;
  className?: string;
}) {
  const modules = useMemo(() => qrModules(value), [value]);
  const side = modules.length + QUIET * 2;
  const path = useMemo(() => qrPath(modules), [modules]);
  return h(
    "svg",
    {
      role: "img",
      "aria-label": label,
      viewBox: `0 0 ${side} ${side}`,
      width: size,
      height: size,
      shapeRendering: "crispEdges",
      className: className ? `sanctum-qr ${className}` : "sanctum-qr",
      "data-sanctum-qr": "",
    },
    h("rect", { width: side, height: side, fill: "#ffffff" }),
    h("path", { d: path, fill: "#000000" }),
  );
}
