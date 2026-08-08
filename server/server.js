const express = require("express");
const cors = require("cors");
const { Pool, types } = require("pg");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
require("dotenv").config();

const app = express();
const PORT = Number(process.env.PORT) || 5001;
const HOST = "0.0.0.0";
const clientDistPath = path.join(__dirname, "..", "client", "dist");
const uploadRoot = path.join(__dirname, "uploads");
const applicationUploadDir = path.join(uploadRoot, "applications");
const avatarUploadDir = path.join(uploadRoot, "avatars");
const databaseUrl =
  process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL;
const databaseUrlConfig = (() => {
  if (!databaseUrl) return {};

  try {
    const parsedUrl = new URL(databaseUrl);

    return {
      host: parsedUrl.hostname,
      port: parsedUrl.port ? Number(parsedUrl.port) : undefined,
      user: decodeURIComponent(parsedUrl.username || ""),
      password: decodeURIComponent(parsedUrl.password || ""),
      database: parsedUrl.pathname.replace(/^\/+/, ""),
    };
  } catch (err) {
    console.log("Database URL parse error:", err.message);
    return {};
  }
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

app.use(cors());
app.use(express.json());

fs.mkdirSync(applicationUploadDir, { recursive: true });
fs.mkdirSync(avatarUploadDir, { recursive: true });

const sanitizeUploadPathPart = (value, fallback) => {
  const cleanedValue = String(value || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return cleanedValue || fallback;
};

const applicationStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const studentName = req.body?.studentName || req.body?.student_name;
    const studentFolder = sanitizeUploadPathPart(studentName, "unknown-student");
    const studentUploadDir = path.join(applicationUploadDir, studentFolder);

    fs.mkdirSync(studentUploadDir, { recursive: true });
    cb(null, studentUploadDir);
  },
  filename: (req, file, cb) => {
    const originalName = sanitizeUploadPathPart(
      path.basename(file.originalname || "application-file"),
      "attachment"
    );
    const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${suffix}-${originalName}`);
  },
});

const applicationUpload = multer({
  storage: applicationStorage,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(avatarUploadDir, { recursive: true });
    cb(null, avatarUploadDir);
  },
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname || "").toLowerCase();
    const baseName = sanitizeUploadPathPart(
      path.basename(file.originalname || "profile-photo", extension),
      "profile-photo"
    );
    const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${suffix}-${baseName}${extension || ".jpg"}`);
  },
});

const avatarUpload = multer({
  storage: avatarStorage,
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

const seedDefaultAdmin = () => {
  const sql = `
    INSERT INTO users (fullname, email, password, role)
    VALUES ('Admin User', 'admin@scholarhub.com', 'admin123', 'Admin')
    ON CONFLICT (email) DO UPDATE SET
      fullname = EXCLUDED.fullname,
      password = EXCLUDED.password,
      role = EXCLUDED.role
  `;

  db.query(sql, (err) => {
    if (err) {
      console.log("Default Admin Seed Error:", err);
      return;
    }

    console.log("Default admin account ready");
  });
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
    seedDefaultAdmin();

    console.log("Postgres connected and tables ready");
  });
};

pool.connect((err, connection, release) => {
  if (err) {
    console.log("Postgres Error:", err);
    return;
  }

  release();
  initializeDatabase();
});

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

