// Must run before ./auth, ./storage and ./mailer are required: each of them
// reads its configuration from process.env at module load, so requiring them
// first leaves JWT_SECRET and the Supabase keys empty and sign-in always 500s.
require("dotenv").config();

const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const { Pool, types } = require("pg");
const path = require("path");
const multer = require("multer");
const storage = require("./storage");
const auth = require("./auth");
const mailer = require("./mailer");
const analytics = require("./analytics");
// The rules the app refuses on. Kept in their own module so they can be unit
// tested without a database or an HTTP request; see server/rules.test.js.
const rules = require("./rules");

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
  withdrawn_applications: 0,
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

// Requirement files are handed straight back to the coordinator through
// /api/applications/:id/file, so any format the browser executes in this
// app's origin - HTML, SVG, anything scriptable - is a stored cross-site
// scripting payload aimed at the person reviewing the application. The
// allowlist is the formats a scholarship office actually receives.
//
// The browser declares this type, so it is the first gate rather than the
// only one: getApplicationFile refuses to render anything outside this set
// inline, which also covers the files uploaded before this list existed.
const ALLOWED_APPLICATION_FILE_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const APPLICATION_FILE_TYPE_MESSAGE =
  "Requirement files must be PDF, Word, or image files (JPG, PNG, HEIC, WEBP).";

const applicationUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    // The form posts one application form plus up to ten requirement files,
    // and fields() already caps each of those. This is the backstop for a
    // request that does not come from the form at all.
    files: 11,
  },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_APPLICATION_FILE_TYPES.has(file.mimetype)) {
      const typeError = new Error(APPLICATION_FILE_TYPE_MESSAGE);
      typeError.code = "LIMIT_UNSUPPORTED_FILE_TYPE";
      return cb(typeError);
    }

    return cb(null, true);
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

// Adding documents to an application that already exists. Separate from
// uploadApplicationFiles because there is no application form to accept here -
// index 0 of the file list is the form and it is not the student's to replace.
const uploadAdditionalDocuments = (req, res, next) => {
  applicationUpload.array("attachments", rules.MAX_APPLICATION_FILES)(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        message:
          err.code === "LIMIT_FILE_SIZE"
            ? "Each requirement file must be under 10 MB."
            : err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE"
              ? `You can upload up to ${rules.MAX_APPLICATION_FILES} requirement files.`
              : err.message || "Unable to upload your files",
      });
    }

    return next();
  });
};

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

// A stored JSON column that cannot be parsed is a damaged row, not a reason to
// fail the request that happened to read it.
const safeJsonParse = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
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

// Every TIMESTAMP column (no zone) holds UTC wall-clock time: CURRENT_TIMESTAMP
// comes from a UTC database session and the API pins user-entered times to
// UTC before writing. pg's default parser reads them in the *process* zone,
// which is fine on Netlify (UTC) but shifted a dev machine's created_at and
// publish_at by its whole offset. Tag the text as UTC before parsing instead.
types.setTypeParser(1114, (value) => (value ? new Date(`${value.replace(" ", "T")}Z`) : null));

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

// `afterAdd` runs only when the column was genuinely missing and has just been
// created. That distinction matters for a backfill: email_verified_at has to
// treat the accounts that existed before verification did as already verified,
// but running the same UPDATE on a later boot would silently verify every
// address that has not confirmed yet.
const ensureColumn = (columnName, definition, afterAdd) => {
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
          return;
        }

        if (afterAdd) {
          db.query(afterAdd, (backfillErr) => {
            if (backfillErr) {
              console.log(`Backfill failed for ${columnName}:`, backfillErr);
            }
          });
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
    ensureScholarshipColumn("category", "VARCHAR(40)");
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
    // Where a pending application is in the office's review. The final
    // Approved/Rejected answer stays in status; this only says how far the
    // review has got before it.
    ensureApplicationColumn("review_stage", "VARCHAR(20) NOT NULL DEFAULT 'Submitted'");
    ensureApplicationColumn("created_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP");

    // Analytics and reporting. Everything the dashboards group, filter or
    // predict on hangs off these eight columns: without a term an
    // application cannot be counted per semester, and without a recorded
    // grade the renewal prediction has nothing to read.
    ensureApplicationColumn("academic_year", "VARCHAR(20)");
    ensureApplicationColumn("semester", "VARCHAR(30)");
    ensureApplicationColumn("program", "VARCHAR(120)");
    ensureApplicationColumn("application_type", "VARCHAR(20) NOT NULL DEFAULT 'New'");
    ensureApplicationColumn("gpa", "NUMERIC(4,2)");
    ensureApplicationColumn("award_amount", "NUMERIC(12,2)");
    ensureApplicationColumn("disbursed_at", "TIMESTAMP NULL DEFAULT NULL");
    ensureApplicationColumn("documents_json", "TEXT");

    // Withdrawal is the student's own action, so it is recorded separately
    // from status_updated_at, which means "when a coordinator last decided".
    ensureApplicationColumn("withdrawn_at", "TIMESTAMP NULL DEFAULT NULL");
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

    // Scheduling and audience. Both times stay NULL for the common case -
    // post it now, leave it up - so existing rows keep behaving exactly as
    // they did.
    ensureAnnouncementColumn("audience", "VARCHAR(20) NOT NULL DEFAULT 'All'");
    ensureAnnouncementColumn("publish_at", "TIMESTAMP NULL DEFAULT NULL");
    ensureAnnouncementColumn("expires_at", "TIMESTAMP NULL DEFAULT NULL");
    ensureAnnouncementColumn("created_by", "INT");
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

const createEmailVerificationTable = () => {
  const sql = `
    CREATE TABLE IF NOT EXISTS email_verification_tokens (
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
      console.log("Email Verification Table Create Error:", err);
      return;
    }

    db.query(
      "CREATE INDEX IF NOT EXISTS idx_verify_token_hash ON email_verification_tokens (token_hash)",
      (indexErr) => {
        if (indexErr) console.log("Verify token index error:", indexErr.message);
      }
    );
  });
};

// Throttling counters live in the database rather than in process memory: each
// Netlify function instance has its own memory, so an in-process counter would
// reset whenever the platform spun up another one.
//
// This replaces login_attempts. Sign-in was never the only endpoint worth a
// ceiling - registration and the password-reset request both cost an email and
// both were unlimited - so the identifier is namespaced by action and one table
// counts them all.
const createRateLimitsTable = () => {
  const sql = `
    CREATE TABLE IF NOT EXISTS rate_limits (
      identifier VARCHAR(220) PRIMARY KEY,
      attempts INT NOT NULL DEFAULT 0,
      first_attempt_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      locked_until TIMESTAMP
    )
  `;

  db.query(sql, (err) => {
    if (err) console.log("Rate Limits Table Create Error:", err);
  });
};

// Only the read state is stored. The notifications themselves are derived from
// announcements and applications, which are already rows; what could not be
// derived was whether a person had seen one.
const createNotificationReadsTable = () => {
  const sql = `
    CREATE TABLE IF NOT EXISTS notification_reads (
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      notification_key VARCHAR(120) NOT NULL,
      read_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, notification_key)
    )
  `;

  db.query(sql, (err) => {
    if (err) console.log("Notification Reads Table Create Error:", err);
  });
};

const createAuditLogTable = () => {
  const sql = `
    CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY,
      actor_id INT REFERENCES users(id) ON DELETE SET NULL,
      actor_email VARCHAR(150),
      actor_role VARCHAR(50),
      action VARCHAR(60) NOT NULL,
      entity_type VARCHAR(40) NOT NULL,
      entity_id VARCHAR(40),
      summary TEXT NOT NULL,
      metadata_json TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  db.query(sql, (err) => {
    if (err) {
      console.log("Audit Log Table Create Error:", err);
      return;
    }

    db.query(
      "CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log (created_at DESC)",
      (indexErr) => {
        if (indexErr) console.log("Audit log index error:", indexErr.message);
      }
    );

    db.query(
      "CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log (entity_type, entity_id)",
      (indexErr) => {
        if (indexErr) console.log("Audit entity index error:", indexErr.message);
      }
    );
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
    // The bootstrap admin is verified on creation: there is nobody to send it
    // a confirmation link and no one to click it.
    const sql = `
      INSERT INTO users (fullname, email, password, role, email_verified_at)
      VALUES (?, ?, ?, 'Admin', CURRENT_TIMESTAMP)
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

    // Account administration. Deactivation replaces deletion, because a
    // deleted account orphans the applications, awards and audit entries
    // that point back at it.
    ensureColumn("is_active", "BOOLEAN NOT NULL DEFAULT TRUE");
    ensureColumn("deactivated_at", "TIMESTAMP NULL DEFAULT NULL");

    // Every account that existed before this column did is grandfathered as
    // verified, once, at the moment the column is added. Doing it here rather
    // than in a standalone UPDATE is what keeps it from re-running later and
    // marking genuinely unverified addresses as confirmed.
    ensureColumn(
      "email_verified_at",
      "TIMESTAMP NULL DEFAULT NULL",
      "UPDATE users SET email_verified_at = COALESCE(created_at, CURRENT_TIMESTAMP)"
    );

    createScholarshipsTable();
    createApplicationsTable();
    createAnnouncementsTable();
    createPasswordResetTable();
    createEmailVerificationTable();
    createRateLimitsTable();
    createNotificationReadsTable();
    createAuditLogTable();
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
// These live in rules.js so they can be tested on their own; the names are
// kept here so every call site reads the same as it always did.
const { EMAIL_PATTERN, describePasswordProblem } = rules;

// A campus that wants registration limited to its own addresses sets
// ALLOWED_EMAIL_DOMAINS=university.edu.ph,students.university.edu.ph. Left
// unset the check is skipped entirely rather than guessing a domain, because
// guessing wrong locks every student out of a new deployment.
const ALLOWED_EMAIL_DOMAINS = String(process.env.ALLOWED_EMAIL_DOMAINS || "")
  .split(",")
  .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
  .filter(Boolean);

// Verification gates *filing an application*, not signing in. A student who
// mistypes their address has to be able to get in and correct it, and locking
// them out of the account is how that becomes a support ticket instead.
const REQUIRE_EMAIL_VERIFICATION = process.env.REQUIRE_EMAIL_VERIFICATION !== "false";

const VERIFICATION_TOKEN_HOURS = 24;

// Issues a fresh confirmation link and invalidates any earlier one, so a
// forwarded old email cannot still be redeemed. Never throws at the caller: a
// registration that succeeded must not be reported as failed because the mail
// provider was down.
const issueEmailVerification = async ({ id, email, fullname }) => {
  try {
    const { rawToken, tokenHash } = auth.createResetToken();

    await runQuery(
      "UPDATE email_verification_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND used_at IS NULL",
      [id]
    );

    await runQuery(
      `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
       VALUES (?, ?, CURRENT_TIMESTAMP + INTERVAL '${VERIFICATION_TOKEN_HOURS} hours')`,
      [id, tokenHash]
    );

    const delivery = await mailer.sendEmailVerificationEmail({
      to: email,
      name: fullname,
      rawToken,
    });

    return { sent: Boolean(delivery?.sent) };
  } catch (err) {
    console.log("Email Verification Issue Error:", err.message);
    return { sent: false };
  }
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

  const emailProblem = rules.describeEmailProblem(cleanEmail, {
    allowedDomains: ALLOWED_EMAIL_DOMAINS,
  });

  if (emailProblem) {
    return res.status(400).json({ message: emailProblem });
  }

  const passwordProblem = describePasswordProblem(cleanPassword);

  if (passwordProblem) {
    return res.status(400).json({ message: passwordProblem });
  }

  // Counted before the account is written, and counted on every attempt rather
  // than only on failures: here the request itself is the cost, because each
  // one writes a row and sends a confirmation email.
  try {
    if (await isThrottled("register", req, res, cleanEmail)) return undefined;

    await recordThrottledAttempt("register", throttleIdentifier("register", req, cleanEmail));
  } catch (throttleErr) {
    // A counter that cannot be read must not stop people registering.
    console.log("Registration Throttle Error:", throttleErr.message);
  }

  let passwordHash;

  try {
    passwordHash = await auth.hashPassword(cleanPassword);
  } catch (hashErr) {
    console.log("Registration Hash Error:", hashErr.message);
    return res.status(500).json({ message: "Registration Failed" });
  }

  // email_verified_at stays NULL until the link is clicked. With verification
  // switched off the account is stamped verified immediately, so the rest of
  // the app has one thing to read rather than two.
  const sql = `
    INSERT INTO users
      (fullname, school_id_number, email, course_year, contact_number, password, role, email_verified_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ${REQUIRE_EMAIL_VERIFICATION ? "NULL" : "CURRENT_TIMESTAMP"})
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
        emailVerified: !REQUIRE_EMAIL_VERIFICATION,
      };

      let token;

      try {
        token = auth.signToken({ id: newUser.id, email: newUser.email, role });
      } catch (tokenErr) {
        console.log("Registration Token Error:", tokenErr.message);
        return res.status(500).json({ message: serverMisconfiguredMessage });
      }

      // The account exists either way. Whether the confirmation email actually
      // went out is reported honestly rather than assumed, so the client can
      // say "check your inbox" or "ask the office to confirm you" instead of
      // promising mail that a missing API key means was never sent.
      if (!REQUIRE_EMAIL_VERIFICATION) {
        return res.status(201).json({
          message: "Registration Successful",
          token,
          user: newUser,
          emailVerificationSent: false,
        });
      }

      return issueEmailVerification({
        id: newUser.id,
        email: cleanEmail,
        fullname: cleanFullname,
      }).then(({ sent }) =>
        res.status(201).json({
          message: "Registration Successful",
          token,
          user: newUser,
          emailVerificationSent: sent,
        })
      );
    }
  );
};

