import { test, describe } from "node:test";
import assert from "node:assert";
import { issueSessionToken, validateSessionToken, verifyPassword } from "../services/authService.js";
import { snowCoder } from "../services/snowCoder.js";
import jwt from "jsonwebtoken";

describe("Auth Service & Sandbox Isolation Security", () => {
  describe("Auth Service JWT Pinning & Password Defense", () => {
    test("verifies valid operator password in constant time", () => {
      assert.strictEqual(verifyPassword("2026"), true);
      assert.strictEqual(verifyPassword("wrongpass"), false);
      assert.strictEqual(verifyPassword(""), false);
    });

    test("issues session token signed with HS256 algorithm", () => {
      const token = issueSessionToken("nj");
      assert.ok(token, "Token should be issued");

      const decodedHeader = jwt.decode(token, { complete: true });
      assert.strictEqual(decodedHeader?.header.alg, "HS256");

      const session = validateSessionToken(token);
      assert.ok(session);
      assert.strictEqual(session?.user, "nj");
    });

    test("rejects tokens crafted with 'none' algorithm (algorithm confusion defense)", () => {
      // Craft an unverified token with alg: 'none'
      const unsignedPayload = {
        user: "attacker",
        method: "password",
        iat: Math.floor(Date.now() / 1000),
      };
      // Header: {"alg":"none","typ":"JWT"} -> eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0
      const headerB64 = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
      const payloadB64 = Buffer.from(JSON.stringify(unsignedPayload)).toString("base64url");
      const noneToken = `${headerB64}.${payloadB64}.`;

      const session = validateSessionToken(noneToken);
      assert.strictEqual(session, null, "Algorithm 'none' token must be rejected");
    });
  });

  describe("Snow-Coder Sandbox Isolation Defenses", () => {
    test("blocks child_process execution in JavaScript sandbox", async () => {
      const code = `const { execSync } = require("child_process"); execSync("whoami");`;
      const res = await snowCoder.execute({
        code,
        language: "javascript",
        timeoutMs: 3000,
      });

      assert.strictEqual(res.success, false);
      assert.match(res.stderr, /prohibited|disabled|Security Alert/i);
    });

    test("blocks network module requires in JavaScript sandbox", async () => {
      const code = `const http = require("http");`;
      const res = await snowCoder.execute({
        code,
        language: "javascript",
        timeoutMs: 3000,
      });

      assert.strictEqual(res.success, false);
      assert.match(res.stderr, /prohibited|disabled|Security Alert/i);
    });

    test("blocks child_process and net imports in TypeScript sandbox pre-flight", async () => {
      const code = `import { exec } from "child_process"; console.log("escaped");`;
      const res = await snowCoder.execute({
        code,
        language: "typescript",
        timeoutMs: 3000,
      });

      assert.strictEqual(res.success, false);
      assert.match(res.stderr, /prohibited|disabled|Security Alert/i);
    });

    test("permits safe pure computational code in sandbox", async () => {
      const code = `const fib = (n) => n <= 1 ? n : fib(n-1) + fib(n-2); console.log("result:" + fib(10));`;
      const res = await snowCoder.execute({
        code,
        language: "javascript",
        timeoutMs: 3000,
      });

      assert.strictEqual(res.success, true);
      assert.match(res.stdout, /result:55/);
    });
  });
});
