import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SanctumConnect, type SignInResult } from "../../packages/connect/src/index.ts";
import {
  SanctumProvider,
  useSanctum,
  type SanctumConfig,
  type SanctumContextValue,
} from "../../packages/connect-react/src/provider.ts";
import type { SanctumEvent } from "../../packages/connect-react/src/events.ts";
import { sessionTransactionStore } from "../../packages/connect-react/src/transactions.ts";

export const result: SignInResult = {
  subject: "synthetic-subject",
  claims: { sub: "synthetic-subject", iss: "https://issuer.example.test", aud: "synthetic-client", iat: 0, exp: 300 },
  accessToken: "synthetic-access",
  idToken: "synthetic-id",
  refreshToken: "synthetic-refresh",
};

export function deferred<T>() {
  const { promise, resolve, reject } = Promise.withResolvers<T>();
  return { promise, resolve, reject };
}

export async function mountProvider(t: TestContext, strict = false) {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://app.example.test/callback" });
  const replacements = { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true };
  const originals = new Map(
    Object.keys(replacements).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  for (const [key, value] of Object.entries(replacements))
    Object.defineProperty(globalThis, key, { configurable: true, value });
  const rootElement = dom.window.document.getElementById("root");
  assert.ok(rootElement);
  let root = createRoot(rootElement);
  const discover = SanctumConnect.discover;
  t.mock.method(SanctumConnect, "discover", (config: SanctumConfig) =>
    discover({
      ...config,
      fetch: async () =>
        Response.json({
          issuer: config.issuer,
          authorization_endpoint: `${config.issuer}/authorize`,
          token_endpoint: `${config.issuer}/token`,
          jwks_uri: `${config.issuer}/jwks`,
          code_challenge_methods_supported: ["S256"],
          id_token_signing_alg_values_supported: ["ES256"],
          authorization_response_iss_parameter_supported: true,
        }),
    }),
  );
  t.mock.method(SanctumConnect.prototype, "finishSignIn", async () => result);
  t.mock.method(SanctumConnect.prototype, "revoke", async () => undefined);
  let context: SanctumContextValue | undefined;
  const rendered: SanctumContextValue[] = [];
  const events: SanctumEvent[] = [];
  const onEvent = (event: SanctumEvent) => events.push(event);
  const store = sessionTransactionStore(dom.window.sessionStorage);
  let config: SanctumConfig = {
    issuer: `https://${crypto.randomUUID()}.example.test`,
    clientId: "synthetic-client",
    redirectUri: dom.window.location.href,
  };
  function Probe() {
    context = useSanctum();
    rendered.push(context);
    return null;
  }
  async function render(next: SanctumConfig = config) {
    config = next;
    const tree = createElement(SanctumProvider, { ...config, onEvent, transactionStore: store }, createElement(Probe));
    await act(async () => root.render(strict ? createElement(StrictMode, null, tree) : tree));
  }
  let mounted = true;
  async function unmount() {
    if (mounted) await act(async () => root.unmount());
    mounted = false;
  }
  t.after(async () => {
    await unmount();
    dom.window.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  await render();
  return {
    get current() {
      assert.ok(context);
      return context;
    },
    events,
    rendered,
    render,
    unmount,
    async remount() {
      await unmount();
      root = createRoot(rootElement);
      mounted = true;
      await render();
    },
    callback() {
      const state = crypto.randomUUID();
      store.put({
        state,
        nonce: "synthetic-nonce",
        codeVerifier: "synthetic-verifier",
        redirectUri: config.redirectUri,
      });
      return `${config.redirectUri}?state=${state}&code=synthetic-code`;
    },
    async signIn() {
      await act(async () => {
        await this.current.completeCallback(this.callback());
      });
    },
  };
}
