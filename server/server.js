const express = require("express");
const cors = require("cors");
const { Pool, types } = require("pg");
const path = require("path");
const multer = require("multer");
const storage = require("./storage");
const auth = require("./auth");
const mailer = require("./mailer");
require("dotenv").config();

const app = express();
const PORT = Number(process.env.PORT) || 5001;
const HOST = "0.0.0.0";
const clientDistPath = path.join(__dirname, "..", "client", "dist");
// Connection strings get pasted into hosting dashboards by hand, so the usual
// copy/paste damage is repaired here rather than failing with an empty config:
// surrounding quotes, a leading "DATABASE_URL=", and stray whitespace.
const cleanDatabaseUrl = (value) => {
  if (!value) return "";

  let cleaned = String(value).trim();
  cleaned = cleaned.replace(/^(?:DATABASE_URL|SUPABASE_DB_URL|POSTGRES_URL)\s*=\s*/i, "");
  cleaned = cleaned.replace(/^["']|["']$/g, "").trim();

  return cleaned;
};

// A password containing #, ?, / or spaces breaks URL parsing unless escaped.
// Percent-encode whatever sits between the last ":" of the credentials and the
// "@" that ends them, so a raw password still works.
const encodeUrlPassword = (value) => {
  const match = value.match(/^([a-zA-Z][\w+.-]*:\/\/)([^:/@]+):([^@]*)@(.+)$/);

  if (!match) return value;

  const [, scheme, user, password, rest] = match;

  return `${scheme}${user}:${encodeURIComponent(decodeURIComponent(password))}@${rest}`;
};

const databaseUrl = cleanDatabaseUrl(
  process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL
);
// Surfaced by /api/db-status so a bad value can be diagnosed without shell access.
let databaseUrlError = null;
const databaseUrlConfig = (() => {
  if (!databaseUrl) return {};

  for (const candidate of [databaseUrl, encodeUrlPassword(databaseUrl)]) {
    try {
      const parsedUrl = new URL(candidate);

      if (!parsedUrl.hostname) continue;

      databaseUrlError = null;

      return {
        host: parsedUrl.hostname,
        port: parsedUrl.port ? Number(parsedUrl.port) : undefined,
        user: decodeURIComponent(parsedUrl.username || ""),
        password: decodeURIComponent(parsedUrl.password || ""),
        database: parsedUrl.pathname.replace(/^\/+/, ""),
      };
    } catch (err) {
      databaseUrlError = err.message;
    }
  }

  console.log("Database URL parse error:", databaseUrlError);
  return {};
})();
const DATABASE =
  process.env.DB_NAME || process.env.PGDATABASE || databaseUrlConfig.database || "postgres";
// Supabase hands out a managed database; every table lives in the "public" schema.
const DB_SCHEMA = process.env.DB_SCHEMA || "public";
const dbConfig = {
  host: process.env.DB_HOST || process.env.PGHOST || databaseUrlConfig.host,
  port: Number(process.env.DB_PORT || process.env.PGPORT || databaseUrlConfig.port) || 5432,
  user: process.env.DB_USER || process.env.PGUSER || databaseUrlConfig.user,
  password: process.env.DB_PASSWORD || process.env.PGPASSWORD || databaseUrlConfig.password,
  database: DATABASE,
  max: Number(process.env.DB_CONNECTION_LIMIT) || 5,
  connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS) || 20000,
  idleTimeoutMillis: 30000,
  keepAlive: true,
};

// Supabase always requires TLS. Set DB_SSL=false only for a plain local Postgres.
if (process.env.DB_SSL === "false") {
  dbConfig.ssl = false;
} else {
  dbConfig.ssl = { rejectUnauthorized: false };
}
const EMPTY_DASHBOARD_STATS = {
  total_applicants: 0,
  approved_students: 0,
  pending_applications: 0,
  disapproved_applications: 0,
  old_scholars: 0,
  new_scholars: 0,
  scholarships_posted: 0,
};

// Only the origins we actually serve the app from may call the API. Set
// CORS_ALLOWED_ORIGINS to a comma separated list for extra deploy previews.
const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];

const allowedOrigins = [
  ...DEFAULT_ALLOWED_ORIGINS,
  ...String(process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean),
];

// The origin this request was served from, rebuilt from the proxy headers
// Netlify sets. Browsers omit Origin on same-origin GETs but DO send it on
// same-origin POSTs, so the site's own address has to be recognised or every
// login from the deployed site is rejected as cross-origin.
const getRequestOrigin = (req) => {
  const host = req.headers["x-forwarded-host"] || req.headers.host;

  if (!host) return null;

  const protocol =
    req.headers["x-forwarded-proto"] ||
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");

  return `${protocol}://${host}`;
};

const isOriginAllowed = (origin, req) => {
  if (!origin) return true; // No Origin header: same-origin GET, or a non-browser client.

  const normalized = origin.replace(/\/+$/, "");

  return normalized === getRequestOrigin(req) || allowedOrigins.includes(normalized);
};

// The delegate form is used instead of a plain options object because the
// same-origin comparison above needs the request, which cors() does not pass
// to the simpler `origin(origin, callback)` signature.
app.use(
  cors((req, callback) => {
    callback(null, {
      origin: isOriginAllowed(req.headers.origin, req),
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      maxAge: 600,
    });
  })
);

// cors() answers a rejected request by simply omitting the allow header, which
// the browser reports as a vague network failure. A explicit 403 with a real
// message is far easier to diagnose.
app.use((req, res, next) => {
  if (!isOriginAllowed(req.headers.origin, req)) {
    return res.status(403).json({ message: "This origin is not allowed to call the API." });
  }

  return next();
});

// The security headers that matter for an API plus a static SPA. Written by hand
// rather than pulling in helmet, which would add a dependency for six headers.
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains"
  );
  next();
});

// A body larger than this is never legitimate here; file uploads go through
// multer, which enforces its own per-file limits.
app.use(express.json({ limit: "100kb" }));

// ------------------------------------------------------------------
// Authentication
// ------------------------------------------------------------------
// Every handler below trusts req.user and nothing else. Identity is never read
// from the request body or query string, because the client controls both.
const attachUser = (req, res, next) => {
  const payload = auth.verifyToken(auth.readBearerToken(req));

  req.user = payload
    ? { id: Number(payload.sub), email: payload.email, role: payload.role }
    : null;

  next();
};

const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      message: "Please log in to continue.",
      code: "UNAUTHENTICATED",
    });
  }

  return next();
};

const requireRole = (role) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      message: "Please log in to continue.",
      code: "UNAUTHENTICATED",
    });
  }

  if (req.user.role !== role) {
    return res.status(403).json({
      message: "You do not have permission to do that.",
      code: "FORBIDDEN",
    });
  }

  return next();
};

app.use(attachUser);


