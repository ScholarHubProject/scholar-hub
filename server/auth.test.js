// Run with: npm test  (from the server directory)
//
// Covers the parts of auth.js where a mistake is silent and expensive: a hash
// that verifies the wrong password, a token that survives tampering, or a file
// token that works for an application it was not issued for.

const test = require("node:test");
const assert = require("node:assert");

// auth.js refuses to sign without a real secret, so set one before requiring it.
process.env.JWT_SECRET = "test-secret-that-is-definitely-long-enough-32";

const auth = require("./auth");

test("hashPassword produces a verifiable scrypt hash", async () => {
  const hash = await auth.hashPassword("correct horse battery");

  assert.ok(hash.startsWith("scrypt$"), "hash should carry its algorithm");
  assert.ok(!hash.includes("correct horse"), "hash must not contain the password");

  const good = await auth.verifyPassword("correct horse battery", hash);
  assert.equal(good.valid, true);
  assert.equal(good.needsRehash, false);

  const bad = await auth.verifyPassword("wrong password", hash);
  assert.equal(bad.valid, false);
});

test("the same password hashes differently every time", async () => {
  const [first, second] = await Promise.all([
    auth.hashPassword("same-password"),
    auth.hashPassword("same-password"),
  ]);

  assert.notEqual(first, second, "each hash needs its own salt");
});

test("a legacy plain-text password verifies once and asks to be rehashed", async () => {
  const match = await auth.verifyPassword("admin123", "admin123");
  assert.equal(match.valid, true);
  assert.equal(match.needsRehash, true, "matching plain text must trigger an upgrade");

  const mismatch = await auth.verifyPassword("admin124", "admin123");
  assert.equal(mismatch.valid, false);
});

test("verifyPassword rejects an empty stored value", async () => {
  const result = await auth.verifyPassword("anything", "");
  assert.equal(result.valid, false);
});

test("a signed token round-trips its claims", () => {
  const token = auth.signToken({ id: 42, email: "s@example.com", role: "Student" });
  const payload = auth.verifyToken(token);

  assert.equal(payload.sub, "42");
  assert.equal(payload.role, "Student");
  assert.equal(payload.email, "s@example.com");
});

test("a tampered token is rejected", () => {
  const token = auth.signToken({ id: 1, email: "s@example.com", role: "Student" });
  const [header, payload, signature] = token.split(".");

  // Re-encode the payload with role escalated to Admin, keeping the old
  // signature. This is the exact attack the signature exists to stop.
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());
  decoded.role = "Admin";
  const forgedPayload = Buffer.from(JSON.stringify(decoded)).toString("base64url");

  assert.equal(auth.verifyToken(`${header}.${forgedPayload}.${signature}`), null);
  assert.equal(auth.verifyToken("not-a-token"), null);
  assert.equal(auth.verifyToken(""), null);
});

test("an alg:none token is rejected", () => {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString(
    "base64url"
  );
  const payload = Buffer.from(
    JSON.stringify({ sub: "1", role: "Admin", iss: "scholarhub" })
  ).toString("base64url");

  assert.equal(auth.verifyToken(`${header}.${payload}.`), null);
});

test("a file token only opens the application it was issued for", () => {
  const token = auth.signFileToken({ userId: 7, applicationId: 99 });

  assert.ok(auth.verifyFileToken(token, 99), "should open its own application");
  assert.ok(auth.verifyFileToken(token, "99"), "id comparison is string safe");
  assert.equal(auth.verifyFileToken(token, 100), null, "must not open another one");
});

test("a session token is not accepted as a file token", () => {
  const sessionToken = auth.signToken({ id: 7, email: "s@example.com", role: "Admin" });

  assert.equal(
    auth.verifyFileToken(sessionToken, 99),
    null,
    "scope must be checked, not just the signature"
  );
});

test("reset tokens are stored only as a hash", () => {
  const { rawToken, tokenHash } = auth.createResetToken();

  assert.equal(rawToken.length, 64, "32 random bytes as hex");
  assert.notEqual(rawToken, tokenHash);
  assert.equal(auth.hashResetToken(rawToken), tokenHash, "hashing is deterministic");
  assert.notEqual(auth.createResetToken().rawToken, rawToken, "tokens are unique");
});