app.get("/api/db-status", (req, res) => {
  const connectionInfo = {
    host: dbConfig.host || "(not set)",
    port: dbConfig.port,
    user: dbConfig.user || "(not set)",
    database: dbConfig.database,
    ssl: Boolean(dbConfig.ssl),
    passwordProvided: Boolean(dbConfig.password),
    configSource: databaseUrl ? "DATABASE_URL" : "individual DB_* variables",
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

const registerUser = (req, res) => {
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
    role = "Student",
  } = req.body;

  const cleanFullname = fullname?.trim();
  const cleanSchoolIdNumber = (schoolIdNumber || school_id_number || "").trim();
  const cleanEmail = normalizeEmail(email);
  const cleanPassword = password?.trim();
  const cleanCourseYear = (courseYear || course_year || "").trim();
  const cleanContactNumber = (contactNumber || contact_number || "").trim();

      if (!cleanFullname || !cleanSchoolIdNumber || !cleanEmail || !cleanPassword) {
    return res.status(400).json({
      message: "Full name, school ID number, email, and password are required",
    });
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
      cleanPassword,
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

      res.status(201).json({
        message: "Registration Successful",
        user: {
          id: result.insertId,
          name: cleanFullname,
          schoolIdNumber: cleanSchoolIdNumber,
          email: cleanEmail,
          courseYear: cleanCourseYear,
          contactNumber: cleanContactNumber,
          avatarPath: null,
          role,
        },
      });
    }
  );
};

const loginUser = (req, res) => {
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

  const sql = `
    SELECT id, fullname, school_id_number, email, course_year, contact_number, avatar_path, password, role
    FROM users
    WHERE LOWER(email) = ?
  `;

  db.query(sql, [cleanEmail], (err, result) => {
    if (err) {
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

    // Unknown email and wrong password give the same reply so the login page
    // can show one clear "wrong email or password" text either way.
    if (result.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Incorrect email or password. Please try again.",
      });
    }

    const user = result[0];

    if (user.password !== cleanPassword) {
      return res.status(401).json({
        success: false,
        message: "Incorrect email or password. Please try again.",
      });
    }

    if (user.role !== cleanRole) {
      return res.status(403).json({
        success: false,
        message: `This account is registered as ${user.role}`,
      });
    }

    res.json({
      success: true,
      message: "Login Successful",
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

const updateUserProfile = (req, res) => {
  const {
    id,
    email,
    fullname,
    name,
    schoolIdNumber,
    school_id_number,
    courseYear,
    course_year,
    contactNumber,
    contact_number,
  } = req.body;

  const cleanEmail = normalizeEmail(email);
  const cleanFullname = (fullname || name || "").trim();
  const cleanSchoolIdNumber = (schoolIdNumber || school_id_number || "").trim();
  const cleanCourseYear = (courseYear || course_year || "").trim();
  const cleanContactNumber = (contactNumber || contact_number || "").trim();
  const cleanId = Number(id);
  const hasUserId = Number.isInteger(cleanId) && cleanId > 0;

  if ((!hasUserId && !cleanEmail) || !cleanFullname) {
    return res.status(400).json({
      message: "User account and full name are required",
    });
  }

  const sql = `
    UPDATE users
    SET fullname = ?, school_id_number = ?, course_year = ?, contact_number = ?
    WHERE ${hasUserId ? "id = ?" : "LOWER(email) = ?"}
  `;

  db.query(
    sql,
    [
      cleanFullname,
      cleanSchoolIdNumber,
      cleanCourseYear,
      cleanContactNumber,
      hasUserId ? cleanId : cleanEmail,
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

const updateUserAvatar = (req, res) => {
  const { id, email } = req.body || {};
  const cleanId = Number(id);
  const hasUserId = Number.isInteger(cleanId) && cleanId > 0;
  const cleanEmail = normalizeEmail(email);
  const uploadedFile = req.file;

  const cleanupUploadedAvatar = () => {
    if (uploadedFile?.path) {
      fs.unlink(uploadedFile.path, () => {});
    }
  };

  if ((!hasUserId && !cleanEmail) || !uploadedFile) {
    cleanupUploadedAvatar();
    return res.status(400).json({
      message: "User account and profile photo are required",
    });
  }

  const relativeAvatarPath = path.relative(uploadRoot, uploadedFile.path).split(path.sep).join("/");
  const whereClause = hasUserId ? "id = ?" : "LOWER(email) = ?";
  const queryValue = hasUserId ? cleanId : cleanEmail;
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
        const previousAbsolutePath = path.resolve(uploadRoot, previousAvatarPath);
        const safeUploadRoot = `${path.resolve(uploadRoot)}${path.sep}`;

        if (previousAbsolutePath.startsWith(safeUploadRoot)) {
          fs.unlink(previousAbsolutePath, () => {});
        }
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

const createApplication = (req, res) => {
  const body = req.body || {};
  const {
    userId,
    user_id,
    studentName,
    student_name,
    schoolIdNumber,
    school_id_number,
    email,
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
  const cleanEmail = normalizeEmail(email);
  const cleanCourseYear = (courseYear || course_year || "").trim();
  const cleanContactNumber = (contactNumber || contact_number || "").trim();
  const cleanScholarshipTitle = (scholarshipTitle || scholarship_title || "").trim();
  const cleanScholarshipId = scholarshipId || scholarship_id || null;
  const cleanUserId = Number(userId || user_id);
  const hasUserId = Number.isInteger(cleanUserId) && cleanUserId > 0;
  const uploadedFiles = [
    ...(Array.isArray(req.files?.attachments) ? req.files.attachments : []),
    ...(Array.isArray(req.files?.attachment) ? req.files.attachment : []),
    ...(req.file ? [req.file] : []),
  ];
  const uploadedFileRecords = uploadedFiles.map((file) => ({
    name: file.originalname,
    path: path.relative(uploadRoot, file.path).split(path.sep).join("/"),
    type: file.mimetype,
    size: file.size,
  }));
  const primaryUploadedFile = uploadedFileRecords[0] || null;
  const uploadedFileName = primaryUploadedFile?.name || null;
  const uploadedFilePath = primaryUploadedFile?.path || null;
  const uploadedFileType = primaryUploadedFile?.type || null;
  const uploadedFileSize = primaryUploadedFile?.size || null;
  const uploadedFilesJson =
    uploadedFileRecords.length > 0 ? JSON.stringify(uploadedFileRecords) : null;
  const cleanupUploadedFiles = () => {
    if (uploadedFiles.length === 0) {
      return;
    }

    uploadedFiles.forEach((file) => {
      fs.unlink(file.path, () => {});
    });
  };

  if (!cleanStudentName || !cleanEmail || (!cleanScholarshipId && !cleanScholarshipTitle)) {
    cleanupUploadedFiles();
    return res.status(400).json({
      message: "Student name, email, and scholarship are required",
    });
  }

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

const getApplications = (req, res) => {
  const sql = `
    SELECT a.id, a.student_name, a.school_id_number, a.email, a.course_year, a.contact_number,
      a.scholarship_id, s.scholarship_code, COALESCE(NULLIF(a.scholarship_title, ''), s.title) AS scholarship_title,
      a.status, a.remarks, a.uploaded_file_name, a.uploaded_file_path, a.uploaded_file_type, a.uploaded_file_size, a.uploaded_files_json, a.status_updated_at, a.created_at
    FROM applications a
    LEFT JOIN scholarships s ON s.id = a.scholarship_id
    ORDER BY a.created_at DESC, a.id DESC
  `;

  db.query(sql, (err, rows) => {
    if (err) {
      console.log("Applications Fetch Error:", err);
      return res.status(500).json({
        message: "Failed to load applications",
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

const getStudentApplications = (req, res) => {
  const cleanUserId = Number(req.query.userId || req.query.user_id);
  const cleanEmail = normalizeEmail(req.query.email);

  if (!cleanEmail && !(Number.isInteger(cleanUserId) && cleanUserId > 0)) {
    return res.status(400).json({
      message: "Student email or user ID is required",
    });
  }

  const hasUserId = Number.isInteger(cleanUserId) && cleanUserId > 0;
  const whereClause = hasUserId ? "a.user_id = ?" : "LOWER(a.email) = ?";
  const queryValue = hasUserId ? cleanUserId : cleanEmail;

  const sql = `
    SELECT a.id, a.student_name, a.school_id_number, a.email, a.course_year, a.contact_number,
      a.scholarship_id, COALESCE(NULLIF(a.scholarship_title, ''), s.title) AS scholarship_title,
      a.status, a.remarks, a.uploaded_file_name, a.uploaded_file_path, a.uploaded_file_type, a.uploaded_file_size, a.uploaded_files_json, a.status_updated_at, a.created_at
    FROM applications a
    LEFT JOIN scholarships s ON s.id = a.scholarship_id
    WHERE ${whereClause}
    ORDER BY a.created_at DESC, a.id DESC
  `;

  db.query(sql, [queryValue], (err, rows) => {
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

const getApplicationFile = (req, res) => {
  const { id } = req.params;
  const shouldDownload = req.query.download === "1";
  const requestedFileIndex = Number(req.query.file || req.query.index || 0);
  const fileIndex =
    Number.isInteger(requestedFileIndex) && requestedFileIndex >= 0
      ? requestedFileIndex
      : 0;

  const sql = `
    SELECT uploaded_file_name, uploaded_file_path, uploaded_file_type, uploaded_file_size, uploaded_files_json
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
    const uploadedFiles = parseUploadedFiles(application);
    const selectedFile = uploadedFiles[fileIndex];

    if (!selectedFile) {
      return res.status(404).json({
        message: "No uploaded file for this application",
      });
    }

    const absoluteFilePath = path.resolve(uploadRoot, selectedFile.path);
    const safeUploadRoot = `${path.resolve(uploadRoot)}${path.sep}`;

    if (!absoluteFilePath.startsWith(safeUploadRoot) || !fs.existsSync(absoluteFilePath)) {
      return res.status(404).json({
        message: "Uploaded file not found",
      });
    }

    if (shouldDownload) {
      return res.download(absoluteFilePath, selectedFile.name || path.basename(absoluteFilePath));
    }

    return res.sendFile(absoluteFilePath);
  });
};

const getApplicationFilesArchive = (req, res) => {
  const { id } = req.params;
  const sql = `
    SELECT student_name, uploaded_file_name, uploaded_file_path, uploaded_file_type, uploaded_file_size, uploaded_files_json
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
    const uploadedFiles = parseUploadedFiles(application);
    const safeUploadRoot = `${path.resolve(uploadRoot)}${path.sep}`;
    const folderName = sanitizeUploadPathPart(application.student_name, "student-requirements");
    const archiveFiles = uploadedFiles
      .map((file, index) => {
        const absoluteFilePath = path.resolve(uploadRoot, file.path);

        if (!absoluteFilePath.startsWith(safeUploadRoot) || !fs.existsSync(absoluteFilePath)) {
          return null;
        }

        const fileName = sanitizeUploadPathPart(
          file.name || path.basename(absoluteFilePath),
          `requirement-${index + 1}`
        );

        return {
          name: `${folderName}/${String(index + 1).padStart(2, "0")}-${fileName}`,
          data: fs.readFileSync(absoluteFilePath),
        };
      })
      .filter(Boolean);

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
        const absoluteFilePath = path.resolve(uploadRoot, file.path);
        const safeUploadRoot = `${path.resolve(uploadRoot)}${path.sep}`;

        if (absoluteFilePath.startsWith(safeUploadRoot)) {
          fs.unlink(absoluteFilePath, () => {});
        }
      });

      res.json({
        message: "Application deleted successfully",
      });
    });
  });
};

app.post("/register", registerUser);
app.post("/api/register", registerUser);

app.post("/login", loginUser);
app.post("/api/login", loginUser);
app.put("/users/profile", updateUserProfile);
app.put("/api/users/profile", updateUserProfile);
app.put("/users/avatar", uploadAvatarPhoto, updateUserAvatar);
app.put("/api/users/avatar", uploadAvatarPhoto, updateUserAvatar);
app.post("/users/avatar", uploadAvatarPhoto, updateUserAvatar);
app.post("/api/users/avatar", uploadAvatarPhoto, updateUserAvatar);

app.get("/scholarships", serveClientApp, getScholarships);
app.post("/scholarships", createScholarship);
app.put("/scholarships/:id", updateScholarship);
app.delete("/scholarships/:id", deleteScholarship);

app.get("/api/scholarships", getScholarships);
app.post("/api/scholarships", createScholarship);
app.put("/api/scholarships/:id", updateScholarship);
app.delete("/api/scholarships/:id", deleteScholarship);

app.get("/announcements", serveClientApp, getAnnouncements);
app.post("/announcements", createAnnouncement);
app.put("/announcements/:id", updateAnnouncement);

app.get("/api/announcements", getAnnouncements);
app.post("/api/announcements", createAnnouncement);
app.put("/api/announcements/:id", updateAnnouncement);

app.post(
  "/applications",
  applicationUpload.fields([
    { name: "attachment", maxCount: 1 },
    { name: "attachments", maxCount: 10 },
  ]),
  createApplication
);
app.get("/applications", serveClientApp, getApplications);
app.get("/applications/student", serveClientApp, getStudentApplications);
app.put("/applications/:id/status", updateApplicationStatus);
app.get("/applications/:id/file", getApplicationFile);
app.get("/applications/:id/files/download", getApplicationFilesArchive);
app.delete("/applications/:id", deleteApplication);
app.get("/admin/dashboard-stats", getAdminDashboardStats);
app.get("/admin/recent-activity", getAdminRecentActivity);

app.post(
  "/api/applications",
  applicationUpload.fields([
    { name: "attachment", maxCount: 1 },
    { name: "attachments", maxCount: 10 },
  ]),
  createApplication
);
app.get("/api/applications", getApplications);
app.get("/api/applications/student", getStudentApplications);
app.put("/api/applications/:id/status", updateApplicationStatus);
app.get("/api/applications/:id/file", getApplicationFile);
app.get("/api/applications/:id/files/download", getApplicationFilesArchive);
app.delete("/api/applications/:id", deleteApplication);
app.get("/api/admin/dashboard-stats", getAdminDashboardStats);
app.get("/api/admin/recent-activity", getAdminRecentActivity);

app.use("/uploads", express.static(uploadRoot));
app.use(express.static(clientDistPath));
app.get(/.*/, serveClientApp, (req, res) => {
  res.status(404).json({
    message: "Not found",
  });
});

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});