const sanitizeUploadPathPart = (value, fallback) => {
  const cleanedValue = String(value || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return cleanedValue || fallback;
};

// Files are held in memory and forwarded to Supabase Storage. Nothing touches
// the local filesystem, which is read-only on Vercel.
const uniqueSuffix = () => `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

// Object keys keep the shape the old disk paths had ("applications/<student>/…",
// "avatars/…") so existing rows and the client's URL building still line up.
const buildApplicationObjectPath = (studentName, originalName) => {
  const studentFolder = sanitizeUploadPathPart(studentName, "unknown-student");
  const fileName = sanitizeUploadPathPart(
    path.basename(originalName || "application-file"),
    "attachment"
  );

  return `applications/${studentFolder}/${uniqueSuffix()}-${fileName}`;
};

const buildAvatarObjectPath = (originalName) => {
  const extension = path.extname(originalName || "").toLowerCase();
  const baseName = sanitizeUploadPathPart(
    path.basename(originalName || "profile-photo", extension),
    "profile-photo"
  );

  return `avatars/${uniqueSuffix()}-${baseName}${extension || ".jpg"}`;
};

const applicationUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 3 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files can be used as profile photos"));
    }

    return cb(null, true);
  },
});

const uploadAvatarPhoto = (req, res, next) => {
  avatarUpload.single("avatar")(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        message:
          err.code === "LIMIT_FILE_SIZE"
            ? "Choose an image under 3 MB."
            : err.message || "Unable to upload profile photo",
      });
    }

    return next();
  });
};

const serveClientApp = (req, res, next) => {
  const acceptHeader = req.get("accept") || "";
  const isBrowserPageRequest =
    req.method === "GET" &&
    (req.path === "/" || acceptHeader.includes("text/html"));

  if (!isBrowserPageRequest) {
    return next();
  }

  return res.sendFile(path.join(clientDistPath, "index.html"), (err) => {
    if (err) {
      next();
    }
  });
};

const parseUploadedFiles = (application) => {
  if (application.uploaded_files_json) {
    try {
      const parsedFiles = JSON.parse(application.uploaded_files_json);

      if (Array.isArray(parsedFiles)) {
        return parsedFiles.filter((file) => file && file.path);
      }
    } catch {
      return [];
    }
  }

  if (application.uploaded_file_path) {
    return [
      {
        name: application.uploaded_file_name,
        path: application.uploaded_file_path,
        type: application.uploaded_file_type,
        size: application.uploaded_file_size,
      },
    ];
  }

  return [];
};

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;

  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }

  return value >>> 0;
});

const getCrc32 = (buffer) => {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
};

const getDosDateTime = (date = new Date()) => {
  const year = Math.max(date.getFullYear(), 1980);
  const dosTime =
    (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();

  return { dosDate, dosTime };
};

const createZipArchive = (files) => {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { dosDate, dosTime } = getDosDateTime();

  files.forEach((file) => {
    const nameBuffer = Buffer.from(file.name);
    const data = file.data;
    const crc = getCrc32(data);
    const localHeader = Buffer.alloc(30);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuffer, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuffer);
    offset += localHeader.length + nameBuffer.length + data.length;
  });

  const centralDirectory = Buffer.concat(centralParts);
  const localData = Buffer.concat(localParts);
  const endRecord = Buffer.alloc(22);

  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(files.length, 8);
  endRecord.writeUInt16LE(files.length, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(localData.length, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([localData, centralDirectory, endRecord]);
};

// Postgres DATE columns come back as plain "YYYY-MM-DD" strings instead of JS
// Date objects, so a deadline never shifts a day from timezone conversion.
types.setTypeParser(1082, (value) => value);

const pool = new Pool(dbConfig);

pool.on("error", (err) => {
  console.log("Idle Postgres client error:", err.message);
});

// Postgres uses $1, $2, ... where MySQL used ?. No SQL in this file contains a
// literal "?", so a straight positional swap is safe.
const toPositionalPlaceholders = (sql) => {
  let index = 0;
  return sql.replace(/\?/g, () => `$${(index += 1)}`);
};

const isInsertStatement = (sql) => /^\s*insert\s+into/i.test(sql);

// Mirrors the mysql2 callback API the route handlers were written against:
// callback(err, rows) where rows also carries .affectedRows and .insertId.
const db = {
  query(sql, params, callback) {
    const done = typeof params === "function" ? params : callback;
    const values = typeof params === "function" ? [] : params || [];
    const wantsInsertId = isInsertStatement(sql) && !/returning/i.test(sql);
    const finalSql = wantsInsertId
      ? `${sql.trimEnd().replace(/;\s*$/, "")} RETURNING id`
      : sql;

    pool.query(toPositionalPlaceholders(finalSql), values, (err, result) => {
      if (err) {
        return done(err);
      }

      const rows = result.rows || [];
      rows.affectedRows = result.rowCount || 0;

      if (wantsInsertId) {
        rows.insertId = rows[0]?.id;
      }

      return done(null, rows);
    });
  },
};

// Postgres SQLSTATE codes plus Node socket errors that mean "database unreachable".
const DB_CONNECTION_ERROR_CODES = [
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "EPIPE",
  "28P01", // invalid_password
  "28000", // invalid_authorization_specification
  "3D000", // invalid_catalog_name
  "53300", // too_many_connections
  "57P01", // admin_shutdown
  "57P03", // cannot_connect_now
  "08006", // connection_failure
  "08001", // sqlclient_unable_to_establish_sqlconnection
];

const DUPLICATE_KEY_CODE = "23505";

// The Supabase pooler reports "max clients reached" as a generic XX000, so it
// has to be matched on the message instead of the code.
const isPoolerBusyError = (err) =>
  Boolean(err) && /max clients reached/i.test(err.message || "");

const isDbConnectionError = (err) =>
  Boolean(err) &&
  (DB_CONNECTION_ERROR_CODES.includes(err.code) || isPoolerBusyError(err));

const dbUnavailableMessage =
  "The server cannot reach the database right now. Please try again later.";

// MySQL compared VARCHARs case-insensitively, so "Ace@Gmail.com" used to match
// "ace@gmail.com" on login. Postgres compares exactly, so emails are stored and
// matched in lower case to keep existing accounts working.
const normalizeEmail = (value) => (value || "").trim().toLowerCase();

const ensureColumn = (columnName, definition) => {
  const checkSql = `
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = ?
  `;

  db.query(checkSql, [DB_SCHEMA, columnName], (err, rows) => {
    if (err) {
      console.log(`Column check failed for ${columnName}:`, err);
      return;
    }

    if (rows.length === 0) {
      db.query(`ALTER TABLE users ADD COLUMN ${columnName} ${definition}`, (alterErr) => {
        if (alterErr) {
          console.log(`Column add failed for ${columnName}:`, alterErr);
        }
      });
    }
  });
};

const ensureScholarshipColumn = (columnName, definition) => {
  const checkSql = `
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'scholarships' AND COLUMN_NAME = ?
  `;

  db.query(checkSql, [DB_SCHEMA, columnName], (err, rows) => {
    if (err) {
      console.log(`Scholarship column check failed for ${columnName}:`, err);
      return;
    }

    if (rows.length === 0) {
      db.query(
        `ALTER TABLE scholarships ADD COLUMN ${columnName} ${definition}`,
        (alterErr) => {
          if (alterErr) {
            console.log(`Scholarship column add failed for ${columnName}:`, alterErr);
          }
        }
      );
    }
  });
};

const ensureAnnouncementColumn = (columnName, definition) => {
  const checkSql = `
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'announcements' AND COLUMN_NAME = ?
  `;

  db.query(checkSql, [DB_SCHEMA, columnName], (err, rows) => {
    if (err) {
      console.log(`Announcement column check failed for ${columnName}:`, err);
      return;
    }

    if (rows.length === 0) {
      db.query(
        `ALTER TABLE announcements ADD COLUMN ${columnName} ${definition}`,
        (alterErr) => {
          if (alterErr) {
            console.log(`Announcement column add failed for ${columnName}:`, alterErr);
          }
        }
      );
    }
  });
};

const ensureApplicationColumn = (columnName, definition) => {
  const checkSql = `
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'applications' AND COLUMN_NAME = ?
  `;

  db.query(checkSql, [DB_SCHEMA, columnName], (err, rows) => {
    if (err) {
      console.log(`Application column check failed for ${columnName}:`, err);
      return;
    }

    if (rows.length === 0) {
      db.query(
        `ALTER TABLE applications ADD COLUMN ${columnName} ${definition}`,
        (alterErr) => {
          if (alterErr) {
            console.log(`Application column add failed for ${columnName}:`, alterErr);
          }
        }
      );
    }
  });
};

const createScholarshipsTable = () => {
  const sql = `
    CREATE TABLE IF NOT EXISTS scholarships (
      id SERIAL PRIMARY KEY,
      scholarship_code VARCHAR(80),
      title VARCHAR(180) NOT NULL,
      description TEXT NOT NULL,
      benefits TEXT,
      qualification TEXT,
      requirements TEXT,
      available_slots INT NOT NULL DEFAULT 0,
      deadline DATE NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'Open',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  db.query(sql, (err) => {
    if (err) {
      console.log("Scholarships Table Create Error:", err);
      return;
    }

    ensureScholarshipColumn("created_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
    ensureScholarshipColumn("scholarship_code", "VARCHAR(80)");
    ensureScholarshipColumn("benefits", "TEXT");
    ensureScholarshipColumn("qualification", "TEXT");
    ensureScholarshipColumn("requirements", "TEXT");
    ensureScholarshipColumn("available_slots", "INT NOT NULL DEFAULT 0");
  });
};

const createApplicationsTable = () => {
  const sql = `
    CREATE TABLE IF NOT EXISTS applications (
      id SERIAL PRIMARY KEY,
      user_id INT,
      student_name VARCHAR(150) NOT NULL,
      school_id_number VARCHAR(80),
      email VARCHAR(150) NOT NULL,
      course_year VARCHAR(120),
      contact_number VARCHAR(50),
      scholarship_id INT,
      scholarship_title VARCHAR(180) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'Pending Review',
      remarks TEXT,
      uploaded_file_name VARCHAR(255),
      uploaded_file_path VARCHAR(255),
      uploaded_file_type VARCHAR(120),
      uploaded_file_size INT,
      uploaded_files_json TEXT,
      status_updated_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (scholarship_id) REFERENCES scholarships(id) ON DELETE SET NULL
    )
  `;

  db.query(sql, (err) => {
    if (err) {
      console.log("Applications Table Create Error:", err);
      return;
    }

    ensureApplicationColumn("student_name", "VARCHAR(150) NOT NULL DEFAULT ''");
    ensureApplicationColumn("user_id", "INT");
    ensureApplicationColumn("school_id_number", "VARCHAR(80)");
    ensureApplicationColumn("email", "VARCHAR(150) NOT NULL DEFAULT ''");
    ensureApplicationColumn("course_year", "VARCHAR(120)");
    ensureApplicationColumn("contact_number", "VARCHAR(50)");
    ensureApplicationColumn("scholarship_id", "INT");
    ensureApplicationColumn("scholarship_title", "VARCHAR(180) NOT NULL DEFAULT ''");
    ensureApplicationColumn("status", "VARCHAR(50) NOT NULL DEFAULT 'Pending Review'");
    ensureApplicationColumn("remarks", "TEXT");
    ensureApplicationColumn("uploaded_file_name", "VARCHAR(255)");
    ensureApplicationColumn("uploaded_file_path", "VARCHAR(255)");
    ensureApplicationColumn("uploaded_file_type", "VARCHAR(120)");
    ensureApplicationColumn("uploaded_file_size", "INT");
    ensureApplicationColumn("uploaded_files_json", "TEXT");
    ensureApplicationColumn("status_updated_at", "TIMESTAMP NULL DEFAULT NULL");
    ensureApplicationColumn("created_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
  });
};

const createAnnouncementsTable = () => {
  const sql = `
    CREATE TABLE IF NOT EXISTS announcements (
      id SERIAL PRIMARY KEY,
      title VARCHAR(180) NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  db.query(sql, (err) => {
    if (err) {
      console.log("Announcements Table Create Error:", err);
      return;
    }

    ensureAnnouncementColumn("title", "VARCHAR(180) NOT NULL DEFAULT 'Announcement'");
    ensureAnnouncementColumn("content", "TEXT NOT NULL");
    ensureAnnouncementColumn("created_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
  });
};

const createPasswordResetTable = () => {
  const sql = `
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash VARCHAR(128) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  db.query(sql, (err) => {
    if (err) {
      console.log("Password Reset Table Create Error:", err);
      return;
    }

    db.query(
      "CREATE INDEX IF NOT EXISTS idx_reset_token_hash ON password_reset_tokens (token_hash)",
      (indexErr) => {
        if (indexErr) console.log("Reset token index error:", indexErr.message);
      }
    );
  });
};

// Brute-force counters live in the database rather than in process memory:
// each Netlify function instance has its own memory, so an in-process counter
// would reset whenever the platform spun up another one.
const createLoginAttemptsTable = () => {
  const sql = `
    CREATE TABLE IF NOT EXISTS login_attempts (
      identifier VARCHAR(200) PRIMARY KEY,
      attempts INT NOT NULL DEFAULT 0,
      first_attempt_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      locked_until TIMESTAMP
    )
  `;

  db.query(sql, (err) => {
    if (err) console.log("Login Attempts Table Create Error:", err);
  });
};

// Only creates the account when it is missing. The previous version overwrote
// the password on every boot, which reset the admin back to a known value after
// each deploy and undid any password change.
const seedDefaultAdmin = async () => {
  const email = normalizeEmail(process.env.ADMIN_EMAIL || "admin@scholarhub.com");
  const password = process.env.ADMIN_PASSWORD || "";

  if (!password) {
    console.log(
      "Default admin not seeded: set ADMIN_PASSWORD to create the first admin account."
    );
    return;
  }

  try {
    const passwordHash = await auth.hashPassword(password);
    const sql = `
      INSERT INTO users (fullname, email, password, role)
      VALUES (?, ?, ?, 'Admin')
      ON CONFLICT (email) DO NOTHING
    `;

    db.query(sql, ["Admin User", email, passwordHash], (err, result) => {
      if (err) {
        console.log("Default Admin Seed Error:", err);
        return;
      }

      console.log(
        result.affectedRows > 0
          ? `Default admin created: ${email}`
          : "Default admin already exists; left unchanged"
      );
    });
  } catch (hashErr) {
    console.log("Default Admin Hash Error:", hashErr.message);
  }
};

// Supabase provisions the database for us, so there is no CREATE DATABASE step:
// we connect straight to it and only make sure the tables exist.
const initializeDatabase = () => {
  const createUsersTable = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      fullname VARCHAR(150) NOT NULL,
      school_id_number VARCHAR(80),
      email VARCHAR(150) NOT NULL UNIQUE,
      course_year VARCHAR(120),
      contact_number VARCHAR(50),
      avatar_path VARCHAR(255),
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'Student',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  db.query(createUsersTable, (tableErr) => {
    if (tableErr) {
      console.log("Users Table Create Error:", tableErr);
      return;
    }

    ensureColumn("course_year", "VARCHAR(120)");
    ensureColumn("contact_number", "VARCHAR(50)");
    ensureColumn("school_id_number", "VARCHAR(80)");
    ensureColumn("avatar_path", "VARCHAR(255)");
    ensureColumn("created_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
    createScholarshipsTable();
    createApplicationsTable();
    createAnnouncementsTable();
    createPasswordResetTable();
    createLoginAttemptsTable();
    seedDefaultAdmin();

    console.log("Postgres connected and tables ready");
  });
};

// Schema setup is roughly forty round trips to Postgres: six CREATE TABLE
// statements plus thirty-one INFORMATION_SCHEMA lookups for individual columns.
// Running that on boot is fine for a long-lived server, but this app runs as a
// serverless function, where "boot" happens on every cold start — so it was
// paying several seconds of schema checks before it could answer a login.
//
// It is opt-in instead. The tables are created by database/schema.sql, and this
// only needs to run after adding a column to the schema:
//
//   DB_AUTO_MIGRATE=true    on the next deploy, or
//   npm run db:setup        from the server directory
const shouldAutoMigrate = process.env.DB_AUTO_MIGRATE === "true";

if (shouldAutoMigrate) {
  pool.connect((err, connection, release) => {
    if (err) {
      console.log("Postgres Error:", err);
      return;
    }

    release();
    initializeDatabase();
  });
}

app.get("/", serveClientApp, (req, res) => {
  res.status(200).send("Scholar Hub Backend Running");
});

app.get("/api/test", (req, res) => {
  db.query("SELECT 1 AS ok", (err) => {
    if (err) {
      console.log("Database Health Check Error:", err);
      return res.status(500).json({
        message: "Backend is running, but the database is not reachable",
        error: err.code || err.message,
      });
    }

    return res.json({ message: "Backend and database are working" });
  });
});

// Admin only: the response names the database host, user and config source,
// which is exactly the reconnaissance an attacker wants.
app.get("/api/db-status", (req, res, next) => requireRole("Admin")(req, res, next), (req, res) => {
  const connectionInfo = {
    host: dbConfig.host || "(not set)",
    port: dbConfig.port,
    user: dbConfig.user || "(not set)",
    database: dbConfig.database,
    ssl: Boolean(dbConfig.ssl),
    passwordProvided: Boolean(dbConfig.password),
    configSource: databaseUrl ? "DATABASE_URL" : "individual DB_* variables",
    // Set when DATABASE_URL was present but unusable, which otherwise looks
    // identical to no configuration at all.
    urlParseError: databaseUrlError,
    urlLooksQuoted: /^["']|["']$/.test(
      String(process.env.DATABASE_URL || "").trim()
    ),
    urlHasAssignmentPrefix: /^\s*DATABASE_URL\s*=/i.test(
      String(process.env.DATABASE_URL || "")
    ),
  };

  db.query("SELECT 1 AS ok", (err) => {
    if (err) {
      return res.status(503).json({
        connected: false,
        connectionInfo,
        error: err.code || err.message,
      });
    }

    return res.json({ connected: true, connectionInfo });
  });
});

// Self-service signup always creates a Student. The old handler took `role`
// straight from the request body, so anyone could POST role:"Admin" and get an
// admin account. Admins are created by an existing admin, or by ADMIN_PASSWORD
// on first boot.
const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const describePasswordProblem = (password) => {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`;
  }

  if (password.length > 200) {
    return "Password must be shorter than 200 characters.";
  }

  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must contain at least one letter and one number.";
  }

  return null;
};

const registerUser = async (req, res) => {
  const {
    fullname,
    schoolIdNumber,
    school_id_number,
    email,
    courseYear,
    course_year,
    contactNumber,
    contact_number,
    password,
  } = req.body;

  const cleanFullname = fullname?.trim();
  const cleanSchoolIdNumber = (schoolIdNumber || school_id_number || "").trim();
  const cleanEmail = normalizeEmail(email);
  const cleanPassword = password?.trim();
  const cleanCourseYear = (courseYear || course_year || "").trim();
  const cleanContactNumber = (contactNumber || contact_number || "").trim();
  const role = "Student";

  if (!cleanFullname || !cleanSchoolIdNumber || !cleanEmail || !cleanPassword) {
    return res.status(400).json({
      message: "Full name, school ID number, email, and password are required",
    });
  }

  if (!EMAIL_PATTERN.test(cleanEmail)) {
    return res.status(400).json({ message: "Please enter a valid email address." });
  }

  const passwordProblem = describePasswordProblem(cleanPassword);

  if (passwordProblem) {
    return res.status(400).json({ message: passwordProblem });
  }

  let passwordHash;

  try {
    passwordHash = await auth.hashPassword(cleanPassword);
  } catch (hashErr) {
    console.log("Registration Hash Error:", hashErr.message);
    return res.status(500).json({ message: "Registration Failed" });
  }

  const sql = `
    INSERT INTO users
      (fullname, school_id_number, email, course_year, contact_number, password, role)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(
    sql,
    [
      cleanFullname,
      cleanSchoolIdNumber,
      cleanEmail,
      cleanCourseYear,
      cleanContactNumber,
      passwordHash,
      role,
    ],
    (err, result) => {
      if (err) {
        if (err.code === DUPLICATE_KEY_CODE) {
          return res.status(409).json({
            message: `The email ${cleanEmail} is already registered. Please log in instead or sign up with a different email address.`,
          });
        }

        console.log("Registration Error:", err);

        if (isDbConnectionError(err)) {
          return res.status(503).json({
            message: dbUnavailableMessage,
            error: err.code,
          });
        }

        return res.status(500).json({
          message: "Registration Failed",
          error: err.sqlMessage || err.message,
        });
      }

      const newUser = {
        id: result.insertId,
        name: cleanFullname,
        schoolIdNumber: cleanSchoolIdNumber,
        email: cleanEmail,
        courseYear: cleanCourseYear,
        contactNumber: cleanContactNumber,
        avatarPath: null,
        role,
      };

      let token;

      try {
        token = auth.signToken({ id: newUser.id, email: newUser.email, role });
      } catch (tokenErr) {
        console.log("Registration Token Error:", tokenErr.message);
        return res.status(500).json({ message: serverMisconfiguredMessage });
      }

      res.status(201).json({
        message: "Registration Successful",
        token,
        user: newUser,
      });
    }
  );
};

const MAX_LOGIN_ATTEMPTS = 8;
const LOGIN_WINDOW_MINUTES = 15;
const LOGIN_LOCKOUT_MINUTES = 15;

const runQuery = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });

const loginIdentifier = (req, email) => {
  const ip = (req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim();
  return `${email}|${ip}`.slice(0, 200);
};

// Returns the number of seconds left on a lockout, or 0 when the caller may try.
const getLockoutSeconds = async (identifier) => {
  const rows = await runQuery(
    `SELECT locked_until FROM login_attempts
     WHERE identifier = ? AND locked_until IS NOT NULL AND locked_until > CURRENT_TIMESTAMP
     LIMIT 1`,
    [identifier]
  );

  if (rows.length === 0) return 0;

  return Math.max(
    1,
    Math.ceil((new Date(rows[0].locked_until).getTime() - Date.now()) / 1000)
  );
};

const recordFailedLogin = async (identifier) => {
  await runQuery(
    `INSERT INTO login_attempts (identifier, attempts, first_attempt_at)
     VALUES (?, 1, CURRENT_TIMESTAMP)
     ON CONFLICT (identifier) DO UPDATE SET
       attempts = CASE
         WHEN login_attempts.first_attempt_at < CURRENT_TIMESTAMP - INTERVAL '${LOGIN_WINDOW_MINUTES} minutes'
         THEN 1
         ELSE login_attempts.attempts + 1
       END,
       first_attempt_at = CASE
         WHEN login_attempts.first_attempt_at < CURRENT_TIMESTAMP - INTERVAL '${LOGIN_WINDOW_MINUTES} minutes'
         THEN CURRENT_TIMESTAMP
         ELSE login_attempts.first_attempt_at
       END`,
    [identifier]
  );

  await runQuery(
    `UPDATE login_attempts
     SET locked_until = CURRENT_TIMESTAMP + INTERVAL '${LOGIN_LOCKOUT_MINUTES} minutes'
     WHERE identifier = ? AND attempts >= ?`,
    [identifier, MAX_LOGIN_ATTEMPTS]
  );
};

const clearLoginAttempts = (identifier) =>
  runQuery("DELETE FROM login_attempts WHERE identifier = ?", [identifier]);

const serverMisconfiguredMessage =
  "The server is not configured for sign-in yet. Please contact the administrator.";

const loginUser = async (req, res) => {
  const { email, password, role } = req.body;

  const cleanEmail = normalizeEmail(email);
  const cleanPassword = password?.trim();
  const cleanRole = role?.trim();

  if (!cleanEmail || !cleanPassword || !cleanRole) {
    return res.status(400).json({
      success: false,
      message: "Email, password, and role are required",
    });
  }

  if (!auth.isSecretConfigured()) {
    console.log("Login blocked: JWT_SECRET is missing or shorter than 32 characters.");
    return res.status(500).json({ success: false, message: serverMisconfiguredMessage });
  }

  const identifier = loginIdentifier(req, cleanEmail);

  try {
    const lockoutSeconds = await getLockoutSeconds(identifier);

    if (lockoutSeconds > 0) {
      return res.status(429).json({
        success: false,
        message: `Too many failed sign-in attempts. Please try again in ${Math.ceil(
          lockoutSeconds / 60
        )} minute(s).`,
      });
    }

    const result = await runQuery(
      `SELECT id, fullname, school_id_number, email, course_year, contact_number, avatar_path, password, role
       FROM users
       WHERE LOWER(email) = ?`,
      [cleanEmail]
    );

    // Unknown email and wrong password give the same reply so the login page
    // can show one clear "wrong email or password" text either way.
    const user = result[0];
    const check = user
      ? await auth.verifyPassword(cleanPassword, user.password)
      : { valid: false, needsRehash: false };

    if (!user || !check.valid) {
      await recordFailedLogin(identifier);
      return res.status(401).json({
        success: false,
        message: "Incorrect email or password. Please try again.",
      });
    }

    if (user.role !== cleanRole) {
      await recordFailedLogin(identifier);
      return res.status(403).json({
        success: false,
        message: `This account is registered as ${user.role}`,
      });
    }

    await clearLoginAttempts(identifier);

    // The row still held a plain-text password from before hashing existed.
    // Now that we know it is correct, replace it with a hash.
    if (check.needsRehash) {
      try {
        const upgradedHash = await auth.hashPassword(cleanPassword);
        await runQuery("UPDATE users SET password = ? WHERE id = ?", [
          upgradedHash,
          user.id,
        ]);
        console.log(`Upgraded legacy password hash for user ${user.id}`);
      } catch (upgradeErr) {
        console.log("Password Upgrade Error:", upgradeErr.message);
      }
    }

    return res.json({
      success: true,
      message: "Login Successful",
      token: auth.signToken({ id: user.id, email: user.email, role: user.role }),
      user: {
        id: user.id,
        name: user.fullname,
        schoolIdNumber: user.school_id_number,
        email: user.email,
        courseYear: user.course_year,
        contactNumber: user.contact_number,
        avatarPath: user.avatar_path,
        role: user.role,
      },
    });
  } catch (err) {
    console.log("Login Error:", err);

    if (isDbConnectionError(err)) {
      return res.status(503).json({
        success: false,
        message: dbUnavailableMessage,
        error: err.code,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Login Failed",
      error: err.code || err.message,
    });
  }
};

// ------------------------------------------------------------------
// Password management
// ------------------------------------------------------------------
const RESET_TOKEN_MINUTES = 60;

// Always answers 200 with the same body. Telling the caller whether an address
// exists would turn this endpoint into an account enumeration oracle.
const requestPasswordReset = async (req, res) => {
  const cleanEmail = normalizeEmail(req.body?.email);
  const genericReply = {
    message:
      "If that email address has an account, a password reset link is on its way.",
  };

  if (!cleanEmail || !EMAIL_PATTERN.test(cleanEmail)) {
    return res.json(genericReply);
  }

  try {
    const rows = await runQuery(
      "SELECT id, fullname, email FROM users WHERE LOWER(email) = ? LIMIT 1",
      [cleanEmail]
    );

    if (rows.length === 0) {
      return res.json(genericReply);
    }

    const user = rows[0];
    const { rawToken, tokenHash } = auth.createResetToken();

    // Any link already outstanding for this account stops working.
    await runQuery(
      "UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND used_at IS NULL",
      [user.id]
    );

    await runQuery(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES (?, ?, CURRENT_TIMESTAMP + INTERVAL '${RESET_TOKEN_MINUTES} minutes')`,
      [user.id, tokenHash]
    );

    const mailResult = await mailer.sendPasswordResetEmail({
      to: user.email,
      name: user.fullname,
      rawToken,
    });

    // With no mail provider configured the link would otherwise be unreachable,
    // so it is logged for the operator instead of being silently dropped.
    if (!mailResult.sent) {
      console.log(
        `Password reset link for ${user.email} (email not sent: ${mailResult.reason}): /reset-password?token=${rawToken}`
      );
    }

    return res.json(genericReply);
  } catch (err) {
    console.log("Password Reset Request Error:", err);
    return res.json(genericReply);
  }
};

const resetPassword = async (req, res) => {
  const rawToken = String(req.body?.token || "").trim();
  const newPassword = String(req.body?.password || "").trim();

  if (!rawToken) {
    return res.status(400).json({ message: "This reset link is not valid." });
  }

  const passwordProblem = describePasswordProblem(newPassword);

  if (passwordProblem) {
    return res.status(400).json({ message: passwordProblem });
  }

  try {
    const rows = await runQuery(
      `SELECT id, user_id FROM password_reset_tokens
       WHERE token_hash = ? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
       LIMIT 1`,
      [auth.hashResetToken(rawToken)]
    );

    if (rows.length === 0) {
      return res.status(400).json({
        message: "This reset link has expired or was already used. Please request a new one.",
      });
    }

    const { id: tokenId, user_id: userId } = rows[0];
    const passwordHash = await auth.hashPassword(newPassword);

    await runQuery("UPDATE users SET password = ? WHERE id = ?", [passwordHash, userId]);
    await runQuery(
      "UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?",
      [tokenId]
    );

    return res.json({ message: "Your password has been changed. Please log in." });
  } catch (err) {
    console.log("Password Reset Error:", err);
    return res.status(500).json({ message: "Failed to reset password. Please try again." });
  }
};

const changePassword = async (req, res) => {
  const currentPassword = String(req.body?.currentPassword || "").trim();
  const newPassword = String(req.body?.newPassword || "").trim();

  if (!currentPassword) {
    return res.status(400).json({ message: "Please enter your current password." });
  }

  const passwordProblem = describePasswordProblem(newPassword);

  if (passwordProblem) {
    return res.status(400).json({ message: passwordProblem });
  }

  try {
    const rows = await runQuery("SELECT password FROM users WHERE id = ? LIMIT 1", [
      req.user.id,
    ]);

    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found. Please log in again." });
    }

    const check = await auth.verifyPassword(currentPassword, rows[0].password);

    if (!check.valid) {
      return res.status(401).json({ message: "Your current password is incorrect." });
    }

    const passwordHash = await auth.hashPassword(newPassword);
    await runQuery("UPDATE users SET password = ? WHERE id = ?", [passwordHash, req.user.id]);

    return res.json({ message: "Password changed successfully." });
  } catch (err) {
    console.log("Change Password Error:", err);
    return res.status(500).json({ message: "Failed to change password. Please try again." });
  }
};

// Which account is edited comes from the token, never from the body: the old
// version let a caller pass any id or email and rewrite that person's profile.
const updateUserProfile = (req, res) => {
  const {
    fullname,
    name,
    schoolIdNumber,
    school_id_number,
    courseYear,
    course_year,
    contactNumber,
    contact_number,
  } = req.body;

  const cleanEmail = normalizeEmail(req.user.email);
  const cleanFullname = (fullname || name || "").trim();
  const cleanSchoolIdNumber = (schoolIdNumber || school_id_number || "").trim();
  const cleanCourseYear = (courseYear || course_year || "").trim();
  const cleanContactNumber = (contactNumber || contact_number || "").trim();
  const cleanId = req.user.id;

  if (!cleanFullname) {
    return res.status(400).json({
      message: "Full name is required",
    });
  }

  const sql = `
    UPDATE users
    SET fullname = ?, school_id_number = ?, course_year = ?, contact_number = ?
    WHERE id = ?
  `;

  db.query(
    sql,
    [
      cleanFullname,
      cleanSchoolIdNumber,
      cleanCourseYear,
      cleanContactNumber,
      cleanId,
    ],
    (err, result) => {
      if (err) {
        console.log("Profile Update Error:", err);
        return res.status(500).json({
          message: "Failed to update profile",
        });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({
          message: "User not found. Please log out and log in again.",
        });
      }

      const applicationSql = `
        UPDATE applications
        SET student_name = ?, school_id_number = ?, course_year = ?, contact_number = ?
        WHERE LOWER(email) = ?
      `;

      db.query(
        applicationSql,
        [
          cleanFullname,
          cleanSchoolIdNumber,
          cleanCourseYear,
          cleanContactNumber,
          cleanEmail,
        ],
        (applicationErr) => {
          if (applicationErr) {
            console.log("Application Profile Sync Error:", applicationErr);
          }

          res.json({
            message: "Profile updated successfully",
            user: {
              name: cleanFullname,
              fullname: cleanFullname,
              schoolIdNumber: cleanSchoolIdNumber,
              id: hasUserId ? cleanId : undefined,
              email: cleanEmail,
              courseYear: cleanCourseYear,
              contactNumber: cleanContactNumber,
            },
          });
        }
      );
    }
  );
};

const updateUserAvatar = async (req, res) => {
  const cleanId = req.user.id;
  const uploadedFile = req.file;

  if (!uploadedFile) {
    return res.status(400).json({
      message: "A profile photo is required",
    });
  }

  if (!storage.isStorageConfigured()) {
    console.log("Avatar Upload Error:", storage.storageNotConfiguredMessage);
    return res.status(500).json({
      message: "Profile photo uploads are unavailable right now.",
    });
  }

  const relativeAvatarPath = buildAvatarObjectPath(uploadedFile.originalname);

  try {
    await storage.putObject(relativeAvatarPath, uploadedFile.buffer, uploadedFile.mimetype);
  } catch (uploadErr) {
    console.log("Avatar Upload Error:", uploadErr.message);
    return res.status(500).json({
      message: "Failed to upload profile photo. Please try again.",
    });
  }

  const cleanupUploadedAvatar = () => {
    storage.removeObject(relativeAvatarPath);
  };
  const whereClause = "id = ?";
  const queryValue = cleanId;
  const lookupSql = `
    SELECT avatar_path
    FROM users
    WHERE ${whereClause}
    LIMIT 1
  `;

  db.query(lookupSql, [queryValue], (lookupErr, rows) => {
    if (lookupErr) {
      console.log("Avatar Lookup Error:", lookupErr);
      cleanupUploadedAvatar();
      return res.status(500).json({
        message: "Failed to update profile photo",
      });
    }

    if (rows.length === 0) {
      cleanupUploadedAvatar();
      return res.status(404).json({
        message: "User not found. Please log out and log in again.",
      });
    }

    const previousAvatarPath = rows[0].avatar_path;
    const updateSql = `
      UPDATE users
      SET avatar_path = ?
      WHERE ${whereClause}
    `;

    db.query(updateSql, [relativeAvatarPath, queryValue], (updateErr) => {
      if (updateErr) {
        console.log("Avatar Update Error:", updateErr);
        cleanupUploadedAvatar();
        return res.status(500).json({
          message: "Failed to update profile photo",
        });
      }

      if (previousAvatarPath && previousAvatarPath !== relativeAvatarPath) {
        storage.removeObject(previousAvatarPath);
      }

      res.json({
        message: "Profile photo updated successfully",
        avatarPath: relativeAvatarPath,
      });
    });
  });
};

const getScholarships = (req, res) => {
  const sql = `
    SELECT id, scholarship_code, title, description, benefits, qualification, requirements, available_slots, deadline, status, created_at
    FROM scholarships
    ORDER BY created_at DESC, id DESC
  `;

  db.query(sql, (err, rows) => {
    if (err) {
      console.log("Scholarships Fetch Error:", err);
      return res.status(500).json({
        message: "Failed to load scholarships",
      });
    }

    res.json(rows);
  });
};

const createScholarship = (req, res) => {
  const {
    scholarshipCode,
    scholarship_code,
    title,
    description,
    benefits,
    qualification,
    requirements,
    availableSlots,
    available_slots,
    deadline,
    status = "Open",
  } = req.body;
  const cleanScholarshipCode = (scholarshipCode || scholarship_code || "").trim();
  const cleanTitle = title?.trim();
  const cleanDescription = description?.trim();
  const cleanBenefits = benefits?.trim() || "";
  const cleanQualification = qualification?.trim() || "";
  const cleanRequirements = requirements?.trim() || "";
  const cleanAvailableSlots = Math.max(
    0,
    Number.parseInt(availableSlots ?? available_slots ?? 0, 10) || 0
  );
  const cleanDeadline = deadline?.trim();
  const cleanStatus = status?.trim() || "Open";

  if (!cleanTitle || !cleanDescription || !cleanDeadline) {
    return res.status(400).json({
      message: "Title, description, and deadline are required",
    });
  }

  const sql = `
    INSERT INTO scholarships (scholarship_code, title, description, benefits, qualification, requirements, available_slots, deadline, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(
    sql,
    [
      cleanScholarshipCode,
      cleanTitle,
      cleanDescription,
      cleanBenefits,
      cleanQualification,
      cleanRequirements,
      cleanAvailableSlots,
      cleanDeadline,
      cleanStatus,
    ],
    (err, result) => {
      if (err) {
        console.log("Scholarship Create Error:", err);
        return res.status(500).json({
          message: "Failed to create scholarship",
        });
      }

      res.status(201).json({
        message: "Scholarship created successfully",
        scholarship: {
          id: result.insertId,
          scholarship_code: cleanScholarshipCode,
          title: cleanTitle,
          description: cleanDescription,
          benefits: cleanBenefits,
          qualification: cleanQualification,
          requirements: cleanRequirements,
          available_slots: cleanAvailableSlots,
          deadline: cleanDeadline,
          status: cleanStatus,
        },
      });
    }
  );
};

const updateScholarship = (req, res) => {
  const { id } = req.params;
  const {
    scholarshipCode,
    scholarship_code,
    title,
    description,
    benefits,
    qualification,
    requirements,
    availableSlots,
    available_slots,
    deadline,
    status = "Open",
  } = req.body;
  const cleanScholarshipCode = (scholarshipCode || scholarship_code || "").trim();
  const cleanTitle = title?.trim();
  const cleanDescription = description?.trim();
  const cleanBenefits = benefits?.trim() || "";
  const cleanQualification = qualification?.trim() || "";
  const cleanRequirements = requirements?.trim() || "";
  const cleanAvailableSlots = Math.max(
    0,
    Number.parseInt(availableSlots ?? available_slots ?? 0, 10) || 0
  );
  const cleanDeadline = deadline?.trim();
  const cleanStatus = status?.trim() || "Open";

  if (!cleanTitle || !cleanDescription || !cleanDeadline) {
    return res.status(400).json({
      message: "Title, description, and deadline are required",
    });
  }

  const sql = `
    UPDATE scholarships
    SET scholarship_code = ?, title = ?, description = ?, benefits = ?, qualification = ?, requirements = ?, available_slots = ?, deadline = ?, status = ?
    WHERE id = ?
  `;

  db.query(
    sql,
    [
      cleanScholarshipCode,
      cleanTitle,
      cleanDescription,
      cleanBenefits,
      cleanQualification,
      cleanRequirements,
      cleanAvailableSlots,
      cleanDeadline,
      cleanStatus,
      id,
    ],
    (err, result) => {
      if (err) {
        console.log("Scholarship Update Error:", err);
        return res.status(500).json({
          message: "Failed to update scholarship",
        });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({
          message: "Scholarship not found",
        });
      }

      res.json({
        message: "Scholarship updated successfully",
      });
    }
  );
};

const deleteScholarship = (req, res) => {
  const { id } = req.params;

  db.query("DELETE FROM scholarships WHERE id = ?", [id], (err, result) => {
    if (err) {
      console.log("Scholarship Delete Error:", err);
      return res.status(500).json({
        message: "Failed to delete scholarship",
      });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Scholarship not found",
      });
    }

    res.json({
      message: "Scholarship deleted successfully",
    });
  });
};

const getAnnouncements = (req, res) => {
  const sql = `
    SELECT id, title, content, created_at
    FROM announcements
    ORDER BY created_at DESC, id DESC
  `;

  db.query(sql, (err, rows) => {
    if (err) {
      console.log("Announcements Fetch Error:", err);
      return res.status(500).json({
        message: "Failed to load announcements",
      });
    }

    res.json(rows);
  });
};

const createAnnouncement = (req, res) => {
  const { title, content } = req.body;
  const cleanTitle = (title || "").trim() || "Announcement";
  const cleanContent = (content || "").trim();

  if (!cleanContent) {
    return res.status(400).json({
      message: "Announcement content is required",
    });
  }

  const sql = `
    INSERT INTO announcements (title, content)
    VALUES (?, ?)
  `;

  db.query(sql, [cleanTitle, cleanContent], (err, result) => {
    if (err) {
      console.log("Announcement Create Error:", err);
      return res.status(500).json({
        message: "Failed to post announcement",
      });
    }

    res.status(201).json({
      message: "Announcement posted successfully",
      announcement: {
        id: result.insertId,
        title: cleanTitle,
        content: cleanContent,
      },
    });
  });
};

const updateAnnouncement = (req, res) => {
  const { id } = req.params;
  const { title, content } = req.body;
  const cleanTitle = (title || "").trim() || "Announcement";
  const cleanContent = (content || "").trim();

  if (!cleanContent) {
    return res.status(400).json({
      message: "Announcement content is required",
    });
  }

  const sql = `
    UPDATE announcements
    SET title = ?, content = ?
    WHERE id = ?
  `;

  db.query(sql, [cleanTitle, cleanContent, id], (err, result) => {
    if (err) {
      console.log("Announcement Update Error:", err);
      return res.status(500).json({
        message: "Failed to update announcement",
      });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Announcement not found",
      });
    }

    res.json({
      message: "Announcement updated successfully",
      announcement: {
        id: Number(id),
        title: cleanTitle,
        content: cleanContent,
      },
    });
  });
};

const createApplication = async (req, res) => {
  const body = req.body || {};
  const {
    studentName,
    student_name,
    schoolIdNumber,
    school_id_number,
    courseYear,
    course_year,
    contactNumber,
    contact_number,
    scholarshipId,
    scholarship_id,
    scholarshipTitle,
    scholarship_title,
  } = body;

  const cleanStudentName = (studentName || student_name || "").trim();
  const cleanSchoolIdNumber = (schoolIdNumber || school_id_number || "").trim();
  const cleanCourseYear = (courseYear || course_year || "").trim();
  const cleanContactNumber = (contactNumber || contact_number || "").trim();
  const cleanScholarshipTitle = (scholarshipTitle || scholarship_title || "").trim();
  const cleanScholarshipId = scholarshipId || scholarship_id || null;
  // The application is always filed for the signed-in student. Taking userId
  // and email from the body let a caller submit under another student's name.
  const cleanUserId = req.user.id;
  const cleanEmail = normalizeEmail(req.user.email);
  const hasUserId = true;
  const uploadedFiles = [
    ...(Array.isArray(req.files?.attachments) ? req.files.attachments : []),
    ...(Array.isArray(req.files?.attachment) ? req.files.attachment : []),
    ...(req.file ? [req.file] : []),
  ];

  // Validate before uploading so a bad request never leaves orphaned objects.
  if (!cleanStudentName || !cleanEmail || (!cleanScholarshipId && !cleanScholarshipTitle)) {
    return res.status(400).json({
      message: "Student name, email, and scholarship are required",
    });
  }

  if (uploadedFiles.length > 0 && !storage.isStorageConfigured()) {
    console.log("Application Upload Error:", storage.storageNotConfiguredMessage);
    return res.status(500).json({
      message: "File uploads are unavailable right now. Please try again later.",
    });
  }

  let uploadedFileRecords = [];

  try {
    uploadedFileRecords = await Promise.all(
      uploadedFiles.map(async (file) => {
        const objectPath = buildApplicationObjectPath(cleanStudentName, file.originalname);
        await storage.putObject(objectPath, file.buffer, file.mimetype);

        return {
          name: file.originalname,
          path: objectPath,
          type: file.mimetype,
          size: file.size,
        };
      })
    );
  } catch (uploadErr) {
    console.log("Application Upload Error:", uploadErr.message);
    return res.status(500).json({
      message: "Failed to upload your requirement files. Please try again.",
    });
  }

  const primaryUploadedFile = uploadedFileRecords[0] || null;
  const uploadedFileName = primaryUploadedFile?.name || null;
  const uploadedFilePath = primaryUploadedFile?.path || null;
  const uploadedFileType = primaryUploadedFile?.type || null;
  const uploadedFileSize = primaryUploadedFile?.size || null;
  const uploadedFilesJson =
    uploadedFileRecords.length > 0 ? JSON.stringify(uploadedFileRecords) : null;
  // Drops objects already pushed to Storage when the insert below fails.
  const cleanupUploadedFiles = () => {
    uploadedFileRecords.forEach((file) => {
      storage.removeObject(file.path);
    });
  };

  const syncStudentAccount = (done) => {
    const syncSql = `
      UPDATE users
      SET fullname = ?, school_id_number = ?, email = ?, course_year = ?, contact_number = ?
      WHERE ${hasUserId ? "id = ?" : "LOWER(email) = ?"}
    `;

    db.query(
      syncSql,
      [
        cleanStudentName,
        cleanSchoolIdNumber,
        cleanEmail,
        cleanCourseYear,
        cleanContactNumber,
        hasUserId ? cleanUserId : cleanEmail,
      ],
      (syncErr, syncResult) => {
        if (syncErr) {
          console.log("Application Profile Sync Error:", syncErr);
          cleanupUploadedFiles();
          return done({
            status: 500,
            message: "Failed to sync account information",
          });
        }

        if (syncResult.affectedRows === 0) {
          cleanupUploadedFiles();
          return done({
            status: 404,
            message: "User account not found",
          });
        }

        return done(null);
      }
    );
  };

  const resolveScholarship = (resolvedSchoolIdNumber) => {
    const scholarshipLookupSql = cleanScholarshipId
      ? "SELECT id, title FROM scholarships WHERE id = ? LIMIT 1"
      : "SELECT id, title FROM scholarships WHERE title = ? LIMIT 1";
    const scholarshipLookupValue = cleanScholarshipId ? cleanScholarshipId : cleanScholarshipTitle;

    db.query(scholarshipLookupSql, [scholarshipLookupValue], (lookupErr, scholarshipRows) => {
      if (lookupErr) {
        console.log("Application Scholarship Lookup Error:", lookupErr);
        cleanupUploadedFiles();
        return res.status(500).json({
          message: "Failed to submit application",
        });
      }

      if (scholarshipRows.length === 0) {
        cleanupUploadedFiles();
        return res.status(404).json({
          message: "Selected scholarship not found",
        });
      }

      const scholarship = scholarshipRows[0];
      const resolvedScholarshipId = scholarship.id;
      const resolvedScholarshipTitle = scholarship.title;
      const sql = `
        INSERT INTO applications
          (user_id, student_name, school_id_number, email, course_year, contact_number, scholarship_id, scholarship_title, status, remarks, uploaded_file_name, uploaded_file_path, uploaded_file_type, uploaded_file_size, uploaded_files_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending Review', 'Waiting for admin review.', ?, ?, ?, ?, ?)
      `;

      db.query(
        sql,
        [
          hasUserId ? cleanUserId : null,
          cleanStudentName,
          resolvedSchoolIdNumber,
          cleanEmail,
          cleanCourseYear,
          cleanContactNumber,
          resolvedScholarshipId,
          resolvedScholarshipTitle,
          uploadedFileName,
          uploadedFilePath,
          uploadedFileType,
          uploadedFileSize,
          uploadedFilesJson,
        ],
        (err, result) => {
          if (err) {
            console.log("Application Submit Error:", err);
            cleanupUploadedFiles();
            return res.status(500).json({
              message: "Failed to submit application",
            });
          }

          const decrementSlotsSql = `
            UPDATE scholarships
            SET available_slots = GREATEST(COALESCE(available_slots, 0) - 1, 0)
            WHERE id = ?
          `;

          db.query(decrementSlotsSql, [resolvedScholarshipId], (slotErr) => {
            if (slotErr) {
              console.log("Scholarship Slot Update Error:", slotErr);
            }

            res.status(201).json({
              message: "Application submitted successfully",
              application: {
                id: result.insertId,
                userId: hasUserId ? cleanUserId : null,
                studentName: cleanStudentName,
                schoolIdNumber: resolvedSchoolIdNumber,
                email: cleanEmail,
                courseYear: cleanCourseYear,
                contactNumber: cleanContactNumber,
                scholarshipId: resolvedScholarshipId,
                scholarshipTitle: resolvedScholarshipTitle,
                uploadedFileName,
                uploadedFilePath,
                uploadedFileType,
                uploadedFileSize,
                uploadedFiles: uploadedFileRecords,
                status: "Pending Review",
                remarks: "Waiting for admin review.",
              },
              user: {
                id: hasUserId ? cleanUserId : undefined,
                name: cleanStudentName,
                fullname: cleanStudentName,
                schoolIdNumber: cleanSchoolIdNumber,
                email: cleanEmail,
                courseYear: cleanCourseYear,
                contactNumber: cleanContactNumber,
              },
            });
          });
        }
      );
    });
  };

  const resolvedSchoolIdNumber = cleanSchoolIdNumber;

  syncStudentAccount((syncError) => {
    if (syncError) {
      return res.status(syncError.status).json({
        message: syncError.message,
      });
    }

    resolveScholarship(resolvedSchoolIdNumber);
  });
};

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;

// The list used to select every row with no limit, so the response grew without
// bound as applications came in. It now pages, and can be searched and filtered
// in the database instead of in the browser.
const getApplications = (req, res) => {
  const search = String(req.query.search || "").trim().slice(0, 120);
  const status = String(req.query.status || "").trim();
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number.parseInt(req.query.pageSize, 10) || DEFAULT_PAGE_SIZE)
  );
  const offset = (page - 1) * pageSize;

  const conditions = [];
  const values = [];

  if (search) {
    conditions.push(`(
      a.student_name ILIKE ?
      OR a.email ILIKE ?
      OR a.school_id_number ILIKE ?
      OR COALESCE(NULLIF(a.scholarship_title, ''), s.title) ILIKE ?
    )`);
    const pattern = `%${search}%`;
    values.push(pattern, pattern, pattern, pattern);
  }

  if (["Approved", "Rejected", "Pending Review"].includes(status)) {
    conditions.push("a.status = ?");
    values.push(status);
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countSql = `
    SELECT COUNT(*) AS total
    FROM applications a
    LEFT JOIN scholarships s ON s.id = a.scholarship_id
    ${whereSql}
  `;

  db.query(countSql, values, (countErr, countRows) => {
    if (countErr) {
      console.log("Applications Count Error:", countErr);
      return res.status(500).json({
        message: "Failed to load applications",
      });
    }

    const total = Number(countRows[0]?.total) || 0;
    const sql = `
      SELECT a.id, a.student_name, a.school_id_number, a.email, a.course_year, a.contact_number,
        a.scholarship_id, s.scholarship_code, COALESCE(NULLIF(a.scholarship_title, ''), s.title) AS scholarship_title,
        a.status, a.remarks, a.uploaded_file_name, a.uploaded_file_path, a.uploaded_file_type, a.uploaded_file_size, a.uploaded_files_json, a.status_updated_at, a.created_at
      FROM applications a
      LEFT JOIN scholarships s ON s.id = a.scholarship_id
      ${whereSql}
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT ? OFFSET ?
    `;

    return db.query(sql, [...values, pageSize, offset], (err, rows) => {
      if (err) {
        console.log("Applications Fetch Error:", err);
        return res.status(500).json({
          message: "Failed to load applications",
        });
      }

      return res.json({
        applications: rows.map((application) => ({
          ...application,
          uploaded_files: parseUploadedFiles(application),
        })),
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      });
    });
  });
};

// Scoped to the signed-in student. The old handler read the email straight out
// of the query string, so passing anyone's address returned their applications.
// Rows are matched on user_id or email because applications filed before
// accounts were linked have a null user_id.
const getStudentApplications = (req, res) => {
  const whereClause = "(a.user_id = ? OR LOWER(a.email) = ?)";
  const queryValue = [req.user.id, normalizeEmail(req.user.email)];

  const sql = `
    SELECT a.id, a.student_name, a.school_id_number, a.email, a.course_year, a.contact_number,
      a.scholarship_id, COALESCE(NULLIF(a.scholarship_title, ''), s.title) AS scholarship_title,
      a.status, a.remarks, a.uploaded_file_name, a.uploaded_file_path, a.uploaded_file_type, a.uploaded_file_size, a.uploaded_files_json, a.status_updated_at, a.created_at
    FROM applications a
    LEFT JOIN scholarships s ON s.id = a.scholarship_id
    WHERE ${whereClause}
    ORDER BY a.created_at DESC, a.id DESC
  `;

  db.query(sql, queryValue, (err, rows) => {
    if (err) {
      console.log("Student Applications Fetch Error:", err);
      return res.status(500).json({
        message: "Failed to load application status",
      });
    }

    res.json(
      rows.map((application) => ({
        ...application,
        uploaded_files: parseUploadedFiles(application),
      }))
    );
  });
};

const updateApplicationStatus = (req, res) => {
  const { id } = req.params;
  const { status, remarks } = req.body;
  const cleanStatus = status?.trim();
  const cleanRemarks =
    remarks?.trim() ||
    (cleanStatus === "Approved"
      ? "Congratulations! Your application was approved."
      : "Your application was rejected.");

  if (!["Approved", "Rejected", "Pending Review"].includes(cleanStatus)) {
    return res.status(400).json({
      message: "Invalid application status",
    });
  }

  const sql = `
    UPDATE applications
    SET status = ?, remarks = ?, status_updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;

  db.query(sql, [cleanStatus, cleanRemarks, id], (err, result) => {
    if (err) {
      console.log("Application Status Update Error:", err);
      return res.status(500).json({
        message: "Failed to update application status",
      });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Application not found",
      });
    }

    // The admin's response must not wait on, or fail because of, the email.
    if (cleanStatus !== "Pending Review") {
      db.query(
        "SELECT student_name, email, scholarship_title FROM applications WHERE id = ? LIMIT 1",
        [id],
        (lookupErr, rows) => {
          if (lookupErr || rows.length === 0) return;

          mailer
            .sendApplicationStatusEmail({
              to: rows[0].email,
              name: rows[0].student_name,
              scholarshipTitle: rows[0].scholarship_title,
              status: cleanStatus,
              remarks: cleanRemarks,
            })
            .catch((mailErr) => console.log("Status Email Error:", mailErr.message));
        }
      );
    }

    res.json({
      message: `Application ${cleanStatus.toLowerCase()} successfully`,
    });
  });
};

const getAdminDashboardStats = (req, res) => {
  const sql = `
    SELECT
      (SELECT COUNT(*) FROM applications) AS total_applicants,
      (SELECT COUNT(*) FROM applications WHERE LOWER(TRIM(status)) = 'approved') AS approved_students,
      (SELECT COUNT(*) FROM applications WHERE LOWER(TRIM(status)) = 'pending review') AS pending_applications,
      (SELECT COUNT(*) FROM applications WHERE LOWER(TRIM(status)) = 'rejected') AS disapproved_applications,
      (SELECT COUNT(*) FROM applications WHERE LOWER(TRIM(status)) = 'approved' AND created_at < CURRENT_DATE - INTERVAL '6 months') AS old_scholars,
      (SELECT COUNT(*) FROM applications WHERE LOWER(TRIM(status)) = 'approved' AND created_at >= CURRENT_DATE - INTERVAL '6 months') AS new_scholars,
      (SELECT COUNT(*) FROM scholarships) AS scholarships_posted
  `;

  db.query(sql, (err, rows) => {
    if (err) {
      console.log("Admin Dashboard Stats Error:", err);
      return res.status(500).json({
        message: "Failed to load dashboard stats",
      });
    }

    const stats = rows[0] || EMPTY_DASHBOARD_STATS;

    res.json({
      total_applicants: Number(stats.total_applicants) || 0,
      approved_students: Number(stats.approved_students) || 0,
      pending_applications: Number(stats.pending_applications) || 0,
      disapproved_applications: Number(stats.disapproved_applications) || 0,
      old_scholars: Number(stats.old_scholars) || 0,
      new_scholars: Number(stats.new_scholars) || 0,
      scholarships_posted: Number(stats.scholarships_posted) || 0,
    });
  });
};

const getAdminRecentActivity = (req, res) => {
  const sql = `
    SELECT *
    FROM (
      SELECT
        CONCAT('application-', id) AS id,
        'Application' AS type,
        CONCAT(student_name, ' submitted an application for ', scholarship_title, '.') AS message,
        created_at
      FROM applications

      UNION ALL

      SELECT
        CONCAT('scholarship-', id) AS id,
        'Scholarship' AS type,
        CONCAT('New scholarship posted: ', title, '.') AS message,
        created_at
      FROM scholarships

      UNION ALL

      SELECT
        CONCAT('announcement-', id) AS id,
        'Announcement' AS type,
        CONCAT('Announcement posted: ', title, '.') AS message,
        created_at
      FROM announcements
    ) recent_activity
    ORDER BY created_at DESC
    LIMIT 8
  `;

  db.query(sql, (err, rows) => {
    if (err) {
      console.log("Admin Recent Activity Error:", err);
      return res.status(500).json({
        message: "Failed to load recent activity",
      });
    }

    res.json(rows);
  });
};

// Admins see every application; a student sees only their own. Applications
// filed before accounts were linked have a null user_id, so email is the
// fallback match.
const canAccessApplication = (user, application) => {
  if (!user) return false;
  if (user.role === "Admin") return true;

  return (
    (application.user_id != null && Number(application.user_id) === user.id) ||
    normalizeEmail(application.email) === normalizeEmail(user.email)
  );
};

const getApplicationFile = (req, res) => {
  const { id } = req.params;
  const shouldDownload = req.query.download === "1";
  const requestedFileIndex = Number(req.query.file || req.query.index || 0);
  const fileIndex =
    Number.isInteger(requestedFileIndex) && requestedFileIndex >= 0
      ? requestedFileIndex
      : 0;

  const sql = `
    SELECT user_id, email, uploaded_file_name, uploaded_file_path, uploaded_file_type, uploaded_file_size, uploaded_files_json
    FROM applications
    WHERE id = ?
    LIMIT 1
  `;

  db.query(sql, [id], (err, rows) => {
    if (err) {
      console.log("Application File Lookup Error:", err);
      return res.status(500).json({
        message: "Failed to load application file",
      });
    }

    if (rows.length === 0) {
      return res.status(404).json({
        message: "Application not found",
      });
    }

    const application = rows[0];

    if (!canAccessApplication(req.user, application)) {
      return res.status(403).json({
        message: "You do not have permission to view this file.",
      });
    }

    const uploadedFiles = parseUploadedFiles(application);
    const selectedFile = uploadedFiles[fileIndex];

    if (!selectedFile) {
      return res.status(404).json({
        message: "No uploaded file for this application",
      });
    }

    return storage
      .getObject(selectedFile.path)
      .then((object) => {
        if (!object) {
          return res.status(404).json({
            message: "Uploaded file not found",
          });
        }

        const fileName = selectedFile.name || path.basename(selectedFile.path);

        res.setHeader("Content-Type", selectedFile.type || object.contentType);
        res.setHeader(
          "Content-Disposition",
          `${shouldDownload ? "attachment" : "inline"}; filename="${fileName}"`
        );

        return res.send(object.buffer);
      })
      .catch((storageErr) => {
        console.log("Application File Download Error:", storageErr.message);
        return res.status(500).json({
          message: "Failed to load application file",
        });
      });
  });
};

const getApplicationFilesArchive = (req, res) => {
  const { id } = req.params;
  const sql = `
    SELECT student_name, user_id, email, uploaded_file_name, uploaded_file_path, uploaded_file_type, uploaded_file_size, uploaded_files_json
    FROM applications
    WHERE id = ?
    LIMIT 1
  `;

  db.query(sql, [id], (err, rows) => {
    if (err) {
      console.log("Application Folder Download Lookup Error:", err);
      return res.status(500).json({
        message: "Failed to download requirement folder",
      });
    }

    if (rows.length === 0) {
      return res.status(404).json({
        message: "Application not found",
      });
    }

    const application = rows[0];

    if (!canAccessApplication(req.user, application)) {
      return res.status(403).json({
        message: "You do not have permission to download these files.",
      });
    }

    const uploadedFiles = parseUploadedFiles(application);
    const folderName = sanitizeUploadPathPart(application.student_name, "student-requirements");

    return Promise.all(
      uploadedFiles.map(async (file, index) => {
        const object = await storage.getObject(file.path);

        if (!object) {
          return null;
        }

        const fileName = sanitizeUploadPathPart(
          file.name || path.basename(file.path),
          `requirement-${index + 1}`
        );

        return {
          name: `${folderName}/${String(index + 1).padStart(2, "0")}-${fileName}`,
          data: object.buffer,
        };
      })
    )
      .then((results) => {
        const archiveFiles = results.filter(Boolean);

        if (archiveFiles.length === 0) {
          return res.status(404).json({
            message: "No uploaded files for this application",
          });
        }

        const zipBuffer = createZipArchive(archiveFiles);
        const zipFileName = `${folderName}-requirements.zip`;

        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", `attachment; filename="${zipFileName}"`);
        return res.send(zipBuffer);
      })
      .catch((storageErr) => {
        console.log("Application Folder Download Error:", storageErr.message);
        return res.status(500).json({
          message: "Failed to download requirement folder",
        });
      });
  });
};

const deleteApplication = (req, res) => {
  const { id } = req.params;
  const lookupSql = `
    SELECT uploaded_file_name, uploaded_file_path, uploaded_file_type, uploaded_file_size, uploaded_files_json
    FROM applications
    WHERE id = ?
    LIMIT 1
  `;

  db.query(lookupSql, [id], (lookupErr, rows) => {
    if (lookupErr) {
      console.log("Application Delete Lookup Error:", lookupErr);
      return res.status(500).json({
        message: "Failed to delete application",
      });
    }

    if (rows.length === 0) {
      return res.status(404).json({
        message: "Application not found",
      });
    }

    const uploadedFiles = parseUploadedFiles(rows[0]);

    db.query("DELETE FROM applications WHERE id = ?", [id], (deleteErr, result) => {
      if (deleteErr) {
        console.log("Application Delete Error:", deleteErr);
        return res.status(500).json({
          message: "Failed to delete application",
        });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({
          message: "Application not found",
        });
      }

      uploadedFiles.forEach((file) => {
        storage.removeObject(file.path);
      });

      res.json({
        message: "Application deleted successfully",
      });
    });
  });
};

// Lets the client confirm a stored token is still valid and refresh the cached
// profile, instead of trusting whatever localStorage happens to hold.
const getCurrentUser = (req, res) => {
  const sql = `
    SELECT id, fullname, school_id_number, email, course_year, contact_number, avatar_path, role
    FROM users
    WHERE id = ?
    LIMIT 1
  `;

  db.query(sql, [req.user.id], (err, rows) => {
    if (err) {
      console.log("Current User Fetch Error:", err);
      return res.status(500).json({ message: "Failed to load your account" });
    }

    if (rows.length === 0) {
      return res.status(401).json({
        message: "Your account no longer exists. Please log in again.",
        code: "UNAUTHENTICATED",
      });
    }

    const user = rows[0];

    return res.json({
      user: {
        id: user.id,
        name: user.fullname,
        schoolIdNumber: user.school_id_number,
        email: user.email,
        courseYear: user.course_year,
        contactNumber: user.contact_number,
        avatarPath: user.avatar_path,
        role: user.role,
      },
    });
  });
};

// Mints the short-lived, single-application token used by download links.
// The ownership check happens here, once, rather than on every file request.
const getApplicationFileToken = (req, res) => {
  const { id } = req.params;

  db.query(
    "SELECT user_id, email FROM applications WHERE id = ? LIMIT 1",
    [id],
    (err, rows) => {
      if (err) {
        console.log("File Token Lookup Error:", err);
        return res.status(500).json({ message: "Failed to prepare the file link" });
      }

      if (rows.length === 0) {
        return res.status(404).json({ message: "Application not found" });
      }

      if (!canAccessApplication(req.user, rows[0])) {
        return res.status(403).json({
          message: "You do not have permission to view this file.",
        });
      }

      return res.json({
        token: auth.signFileToken({ userId: req.user.id, applicationId: id }),
        expiresInSeconds: 300,
      });
    }
  );
};

const requireAuthOrFileToken = (req, res, next) => {
  if (req.user) return next();

  if (auth.verifyFileToken(req.query.token, req.params.id)) {
    // A valid scoped token is itself the proof of access: it is only issued
    // after getApplicationFileToken has checked ownership for this exact id.
    req.fileTokenGranted = true;
    return next();
  }

  return res.status(401).json({
    message: "Please log in to continue.",
    code: "UNAUTHENTICATED",
  });
};

// Surfaces multer's limits as a clean 400 instead of an unhandled throw.
const uploadApplicationFiles = (req, res, next) => {
  applicationUpload.fields([
    { name: "attachment", maxCount: 1 },
    { name: "attachments", maxCount: 10 },
  ])(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        message:
          err.code === "LIMIT_FILE_SIZE"
            ? "Each requirement file must be under 10 MB."
            : err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE"
              ? "You can upload up to 10 requirement files."
              : err.message || "Unable to upload your files",
      });
    }

    return next();
  });
};

// ------------------------------------------------------------------
// Routes
// ------------------------------------------------------------------
// Every endpoint is declared once, under /api, with the guard it needs. The
// previous version registered each route twice — once bare, once prefixed —
// which doubled the surface that had to be secured and made it easy to protect
// one copy and forget the other.
const api = express.Router();

// Public: no session needed.
api.post("/register", registerUser);
api.post("/login", loginUser);
api.post("/password/forgot", requestPasswordReset);
api.post("/password/reset", resetPassword);

// Signed in, any role.
api.get("/me", requireAuth, getCurrentUser);
api.post("/password/change", requireAuth, changePassword);
api.put("/users/profile", requireAuth, updateUserProfile);
api.put("/users/avatar", requireAuth, uploadAvatarPhoto, updateUserAvatar);
api.post("/users/avatar", requireAuth, uploadAvatarPhoto, updateUserAvatar);
api.get("/scholarships", requireAuth, getScholarships);
api.get("/announcements", requireAuth, getAnnouncements);

// Students file and track their own applications.
api.post("/applications", requireRole("Student"), uploadApplicationFiles, createApplication);
api.get("/applications/student", requireAuth, getStudentApplications);

// Owner or admin. The file routes also accept a scoped ?token= because browsers
// cannot attach an Authorization header to <a href> or <img src>.
api.get("/applications/:id/file-token", requireAuth, getApplicationFileToken);
api.get("/applications/:id/file", requireAuthOrFileToken, getApplicationFile);
api.get(
  "/applications/:id/files/download",
  requireAuthOrFileToken,
  getApplicationFilesArchive
);

// Admin only.
api.get("/applications", requireRole("Admin"), getApplications);
api.put("/applications/:id/status", requireRole("Admin"), updateApplicationStatus);
api.delete("/applications/:id", requireRole("Admin"), deleteApplication);
api.post("/scholarships", requireRole("Admin"), createScholarship);
api.put("/scholarships/:id", requireRole("Admin"), updateScholarship);
api.delete("/scholarships/:id", requireRole("Admin"), deleteScholarship);
api.post("/announcements", requireRole("Admin"), createAnnouncement);
api.put("/announcements/:id", requireRole("Admin"), updateAnnouncement);
api.get("/admin/dashboard-stats", requireRole("Admin"), getAdminDashboardStats);
api.get("/admin/recent-activity", requireRole("Admin"), getAdminRecentActivity);

app.use("/api", api);

// Avatars used to be served straight off disk. They now live in Supabase
// Storage, so the same public URL shape is kept and proxied through instead —
// that way the client's getUploadUrl() needs no change.
//
// Only avatars are served here. This route used to hand out any object key,
// including applications/<student>/…, which meant a guessed or shared URL
// exposed another student's uploaded documents to anyone. Those now go through
// /api/applications/:id/file, which checks ownership.
app.get("/uploads/*objectPath", (req, res) => {
  const objectPath = Array.isArray(req.params.objectPath)
    ? req.params.objectPath.join("/")
    : req.params.objectPath || "";

  if (!objectPath || objectPath.includes("..")) {
    return res.status(404).json({ message: "File not found" });
  }

  if (!objectPath.startsWith("avatars/")) {
    return res.status(404).json({ message: "File not found" });
  }

  return storage
    .getObject(objectPath)
    .then((object) => {
      if (!object) {
        return res.status(404).json({ message: "File not found" });
      }

      res.setHeader("Content-Type", object.contentType);
      res.setHeader("Cache-Control", "public, max-age=300");
      return res.send(object.buffer);
    })
    .catch((storageErr) => {
      console.log("Upload Fetch Error:", storageErr.message);
      return res.status(500).json({ message: "Failed to load file" });
    });
});

app.use(express.static(clientDistPath));
app.get(/.*/, serveClientApp, (req, res) => {
  res.status(404).json({
    message: "Not found",
  });
});

// Last stop for anything thrown or passed to next(). Without it Express prints
// a stack trace into the response body, which tells an attacker about the file
// layout and dependency versions.
// eslint-disable-next-line no-unused-vars -- Express detects a handler as an
// error handler by its arity, so `next` must stay in the signature.
app.use((err, req, res, next) => {
  if (err?.message === "Origin not allowed by CORS") {
    return res.status(403).json({ message: "This origin is not allowed to call the API." });
  }

  if (err?.type === "entity.too.large") {
    return res.status(413).json({ message: "That request was too large." });
  }

  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ message: "That request body was not valid JSON." });
  }

  console.log("Unhandled Error:", err?.stack || err);

  return res.status(500).json({ message: "Something went wrong. Please try again." });
});

// Vercel imports this module and drives it as a serverless function, so the
// listener only starts when the file is run directly (local dev, or any plain
// Node host).
if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
  });
}

module.exports = app;