const runQuery = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });

// ------------------------------------------------------------------
// Throttling
// ------------------------------------------------------------------
// Sign-in was the only endpoint with a ceiling, which left the three that cost
// real money or real mail wide open: registration writes a row and sends a
// confirmation, and the password-reset request sends an email for every call it
// receives whether or not the address exists.
//
// One counter table serves them all, namespaced by action. What is counted
// differs by endpoint and is decided at the call site: login counts *failures*,
// because a person signing in correctly fifty times is not an attack, while
// registration and the mail endpoints count *every* request, because there the
// request itself is the cost.
const THROTTLE_POLICIES = {
  login: { max: 8, windowMinutes: 15, lockoutMinutes: 15 },
  register: { max: 5, windowMinutes: 60, lockoutMinutes: 60 },
  "password-forgot": { max: 5, windowMinutes: 60, lockoutMinutes: 60 },
  "password-reset": { max: 10, windowMinutes: 60, lockoutMinutes: 60 },
  "email-verify": { max: 8, windowMinutes: 60, lockoutMinutes: 60 },
};

const DEFAULT_THROTTLE_POLICY = { max: 10, windowMinutes: 15, lockoutMinutes: 15 };

const getThrottlePolicy = (action) => THROTTLE_POLICIES[action] || DEFAULT_THROTTLE_POLICY;

const getClientIp = (req) =>
  (req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim();

// Counting per address *and* per IP together is deliberate: keying on the
// address alone lets one machine walk a list of addresses, and keying on the IP
// alone locks out a whole campus NAT.
const throttleIdentifier = (action, req, key = "") =>
  `${action}:${key}|${getClientIp(req)}`.slice(0, 220);

// Returns the number of seconds left on a lockout, or 0 when the caller may try.
const getLockoutSeconds = async (identifier) => {
  const rows = await runQuery(
    `SELECT locked_until FROM rate_limits
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

// The window and lockout are interpolated because Postgres will not take a
// placeholder inside an INTERVAL literal. They come from the table above and
// are coerced to numbers here, so nothing a caller sends can reach the string.
const recordThrottledAttempt = async (action, identifier) => {
  const policy = getThrottlePolicy(action);
  const windowMinutes = Number(policy.windowMinutes);
  const lockoutMinutes = Number(policy.lockoutMinutes);

  await runQuery(
    `INSERT INTO rate_limits (identifier, attempts, first_attempt_at)
     VALUES (?, 1, CURRENT_TIMESTAMP)
     ON CONFLICT (identifier) DO UPDATE SET
       attempts = CASE
         WHEN rate_limits.first_attempt_at < CURRENT_TIMESTAMP - INTERVAL '${windowMinutes} minutes'
         THEN 1
         ELSE rate_limits.attempts + 1
       END,
       first_attempt_at = CASE
         WHEN rate_limits.first_attempt_at < CURRENT_TIMESTAMP - INTERVAL '${windowMinutes} minutes'
         THEN CURRENT_TIMESTAMP
         ELSE rate_limits.first_attempt_at
       END
     RETURNING identifier`,
    [identifier]
  );

  await runQuery(
    `UPDATE rate_limits
     SET locked_until = CURRENT_TIMESTAMP + INTERVAL '${lockoutMinutes} minutes'
     WHERE identifier = ? AND attempts >= ?`,
    [identifier, Number(policy.max)]
  );
};

const clearThrottledAttempts = (identifier) =>
  runQuery("DELETE FROM rate_limits WHERE identifier = ?", [identifier]);

// Answers the request itself when the caller is locked out, and returns true so
// the handler can stop. The message never says whether the account exists,
// which would turn a ceiling into an enumeration oracle.
const isThrottled = async (action, req, res, key, message) => {
  const identifier = throttleIdentifier(action, req, key);
  const lockoutSeconds = await getLockoutSeconds(identifier);

  if (lockoutSeconds <= 0) return false;

  const minutes = Math.ceil(lockoutSeconds / 60);

  res.status(429).json({
    success: false,
    message:
      message ||
      `Too many requests. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
  });

  return true;
};

