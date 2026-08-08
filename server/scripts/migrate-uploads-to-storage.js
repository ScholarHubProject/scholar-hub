// One-shot migration: copy the files that used to live in server/uploads into
// the Supabase Storage bucket, keeping the exact same relative keys.
//
// Existing rows in `applications.uploaded_files_json` and `users.avatar_path`
// store those relative paths, so preserving the keys means old records keep
// resolving after the move to serverless.
//
// Usage (from the server/ directory, with .env filled in):
//   node scripts/migrate-uploads-to-storage.js
//   node scripts/migrate-uploads-to-storage.js --dry-run

const fs = require("fs");
const path = require("path");
require("dotenv").config();

const storage = require("../storage");

const uploadRoot = path.join(__dirname, "..", "uploads");
const isDryRun = process.argv.includes("--dry-run");

const CONTENT_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const guessContentType = (filePath) =>
  CONTENT_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";

const walk = (dir) => {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(entryPath) : [entryPath];
  });
};

const main = async () => {
  if (!storage.isStorageConfigured()) {
    console.error(storage.storageNotConfiguredMessage);
    process.exit(1);
  }

  const files = walk(uploadRoot).filter((filePath) => !filePath.endsWith(".DS_Store"));

  if (files.length === 0) {
    console.log("No files found under server/uploads — nothing to migrate.");
    return;
  }

  console.log(
    `${isDryRun ? "[dry run] " : ""}Migrating ${files.length} file(s) to bucket "${storage.BUCKET}"\n`
  );

  let migrated = 0;
  let failed = 0;

  for (const filePath of files) {
    const objectPath = path.relative(uploadRoot, filePath).split(path.sep).join("/");

    if (isDryRun) {
      console.log(`  would upload  ${objectPath}`);
      migrated += 1;
      continue;
    }

    try {
      await storage.putObject(objectPath, fs.readFileSync(filePath), guessContentType(filePath));
      console.log(`  uploaded      ${objectPath}`);
      migrated += 1;
    } catch (err) {
      console.log(`  FAILED        ${objectPath} — ${err.message}`);
      failed += 1;
    }
  }

  console.log(`\nDone. ${migrated} migrated, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
};

main().catch((err) => {
  console.error("Migration error:", err.message);
  process.exit(1);
});
