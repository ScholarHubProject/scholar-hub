// One-time repair for scholarships.available_slots.
//
// The old createApplication took a slot on every submission, so the counter
// drifted down by one per applicant instead of one per award. This adds back
// the slots that were charged to applications that were never approved:
//
//   correct remaining = current remaining + applications not approved
//
// which reconstructs the count exactly, because under the corrected rule an
// approved application is the only thing that should have spent a slot.
//
//   node scripts/repair-slot-counts.js            # show the plan, change nothing
//   node scripts/repair-slot-counts.js --confirm  # apply it
//
// Run it once, after deploying the fix. Running it twice would inflate the
// counts, so it prints what it is about to do and does nothing without
// --confirm.
//
// One caveat it cannot repair: the old statement floored at 0, so a
// scholarship that was driven to zero lost the submissions past that point.
// Those are gone for good and the slot count has to be re-entered by hand in
// Manage Scholarship. The report below flags every scholarship sitting at 0.

const path = require("path");
const { Pool } = require("pg");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const cleanDatabaseUrl = (value) =>
  String(value || "")
    .trim()
    .replace(/^(?:DATABASE_URL|SUPABASE_DB_URL|POSTGRES_URL)\s*=\s*/i, "")
    .replace(/^["']|["']$/g, "")
    .trim();

const buildPool = () => {
  const url = cleanDatabaseUrl(
    process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL
  );
  const parsed = url ? new URL(url) : null;

  return new Pool({
    host: process.env.DB_HOST || process.env.PGHOST || parsed?.hostname,
    port: Number(process.env.DB_PORT || process.env.PGPORT || parsed?.port) || 5432,
    user: process.env.DB_USER || process.env.PGUSER || decodeURIComponent(parsed?.username || ""),
    password:
      process.env.DB_PASSWORD || process.env.PGPASSWORD || decodeURIComponent(parsed?.password || ""),
    database:
      process.env.DB_NAME ||
      process.env.PGDATABASE ||
      parsed?.pathname.replace(/^\/+/, "") ||
      "postgres",
    ssl: process.env.DB_SSL === "false" ? false : { rejectUnauthorized: false },
    max: 3,
  });
};

const PLAN_SQL = `
  SELECT
    s.id,
    s.title,
    s.available_slots AS current_slots,
    COUNT(a.id) FILTER (WHERE a.status <> 'Approved') AS wrongly_charged,
    COUNT(a.id) FILTER (WHERE a.status = 'Approved') AS approved
  FROM scholarships s
  LEFT JOIN applications a ON a.scholarship_id = s.id
  GROUP BY s.id, s.title, s.available_slots
  ORDER BY s.id
`;

const REPAIR_SQL = `
  UPDATE scholarships s
  SET available_slots = s.available_slots + charged.total
  FROM (
    SELECT scholarship_id, COUNT(*) AS total
    FROM applications
    WHERE scholarship_id IS NOT NULL AND status <> 'Approved'
    GROUP BY scholarship_id
  ) AS charged
  WHERE s.id = charged.scholarship_id
`;

const run = async () => {
  const confirmed = process.argv.includes("--confirm");
  const pool = buildPool();

  try {
    const { rows } = await pool.query(PLAN_SQL);

    if (rows.length === 0) {
      console.log("No scholarships found. Nothing to repair.");
      return;
    }

    console.log(confirmed ? "Repairing slot counts:\n" : "Planned changes (dry run):\n");

    const floored = [];

    rows.forEach((row) => {
      const current = Number(row.current_slots) || 0;
      const charged = Number(row.wrongly_charged) || 0;
      const approved = Number(row.approved) || 0;
      const next = current + charged;

      console.log(
        `  #${row.id} ${row.title}\n` +
          `      slots ${current} -> ${next}  (+${charged} refunded, ${approved} approved)`
      );

      if (current === 0) floored.push(row);
    });

    if (floored.length > 0) {
      console.log(
        "\nThese scholarships sat at 0, where the old statement stopped counting down.\n" +
          "Their original slot count cannot be recovered - re-enter it in Manage Scholarship:"
      );
      floored.forEach((row) => console.log(`  #${row.id} ${row.title}`));
    }

    if (!confirmed) {
      console.log("\nNothing was changed. Re-run with --confirm to apply.");
      return;
    }

    const result = await pool.query(REPAIR_SQL);
    console.log(`\nDone. ${result.rowCount} scholarship(s) updated.`);
  } catch (err) {
    console.error("Slot repair failed:", err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
};

run();
