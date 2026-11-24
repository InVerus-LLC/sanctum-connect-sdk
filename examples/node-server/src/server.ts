/**
 * A server-side web app that signs people in with @sanctum.ai/connect as a confidential client (its
 * secret never reaches the browser). Plain node:http, no framework:
 *
 *   GET  /          signed in or not, with Sign in / Refresh / Sign out
 *   GET  /login     starts sign-in; the transaction (state, nonce, PKCE verifier) waits in this
 *                   server's session, never in the URL or the browser
 *   GET  /callback  finishes sign-in once (state, iss, PKCE, nonce, ID token signature)
 *   GET  /me        userinfo for the signed-in subject (JSON)
 *   POST /refresh   rotates the refresh token (Sanctum keeps only the newest)
 *   POST /logout    revokes both tokens, forgets the session and sends the person to Sanctum's
 *                   RP-initiated logout
 *
 * Sessions are in memory behind an opaque HttpOnly, SameSite=Lax cookie; POSTs must come from this
 * origin. Tokens are never logged or rendered. Every call to Sanctum has a 10-second AbortSignal.
 *
 *   SANCTUM_ISSUER=http://localhost:4400 SANCTUM_CLIENT_ID=… SANCTUM_CLIENT_SECRET=… \
 *   SANCTUM_ALLOW_LOOPBACK=1 PORT=4430 node examples/node-server/src/server.ts
 */
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { SanctumConnect, SanctumConnectError, type SignInTransaction } from "@sanctum.ai/connect";

const port = Number(process.env.PORT ?? 4430);
const origin = `http://127.0.0.1:${port}`;
const issuer = process.env.SANCTUM_ISSUER ?? "";
const clientSecret = process.env.SANCTUM_CLIENT_SECRET ?? "";
if (!issuer || !process.env.SANCTUM_CLIENT_ID || !clientSecret) {
  console.error(
    "Set SANCTUM_ISSUER, SANCTUM_CLIENT_ID and SANCTUM_CLIENT_SECRET (see examples/node-server/README.md).",
  );
  process.exit(1);
}

const sanctum = await SanctumConnect.discover(
  {
    issuer,
    clientId: process.env.SANCTUM_CLIENT_ID,
    clientSecret,
    redirectUri: `${origin}/callback`,
    allowInsecureLoopback: process.env.SANCTUM_ALLOW_LOOPBACK === "1",
  },
  { signal: AbortSignal.timeout(10_000) },
);

interface Session {
  transaction?: SignInTransaction;
  signedIn?: { subject: string; idToken: string; accessToken: string; refreshToken: string | undefined };
}
const sessions = new Map<string, Session>();
const timeout = () => ({ signal: AbortSignal.timeout(10_000) });

function sessionOf(request: IncomingMessage, response: ServerResponse): Session {
  const id = /(?:^|;\s*)sid=([A-Za-z0-9_-]{43})/u.exec(request.headers.cookie ?? "")?.[1];
  const found = id ? sessions.get(id) : undefined;
  if (found) return found;
  const fresh = randomBytes(32).toString("base64url");
  const session: Session = {};
  sessions.set(fresh, session);
  response.setHeader("set-cookie", `sid=${fresh}; HttpOnly; SameSite=Lax; Path=/`);
  return session;
}

const escape = (text: string) => text.replace(/[&<>"']/gu, (character) => `&#${character.charCodeAt(0)};`);
function page(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; form-action 'self'",
  });
  response.end(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Node server example</title></head><body><main>${body}</main></body></html>`,
  );
}
const redirect = (response: ServerResponse, location: string) => {
  response.writeHead(303, { location, "cache-control": "no-store" }).end();
};
const json = (response: ServerResponse, status: number, body: unknown) => {
  response
    .writeHead(status, { "content-type": "application/json", "cache-control": "no-store" })
    .end(JSON.stringify(body));
};
const form = (action: string, label: string) =>
  `<form method="post" action="${action}"><button type="submit">${label}</button></form>`;

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", origin);
  const session = sessionOf(request, response);
  if (request.method === "POST" && request.headers.origin !== origin)
    return json(response, 403, { error: "cross_origin" });
  const route = `${request.method} ${url.pathname}`;

  if (route === "GET /") {
    const who = session.signedIn
      ? `<p data-subject="${escape(session.signedIn.subject)}">Signed in.</p>${form("/refresh", "Refresh")}${form("/logout", "Sign out")}`
      : `<p><a href="/login">Sign in with Sanctum</a></p>`;
    return page(response, 200, `<h1>Node server example</h1>${who}`);
  }
  if (route === "GET /login") {
    const { url: authorize, transaction } = await sanctum.startSignIn();
    session.transaction = transaction;
    return redirect(response, authorize.href);
  }
  if (route === "GET /callback") {
    const transaction = session.transaction;
    delete session.transaction; // one use, whatever happens next
    if (!transaction)
      return page(
        response,
        400,
        '<p>This sign-in isn\'t waiting here (already finished or expired). <a href="/login">Start again</a>.</p>',
      );
    try {
      const result = await sanctum.finishSignIn(url, transaction, timeout());
      session.signedIn = {
        subject: result.subject,
        idToken: result.idToken,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      };
      return redirect(response, "/");
    } catch (error) {
      const code = error instanceof SanctumConnectError ? error.code : "unexpected";
      return page(
        response,
        400,
        `<p>Sign-in wasn't completed (${escape(code)}). <a href="/login">Start again</a>.</p>`,
      );
    }
  }
  if (route === "GET /me") {
    if (!session.signedIn) return json(response, 401, { error: "signed_out" });
    const info = await sanctum
      .userInfo(session.signedIn.accessToken, session.signedIn.subject, timeout())
      .catch(() => null);
    return info ? json(response, 200, { subject: info.sub }) : json(response, 401, { error: "token_failed" });
  }
  if (route === "POST /refresh") {
    const current = session.signedIn;
    if (!current?.refreshToken) return json(response, 401, { error: "signed_out" });
    try {
      const next = await sanctum.refresh(current.refreshToken, timeout());
      session.signedIn = {
        ...current,
        accessToken: next.accessToken,
        refreshToken: next.refreshToken ?? current.refreshToken,
      };
      return redirect(response, "/");
    } catch {
      delete session.signedIn; // a refused refresh token: the person signs in again
      return json(response, 401, { error: "token_failed" });
    }
  }
  if (route === "POST /logout") {
    const current = session.signedIn;
    delete session.signedIn;
    if (!current) return redirect(response, "/");
    await Promise.allSettled([
      current.refreshToken ? sanctum.revoke(current.refreshToken, timeout()) : null,
      sanctum.revoke(current.accessToken, timeout()),
    ]);
    return redirect(
      response,
      sanctum.signOutUrl({ idTokenHint: current.idToken, postLogoutRedirectUri: `${origin}/` }).href,
    );
  }
  return json(response, 404, { error: "not_found" });
}

createServer((request, response) => {
  handle(request, response).catch(() => {
    if (!response.headersSent) json(response, 500, { error: "unexpected" });
  });
}).listen(port, "127.0.0.1", () => console.log(`Listening on ${origin}`));
