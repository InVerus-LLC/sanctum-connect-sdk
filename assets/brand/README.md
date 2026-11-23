# Sanctum Connect brand assets

<p align="center">
  <img src="sanctum-connect-mark.svg" alt="Sanctum Connect logo" width="120" height="120" />
</p>

This folder contains the canonical Sanctum Connect logo used by the SDK's
sign-in controls and repository documentation.

| Asset | Format | Purpose |
| --- | --- | --- |
| [sanctum-connect-mark.svg](sanctum-connect-mark.svg) | SVG | Scalable logo for authorized Sanctum Connect integrations |

## Use the React component

```tsx
import { SanctumMark } from "@inverus/connect-react";

<SanctumMark width={32} height={32} />
```

Use the SDK's `SignInButton` or `SignInDrawerButton` for a complete sign-in control.
When presenting the logo by itself, provide an accessible name in the surrounding
interface. For an image element, use an appropriate `alt` attribute.

## Display guidelines

Keep the original proportions and enough surrounding space for the logo to remain
recognizable. Do not redraw, stretch or combine it with another product's identity.
Use it to identify a Sanctum Connect integration, without implying endorsement of
the integrating application.

## Brand terms

The logo is a brand asset, separate from the MIT-licensed SDK code. Its inclusion
does not grant trademark rights or permission to use it outside the SDK's authorized
integration context. See the [brand notice](../../packages/connect-react/THIRD_PARTY_NOTICES.md#brand-asset).
