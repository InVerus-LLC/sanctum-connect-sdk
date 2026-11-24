import assert from "node:assert/strict";
import { test } from "node:test";
import { act } from "react";
import { SanctumConnect, type SignInResult } from "../../packages/connect/src/index.ts";
import { deferred, mountProvider, result } from "../support/react-provider.ts";

test("a remounted provider cannot inherit an exchange owned by its unmounted predecessor", async (t) => {
  const view = await mountProvider(t);
  const gate = deferred<SignInResult>();
  t.mock.method(SanctumConnect.prototype, "finishSignIn", () => gate.promise);
  const url = view.callback();
  const old = assert.rejects(view.current.completeCallback(url), { code: "aborted" });
  await view.remount();
  const next = assert.rejects(view.current.completeCallback(url), { code: "transaction_missing" });
  await act(async () => {
    gate.resolve(result);
    await Promise.all([old, next]);
  });
  assert.equal(view.current.session, null);
  assert.equal(view.events.filter((event) => event.type === "signed_in").length, 0);
});

test("StrictMode preserves sign-in and shares concurrent callbacks without revoking their tokens", async (t) => {
  const view = await mountProvider(t, true);
  const gate = deferred<SignInResult>();
  const finish = t.mock.method(SanctumConnect.prototype, "finishSignIn", () => gate.promise);
  const revoke = t.mock.method(SanctumConnect.prototype, "revoke", async () => undefined);
  const url = view.callback();
  const first = view.current.completeCallback(url);
  const second = view.current.completeCallback(url);
  await act(async () => {
    gate.resolve(result);
    await Promise.all([first, second]);
  });
  assert.equal(finish.mock.callCount(), 1);
  assert.equal(revoke.mock.callCount(), 0);
  assert.equal(view.current.session?.accessToken, result.accessToken);
  assert.equal(view.events.filter((event) => event.type === "signed_in").length, 1);
});

test("a refresh completing after sign-out cannot restore a session or announce refresh", async (t) => {
  const view = await mountProvider(t);
  await view.signIn();
  const gate = deferred<{ accessToken: string; refreshToken: string }>();
  t.mock.method(SanctumConnect.prototype, "refresh", () => gate.promise);
  const pending = view.current.refresh();
  const rejected = assert.rejects(pending, { code: "aborted" });
  await act(async () => {
    await view.current.signOut();
  });
  await act(async () => {
    gate.resolve({ accessToken: "synthetic-late-access", refreshToken: "synthetic-late-refresh" });
    await rejected;
  });
  assert.equal(view.current.session, null);
  assert.equal(view.events.filter((event) => event.type === "refreshed").length, 0);
});

test("a callback completing after sign-out cannot sign the person back in", async (t) => {
  const view = await mountProvider(t);
  const gate = deferred<SignInResult>();
  t.mock.method(SanctumConnect.prototype, "finishSignIn", () => gate.promise);
  const pending = view.current.completeCallback(view.callback());
  const rejected = assert.rejects(pending, { code: "aborted" });
  await act(async () => {
    await view.current.signOut();
  });
  await act(async () => {
    gate.resolve(result);
    await rejected;
  });
  assert.equal(view.current.session, null);
  assert.equal(view.events.filter((event) => event.type === "signed_in").length, 0);
});

test("issuer and client changes never render a previous configuration's session", async (t) => {
  const view = await mountProvider(t);
  await view.signIn();
  assert.ok(view.current.session);
  for (const next of [
    { ...view.current.config, clientId: "second-client" },
    { ...view.current.config, issuer: "https://second-issuer.example.test" },
  ]) {
    const start = view.rendered.length;
    await view.render(next);
    assert.ok(view.rendered.slice(start).every((context) => context.session === null));
    await view.signIn();
  }
});

test("unmounting invalidates callback results and suppresses late success events", async (t) => {
  const view = await mountProvider(t);
  const gate = deferred<SignInResult>();
  t.mock.method(SanctumConnect.prototype, "finishSignIn", () => gate.promise);
  const pending = view.current.completeCallback(view.callback());
  const rejected = assert.rejects(pending, { code: "aborted" });
  await view.unmount();
  gate.resolve(result);
  await rejected;
  assert.equal(view.events.filter((event) => event.type === "signed_in").length, 0);
});

test("concurrent refreshes share one rotating-token exchange", async (t) => {
  const view = await mountProvider(t);
  await view.signIn();
  const gate = deferred<{ accessToken: string; refreshToken: string }>();
  const mocked = t.mock.method(SanctumConnect.prototype, "refresh", () => gate.promise);
  const first = view.current.refresh();
  const second = view.current.refresh();
  await act(async () => {
    gate.resolve({ accessToken: "synthetic-new-access", refreshToken: "synthetic-new-refresh" });
    await Promise.all([first, second]);
  });
  assert.equal(mocked.mock.callCount(), 1);
  assert.equal(view.current.session?.accessToken, "synthetic-new-access");
  assert.equal(view.events.filter((event) => event.type === "refreshed").length, 1);
});