// ------------------------------------------------------------------
// Audit trail
// ------------------------------------------------------------------
// Every write a coordinator makes leaves an entry here. status_updated_at
// answered "when" and nothing answered "who", which is the first question asked
// about any award.
//
// Writing the entry never fails the action it describes: an award that was
// granted stays granted even if the log line could not be stored, and the
// failure is logged instead. The alternative - refusing an approval because an
// audit insert timed out - is worse for the student and no safer.
const recordAudit = (
  req,
  { action, entityType, entityId, summary, metadata }
) => {
  const sql = `
    INSERT INTO audit_log
      (actor_id, actor_email, actor_role, action, entity_type, entity_id, summary, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(
    sql,
    [
      req.user?.id ?? null,
      req.user?.email ?? null,
      req.user?.role ?? null,
      action,
      entityType,
      entityId == null ? null : String(entityId),
      summary,
      metadata ? JSON.stringify(metadata) : null,
    ],
    (err) => {
      if (err) console.log("Audit Write Error:", err.message);
    }
  );
};

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

  const identifier = throttleIdentifier("login", req, cleanEmail);

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
      `SELECT id, fullname, school_id_number, email, course_year, contact_number, avatar_path,
              password, role, is_active, email_verified_at
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
      await recordThrottledAttempt("login", identifier);
      return res.status(401).json({
        success: false,
        message: "Incorrect email or password. Please try again.",
      });
    }

    if (user.role !== cleanRole) {
      await recordThrottledAttempt("login", identifier);
      return res.status(403).json({
        success: false,
        message: `This account is registered as ${user.role}`,
      });
    }

    // Checked after the password, not before it. Answering "this account is
    // deactivated" to anyone who types the address would confirm the address
    // exists; answering it only once the password is right tells the person
    // who owns the account what they need to know and nobody else.
    if (user.is_active === false) {
      await clearThrottledAttempts(identifier);
      return res.status(403).json({
        success: false,
        message:
          "This account has been deactivated. Contact the scholarship office if you think that is a mistake.",
        code: "ACCOUNT_DEACTIVATED",
      });
    }

    await clearThrottledAttempts(identifier);

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
        emailVerified: Boolean(user.email_verified_at),
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

  // This endpoint sends an email for every call it accepts, whether or not the
  // address exists, so the ceiling has to count requests rather than failures.
  // It is applied before the lookup for the same reason the reply is generic:
  // doing it afterwards would make the response time itself say whether the
  // account exists.
  try {
    if (
      await isThrottled(
        "password-forgot",
        req,
        res,
        cleanEmail,
        "Too many password reset requests. Please wait an hour and try again, or contact the scholarship office."
      )
    ) {
      return undefined;
    }

    await recordThrottledAttempt(
      "password-forgot",
      throttleIdentifier("password-forgot", req, cleanEmail)
    );
  } catch (throttleErr) {
    console.log("Password Reset Throttle Error:", throttleErr.message);
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

  // A reset token is 32 random bytes, so this is not really guessable - the
  // ceiling is here to stop the attempt costing a scrypt hash per request,
  // which is the expensive half of this handler.
  try {
    if (await isThrottled("password-reset", req, res, "")) return undefined;
  } catch (throttleErr) {
    console.log("Password Reset Redeem Throttle Error:", throttleErr.message);
  }

  try {
    const rows = await runQuery(
      `SELECT id, user_id FROM password_reset_tokens
       WHERE token_hash = ? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
       LIMIT 1`,
      [auth.hashResetToken(rawToken)]
    );

    if (rows.length === 0) {
      await recordThrottledAttempt(
        "password-reset",
        throttleIdentifier("password-reset", req, "")
      );

      return res.status(400).json({
        message: "This reset link has expired or was already used. Please request a new one.",
      });
    }

    const { id: tokenId, user_id: userId } = rows[0];
    const passwordHash = await auth.hashPassword(newPassword);

    // Redeeming the link proves the person reads mail at that address, which is
    // exactly what verification asks. Confirming it here spares a student who
    // arrived through an invite or a reset from a second round trip, and it is
    // what makes an admin-created account usable the moment its owner sets a
    // password.
    await runQuery(
      `UPDATE users
       SET password = ?, email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP)
       WHERE id = ?`,
      [passwordHash, userId]
    );
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

// ------------------------------------------------------------------
// Email verification
// ------------------------------------------------------------------
// Anyone could register with anybody's address, which matters here beyond the
// usual reasons: status emails go to the address on the application, so an
// unverified one means a decision about somebody's scholarship is mailed to a
// stranger.
//
// Public, because the person clicking the link in their inbox may not be signed
// in - most will click it on a phone that has never seen this app.
const verifyEmailAddress = async (req, res) => {
  const rawToken = String(req.body?.token || "").trim();

  if (!rawToken) {
    return res.status(400).json({ message: "This confirmation link is not valid." });
  }

  try {
    if (await isThrottled("email-verify", req, res, "")) return undefined;

    const rows = await runQuery(
      `SELECT t.id, t.user_id, u.email, u.fullname, u.email_verified_at
       FROM email_verification_tokens t
       JOIN users u ON u.id = t.user_id
       WHERE t.token_hash = ? AND t.used_at IS NULL AND t.expires_at > CURRENT_TIMESTAMP
       LIMIT 1`,
      [auth.hashResetToken(rawToken)]
    );

    if (rows.length === 0) {
      await recordThrottledAttempt(
        "email-verify",
        throttleIdentifier("email-verify", req, "")
      );

      return res.status(400).json({
        message:
          "This confirmation link has expired or was already used. Sign in and ask for a new one.",
      });
    }

    const record = rows[0];

    // COALESCE keeps the first confirmation time rather than overwriting it if
    // an older link is opened afterwards.
    await runQuery(
      "UPDATE users SET email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP) WHERE id = ?",
      [record.user_id]
    );
    await runQuery(
      "UPDATE email_verification_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?",
      [record.id]
    );

    return res.json({
      message: "Your email address is confirmed. You can now submit applications.",
      email: record.email,
      alreadyVerified: Boolean(record.email_verified_at),
    });
  } catch (err) {
    console.log("Email Verification Error:", err);
    return res.status(500).json({
      message: "Failed to confirm that address. Please try again.",
    });
  }
};

const resendEmailVerification = async (req, res) => {
  try {
    if (
      await isThrottled(
        "email-verify",
        req,
        res,
        String(req.user.id),
        "Too many confirmation emails requested. Please wait an hour and try again."
      )
    ) {
      return undefined;
    }

    const rows = await runQuery(
      "SELECT id, email, fullname, email_verified_at FROM users WHERE id = ? LIMIT 1",
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "That account no longer exists." });
    }

    const user = rows[0];

    if (user.email_verified_at) {
      return res.json({
        message: "That address is already confirmed.",
        emailVerified: true,
        sent: false,
      });
    }

    await recordThrottledAttempt(
      "email-verify",
      throttleIdentifier("email-verify", req, String(req.user.id))
    );

    const { sent } = await issueEmailVerification(user);

    return res.json({
      message: sent
        ? `A new confirmation link is on its way to ${user.email}.`
        : "The confirmation email could not be sent. Ask the scholarship office to confirm your address.",
      emailVerified: false,
      sent,
    });
  } catch (err) {
    console.log("Email Verification Resend Error:", err);
    return res.status(500).json({ message: "Failed to send that confirmation email." });
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
    SELECT id, scholarship_code, category, title, description, benefits, qualification, requirements, available_slots, deadline, status, created_at
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

// Mirrors client/src/scholarshipCategories.js. Anything else is stored as no
// category rather than as free text the student filter would never match.
const SCHOLARSHIP_CATEGORIES = ["TDP", "Barangay Scholar", "LGU Scholar"];

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
    category,
  } = req.body;
  const cleanScholarshipCode = (scholarshipCode || scholarship_code || "").trim();
  const cleanCategory = SCHOLARSHIP_CATEGORIES.includes(category) ? category : null;
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
    INSERT INTO scholarships (scholarship_code, title, description, benefits, qualification, requirements, available_slots, deadline, status, category)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      cleanCategory,
    ],
    (err, result) => {
      if (err) {
        console.log("Scholarship Create Error:", err);
        return res.status(500).json({
          message: "Failed to create scholarship",
        });
      }

      recordAudit(req, {
        action: "scholarship.create",
        entityType: "scholarship",
        entityId: result.insertId,
        summary: `Created the scholarship "${cleanTitle}" with ${cleanAvailableSlots} slot${
          cleanAvailableSlots === 1 ? "" : "s"
        }`,
        metadata: { deadline: cleanDeadline, status: cleanStatus },
      });

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
          category: cleanCategory,
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
    category,
  } = req.body;
  const cleanScholarshipCode = (scholarshipCode || scholarship_code || "").trim();
  const cleanCategory = SCHOLARSHIP_CATEGORIES.includes(category) ? category : null;
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

  // The slot count and the status are the two fields worth reconstructing
  // later - "who reopened this" and "who added four slots" are questions the
  // office does ask - so the previous values are read before they are
  // overwritten. RETURNING would give the new row, not the old one.
  const sql = `
    UPDATE scholarships
    SET scholarship_code = ?, title = ?, description = ?, benefits = ?, qualification = ?, requirements = ?, available_slots = ?, deadline = ?, status = ?, category = ?
    WHERE id = ?
    RETURNING id
  `;

  db.query(
    "SELECT title, available_slots, status, deadline FROM scholarships WHERE id = ? LIMIT 1",
    [id],
    (lookupErr, previousRows) => {
      const previous = lookupErr ? null : previousRows[0];

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
          cleanCategory,
          id,
        ],
        (err, rows) => {
          if (err) {
            console.log("Scholarship Update Error:", err);
            return res.status(500).json({
              message: "Failed to update scholarship",
            });
          }

          if (rows.length === 0) {
            return res.status(404).json({
              message: "Scholarship not found",
            });
          }

          const changes = [];

          if (previous && Number(previous.available_slots) !== cleanAvailableSlots) {
            changes.push(`slots ${previous.available_slots} to ${cleanAvailableSlots}`);
          }

          if (previous && previous.status !== cleanStatus) {
            changes.push(`status ${previous.status} to ${cleanStatus}`);
          }

          if (previous && previous.deadline !== cleanDeadline) {
            changes.push(`deadline ${previous.deadline} to ${cleanDeadline}`);
          }

          recordAudit(req, {
            action: "scholarship.update",
            entityType: "scholarship",
            entityId: id,
            summary: `Edited "${cleanTitle}"${
              changes.length > 0 ? `: ${changes.join(", ")}` : ""
            }`,
            metadata: previous
              ? {
                  before: {
                    availableSlots: previous.available_slots,
                    status: previous.status,
                    deadline: previous.deadline,
                  },
                  after: {
                    availableSlots: cleanAvailableSlots,
                    status: cleanStatus,
                    deadline: cleanDeadline,
                  },
                }
              : null,
          });

          return res.json({
            message: "Scholarship updated successfully",
          });
        }
      );
    }
  );
};

const deleteScholarship = (req, res) => {
  const { id } = req.params;

  // RETURNING gives the title back in the same round trip, so the audit entry
  // can name the scholarship that no longer exists to be looked up.
  db.query(
    "DELETE FROM scholarships WHERE id = ? RETURNING title, available_slots",
    [id],
    (err, rows) => {
      if (err) {
        console.log("Scholarship Delete Error:", err);
        return res.status(500).json({
          message: "Failed to delete scholarship",
        });
      }

      if (rows.length === 0) {
        return res.status(404).json({
          message: "Scholarship not found",
        });
      }

      recordAudit(req, {
        action: "scholarship.delete",
        entityType: "scholarship",
        entityId: id,
        summary: `Deleted the scholarship "${rows[0].title}"`,
        metadata: { availableSlots: rows[0].available_slots },
      });

      return res.json({
        message: "Scholarship deleted successfully",
      });
    }
  );
};

// An announcement used to be a title, a body and nothing else: visible to
// everybody the moment it was written, forever. There was no way to schedule
// one, no way to aim one at staff only, and no way to take a wrong one down -
// it could be edited but never removed.
//
// The window is filtered in SQL for students so an announcement that has not
// gone out yet never reaches the browser. An admin gets every row, because the
// page they manage announcements on has to show the scheduled and expired ones
// or they could never be edited.
const ANNOUNCEMENT_COLUMNS =
  "id, title, content, audience, publish_at, expires_at, created_by, created_at";

const describeAnnouncementWindow = (row, now = Date.now()) => {
  if (row.publish_at && new Date(row.publish_at).getTime() > now) return "Scheduled";
  if (row.expires_at && new Date(row.expires_at).getTime() <= now) return "Expired";
  return "Live";
};

