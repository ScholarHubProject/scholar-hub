// Password hashing and JSON Web Tokens.
//
// Hashing uses Node's built-in scrypt rather than bcrypt: it is a memory-hard
// KDF, ships with Node (nothing extra to bundle into the Netlify function) and
// has no 72-byte input limit.
//
// Stored format:  scrypt$<N>$<r>$<p>$<saltBase64>$<hashBase64>
// Anything that does not match that shape is treated as a legacy plain-text
// password so accounts created before this change can still log in once, and
// are re-hashed on the way through.

const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 };
const HASH_PREFIX = "scrypt";

const JWT_SECRET = process.env.JWT_SECRET || "";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "8h";
const JWT_ISSUER = "scholarhub";

// A missing secret must not silently fall back to a default, or every deployment
// would share the same signing key and anyone could mint an admin token.
const assertSecret = () => {
  if (!JWT_SECRET || JWT_SECRET.length < 32) {
    throw new Error(
      "JWT_SECRET is missing or too short. Set it to a random string of at least 32 characters."
    );
  }
};

const isSecretConfigured = () => Boolean(JWT_SECRET && JWT_SECRET.length >= 32);

const hashPassword = (plainPassword) =>
  new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);

    crypto.scrypt(
      plainPassword,
      salt,
      SCRYPT_PARAMS.keylen,
      { N: SCRYPT_PARAMS.N, r: SCRYPT_PARAMS.r, p: SCRYPT_PARAMS.p },
      (err, derivedKey) => {
        if (err) return reject(err);

        return resolve(
          [
            HASH_PREFIX,
            SCRYPT_PARAMS.N,
            SCRYPT_PARAMS.r,
            SCRYPT_PARAMS.p,
            salt.toString("base64"),
            derivedKey.toString("base64"),
          ].join("$")
        );
      }
    );
  });

const isHashed = (storedValue) =>
  typeof storedValue === "string" && storedValue.startsWith(`${HASH_PREFIX}$`);

// Constant-time compare that tolerates differing lengths, which timingSafeEqual
// itself throws on.
const safeEquals = (a, b) => {
  const bufferA = Buffer.from(String(a));
  const bufferB = Buffer.from(String(b));
  const length = Math.max(bufferA.length, bufferB.length);
  const paddedA = Buffer.alloc(length);
  const paddedB = Buffer.alloc(length);

  bufferA.copy(paddedA);
  bufferB.copy(paddedB);

  return crypto.timingSafeEqual(paddedA, paddedB) && bufferA.length === bufferB.length;
};

const verifyPassword = (plainPassword, storedValue) =>
  new Promise((resolve, reject) => {
    if (!storedValue) return resolve({ valid: false, needsRehash: false });

    if (!isHashed(storedValue)) {
      // Legacy plain-text row. Matching means the caller should re-hash it.
      const valid = safeEquals(plainPassword, storedValue);
      return resolve({ valid, needsRehash: valid });
    }

    const [, N, r, p, saltBase64, hashBase64] = storedValue.split("$");
    const salt = Buffer.from(saltBase64, "base64");
    const expected = Buffer.from(hashBase64, "base64");

    return crypto.scrypt(
      plainPassword,
      salt,
      expected.length,
      { N: Number(N), r: Number(r), p: Number(p) },
      (err, derivedKey) => {
        if (err) return reject(err);

        return resolve({
          valid: crypto.timingSafeEqual(derivedKey, expected),
          needsRehash: false,
        });
      }
    );
  });

const signToken = (user) => {
  assertSecret();

  return jwt.sign(
    {
      sub: String(user.id),
      email: user.email,
      role: user.role,
    },
    JWT_SECRET,
    {
      algorithm: "HS256",
      expiresIn: JWT_EXPIRES_IN,
      issuer: JWT_ISSUER,
    }
  );
};

// Uploaded documents are opened through <a href> and <img src>, which cannot
// send an Authorization header. Rather than putting the session token in a URL
// — where it would land in browser history and access logs — the client asks
// for one of these: valid for five minutes and only for a single application.
const FILE_TOKEN_SCOPE = "application-file";
const FILE_TOKEN_EXPIRES_IN = "5m";

const signFileToken = ({ userId, applicationId }) => {
  assertSecret();

  return jwt.sign(
    { sub: String(userId), scope: FILE_TOKEN_SCOPE, appId: String(applicationId) },
    JWT_SECRET,
    { algorithm: "HS256", expiresIn: FILE_TOKEN_EXPIRES_IN, issuer: JWT_ISSUER }
  );
};

const verifyFileToken = (token, applicationId) => {
  const payload = verifyToken(token);

  if (!payload || payload.scope !== FILE_TOKEN_SCOPE) return null;
  if (String(payload.appId) !== String(applicationId)) return null;

  return payload;
};

// Returns the payload, or null for anything unusable. Pinning algorithms stops
// a caller swapping HS256 for "none" or an asymmetric algorithm.
const verifyToken = (token) => {
  if (!token || !isSecretConfigured()) return null;

  try {
    return jwt.verify(token, JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: JWT_ISSUER,
    });
  } catch {
    return null;
  }
};

const readBearerToken = (req) => {
  const header = req.get("authorization") || "";
  const [scheme, value] = header.split(" ");

  if (!value || scheme.toLowerCase() !== "bearer") return null;

  return value.trim();
};

// Password reset links carry a raw random token; only its SHA-256 goes in the
// database, so a leaked table dump cannot be replayed.
const createResetToken = () => {
  const rawToken = crypto.randomBytes(32).toString("hex");

  return { rawToken, tokenHash: hashResetToken(rawToken) };
};

const hashResetToken = (rawToken) =>
  crypto.createHash("sha256").update(String(rawToken)).digest("hex");

module.exports = {
  hashPassword,
  verifyPassword,
  isHashed,
  signToken,
  verifyToken,
  signFileToken,
  verifyFileToken,
  readBearerToken,
  createResetToken,
  hashResetToken,
  isSecretConfigured,
  assertSecret,
};
