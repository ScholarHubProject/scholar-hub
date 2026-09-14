// Fills the database with a realistic term of scholarship activity so the
// analytics, reports and prediction screens can be demonstrated and
// reviewed before real applications exist.
//
//   node scripts/seed-demo-data.js --confirm
//
// It refuses to run without --confirm, and it refuses to run at all if
// the applications table already holds rows it did not create. Every row
// it inserts is tagged in remarks with DEMO_TAG, so:
//
//   node scripts/seed-demo-data.js --remove
//
// takes them all out again and leaves real records untouched.

const path = require("path");
const { Pool } = require("pg");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const auth = require("../auth");

const DEMO_TAG = "[demo-seed]";
const PROGRAMS = [
  "BS Information Technology",
  "BS Elementary Education",
  "BS Nursing",
  "BS Criminology",
  "BS Business Administration",
  "BS Agriculture",
];
const SEMESTERS = ["1st Semester", "2nd Semester"];
const ACADEMIC_YEARS = ["2024-2025", "2025-2026"];
const FIRST_NAMES = [
  "Aira", "Benito", "Carmela", "Dante", "Elisa", "Fidel", "Gemma", "Hector",
  "Imelda", "Joel", "Karla", "Lito", "Marissa", "Nestor", "Olivia", "Paulo",
  "Queenie", "Ramon", "Sofia", "Teodoro", "Ursula", "Victor", "Wilma", "Ximena",
];
const LAST_NAMES = [
  "Abadilla", "Bautista", "Cabrera", "Dizon", "Estrada", "Fajardo", "Gonzales",
  "Hilario", "Ilagan", "Javier", "Katigbak", "Lacsamana", "Mendoza", "Navarro",
  "Ocampo", "Padilla", "Quiambao", "Reyes", "Santiago", "Tolentino",
];

const SCHOLARSHIPS = [
  {
    code: "PSU-ACAD",
    title: "PSU Academic Excellence Grant",
    description:
      "Merit-based assistance for students who maintain strong academic standing across the school year.",
    benefits: "Stipend of ₱7,500 per semester plus a book allowance.",
    qualification: "General weighted average of at least 3.00 with no failing grade.",
    requirements:
      "Certified true copy of grades\nCertificate of enrolment\nBarangay clearance\n2x2 ID photo",
    slots: 40,
    award: 7500,
  },
  {
    code: "PSU-NEED",
    title: "Financial Assistance Programme",
    description:
      "Need-based support for students whose household income falls below the campus threshold.",
    benefits: "Tuition subsidy worth ₱5,000 per semester.",
    qualification: "Combined household income below ₱120,000 per year.",
    requirements:
      "Certificate of indigency\nIncome tax return or certificate of non-filing\nCertificate of enrolment\nCertified true copy of grades",
    slots: 60,
    award: 5000,
  },
  {
    code: "PSU-STEM",
    title: "STEM Advancement Scholarship",
    description:
      "For students in science and technology programmes taking part in research or extension work.",
    benefits: "₱6,000 per semester with a research allowance.",
    qualification: "Enrolled in a STEM programme with a general average of at least 2.75.",
    requirements:
      "Certified true copy of grades\nResearch adviser endorsement\nCertificate of enrolment",
    slots: 25,
    award: 6000,
  },
  {
    code: "PSU-BRGY",
    title: "Barangay Leadership Award",
    description: "Recognises students in recognised community and student-government service roles.",
    benefits: "₱4,000 per semester.",
    qualification: "Certified officer of a recognised organisation in good academic standing.",
    requirements: "Certificate of officership\nCertificate of enrolment\nCertified true copy of grades",
    slots: 15,
    award: 4000,
  },
];

// A seeded generator, so two runs of this script produce the same
// dashboard. Debugging a chart against data that changes every run is
// its own small nightmare.
let seed = 20260902;
const random = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const pick = (list) => list[Math.floor(random() * list.length)];
const between = (min, max) => min + random() * (max - min);
const roundTo = (value, digits) => Number(value.toFixed(digits));

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