const getAnnouncements = (req, res) => {
  const isAdmin = req.user?.role === "Admin";
  const conditions = [];
  const values = [];

  if (!isAdmin) {
    conditions.push("(publish_at IS NULL OR publish_at <= CURRENT_TIMESTAMP)");
    conditions.push("(expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)");
    conditions.push("(audience = 'All' OR audience = ?)");
    // 'Students' / 'Admins' - the audience column names the plural.
    values.push(`${req.user?.role || "Student"}s`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const sql = `
    SELECT ${ANNOUNCEMENT_COLUMNS}
    FROM announcements
    ${whereClause}
    ORDER BY COALESCE(publish_at, created_at) DESC, id DESC
  `;

  db.query(sql, values, (err, rows) => {
    if (err) {
      console.log("Announcements Fetch Error:", err);
      return res.status(500).json({
        message: "Failed to load announcements",
      });
    }

    const now = Date.now();

    // Polled every few seconds by the announcements page. A cached copy from
    // the browser or the CDN would be exactly the stale list being polled to
    // get rid of.
    res.setHeader("Cache-Control", "no-store");
    res.json(
      rows.map((row) => ({
        ...row,
        // Only an admin sees this; for everyone else every row is Live by
        // construction, because the query already removed the others.
        window_state: describeAnnouncementWindow(row, now),
      }))
    );
  });
};

// A blank string from an empty date input has to become NULL rather than an
// invalid timestamp, so "no schedule" keeps meaning "post it now, leave it up".
const cleanTimestamp = (value) => {
  const raw = String(value || "").trim();

  if (!raw) return null;

  const parsed = new Date(raw);

  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const createAnnouncement = (req, res) => {
  const { title, content, audience, publishAt, expiresAt } = req.body;
  const cleanTitle = (title || "").trim() || "Announcement";
  const cleanContent = (content || "").trim();
  const cleanAudience = (audience || "All").trim();
  const cleanPublishAt = cleanTimestamp(publishAt);
  const cleanExpiresAt = cleanTimestamp(expiresAt);

  const problem = rules.describeAnnouncementProblem({
    content: cleanContent,
    audience: cleanAudience,
    publishAt: cleanPublishAt,
    expiresAt: cleanExpiresAt,
  });

  if (problem) {
    return res.status(problem.status).json({ message: problem.message });
  }

  const sql = `
    INSERT INTO announcements (title, content, audience, publish_at, expires_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  db.query(
    sql,
    [
      cleanTitle,
      cleanContent,
      cleanAudience,
      cleanPublishAt,
      cleanExpiresAt,
      req.user?.id ?? null,
    ],
    (err, result) => {
      if (err) {
        console.log("Announcement Create Error:", err);
        return res.status(500).json({
          message: "Failed to post announcement",
        });
      }

      recordAudit(req, {
        action: "announcement.create",
        entityType: "announcement",
        entityId: result.insertId,
        summary: `Posted the announcement "${cleanTitle}" to ${cleanAudience}`,
        metadata: { publishAt: cleanPublishAt, expiresAt: cleanExpiresAt },
      });

      res.status(201).json({
        message: cleanPublishAt
          ? "Announcement scheduled successfully"
          : "Announcement posted successfully",
        announcement: {
          id: result.insertId,
          title: cleanTitle,
          content: cleanContent,
          audience: cleanAudience,
          publish_at: cleanPublishAt,
          expires_at: cleanExpiresAt,
          window_state: describeAnnouncementWindow({
            publish_at: cleanPublishAt,
            expires_at: cleanExpiresAt,
          }),
        },
      });
    }
  );
};

const updateAnnouncement = (req, res) => {
  const { id } = req.params;
  const { title, content, audience, publishAt, expiresAt } = req.body;
  const cleanTitle = (title || "").trim() || "Announcement";
  const cleanContent = (content || "").trim();
  const cleanAudience = (audience || "All").trim();
  const cleanPublishAt = cleanTimestamp(publishAt);
  const cleanExpiresAt = cleanTimestamp(expiresAt);

  const problem = rules.describeAnnouncementProblem({
    content: cleanContent,
    audience: cleanAudience,
    publishAt: cleanPublishAt,
    expiresAt: cleanExpiresAt,
  });

  if (problem) {
    return res.status(problem.status).json({ message: problem.message });
  }

  const sql = `
    UPDATE announcements
    SET title = ?, content = ?, audience = ?, publish_at = ?, expires_at = ?
    WHERE id = ?
  `;

  db.query(
    sql,
    [cleanTitle, cleanContent, cleanAudience, cleanPublishAt, cleanExpiresAt, id],
    (err, result) => {
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

      recordAudit(req, {
        action: "announcement.update",
        entityType: "announcement",
        entityId: id,
        summary: `Edited the announcement "${cleanTitle}"`,
        metadata: {
          audience: cleanAudience,
          publishAt: cleanPublishAt,
          expiresAt: cleanExpiresAt,
        },
      });

      res.json({
        message: "Announcement updated successfully",
        announcement: {
          id: Number(id),
          title: cleanTitle,
          content: cleanContent,
          audience: cleanAudience,
          publish_at: cleanPublishAt,
          expires_at: cleanExpiresAt,
          window_state: describeAnnouncementWindow({
            publish_at: cleanPublishAt,
            expires_at: cleanExpiresAt,
          }),
        },
      });
    }
  );
};

// An announcement genuinely goes away. Unlike an account or an application it
// carries no history anybody needs later - a wrong or obsolete notice on every
// student's screen is a live problem, and "edit it to say something else" was
// the only remedy the app had.
const deleteAnnouncement = (req, res) => {
  const { id } = req.params;

  db.query(
    "DELETE FROM announcements WHERE id = ? RETURNING title",
    [id],
    (err, rows) => {
      if (err) {
        console.log("Announcement Delete Error:", err);
        return res.status(500).json({ message: "Failed to delete announcement" });
      }

      if (rows.length === 0) {
        return res.status(404).json({ message: "Announcement not found" });
      }

      recordAudit(req, {
        action: "announcement.delete",
        entityType: "announcement",
        entityId: id,
        summary: `Deleted the announcement "${rows[0].title}"`,
      });

      return res.json({ message: "Announcement deleted successfully" });
    }
  );
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

  // This is where verification is enforced, rather than at sign-in. A decision
  // on this application is emailed to the address on it, so an unconfirmed one
  // means somebody else is told the outcome of this student's scholarship.
  // Blocking the submission says that at the moment it matters; blocking the
  // login would only lock a student out of the page where they fix the address.
  if (REQUIRE_EMAIL_VERIFICATION) {
    try {
      const accountRows = await runQuery(
        "SELECT email_verified_at FROM users WHERE id = ? LIMIT 1",
        [cleanUserId]
      );

      if (!accountRows[0]?.email_verified_at) {
        return res.status(403).json({
          message:
            "Confirm your email address before submitting an application. Check your inbox for the confirmation link, or ask for a new one from your profile menu.",
          code: "EMAIL_NOT_VERIFIED",
        });
      }
    } catch (verifyErr) {
      // A lookup that fails is a database problem, not a verdict on the
      // student. Refusing here would be the same as saying they are
      // unverified, which is a claim this handler cannot make.
      console.log("Application Verification Check Error:", verifyErr.message);
    }
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
    // The deadline is compared against the campus calendar date, not the
    // database's. Postgres runs in UTC, so a plain CURRENT_DATE would close
    // every scholarship eight hours early for the students applying to it.
    const scholarshipColumns = `
      id,
      title,
      status,
      deadline,
      (deadline < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date) AS past_deadline
    `;
    const scholarshipLookupSql = cleanScholarshipId
      ? `SELECT ${scholarshipColumns} FROM scholarships WHERE id = ? LIMIT 1`
      : `SELECT ${scholarshipColumns} FROM scholarships WHERE title = ? LIMIT 1`;
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

      // The client hides a closed scholarship, but hiding a card is not a
      // rule. The form posts an id, and every id used to be accepted: an
      // application could be filed against a scholarship the office closed
      // months ago and it would sit in the queue as though it were live.
      const availabilityProblem = rules.describeScholarshipAvailability(scholarship);

      if (availabilityProblem) {
        cleanupUploadedFiles();
        return res.status(availabilityProblem.status).json({
          message: availabilityProblem.message,
        });
      }

      const resolvedScholarshipId = scholarship.id;
      const resolvedScholarshipTitle = scholarship.title;
      const sql = `
        INSERT INTO applications
          (user_id, student_name, school_id_number, email, course_year, contact_number, scholarship_id, scholarship_title, status, remarks, uploaded_file_name, uploaded_file_path, uploaded_file_type, uploaded_file_size, uploaded_files_json, academic_year, semester, program, application_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending Review', 'Waiting for admin review.', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      // Stamp the term and programme at submission rather than leaving
      // them null. Without a term an application falls into "Unassigned
      // term" and drops out of every per-semester chart until someone
      // edits it by hand; the calendar answer is right almost always, and
      // the coordinator can correct the rest from Manage Applicants.
      const submissionTerm = analytics.termForDate();
      // A renewal is anyone who has applied for this scholarship before.
      // The same pass finds the applications that make this submission a
      // duplicate, which is a narrower question than "has applied before":
      //
      //   pending           - one is already in the queue, so a second is
      //                       the same request twice
      //   approvedThisTerm  - they already hold this scholarship for the
      //                       term they are applying for
      //
      // A rejected application counts for neither, so a student who was
      // turned down can apply again; an approval from an earlier term
      // counts for neither either, which is what keeps renewals working.
      //
      // A withdrawn application counts for neither either, which is the whole
      // point of allowing withdrawal: a student who files by mistake can take
      // it back and file again rather than asking the office to delete a row.
      const priorApplicationsSql = `
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'Pending Review') AS pending,
          COUNT(*) FILTER (
            WHERE status = 'Approved'
              AND academic_year = ?
              AND semester = ?
          ) AS approved_this_term
        FROM applications
        WHERE scholarship_id = ? AND (user_id = ? OR LOWER(email) = ?)
      `;

      return db.query(
        priorApplicationsSql,
        [
          submissionTerm.academicYear,
          submissionTerm.semester,
          resolvedScholarshipId,
          hasUserId ? cleanUserId : null,
          normalizeEmail(cleanEmail),
        ],
        (priorErr, priorRows) => {
          if (priorErr) {
            // A failed lookup must not block the application itself; the
            // type simply defaults to New and can be corrected later.
            console.log("Application Renewal Lookup Error:", priorErr);
          }

          const priorCounts = priorRows?.[0] || {};
          const duplicateProblem = priorErr
            ? null
            : rules.describeDuplicateApplication(priorCounts, submissionTerm);

          if (duplicateProblem) {
            cleanupUploadedFiles();
            return res.status(duplicateProblem.status).json({
              message: duplicateProblem.message,
            });
          }

          const applicationType = priorErr
            ? "New"
            : rules.resolveApplicationType(priorCounts);

          return db.query(
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
              submissionTerm.academicYear,
              submissionTerm.semester,
              analytics.programFromCourseYear(cleanCourseYear),
              applicationType,
            ],
            (err, result) => {
              if (err) {
                console.log("Application Submit Error:", err);
                cleanupUploadedFiles();
                return res.status(500).json({
                  message: "Failed to submit application",
                });
              }

              // Submitting takes no slot. A slot is an award and an award is
              // decided at approval, so the counter moves in
              // updateApplicationStatus. Charging one here meant fifty
              // hopefuls emptied a ten-slot grant before the office had
              // opened a single file, and a rejection never gave it back.
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
            }
          );
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

  // One scholarship's list (TDP, TES, ...). Matched by id; applications filed
  // before scholarship_id existed only carry the title.
  const scholarshipId = Number.parseInt(req.query.scholarshipId, 10);

  if (Number.isInteger(scholarshipId) && scholarshipId > 0) {
    conditions.push(
      "(a.scholarship_id = ? OR (a.scholarship_id IS NULL AND a.scholarship_title = (SELECT title FROM scholarships WHERE id = ?)))"
    );
    values.push(scholarshipId, scholarshipId);
  }

  // New scholar = first application to that scholarship; old scholar = a
  // renewal. Anything not marked Renewal counts as new, the column default.
  const scholarType = String(req.query.scholarType || "").trim();

  if (scholarType === "Old") {
    conditions.push("LOWER(COALESCE(a.application_type, 'New')) = 'renewal'");
  } else if (scholarType === "New") {
    conditions.push("LOWER(COALESCE(a.application_type, 'New')) <> 'renewal'");
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // The status tallies are counted here, over the whole filtered set, rather
  // than in the client over the rows it happens to be holding - the client
  // only ever has one page, so counting there reported "16 disapproved of
  // 160" when it meant 16 on this page.
  const countSql = `
    SELECT COUNT(*) AS total,
      COUNT(*) FILTER (WHERE a.status = 'Pending Review') AS pending,
      COUNT(*) FILTER (WHERE a.status = 'Rejected') AS rejected,
      COUNT(*) FILTER (WHERE a.status = 'Approved') AS approved,
      COUNT(*) FILTER (WHERE LOWER(COALESCE(a.application_type, 'New')) = 'renewal') AS old_scholars
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
    const statusCounts = {
      pending: Number(countRows[0]?.pending) || 0,
      rejected: Number(countRows[0]?.rejected) || 0,
      approved: Number(countRows[0]?.approved) || 0,
      oldScholars: Number(countRows[0]?.old_scholars) || 0,
      newScholars: total - (Number(countRows[0]?.old_scholars) || 0),
    };
    const sql = `
      SELECT a.id, a.student_name, a.school_id_number, a.email, a.course_year, a.contact_number,
        a.scholarship_id, s.scholarship_code, COALESCE(NULLIF(a.scholarship_title, ''), s.title) AS scholarship_title,
        a.status, a.remarks, a.uploaded_file_name, a.uploaded_file_path, a.uploaded_file_type, a.uploaded_file_size, a.uploaded_files_json, a.status_updated_at, a.created_at,
        a.academic_year, a.semester, a.program, a.application_type, a.gpa, a.award_amount, a.disbursed_at, a.documents_json,
        a.review_stage, s.requirements
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
        statusCounts,
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
      a.status, a.remarks, a.uploaded_file_name, a.uploaded_file_path, a.uploaded_file_type, a.uploaded_file_size, a.uploaded_files_json, a.status_updated_at, a.created_at,
      a.academic_year, a.semester, a.program, a.application_type, a.gpa, a.award_amount, a.disbursed_at,
      a.review_stage
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

// available_slots counts awards still to be given, so exactly one thing moves
// it: an application entering or leaving the Approved state.
//
// The guard and the decrement are a single statement on purpose. Reading the
// count, deciding, then writing it would let two coordinators approving the
// last slot at the same moment both read 1 and both approve; here the second
// UPDATE matches no row and is told the scholarship is full.
const claimScholarshipSlot = (scholarshipId, done) =>
  db.query(
    `UPDATE scholarships
     SET available_slots = available_slots - 1
     WHERE id = ? AND available_slots > 0`,
    [scholarshipId],
    (err, result) => done(err, !err && result.affectedRows > 0)
  );

// Returns a slot to the pool when an approval is undone or deleted. Failing
// to give a slot back is worth logging but never worth failing the request
// the coordinator actually made.
const releaseScholarshipSlot = (scholarshipId, done = () => {}) =>
  db.query(
    "UPDATE scholarships SET available_slots = available_slots + 1 WHERE id = ?",
    [scholarshipId],
    (err) => {
      if (err) console.log("Scholarship Slot Release Error:", err);
      done(err);
    }
  );

// Moves a pending application along Submitted -> Checking -> Evaluation. Only
// a pending one: once it is approved, rejected or withdrawn the outcome is the
// last step, and rewinding the stage behind it would make the tracker lie.
const REVIEW_STAGES = ["Submitted", "Checking", "Evaluation"];

const updateApplicationStage = (req, res) => {
  const applicationId = Number.parseInt(req.params.id, 10);
  const stage = String(req.body?.stage || "").trim();

  if (!Number.isInteger(applicationId)) {
    return res.status(404).json({ message: "Application not found" });
  }

  if (!REVIEW_STAGES.includes(stage)) {
    return res.status(400).json({ message: "Invalid review stage" });
  }

  db.query(
    `UPDATE applications
     SET review_stage = ?, status_updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'Pending Review'
     RETURNING id, student_name, scholarship_title`,
    [stage, applicationId],
    (err, rows) => {
      if (err) {
        console.log("Application Stage Update Error:", err);
        return res.status(500).json({ message: "Failed to update the review stage" });
      }

      if (rows.length === 0) {
        return res.status(409).json({
          message: "Only a pending application can be moved to another review stage.",
        });
      }

      recordAudit(req, {
        action: "application.stage",
        entityType: "application",
        entityId: applicationId,
        summary: `Moved ${rows[0].student_name}'s ${rows[0].scholarship_title} application to ${stage}`,
        metadata: { stage },
      });

      return res.json({ message: `Application moved to ${stage}`, review_stage: stage });
    }
  );
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

  // "Withdrawn" is absent from this list on purpose: it is the student's own
  // action, reached through their own endpoint. A coordinator who needs a
  // withdrawn application back in the queue sets it to Pending Review, which
  // reads correctly in the audit trail as the office reopening it.
  if (!rules.ADMIN_SETTABLE_STATUSES.includes(cleanStatus)) {
    return res.status(400).json({
      message: "Invalid application status",
    });
  }

  // The row is read before it is written because a slot moves on the
  // *transition*, not on the new value: re-approving an already approved
  // application must not take a second slot.
  const lookupSql = `
    SELECT id, status, scholarship_id, student_name, email, scholarship_title
    FROM applications
    WHERE id = ?
    LIMIT 1
  `;

  db.query(lookupSql, [id], (lookupErr, rows) => {
    if (lookupErr) {
      console.log("Application Status Lookup Error:", lookupErr);
      return res.status(500).json({
        message: "Failed to update application status",
      });
    }

    if (rows.length === 0) {
      return res.status(404).json({
        message: "Application not found",
      });
    }

    const application = rows[0];
    const previousStatus = String(application.status || "").trim();
    const scholarshipId = application.scholarship_id;
    const { claims: isApproval, releases: isReversal } = rules.slotTransition(
      previousStatus,
      cleanStatus
    );

    const writeStatus = (onFailure) => {
      const sql = `
        UPDATE applications
        SET status = ?, remarks = ?, status_updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

      db.query(sql, [cleanStatus, cleanRemarks, id], (err, result) => {
        if (err || result.affectedRows === 0) {
          if (err) console.log("Application Status Update Error:", err);
          onFailure();

          return err
            ? res.status(500).json({ message: "Failed to update application status" })
            : res.status(404).json({ message: "Application not found" });
        }

        if (isReversal && scholarshipId) {
          releaseScholarshipSlot(scholarshipId);
        }

        // Who decided, and what it changed from. status_updated_at already
        // answered "when"; this is the half that was missing when anyone asked
        // who approved an award.
        recordAudit(req, {
          action: "application.status",
          entityType: "application",
          entityId: id,
          summary: `Set ${application.student_name}'s application for ${application.scholarship_title} from ${previousStatus} to ${cleanStatus}`,
          metadata: {
            from: previousStatus,
            to: cleanStatus,
            remarks: cleanRemarks,
            slotClaimed: isApproval,
            slotReleased: isReversal,
          },
        });

        // The admin's response must not wait on, or fail because of, the email.
        if (cleanStatus !== "Pending Review") {
          mailer
            .sendApplicationStatusEmail({
              to: application.email,
              name: application.student_name,
              scholarshipTitle: application.scholarship_title,
              status: cleanStatus,
              remarks: cleanRemarks,
            })
            .catch((mailErr) => console.log("Status Email Error:", mailErr.message));
        }

        res.json({
          message: `Application ${cleanStatus.toLowerCase()} successfully`,
        });
      });
    };

    if (!isApproval || !scholarshipId) {
      return writeStatus(() => {});
    }

    return claimScholarshipSlot(scholarshipId, (slotErr, claimed) => {
      if (slotErr) {
        console.log("Scholarship Slot Claim Error:", slotErr);
        return res.status(500).json({
          message: "Failed to update application status",
        });
      }

      if (!claimed) {
        return res.status(409).json({
          message:
            "This scholarship has no slots left. Update its slot count in Manage Scholarship before approving another applicant.",
        });
      }

      // The slot was taken a statement early. If the status write then fails
      // it has to go back, or the scholarship quietly loses an award.
      return writeStatus(() => releaseScholarshipSlot(scholarshipId));
    });
  });
};

const getAdminDashboardStats = (req, res) => {
  // Withdrawn applications are excluded from the headline count rather than
  // quietly swelling it. A form the student took back before anyone read it is
  // not an application this office received, and leaving it in would make the
  // total drift away from the four figures printed underneath it.
  const sql = `
    SELECT
      (SELECT COUNT(*) FROM applications WHERE LOWER(TRIM(status)) <> 'withdrawn') AS total_applicants,
      (SELECT COUNT(*) FROM applications WHERE LOWER(TRIM(status)) = 'approved') AS approved_students,
      (SELECT COUNT(*) FROM applications WHERE LOWER(TRIM(status)) = 'pending review') AS pending_applications,
      (SELECT COUNT(*) FROM applications WHERE LOWER(TRIM(status)) = 'rejected') AS disapproved_applications,
      (SELECT COUNT(*) FROM applications WHERE LOWER(TRIM(status)) = 'withdrawn') AS withdrawn_applications,
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
      withdrawn_applications: Number(stats.withdrawn_applications) || 0,
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

        // Files stored before the upload allowlist existed are still in
        // Storage, and an HTML or SVG among them would run in this app's
        // origin the moment a coordinator opened it. Anything outside the
        // allowlist is served as an opaque download instead of being
        // rendered; nosniff stops the browser overriding the header.
        const declaredType = selectedFile.type || object.contentType || "";
        const canRenderInline = ALLOWED_APPLICATION_FILE_TYPES.has(declaredType);

        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader(
          "Content-Type",
          canRenderInline ? declaredType : "application/octet-stream"
        );
        res.setHeader(
          "Content-Disposition",
          `${shouldDownload || !canRenderInline ? "attachment" : "inline"}; filename="${fileName}"`
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
    SELECT status, scholarship_id, student_name, email, scholarship_title,
           uploaded_file_name, uploaded_file_path, uploaded_file_type, uploaded_file_size,
           uploaded_files_json
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
    const heldASlot =
      String(rows[0].status || "").trim() === "Approved" && rows[0].scholarship_id;

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

      // Deleting an approved application ends the award, so its slot goes
      // back to the pool the same way reversing the approval would.
      if (heldASlot) {
        releaseScholarshipSlot(rows[0].scholarship_id);
      }

      // The row is gone, so the audit entry is the only surviving record that
      // it ever existed. It names the student and the scholarship rather than
      // just the id, which would point at nothing afterwards.
      recordAudit(req, {
        action: "application.delete",
        entityType: "application",
        entityId: id,
        summary: `Deleted ${rows[0].student_name}'s ${rows[0].status} application for ${rows[0].scholarship_title}`,
        metadata: {
          email: rows[0].email,
          status: rows[0].status,
          slotReleased: Boolean(heldASlot),
          fileCount: uploadedFiles.length,
        },
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
    SELECT id, fullname, school_id_number, email, course_year, contact_number, avatar_path,
           role, is_active, email_verified_at
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

    // A deactivated account can still be holding a signed token that has not
    // expired yet. The client calls this on load, so answering 401 here is what
    // actually ends the session rather than waiting up to eight hours for the
    // token to lapse.
    if (user.is_active === false) {
      return res.status(401).json({
        message: "This account has been deactivated. Please contact the scholarship office.",
        code: "UNAUTHENTICATED",
      });
    }

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
        emailVerified: Boolean(user.email_verified_at),
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
// Notifications
// ------------------------------------------------------------------
// The feed is derived, not stored. An item is an announcement or a decision on
// an application, and both of those are already rows; duplicating them into a
// notifications table would mean two places to keep in step and a second thing
// to get wrong when a status changes.
//
// What could not be derived was whether a person had *seen* one, which is why
// the bell could never clear. Only that is stored, in notification_reads.
//
// The key carries the status as well as the id ("application-88-Approved"), so
// a later decision on the same application arrives as a new unread item rather
// than inheriting the read state of the one before it.
const NOTIFICATION_FEED_LIMIT = 50;

const buildAnnouncementNotifications = (rows) =>
  rows.map((row) => ({
    key: `announcement-${row.id}`,
    type: "Announcement",
    title: row.title,
    body: row.content,
    created_at: row.publish_at || row.created_at,
  }));

const buildStudentApplicationNotifications = (rows) =>
  rows
    .filter((row) => {
      const status = String(row.status || "").trim();
      // A pending application is not news to the person who just filed it.
      return status !== "Pending Review";
    })
    .map((row) => ({
      key: `application-${row.id}-${String(row.status).trim()}`,
      type: "Application",
      title:
        row.status === "Withdrawn"
          ? `You withdrew your application for ${row.scholarship_title}`
          : `Your application for ${row.scholarship_title} was ${String(
              row.status
            ).toLowerCase()}`,
      body: row.remarks || "",
      created_at: row.withdrawn_at || row.status_updated_at || row.created_at,
      applicationId: row.id,
      status: row.status,
    }));

// An admin's feed is the queue, not their own applications: what arrived, and
// what left before they got to it. Previously admins had no notifications page
// at all, so a new application announced itself only if someone reloaded the
// applicants list.
const buildAdminApplicationNotifications = (rows) =>
  rows.map((row) => {
    const withdrawn = String(row.status || "").trim() === "Withdrawn";

    return {
      key: withdrawn ? `admin-withdrawn-${row.id}` : `admin-application-${row.id}`,
      type: "Application",
      title: withdrawn
        ? `${row.student_name} withdrew their application for ${row.scholarship_title}`
        : `${row.student_name} applied for ${row.scholarship_title}`,
      body: withdrawn ? row.remarks || "" : "Waiting for review.",
      created_at: withdrawn ? row.withdrawn_at || row.created_at : row.created_at,
      applicationId: row.id,
      status: row.status,
    };
  });

const loadNotificationFeed = async (user) => {
  const isAdmin = user.role === "Admin";

  const announcementRows = await runQuery(
    `SELECT id, title, content, publish_at, created_at
     FROM announcements
     WHERE (publish_at IS NULL OR publish_at <= CURRENT_TIMESTAMP)
       AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
       AND (audience = 'All' OR audience = ?)
     ORDER BY COALESCE(publish_at, created_at) DESC, id DESC
     LIMIT ?`,
    [`${user.role}s`, NOTIFICATION_FEED_LIMIT]
  );

  const applicationRows = isAdmin
    ? await runQuery(
        `SELECT id, student_name, scholarship_title, status, remarks, created_at, withdrawn_at
         FROM applications
         WHERE status IN ('Pending Review', 'Withdrawn')
         ORDER BY COALESCE(withdrawn_at, created_at) DESC, id DESC
         LIMIT ?`,
        [NOTIFICATION_FEED_LIMIT]
      )
    : await runQuery(
        // Scoped from the token. A student's own applications are never looked
        // up from an email in the query string.
        `SELECT id, scholarship_title, status, remarks, created_at, status_updated_at, withdrawn_at
         FROM applications
         WHERE user_id = ? OR (user_id IS NULL AND LOWER(email) = ?)
         ORDER BY COALESCE(withdrawn_at, status_updated_at, created_at) DESC, id DESC
         LIMIT ?`,
        [user.id, normalizeEmail(user.email), NOTIFICATION_FEED_LIMIT]
      );

  const items = [
    ...buildAnnouncementNotifications(announcementRows),
    ...(isAdmin
      ? buildAdminApplicationNotifications(applicationRows)
      : buildStudentApplicationNotifications(applicationRows)),
  ]
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, NOTIFICATION_FEED_LIMIT);

  const readRows = await runQuery(
    "SELECT notification_key FROM notification_reads WHERE user_id = ?",
    [user.id]
  );
  const readKeys = new Set(readRows.map((row) => row.notification_key));

  return items.map((item) => ({ ...item, read: readKeys.has(item.key) }));
};

const getNotifications = async (req, res) => {
  try {
    const items = await loadNotificationFeed(req.user);

    // Polled by the bell and the notifications page; never serve it from cache.
    res.setHeader("Cache-Control", "no-store");
    return res.json({
      notifications: items,
      unreadCount: items.filter((item) => !item.read).length,
    });
  } catch (err) {
    console.log("Notifications Fetch Error:", err);
    return res.status(500).json({ message: "Failed to load notifications" });
  }
};

const markNotificationsRead = async (req, res) => {
  const keys = Array.isArray(req.body?.keys)
    ? req.body.keys
        .map((key) => String(key || "").trim().slice(0, 120))
        .filter(Boolean)
        .slice(0, NOTIFICATION_FEED_LIMIT)
    : [];

  if (keys.length === 0) {
    return res.status(400).json({ message: "No notifications given to mark as read." });
  }

  try {
    // One statement rather than a loop: a person clearing the bell marks
    // everything on screen at once, and twenty round trips to do it would be
    // twenty chances for half of them to land.
    const placeholders = keys.map(() => "(?, ?)").join(", ");
    const values = keys.flatMap((key) => [req.user.id, key]);

    await runQuery(
      `INSERT INTO notification_reads (user_id, notification_key)
       VALUES ${placeholders}
       ON CONFLICT (user_id, notification_key) DO NOTHING
       RETURNING notification_key`,
      values
    );

    const items = await loadNotificationFeed(req.user);

    return res.json({
      message: "Marked as read.",
      unreadCount: items.filter((item) => !item.read).length,
    });
  } catch (err) {
    console.log("Notification Read Error:", err);
    return res.status(500).json({ message: "Failed to mark those as read." });
  }
};

// "Read everything" means everything currently in the feed, not a wildcard:
// an item that arrives a second later should still be unread.
const markAllNotificationsRead = async (req, res) => {
  try {
    const items = await loadNotificationFeed(req.user);
    const unread = items.filter((item) => !item.read);

    if (unread.length === 0) {
      return res.json({ message: "Nothing left to read.", unreadCount: 0 });
    }

    const placeholders = unread.map(() => "(?, ?)").join(", ");
    const values = unread.flatMap((item) => [req.user.id, item.key]);

    await runQuery(
      `INSERT INTO notification_reads (user_id, notification_key)
       VALUES ${placeholders}
       ON CONFLICT (user_id, notification_key) DO NOTHING
       RETURNING notification_key`,
      values
    );

    return res.json({ message: "All notifications marked as read.", unreadCount: 0 });
  } catch (err) {
    console.log("Notification Read All Error:", err);
    return res.status(500).json({ message: "Failed to mark those as read." });
  }
};

// ------------------------------------------------------------------
// What a student can do to their own application
// ------------------------------------------------------------------
// Previously: nothing. A form submitted by mistake could only be removed by an
// admin, and a document that came out unreadable could not be replaced at all -
// which made "your ID scan is blurry, send it again" a request the system had
// no answer to except delete the record and start over.
//
// Both actions are limited to an application still awaiting review, which is
// the window in which nothing has been decided yet. Once a coordinator has
// ruled, the file set is the evidence the ruling was made on and stops being
// the student's to edit.
const loadOwnedApplication = async (applicationId) => {
  const rows = await runQuery(
    `SELECT id, user_id, email, student_name, status, scholarship_id, scholarship_title,
            uploaded_file_name, uploaded_file_path, uploaded_file_type, uploaded_file_size,
            uploaded_files_json
     FROM applications
     WHERE id = ?
     LIMIT 1`,
    [applicationId]
  );

  return rows[0] || null;
};

const withdrawApplication = async (req, res) => {
  const applicationId = Number.parseInt(req.params.id, 10);

  if (!Number.isInteger(applicationId)) {
    return res.status(404).json({ message: "Application not found" });
  }

  try {
    const application = await loadOwnedApplication(applicationId);
    const problem = rules.describeWithdrawProblem(application, req.user);

    if (problem) {
      return res.status(problem.status).json({ message: problem.message });
    }

    const reason = String(req.body?.reason || "").trim().slice(0, 300);
    const remarks = reason
      ? `Withdrawn by the applicant: ${reason}`
      : "Withdrawn by the applicant.";

    // The WHERE clause repeats the status check the rule already made. Between
    // the read and this write a coordinator may have approved it, and losing
    // that decision to a withdrawal filed a second earlier would take back an
    // award that had already been granted.
    const result = await runQuery(
      `UPDATE applications
       SET status = 'Withdrawn', remarks = ?, withdrawn_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'Pending Review'`,
      [remarks, applicationId]
    );

    if (result.affectedRows === 0) {
      return res.status(409).json({
        message:
          "This application was reviewed a moment ago and can no longer be withdrawn. Refresh to see its status.",
      });
    }

    // No slot moves. Withdrawal is only reachable from Pending Review, and a
    // pending application never held one.
    recordAudit(req, {
      action: "application.withdraw",
      entityType: "application",
      entityId: applicationId,
      summary: `${application.student_name} withdrew their application for ${application.scholarship_title}`,
      metadata: { reason: reason || null },
    });

    mailer
      .sendApplicationWithdrawnEmail({
        to: application.email,
        name: application.student_name,
        scholarshipTitle: application.scholarship_title,
      })
      .catch((mailErr) => console.log("Withdrawal Email Error:", mailErr.message));

    return res.json({
      message:
        "Your application has been withdrawn. You can apply again while this scholarship is still open.",
      status: "Withdrawn",
    });
  } catch (err) {
    console.log("Application Withdraw Error:", err);
    return res.status(500).json({ message: "Failed to withdraw that application." });
  }
};

const addApplicationDocuments = async (req, res) => {
  const applicationId = Number.parseInt(req.params.id, 10);
  const incoming = Array.isArray(req.files) ? req.files : [];

  if (!Number.isInteger(applicationId)) {
    return res.status(404).json({ message: "Application not found" });
  }

  if (incoming.length === 0) {
    return res.status(400).json({ message: "Choose at least one file to upload." });
  }

  try {
    const application = await loadOwnedApplication(applicationId);
    const existingFiles = application ? parseUploadedFiles(application) : [];
    const problem = rules.describeDocumentChangeProblem(application, req.user, {
      existingCount: existingFiles.length,
      addedCount: incoming.length,
    });

    if (problem) {
      return res.status(problem.status).json({ message: problem.message });
    }

    // Uploaded first, then recorded. A storage write that fails must not leave
    // a row pointing at an object that is not there, which is the failure that
    // shows a student a document they cannot open.
    const storedFiles = [];

    for (const file of incoming) {
      const objectPath = buildApplicationObjectPath(
        application.student_name,
        file.originalname
      );

      // eslint-disable-next-line no-await-in-loop -- a student adds one or two
      // files at a time, and uploading them in sequence keeps the cleanup below
      // able to name exactly what was written.
      await storage.putObject(objectPath, file.buffer, file.mimetype);

      storedFiles.push({
        name: file.originalname,
        path: objectPath,
        type: file.mimetype,
        size: file.size,
      });
    }

    const nextFiles = [...existingFiles, ...storedFiles];

    const result = await runQuery(
      `UPDATE applications
       SET uploaded_files_json = ?
       WHERE id = ? AND status = 'Pending Review'`,
      [JSON.stringify(nextFiles), applicationId]
    );

    if (result.affectedRows === 0) {
      await Promise.all(
        storedFiles.map((file) =>
          storage.removeObject(file.path).catch(() => undefined)
        )
      );

      return res.status(409).json({
        message: "This application was reviewed a moment ago, so its documents are now final.",
      });
    }

    recordAudit(req, {
      action: "application.documents-add",
      entityType: "application",
      entityId: applicationId,
      summary: `${application.student_name} added ${storedFiles.length} document${
        storedFiles.length === 1 ? "" : "s"
      } to their application for ${application.scholarship_title}`,
      metadata: { files: storedFiles.map((file) => file.name) },
    });

    return res.status(201).json({
      message: `${storedFiles.length} document${storedFiles.length === 1 ? "" : "s"} added.`,
      uploaded_files: nextFiles,
    });
  } catch (err) {
    console.log("Application Documents Add Error:", err);
    return res.status(500).json({ message: "Failed to add those documents." });
  }
};

const removeApplicationDocument = async (req, res) => {
  const applicationId = Number.parseInt(req.params.id, 10);
  const index = Number.parseInt(req.params.index, 10);

  if (!Number.isInteger(applicationId)) {
    return res.status(404).json({ message: "Application not found" });
  }

  try {
    const application = await loadOwnedApplication(applicationId);
    const existingFiles = application ? parseUploadedFiles(application) : [];
    const problem = rules.describeDocumentRemovalProblem(application, req.user, {
      index,
      fileCount: existingFiles.length,
    });

    if (problem) {
      return res.status(problem.status).json({ message: problem.message });
    }

    const removed = existingFiles[index];
    const nextFiles = existingFiles.filter((_, position) => position !== index);

    const result = await runQuery(
      `UPDATE applications
       SET uploaded_files_json = ?
       WHERE id = ? AND status = 'Pending Review'`,
      [JSON.stringify(nextFiles), applicationId]
    );

    if (result.affectedRows === 0) {
      return res.status(409).json({
        message: "This application was reviewed a moment ago, so its documents are now final.",
      });
    }

    // The row is authoritative, so the object is deleted only after the row no
    // longer refers to it. Failing here leaves an orphaned object in the
    // bucket, which is cheap; the reverse leaves a broken link on a live
    // application, which is not.
    storage
      .removeObject(removed.path)
      .catch((storageErr) =>
        console.log("Application Document Remove Storage Error:", storageErr.message)
      );

    recordAudit(req, {
      action: "application.documents-remove",
      entityType: "application",
      entityId: applicationId,
      summary: `${application.student_name} removed "${removed.name}" from their application for ${application.scholarship_title}`,
    });

    return res.json({
      message: `"${removed.name}" was removed.`,
      uploaded_files: nextFiles,
    });
  } catch (err) {
    console.log("Application Document Remove Error:", err);
    return res.status(500).json({ message: "Failed to remove that document." });
  }
};

// ------------------------------------------------------------------
// Account administration
// ------------------------------------------------------------------
// There was no way to reach an account at all. An office could only ever have
// the one admin the ADMIN_PASSWORD bootstrap created: no second coordinator, no
// roster of who had registered, no way to reset a student's password for them
// and no way to retire a graduate.
//
// Nothing here deletes. An account is pointed at by its applications, its
// awards and its audit entries, so removing the row would orphan the record of
// who was given what; deactivating stops sign-in and leaves the history whole.
const USER_LIST_COLUMNS = `
  id, fullname, school_id_number, email, course_year, contact_number, avatar_path,
  role, is_active, email_verified_at, deactivated_at, created_at
`;

const mapUserRow = (row) => ({
  id: row.id,
  fullname: row.fullname,
  schoolIdNumber: row.school_id_number,
  email: row.email,
  courseYear: row.course_year,
  contactNumber: row.contact_number,
  avatarPath: row.avatar_path,
  role: row.role,
  isActive: row.is_active !== false,
  emailVerified: Boolean(row.email_verified_at),
  deactivatedAt: row.deactivated_at,
  createdAt: row.created_at,
  applicationCount: row.application_count == null ? null : Number(row.application_count),
});

const countActiveAdmins = async () => {
  const rows = await runQuery(
    "SELECT COUNT(*) AS total FROM users WHERE role = 'Admin' AND is_active IS NOT FALSE"
  );

  return Number(rows[0]?.total) || 0;
};

// Paged from the start rather than after it hurts: this is the one list that
// grows with the size of the student body.
const getUsers = async (req, res) => {
  const search = String(req.query.search || "").trim().slice(0, 120);
  const role = String(req.query.role || "").trim();
  const state = String(req.query.state || "").trim().toLowerCase();
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number.parseInt(req.query.pageSize, 10) || DEFAULT_PAGE_SIZE)
  );
  const offset = (page - 1) * pageSize;

  const conditions = [];
  const values = [];

  if (search) {
    conditions.push(
      "(LOWER(u.fullname) LIKE ? OR LOWER(u.email) LIKE ? OR LOWER(COALESCE(u.school_id_number, '')) LIKE ?)"
    );
    const pattern = `%${search.toLowerCase()}%`;
    values.push(pattern, pattern, pattern);
  }

  if (rules.USER_ROLES.includes(role)) {
    conditions.push("u.role = ?");
    values.push(role);
  }

  if (state === "active") conditions.push("u.is_active IS NOT FALSE");
  if (state === "inactive") conditions.push("u.is_active IS FALSE");
  if (state === "unverified") conditions.push("u.email_verified_at IS NULL");

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const countRows = await runQuery(
      `SELECT COUNT(*) AS total FROM users u ${whereClause}`,
      values
    );

    // The application count is what tells a coordinator whether an account is
    // safe to retire, so it is worth the correlated subquery on a page of 25.
    const rows = await runQuery(
      `SELECT ${USER_LIST_COLUMNS},
              (SELECT COUNT(*) FROM applications a WHERE a.user_id = u.id) AS application_count
       FROM users u
       ${whereClause}
       ORDER BY u.role ASC, u.fullname ASC, u.id ASC
       LIMIT ? OFFSET ?`,
      [...values, pageSize, offset]
    );

    const total = Number(countRows[0]?.total) || 0;

    return res.json({
      users: rows.map(mapUserRow),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      activeAdmins: await countActiveAdmins(),
    });
  } catch (err) {
    console.log("User List Error:", err);
    return res.status(500).json({ message: "Failed to load accounts" });
  }
};

