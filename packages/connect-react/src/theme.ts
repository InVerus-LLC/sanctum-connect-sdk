/**
 * Typed theme tokens. `themeCss` turns them into CSS custom properties for a stylesheet the app
 * already serves, so theming needs no inline styles or injected <style> (it works under a strict
 * Content Security Policy). Values are checked: anything that could end the declaration or load a
 * resource (`;`, braces, angle brackets, backslashes, `url(`, `@`) is refused.
 */
export interface SanctumTheme {
  /** Primary button background. */
  accent?: string;
  /** Text on the primary button. */
  accentText?: string;
  text?: string;
  mutedText?: string;
  surface?: string;
  border?: string;
  danger?: string;
  focusRing?: string;
  /** Corner radius of buttons and panels, for example "12px". */
  radius?: string;
  font?: string;
}

const PROPERTIES: Record<keyof SanctumTheme, string> = {
  accent: "--sanctum-accent",
  accentText: "--sanctum-accent-text",
  text: "--sanctum-text",
  mutedText: "--sanctum-muted-text",
  surface: "--sanctum-surface",
  border: "--sanctum-border",
  danger: "--sanctum-danger",
  focusRing: "--sanctum-focus-ring",
  radius: "--sanctum-radius",
  font: "--sanctum-font",
};
const SAFE_VALUE = /^[\p{L}\p{N} #%(),./'"_+-]{1,120}$/u;
const SAFE_SELECTOR = /^[\p{L}\p{N} .#:_[\]="'-]{1,120}$/u;

export function themeCss(theme: SanctumTheme, selector = ":root"): string {
  if (!SAFE_SELECTOR.test(selector)) throw new TypeError("themeCss: the selector has characters that aren't allowed");
  const declarations = (Object.keys(theme) as (keyof SanctumTheme)[]).flatMap((name) => {
    const value = theme[name];
    const property = PROPERTIES[name];
    if (value === undefined) return [];
    if (!property) throw new TypeError(`themeCss: unknown token ${String(name)}`);
    if (!SAFE_VALUE.test(value) || /url\s*\(|expression\s*\(/iu.test(value))
      throw new TypeError(`themeCss: the value for ${name} isn't allowed`);
    return [`${property}: ${value};`];
  });
  return `${selector} { ${declarations.join(" ")} }`;
}
