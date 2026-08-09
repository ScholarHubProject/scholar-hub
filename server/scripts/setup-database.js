// One-off schema setup: creates any missing tables and columns, then exits.
//
// Run after changing the schema, or against a fresh database that has not had
// database/schema.sql applied:
//
//   npm run db:setup
//
// The server itself no longer does this on boot. It runs as a serverless
// function, so "boot" is every cold start, and the ~40 queries this performs
// were being paid before each request could be answered.

process.env.DB_AUTO_MIGRATE = "true";

require("../server.js");

console.log("Running schema setup...");

// initializeDatabase fires its queries through nested callbacks with no
// completion signal, so the process is held open long enough for them to land
// rather than being wired into a promise chain it does not expose.
setTimeout(() => {
  console.log("Schema setup finished. Check above for any errors.");
  process.exit(0);
}, 15000);