// The admin never chooses the password. A coordinator who types one has to
// deliver it somehow - and it ends up in a chat message or on a sticky note -
// so the account is created with an unguessable placeholder and its owner sets
// the real password from a link mailed to the address itself.
const createUser = async (req, res) => {
  const fullname = String(req.body?.fullname || "").trim();
  const cleanEmail = normalizeEmail(req.body?.email);
  const role = String(req.body?.role || "Student").trim();
  const schoolIdNumber = String(req.body?.schoolIdNumber || "").trim();
  const courseYear = String(req.body?.courseYear || "").trim();
  const contactNumber = String(req.body?.contactNumber || "").trim();

  if (!fullname || !cleanEmail) {
    return res.status(400).json({ message: "A full name and email address are required." });
  }

  if (!rules.USER_ROLES.includes(role)) {
    return res.status(400).json({ message: "A role must be either Student or Admin." });
  }

  // The domain restriction is deliberately not applied here. It exists to keep
  // self-registration to the campus; a coordinator adding a colleague with an
  // external address is making a decision, not a mistake.
  if (!EMAIL_PATTERN.test(cleanEmail)) {
    return res.status(400).json({ message: "Please enter a valid email address." });
  }

  try {
    const placeholderHash = await auth.hashPassword(
      crypto.randomBytes(32).toString("hex")
    );

    const inserted = await runQuery(
      `INSERT INTO users
         (fullname, school_id_number, email, course_year, contact_number, password, role)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [
        fullname,
        schoolIdNumber,
        cleanEmail,
        courseYear,
        contactNumber,
        placeholderHash,
        role,
      ]
    );

    if (inserted.length === 0) {
      return res.status(409).json({
        message: `${cleanEmail} already has an account.`,
      });
    }

    const userId = inserted[0].id;

    // Same token type the reset flow uses, so redeeming it also confirms the
    // address - which is what makes the account usable the moment its owner
    // sets a password.
    const { rawToken, tokenHash } = auth.createResetToken();

    await runQuery(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES (?, ?, CURRENT_TIMESTAMP + INTERVAL '${RESET_TOKEN_MINUTES} minutes')`,
      [userId, tokenHash]
    );

    const mailResult = await mailer.sendAccountInviteEmail({
      to: cleanEmail,
      name: fullname,
      rawToken,
      role,
      invitedBy: req.user?.email,
    });

    if (!mailResult.sent) {
      console.log(
        `Account invite for ${cleanEmail} (email not sent: ${mailResult.reason}): /reset-password?token=${rawToken}`
      );
    }

    recordAudit(req, {
      action: "user.create",
      entityType: "user",
      entityId: userId,
      summary: `Created a ${role} account for ${cleanEmail}`,
      metadata: { role, inviteSent: mailResult.sent },
    });

    const rows = await runQuery(
      `SELECT ${USER_LIST_COLUMNS} FROM users u WHERE id = ? LIMIT 1`,
      [userId]
    );

    return res.status(201).json({
      message: mailResult.sent
        ? `Account created. ${cleanEmail} has been emailed a link to choose a password.`
        : `Account created, but the invitation email could not be sent. Use "Send password link" once email is configured.`,
      inviteSent: mailResult.sent,
      user: mapUserRow(rows[0]),
    });
  } catch (err) {
    console.log("User Create Error:", err);

    if (err.code === DUPLICATE_KEY_CODE) {
      return res.status(409).json({ message: `${cleanEmail} already has an account.` });
    }

    return res.status(500).json({ message: "Failed to create that account." });
  }
};