const termStart = (academicYear, semester) => {
  const startYear = Number(academicYear.slice(0, 4));
  // A Philippine academic year opens in August; the second semester
  // opens in January of the following calendar year.
  return semester === "1st Semester"
    ? new Date(Date.UTC(startYear, 7, 15))
    : new Date(Date.UTC(startYear + 1, 0, 15));
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const buildStudents = (count) => {
  const students = [];
  const usedEmails = new Set();

  for (let index = 0; index < count; index += 1) {
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    const program = pick(PROGRAMS);
    const yearLevel = Math.ceil(between(1, 4.99));
    const base = `${first}.${last}${index}`.toLowerCase();
    const email = `${base}@demo.scholarhub.test`;

    if (usedEmails.has(email)) continue;
    usedEmails.add(email);

    students.push({
      fullname: `${first} ${last}`,
      email,
      program,
      courseYear: `${program} - ${yearLevel}${["st", "nd", "rd", "th"][Math.min(yearLevel - 1, 3)]} Year`,
      schoolId: `20${22 + (index % 4)}-${String(1000 + index).padStart(5, "0")}`,
      // A per-student baseline plus per-term drift is what makes a GPA
      // chart look like a person rather than a random walk.
      baseGpa: roundTo(between(1.7, 3.9), 2),
      drift: roundTo(between(-0.22, 0.28), 2),
    });
  }

  return students;
};

const run = async () => {
  const remove = process.argv.includes("--remove");
  const confirmed = process.argv.includes("--confirm") || remove;

  if (!confirmed) {
    console.log(
      "Refusing to run without --confirm.\n\n" +
        "  node scripts/seed-demo-data.js --confirm   insert demo records\n" +
        "  node scripts/seed-demo-data.js --remove    delete them again\n"
    );
    process.exit(1);
  }

  const pool = buildPool();

  try {
    if (remove) {
      const applications = await pool.query("DELETE FROM applications WHERE remarks LIKE $1", [
        `%${DEMO_TAG}%`,
      ]);
      const users = await pool.query("DELETE FROM users WHERE email LIKE $1", [
        "%@demo.scholarhub.test",
      ]);
      const scholarships = await pool.query(
        "DELETE FROM scholarships WHERE scholarship_code = ANY($1)",
        [SCHOLARSHIPS.map((scholarship) => scholarship.code)]
      );

      console.log(
        `Removed ${applications.rowCount} applications, ${users.rowCount} students and ${scholarships.rowCount} scholarships.`
      );
      return;
    }

    const existing = await pool.query(
      "SELECT COUNT(*) AS total FROM applications WHERE remarks IS NULL OR remarks NOT LIKE $1",
      [`%${DEMO_TAG}%`]
    );

    if (Number(existing.rows[0].total) > 0) {
      console.log(
        `This database already holds ${existing.rows[0].total} real application(s).\n` +
          "Seeding demo data on top of live records would corrupt your reports. Aborting."
      );
      process.exit(1);
    }

    // Scholarships ------------------------------------------------
    const scholarshipIds = new Map();

    for (const scholarship of SCHOLARSHIPS) {
      const found = await pool.query("SELECT id FROM scholarships WHERE scholarship_code = $1", [
        scholarship.code,
      ]);

      if (found.rows.length > 0) {
        scholarshipIds.set(scholarship.code, found.rows[0].id);
        continue;
      }

      const inserted = await pool.query(
        `INSERT INTO scholarships
           (scholarship_code, title, description, benefits, qualification, requirements, available_slots, deadline, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Open')
         RETURNING id`,
        [
          scholarship.code,
          scholarship.title,
          scholarship.description,
          scholarship.benefits,
          scholarship.qualification,
          scholarship.requirements,
          scholarship.slots,
          addDays(new Date(), 45).toISOString().slice(0, 10),
        ]
      );

      scholarshipIds.set(scholarship.code, inserted.rows[0].id);
    }

    console.log(`Scholarships ready: ${scholarshipIds.size}`);

    // Students ----------------------------------------------------
    const students = buildStudents(64);
    const demoPassword = await auth.hashPassword("DemoScholar2026!");
    const userIds = new Map();

    for (const student of students) {
      const inserted = await pool.query(
        `INSERT INTO users (fullname, school_id_number, email, course_year, contact_number, password, role)
         VALUES ($1, $2, $3, $4, $5, $6, 'Student')
         ON CONFLICT (email) DO UPDATE SET course_year = EXCLUDED.course_year
         RETURNING id`,
        [
          student.fullname,
          student.schoolId,
          student.email,
          student.courseYear,
          `09${String(Math.floor(between(100000000, 999999999)))}`.slice(0, 11),
          demoPassword,
        ]
      );

      userIds.set(student.email, inserted.rows[0].id);
    }

    console.log(`Students ready: ${userIds.size} (password: DemoScholar2026!)`);

    // Applications ------------------------------------------------
    // Each student files for one to four consecutive terms. The first is
    // always "New" and the rest are renewals, which is what makes the
    // renewal counts, the GPA trend and the renewal prediction have
    // anything to work with.
    const terms = ACADEMIC_YEARS.flatMap((year) =>
      SEMESTERS.map((semester) => ({ year, semester }))
    );

    let inserted = 0;

    for (const student of students) {
      const scholarship = pick(SCHOLARSHIPS);
      const scholarshipId = scholarshipIds.get(scholarship.code);
      const startIndex = Math.floor(between(0, terms.length - 0.01));
      const requirements = scholarship.requirements.split("\n");

      for (let step = 0; startIndex + step < terms.length; step += 1) {
        const term = terms[startIndex + step];
        const opened = termStart(term.year, term.semester);
        const submittedAt = addDays(opened, Math.floor(between(-20, 25)));

        if (submittedAt > new Date()) break;

        const gpa = roundTo(
          Math.max(0.9, Math.min(4, student.baseGpa + student.drift * step + between(-0.12, 0.12))),
          2
        );

        // Grades and paperwork drive the decision, which is what makes
        // the eligibility score and the charts tell a consistent story.
        const documentsSubmitted =
          random() < 0.62
            ? requirements.length
            : Math.max(1, Math.round(between(1, requirements.length - 0.01)));
        const complete = documentsSubmitted === requirements.length;

        const isPending = submittedAt > addDays(new Date(), -25);
        const approved = !isPending && gpa >= 2.4 && complete && random() < 0.88;
        const status = isPending ? "Pending Review" : approved ? "Approved" : "Rejected";
        const decidedAt = isPending ? null : addDays(submittedAt, Math.floor(between(5, 22)));
        const released =
          approved && random() < 0.75 ? addDays(decidedAt, Math.floor(between(24, 38))) : null;

        const remarks = isPending
          ? `Awaiting review. ${DEMO_TAG}`
          : approved
            ? `Approved for ${term.semester} ${term.year}. ${DEMO_TAG}`
            : `${
                gpa < 2.4 ? "Grade below the retention minimum." : "Incomplete requirements."
              } ${DEMO_TAG}`;

        await pool.query(
          `INSERT INTO applications
             (user_id, student_name, school_id_number, email, course_year, contact_number,
              scholarship_id, scholarship_title, status, remarks, status_updated_at, created_at,
              academic_year, semester, program, application_type, gpa, award_amount, disbursed_at,
              documents_json)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
          [
            userIds.get(student.email),
            student.fullname,
            student.schoolId,
            student.email,
            student.courseYear,
            "09171234567",
            scholarshipId,
            scholarship.title,
            status,
            remarks,
            decidedAt,
            submittedAt,
            term.year,
            term.semester,
            student.program,
            step === 0 ? "New" : "Renewal",
            gpa,
            approved ? scholarship.award : null,
            released,
            JSON.stringify(
              requirements.map((name, index) => ({
                name,
                submitted: index < documentsSubmitted,
              }))
            ),
          ]
        );

        inserted += 1;
      }
    }

    console.log(`Applications inserted: ${inserted}`);
    console.log("\nDone. Open the admin dashboard to see the analytics populated.");
    console.log(`Remove it all again with: node scripts/seed-demo-data.js --remove`);
  } catch (err) {
    console.error("Seeding failed:", err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
};

run();
