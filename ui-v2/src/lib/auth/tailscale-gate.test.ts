import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ALLOWED_LOGINS,
  TAILSCALE_LOGIN_HEADER,
  INTERNAL_TOKEN_HEADER,
  parseAllowedLogins,
  isLoopbackHost,
  isStaticAssetPath,
  evaluateKeepGateWithHeaders,
} from "./tailscale-gate.ts";

test("parseAllowedLogins", async (t) => {
  await t.test("defaults to the operator login when unset", () => {
    assert.deepEqual(parseAllowedLogins(undefined), ["jasonmboyd87@gmail.com"]);
  });

  await t.test("trims, lowercases and drops empty entries", () => {
    assert.deepEqual(parseAllowedLogins(" A@B.COM , c@d.com,,  e@f.com "), ["a@b.com", "c@d.com", "e@f.com"]);
  });

  await t.test("an explicitly empty string locks the tailscale path to nobody", () => {
    assert.deepEqual(parseAllowedLogins(""), []);
  });
});

test("isLoopbackHost", async (t) => {
  for (const host of ["localhost", "127.0.0.1", "127.0.0.1:3000", "0.0.0.0", "[::1]", "::1", "[::1]:8130"]) {
    await t.test(`accepts ${host}`, () => {
      assert.equal(isLoopbackHost(host), true);
    });
  }

  for (const host of [
    "openclaw.some-tailnet.ts.net",
    "192.168.1.10",
    "10.0.0.5:8130",
    "example.com",
    "127.0.0.1.example.com",
  ]) {
    await t.test(`rejects ${host}`, () => {
      assert.equal(isLoopbackHost(host), false);
    });
  }
});

test("isStaticAssetPath", async (t) => {
  for (const path of ["/assets/abc.js", "/assets/", "/hall/room.png", "/__grok/thing", "/favicon.ico", "/logo.svg", "/robots.txt"]) {
    await t.test(`treats ${path} as a static asset`, () => {
      assert.equal(isStaticAssetPath(path), true);
    });
  }

  for (const path of ["/", "/login", "/api/auth/get-session", "/oximeter", "/hall-2", "/keep", "/x.js.map"?.slice(0, -1)]) {
    await t.test(`gates ${path}`, () => {
      assert.equal(isStaticAssetPath(path), false);
    });
  }
});

test("evaluateKeepGate", async (t) => {
  await t.test("VERCEL runtime skips the check entirely", () => {
    const verdict = evaluateKeepGateWithHeaders({ host: "anything.example.com" }, { skipTailscaleCheck: true });
    assert.equal(verdict.allowed, true);
    assert.equal(verdict.mode, "unmanaged");
  });

  await t.test("local dev override fires only for a loopback host", () => {
    const verdict = evaluateKeepGateWithHeaders({ host: "127.0.0.1:3000" }, { authDisabled: true });
    assert.equal(verdict.allowed, true);
    assert.equal(verdict.mode, "local");
  });

  await t.test("local dev override never fires on a tailnet host", () => {
    const verdict = evaluateKeepGateWithHeaders(
      { host: "openclaw.some-tailnet.ts.net" },
      { authDisabled: true },
    );
    assert.equal(verdict.allowed, false);
    assert.equal(verdict.mode, "unauthorized");
  });

  await t.test("allows an allowlisted Tailscale login, keeping the raw case for the badge", () => {
    const verdict = evaluateKeepGateWithHeaders(
      { [TAILSCALE_LOGIN_HEADER]: "JasonMBoyd87@GMAIL.COM", host: "openclaw.some-tailnet.ts.net" },
      { allowedLogins: parseAllowedLogins() },
    );
    assert.equal(verdict.allowed, true);
    assert.equal(verdict.mode, "tailscale");
    assert.equal(verdict.login, "JasonMBoyd87@GMAIL.COM");
  });

  await t.test("refuses a Tailscale login outside the allowlist", () => {
    const verdict = evaluateKeepGateWithHeaders(
      { [TAILSCALE_LOGIN_HEADER]: "someone@else.com", host: "openclaw.some-tailnet.ts.net" },
      { allowedLogins: parseAllowedLogins() },
    );
    assert.equal(verdict.allowed, false);
    assert.equal(verdict.mode, "unauthorized");
    assert.equal(verdict.login, "someone@else.com");
  });

  await t.test("allows the internal token", () => {
    const verdict = evaluateKeepGateWithHeaders(
      { [INTERNAL_TOKEN_HEADER]: "tok-123" },
      { internalToken: "tok-123" },
    );
    assert.equal(verdict.allowed, true);
    assert.equal(verdict.mode, "internal");
  });

  await t.test("refuses a wrong internal token", () => {
    const verdict = evaluateKeepGateWithHeaders(
      { [INTERNAL_TOKEN_HEADER]: "wrong" },
      { internalToken: "tok-123" },
    );
    assert.equal(verdict.allowed, false);
    assert.equal(verdict.mode, "unauthorized");
  });

  await t.test("internal path is locked off when no token is configured", () => {
    const verdict = evaluateKeepGateWithHeaders({ [INTERNAL_TOKEN_HEADER]: "tok-123" }, { internalToken: "" });
    assert.equal(verdict.allowed, false);
    assert.equal(verdict.mode, "unauthorized");
  });

  await t.test("the tailscale stamp wins over a matching internal token", () => {
    const verdict = evaluateKeepGateWithHeaders(
      { [TAILSCALE_LOGIN_HEADER]: DEFAULT_ALLOWED_LOGINS, [INTERNAL_TOKEN_HEADER]: "tok-123" },
      { internalToken: "tok-123", allowedLogins: parseAllowedLogins() },
    );
    assert.equal(verdict.allowed, true);
    assert.equal(verdict.mode, "tailscale");
  });

  await t.test("no identity at all is a 401", () => {
    const verdict = evaluateKeepGateWithHeaders({ host: "openclaw.some-tailnet.ts.net" });
    assert.equal(verdict.allowed, false);
    assert.equal(verdict.mode, "unauthorized");
    assert.equal(verdict.login, null);
  });
});