const updateUser = async (req, res) => {
  const targetId = Number.parseInt(req.params.id, 10);

  if (!Number.isInteger(targetId)) {
    return res.status(404).json({ message: "That account was not found." });
  }

  const changes = {};

  if (req.body?.fullname !== undefined) changes.fullname = String(req.body.fullname).trim();
  if (req.body?.role !== undefined) changes.role = String(req.body.role).trim();
  if (req.body?.isActive !== undefined) changes.isActive = Boolean(req.body.isActive);
  if (req.body?.schoolIdNumber !== undefined) {
    changes.schoolIdNumber = String(req.body.schoolIdNumber).trim();
  }
  if (req.body?.courseYear !== undefined) changes.courseYear = String(req.body.courseYear).trim();
  if (req.body?.contactNumber !== undefined) {
    changes.contactNumber = String(req.body.contactNumber).trim();
  }

  if (Object.keys(changes).length === 0) {
    return res.status(400).json({ message: "Nothing to change." });
  }

  if (changes.fullname !== undefined && !changes.fullname) {
    return res.status(400).json({ message: "A full name cannot be empty." });
  }

  try {
    const rows = await runQuery(
      `SELECT ${USER_LIST_COLUMNS} FROM users u WHERE id = ? LIMIT 1`,
      [targetId]
    );

    const target = rows[0];

    // The refusals live in rules.js: an admin cannot demote or deactivate
    // themselves, and the last active admin cannot be demoted or deactivated
    // by anyone. Both are the same failure - an office locked out of its own
    // system with no way back in from inside the app.
    const problem = rules.describeUserChangeProblem({
      actor: req.user,
      target,
      changes,
      activeAdminCount: await countActiveAdmins(),
    });

    if (problem) {
      return res.status(problem.status).json({ message: problem.message });
    }

    const assignments = [];
    const values = [];

    const setColumn = (column, value) => {
      assignments.push(`${column} = ?`);
      values.push(value);
    };

    if (changes.fullname !== undefined) setColumn("fullname", changes.fullname);
    if (changes.role !== undefined) setColumn("role", changes.role);
    if (changes.schoolIdNumber !== undefined) {
      setColumn("school_id_number", changes.schoolIdNumber);
    }
    if (changes.courseYear !== undefined) setColumn("course_year", changes.courseYear);
    if (changes.contactNumber !== undefined) setColumn("contact_number", changes.contactNumber);

    if (changes.isActive !== undefined) {
      setColumn("is_active", changes.isActive);
      assignments.push(
        changes.isActive ? "deactivated_at = NULL" : "deactivated_at = CURRENT_TIMESTAMP"
      );
    }

    values.push(targetId);

    await runQuery(`UPDATE users SET ${assignments.join(", ")} WHERE id = ?`, values);

    const describeChange = () => {
      const parts = [];

      if (changes.role !== undefined && changes.role !== target.role) {
        parts.push(`role ${target.role} to ${changes.role}`);
      }

      if (changes.isActive !== undefined && changes.isActive !== (target.is_active !== false)) {
        parts.push(changes.isActive ? "reactivated" : "deactivated");
      }

      if (parts.length === 0) parts.push("profile details");

      return parts.join(", ");
    };

    recordAudit(req, {
      action: "user.update",
      entityType: "user",
      entityId: targetId,
      summary: `Updated ${target.email}: ${describeChange()}`,
      metadata: {
        before: { role: target.role, isActive: target.is_active !== false },
        after: changes,
      },
    });

    const updated = await runQuery(
      `SELECT ${USER_LIST_COLUMNS},
              (SELECT COUNT(*) FROM applications a WHERE a.user_id = u.id) AS application_count
       FROM users u WHERE u.id = ? LIMIT 1`,
      [targetId]
    );

    return res.json({
      message: "Account updated.",
      user: mapUserRow(updated[0]),
    });
  } catch (err) {
    console.log("User Update Error:", err);
    return res.status(500).json({ message: "Failed to update that account." });
  }
};

// DELETE means deactivate. The verb is the one the client naturally reaches
// for and the effect is the reversible one; nothing in this app ever removes an
// account row.
const deactivateUser = (req, res) => {
  req.body = { isActive: false };
  return updateUser(req, res);
};

// Sends the account's owner a link. The coordinator never sees a password and
// never sees the token: it goes to the address on the account, so a
// coordinator cannot point a colleague's reset at their own inbox.
const sendUserPasswordLink = async (req, res) => {
  const targetId = Number.parseInt(req.params.id, 10);

  if (!Number.isInteger(targetId)) {
    return res.status(404).json({ message: "That account was not found." });
  }

  try {
    const rows = await runQuery(
      "SELECT id, fullname, email, is_active FROM users WHERE id = ? LIMIT 1",
      [targetId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "That account was not found." });
    }

    const target = rows[0];

    if (target.is_active === false) {
      return res.status(409).json({
        message: "That account is deactivated. Reactivate it before sending a password link.",
      });
    }

    const { rawToken, tokenHash } = auth.createResetToken();

    await runQuery(
      "UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND used_at IS NULL",
      [target.id]
    );

    await runQuery(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES (?, ?, CURRENT_TIMESTAMP + INTERVAL '${RESET_TOKEN_MINUTES} minutes')`,
      [target.id, tokenHash]
    );

    const mailResult = await mailer.sendPasswordResetEmail({
      to: target.email,
      name: target.fullname,
      rawToken,
    });

    if (!mailResult.sent) {
      console.log(
        `Password link for ${target.email} (email not sent: ${mailResult.reason}): /reset-password?token=${rawToken}`
      );
    }

    recordAudit(req, {
      action: "user.password-link",
      entityType: "user",
      entityId: target.id,
      summary: `Sent a password reset link to ${target.email}`,
      metadata: { sent: mailResult.sent },
    });

    return res.json({
      message: mailResult.sent
        ? `A password link is on its way to ${target.email}.`
        : "Email is not configured, so the link was written to the server log instead.",
      sent: mailResult.sent,
    });
  } catch (err) {
    console.log("User Password Link Error:", err);
    return res.status(500).json({ message: "Failed to send that password link." });
  }
};

// ------------------------------------------------------------------
// Audit trail
// ------------------------------------------------------------------
const getAuditLog = async (req, res) => {
  const entityType = String(req.query.entityType || "").trim();
  const entityId = String(req.query.entityId || "").trim();
  const action = String(req.query.action || "").trim();
  const search = String(req.query.search || "").trim().slice(0, 120);
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number.parseInt(req.query.pageSize, 10) || DEFAULT_PAGE_SIZE)
  );
  const offset = (page - 1) * pageSize;

  const conditions = [];
  const values = [];

  if (entityType) {
    conditions.push("entity_type = ?");
    values.push(entityType);
  }

  if (entityId) {
    conditions.push("entity_id = ?");
    values.push(entityId);
  }

  if (action) {
    conditions.push("action = ?");
    values.push(action);
  }

  if (search) {
    conditions.push("(LOWER(summary) LIKE ? OR LOWER(COALESCE(actor_email, '')) LIKE ?)");
    const pattern = `%${search.toLowerCase()}%`;
    values.push(pattern, pattern);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const countRows = await runQuery(
      `SELECT COUNT(*) AS total FROM audit_log ${whereClause}`,
      values
    );

    const rows = await runQuery(
      `SELECT id, actor_id, actor_email, actor_role, action, entity_type, entity_id,
              summary, metadata_json, created_at
       FROM audit_log
       ${whereClause}
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...values, pageSize, offset]
    );

    const total = Number(countRows[0]?.total) || 0;

    return res.json({
      entries: rows.map((row) => ({
        id: row.id,
        actorId: row.actor_id,
        actorEmail: row.actor_email,
        actorRole: row.actor_role,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        summary: row.summary,
        metadata: row.metadata_json ? safeJsonParse(row.metadata_json) : null,
        createdAt: row.created_at,
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (err) {
    console.log("Audit Log Read Error:", err);
    return res.status(500).json({ message: "Failed to load the audit trail" });
  }
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
// Public because the link is opened from an inbox, usually on a phone that has
// never signed in to this app.
api.post("/email/verify", verifyEmailAddress);

// Signed in, any role.
api.get("/me", requireAuth, getCurrentUser);
api.post("/password/change", requireAuth, changePassword);
api.post("/email/resend", requireAuth, resendEmailVerification);
api.put("/users/profile", requireAuth, updateUserProfile);
api.put("/users/avatar", requireAuth, uploadAvatarPhoto, updateUserAvatar);
api.post("/users/avatar", requireAuth, uploadAvatarPhoto, updateUserAvatar);
api.get("/scholarships", requireAuth, getScholarships);
api.get("/announcements", requireAuth, getAnnouncements);
// Both roles have a feed; an admin's is the review queue rather than their own
// applications, which is why there was no admin notifications page before.
api.get("/notifications", requireAuth, getNotifications);
api.post("/notifications/read", requireAuth, markNotificationsRead);
api.post("/notifications/read-all", requireAuth, markAllNotificationsRead);

// Students file and track their own applications.
api.post("/applications", requireRole("Student"), uploadApplicationFiles, createApplication);
api.get("/applications/student", requireAuth, getStudentApplications);

// A student's own corrections, all three limited to an application still
// awaiting review. Ownership is checked in the handler against the token, not
// by the guard, because "Student" is not the same claim as "this student".
api.post("/applications/:id/withdraw", requireRole("Student"), withdrawApplication);
api.post(
  "/applications/:id/documents",
  requireRole("Student"),
  uploadAdditionalDocuments,
  addApplicationDocuments
);
api.delete(
  "/applications/:id/documents/:index",
  requireRole("Student"),
  removeApplicationDocument
);

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
api.put("/applications/:id/stage", requireRole("Admin"), updateApplicationStage);
api.delete("/applications/:id", requireRole("Admin"), deleteApplication);
api.post("/scholarships", requireRole("Admin"), createScholarship);
api.put("/scholarships/:id", requireRole("Admin"), updateScholarship);
api.delete("/scholarships/:id", requireRole("Admin"), deleteScholarship);
api.post("/announcements", requireRole("Admin"), createAnnouncement);
api.put("/announcements/:id", requireRole("Admin"), updateAnnouncement);
api.delete("/announcements/:id", requireRole("Admin"), deleteAnnouncement);
api.get("/admin/dashboard-stats", requireRole("Admin"), getAdminDashboardStats);
api.get("/admin/recent-activity", requireRole("Admin"), getAdminRecentActivity);

// Account administration. These sit after /users/profile and /users/avatar
// above: Express matches in declaration order, so the literal paths have to be
// registered before "/users/:id" or "profile" would be read as an id.
api.get("/users", requireRole("Admin"), getUsers);
api.post("/users", requireRole("Admin"), createUser);
api.put("/users/:id", requireRole("Admin"), updateUser);
// DELETE deactivates. Nothing in this app removes an account row.
api.delete("/users/:id", requireRole("Admin"), deactivateUser);
api.post("/users/:id/password-link", requireRole("Admin"), sendUserPasswordLink);

api.get("/admin/audit-log", requireRole("Admin"), getAuditLog);

// Analytics is built as its own module and handed the three helpers it
// needs, so it can be exercised without standing up the whole server.
const analyticsRoutes = require("./analyticsRoutes")({
  runQuery,
  normalizeEmail,
  parseUploadedFiles,
  recordAudit,
});

api.get("/admin/analytics", requireRole("Admin"), analyticsRoutes.getAdminAnalytics);
// A student reads only their own analytics; the handler scopes every
// query to req.user rather than to anything in the query string.
api.get("/student/analytics", requireAuth, analyticsRoutes.getStudentAnalytics);
api.put(
  "/applications/:id/academics",
  requireRole("Admin"),
  analyticsRoutes.updateApplicationAcademics
);

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
