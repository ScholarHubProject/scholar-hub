// ============================================================
// Analytics and reporting endpoints
// ============================================================
// Kept out of server.js because it is a self-contained slice: three
// read endpoints and one write, all of them about the same set of
// application records. The scoring rules themselves live in
// analytics.js, which knows nothing about Express or Postgres.
//
// The aggregation runs in Node rather than in SQL. A campus scholarship
// office holds thousands of applications, not millions, and one pass
// over the rows keeps every chart on a page consistent with every other
// chart: the same filtered slice feeds all of them, which a set of
// independent GROUP BY queries could not guarantee under concurrent
// writes. ROW_LIMIT is the guard if that assumption ever stops holding.

const analytics = require("./analytics");

const ROW_LIMIT = 20000;
const DETAIL_ROW_LIMIT = 500;
const TREND_MONTHS = 12;

const APPLICATION_COLUMNS = `
  a.id, a.user_id, a.student_name, a.school_id_number, a.email, a.course_year,
  a.contact_number, a.scholarship_id, a.status, a.remarks, a.created_at,
  a.status_updated_at, a.uploaded_files_json, a.uploaded_file_path,
  a.academic_year, a.semester, a.program, a.application_type, a.gpa,
  a.award_amount, a.disbursed_at, a.documents_json,
  COALESCE(NULLIF(a.scholarship_title, ''), s.title) AS scholarship_title,
  s.requirements, s.benefits, s.deadline, s.scholarship_code
`;

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const monthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const monthLabel = (date) =>
  date.toLocaleDateString("en-US", { month: "short", year: "numeric" });

// Counts by key, returned newest-largest first, with a stable label.
const tally = (rows, getKey) => {
  const counts = new Map();

  rows.forEach((row) => {
    const key = getKey(row);
    if (!key) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
};

// One key per person. Applications filed before accounts were linked have
// no user_id, so the email stands in; a row with neither is not a person
// this office can count.
const studentKeys = (rows) => {
  const keys = new Set();
  rows.forEach((row) => {
    keys.add(row.user_id != null ? `id:${row.user_id}` : `email:${String(row.email || "").toLowerCase()}`);
  });
  keys.delete("email:");
  return keys;
};

const distinctStudents = (rows) => studentKeys(rows).size;

// A row's program is the column when the office has set one, and is
// otherwise read off the free-text course_year the student typed.
const rowProgram = (row) =>
  String(row.program || "").trim() || analytics.programFromCourseYear(row.course_year);

const rowTerm = (row) =>
  row.academic_year || row.semester
    ? analytics.termLabel(row.academic_year, row.semester)
    : "Unassigned term";

const rowType = (row) =>
  String(row.application_type || "").trim().toLowerCase() === "renewal" ? "Renewal" : "New";

const sortTerms = (rows) =>
  [...rows].sort((a, b) => a.key - b.key);

// ------------------------------------------------------------
// Filters
// ------------------------------------------------------------
// Options are always derived from the unfiltered set. Narrowing by
// program must not delete the semesters from the semester menu, or the
// user gets stuck in a corner they cannot filter their way out of.
const readFilters = (query) => ({
  academicYear: String(query.academicYear || "").trim(),
  semester: String(query.semester || "").trim(),
  program: String(query.program || "").trim(),
  scholarship: String(query.scholarship || "").trim(),
  status: String(query.status || "").trim(),
  applicationType: String(query.applicationType || "").trim(),
});

const applyFilters = (rows, filters) =>
  rows.filter((row) => {
    if (filters.academicYear && String(row.academic_year || "") !== filters.academicYear) return false;
    if (filters.semester && String(row.semester || "") !== filters.semester) return false;
    if (filters.program && rowProgram(row) !== filters.program) return false;
    if (filters.scholarship && String(row.scholarship_title || "") !== filters.scholarship) return false;
    if (filters.status && analytics.normalizeStatus(row.status) !== filters.status) return false;
    if (filters.applicationType && rowType(row) !== filters.applicationType) return false;
    return true;
  });

const buildFilterOptions = (rows) => {
  const unique = (getValue) =>
    [...new Set(rows.map(getValue).filter((value) => value && String(value).trim()))].sort();

  return {
    academicYears: unique((row) => row.academic_year).reverse(),
    semesters: analytics.SEMESTER_ORDER.filter((semester) =>
      rows.some((row) => row.semester === semester)
    ),
    programs: unique(rowProgram),
    scholarships: unique((row) => row.scholarship_title),
    statuses: ["Approved", "Pending Review", "Rejected", "Withdrawn"],
    applicationTypes: ["New", "Renewal"],
  };
};

// ------------------------------------------------------------
// The admin aggregate
// ------------------------------------------------------------
const buildAdminAnalytics = (rows, scholarshipCount) => {
  const approved = rows.filter((row) => analytics.normalizeStatus(row.status) === "Approved");
  const rejected = rows.filter((row) => analytics.normalizeStatus(row.status) === "Rejected");
  const pending = rows.filter((row) => analytics.normalizeStatus(row.status) === "Pending Review");
  const withdrawn = rows.filter((row) => analytics.normalizeStatus(row.status) === "Withdrawn");
  const renewals = rows.filter((row) => rowType(row) === "Renewal");

  // Applicants counts people; applications counts forms. A student who
  // renews for three terms is one applicant and three applications, and
  // conflating the two is the usual way a scholarship report ends up
  // overstating its reach.
  //
  // Counting the not-qualified as rejected *forms* was what produced "64
  // applicants, 106 not qualified" - a rejection is not a person.
  //
  // Not-qualified is now read off the rejected rows rather than as "everyone
  // left over". Those were the same set while an application could only be
  // approved, pending or rejected; with withdrawal they are not, and the
  // leftover form would have counted a student who took their own application
  // back as one the office turned down.
  const approvedStudentKeys = studentKeys(approved);
  const pendingStudentKeys = studentKeys(pending);
  const awaitingStudentKeys = [...pendingStudentKeys].filter(
    (key) => !approvedStudentKeys.has(key)
  );
  const notQualifiedStudentKeys = [...studentKeys(rejected)].filter(
    (key) => !approvedStudentKeys.has(key) && !pendingStudentKeys.has(key)
  );

  const summary = {
    totalApplicants: distinctStudents(rows),
    totalApplications: rows.length,
    qualifiedStudents: approvedStudentKeys.size,
    notQualifiedStudents: notQualifiedStudentKeys.length,
    awaitingStudents: awaitingStudentKeys.length,
    approvedApplications: approved.length,
    rejectedApplications: rejected.length,
    pendingApplications: pending.length,
    withdrawnApplications: withdrawn.length,
    renewalApplications: renewals.length,
    newApplications: rows.length - renewals.length,
    scholarshipsPosted: scholarshipCount,
    totalAwarded: approved.reduce((sum, row) => sum + (toNumber(row.award_amount) || 0), 0),
    totalDisbursed: approved
      .filter((row) => row.disbursed_at)
      .reduce((sum, row) => sum + (toNumber(row.award_amount) || 0), 0),
    disbursedCount: approved.filter((row) => row.disbursed_at).length,
  };

  const decided = approved.length + rejected.length;
  summary.approvalRate = decided > 0 ? Math.round((approved.length / decided) * 100) : null;

  // --- charts -------------------------------------------------
  const byProgram = tally(rows, rowProgram);
  const recipientsByProgram = tally(approved, rowProgram);

  // Withdrawn is appended rather than slotted in, and only when there are any:
  // the categorical palette is assigned by position and never cycled, so adding
  // a slice at the end leaves the other three the colours they already had.
  // An office that has never had a withdrawal sees the same three-slice chart
  // as before rather than a permanently empty fourth legend entry.
  const byStatus = [
    { label: "Approved", value: approved.length },
    { label: "Pending Review", value: pending.length },
    { label: "Rejected", value: rejected.length },
    ...(withdrawn.length > 0 ? [{ label: "Withdrawn", value: withdrawn.length }] : []),
  ];

  const termCounts = new Map();
  rows.forEach((row) => {
    const label = rowTerm(row);
    const key = analytics.termKey(row.academic_year, row.semester);
    const entry = termCounts.get(label) || { label, key, value: 0, approved: 0 };
    entry.value += 1;
    if (analytics.normalizeStatus(row.status) === "Approved") entry.approved += 1;
    termCounts.set(label, entry);
  });
  const byTerm = sortTerms([...termCounts.values()]);

  // Twelve months ending this month, with the empty months kept in so
  // the line reads as a gap rather than closing over a quiet period.
  const trendMonths = [];
  const cursor = new Date();
  cursor.setDate(1);
  cursor.setHours(0, 0, 0, 0);
  cursor.setMonth(cursor.getMonth() - (TREND_MONTHS - 1));

  for (let index = 0; index < TREND_MONTHS; index += 1) {
    const date = new Date(cursor);
    date.setMonth(cursor.getMonth() + index);
    trendMonths.push({ key: monthKey(date), label: monthLabel(date), submitted: 0, approved: 0 });
  }

  const trendIndex = new Map(trendMonths.map((month) => [month.key, month]));
  rows.forEach((row) => {
    if (!row.created_at) return;
    const bucket = trendIndex.get(monthKey(new Date(row.created_at)));
    if (!bucket) return;
    bucket.submitted += 1;
    if (analytics.normalizeStatus(row.status) === "Approved") bucket.approved += 1;
  });

  const byType = [
    { label: "New", value: summary.newApplications },
    { label: "Renewal", value: summary.renewalApplications },
  ];

  // --- report tables -----------------------------------------
  // The reports page renders these directly and exports them as CSV, so
  // each one carries its own column headers.
  const gpaRows = rows
    .map((row) => ({ gpa: toNumber(row.gpa), program: rowProgram(row), status: analytics.normalizeStatus(row.status) }))
    .filter((row) => row.gpa != null && row.gpa > 0);

  const gpaByProgram = [...new Set(gpaRows.map((row) => row.program))]
    .map((program) => {
      const scoped = gpaRows.filter((row) => row.program === program);
      const average = scoped.reduce((sum, row) => sum + row.gpa, 0) / scoped.length;
      const atRisk = scoped.filter(
        (row) => row.gpa < analytics.GPA_SCALE.retentionMinimum
      ).length;
      return {
        label: program,
        value: Math.round(average * 100) / 100,
        count: scoped.length,
        atRisk,
      };
    })
    .sort((a, b) => b.value - a.value);

  const documentStats = rows.reduce(
    (accumulator, row) => {
      const completion = analytics.documentCompletion(row, row);
      accumulator.total += 1;
      accumulator.percentSum += completion.percent;
      if (completion.percent >= 100) accumulator.complete += 1;
      else if (completion.percent >= 50) accumulator.partial += 1;
      else accumulator.missing += 1;
      return accumulator;
    },
    { total: 0, percentSum: 0, complete: 0, partial: 0, missing: 0 }
  );

  // One flat row per application, which every detail report on the
  // reports page slices further. Sending one list rather than a list per
  // report keeps the payload small and guarantees the reports agree with
  // each other and with the charts above them.
  const details = rows
    .slice()
    .sort(
      (a, b) =>
        new Date(b.status_updated_at || b.created_at || 0) -
        new Date(a.status_updated_at || a.created_at || 0)
    )
    .slice(0, DETAIL_ROW_LIMIT)
    .map((row) => {
      const completion = analytics.documentCompletion(row, row);

      return {
        id: row.id,
        studentName: row.student_name,
        schoolId: row.school_id_number || "",
        email: row.email,
        program: rowProgram(row),
        yearLevel: analytics.yearLevelFromCourseYear(row.course_year),
        scholarship: row.scholarship_title,
        term: rowTerm(row),
        academicYear: row.academic_year || "",
        semester: row.semester || "",
        applicationType: rowType(row),
        status: analytics.normalizeStatus(row.status),
        gpa: toNumber(row.gpa),
        awardAmount: toNumber(row.award_amount),
        disbursedAt: row.disbursed_at,
        documentPercent: completion.percent,
        documentsSubmitted: completion.submittedCount,
        documentsRequired: completion.requiredCount,
        submittedAt: row.created_at,
        decidedAt: row.status_updated_at,
        remarks: row.remarks || "",
      };
    });

  return {
    summary,
    charts: {
      byProgram,
      byStatus,
      byTerm: byTerm.map(({ label, value, approved: approvedCount }) => ({
        label,
        value,
        approved: approvedCount,
      })),
      recipientsByProgram,
      byType,
      trend: trendMonths.map(({ label, submitted, approved: approvedCount }) => ({
        label,
        submitted,
        approved: approvedCount,
      })),
      qualifiedVsRejected: [
        { label: "Qualified", value: approved.length },
        { label: "Not qualified", value: rejected.length },
        { label: "Still under review", value: pending.length },
      ],
      gpaByProgram,
    },
    documents: {
      ...documentStats,
      averagePercent:
        documentStats.total > 0 ? Math.round(documentStats.percentSum / documentStats.total) : 0,
    },
    details,
    detailsTruncated: rows.length > DETAIL_ROW_LIMIT,
    detailRowLimit: DETAIL_ROW_LIMIT,
  };
};

// ------------------------------------------------------------
// Route factory
// ------------------------------------------------------------
// recordAudit is handed in rather than imported, for the same reason runQuery
// is: this module stays free of Express and Postgres so it can be exercised on
// its own. A caller that passes nothing gets a no-op instead of a crash.
module.exports = ({
  runQuery,
  normalizeEmail,
  parseUploadedFiles,
  recordAudit = () => {},
}) => {
  const loadApplicationRows = () =>
    runQuery(`
      SELECT ${APPLICATION_COLUMNS}
      FROM applications a
      LEFT JOIN scholarships s ON s.id = a.scholarship_id
      ORDER BY a.created_at ASC
      LIMIT ${ROW_LIMIT}
    `);

  const getAdminAnalytics = async (req, res) => {
    try {
      const filters = readFilters(req.query);
      const [rows, scholarshipRows] = await Promise.all([
        loadApplicationRows(),
        runQuery("SELECT COUNT(*) AS total FROM scholarships"),
      ]);

      const enriched = rows.map((row) => ({
        ...row,
        uploaded_files: parseUploadedFiles(row),
      }));

      const filtered = applyFilters(enriched, filters);
      const payload = buildAdminAnalytics(filtered, Number(scholarshipRows[0]?.total) || 0);

      res.json({
        ...payload,
        filters,
        filterOptions: buildFilterOptions(enriched),
        totalUnfiltered: enriched.length,
        rowLimitReached: enriched.length >= ROW_LIMIT,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.log("Admin Analytics Error:", err);
      res.status(500).json({ message: "Failed to load analytics" });
    }
  };

  const getStudentAnalytics = async (req, res) => {
    try {
      const [applications, scholarships, awardRows, leadRows] = await Promise.all([
        runQuery(
          `
            SELECT ${APPLICATION_COLUMNS}
            FROM applications a
            LEFT JOIN scholarships s ON s.id = a.scholarship_id
            WHERE (a.user_id = ? OR LOWER(a.email) = ?)
            ORDER BY a.created_at DESC, a.id DESC
          `,
          [req.user.id, normalizeEmail(req.user.email)]
        ),
        runQuery(
          "SELECT id, title, requirements, benefits, deadline, status FROM scholarships ORDER BY id"
        ),
        // Campus-wide, not per student: the award range and the release
        // window are properties of the scholarship, so they are learned
        // from everyone who has already been paid.
        runQuery(
          "SELECT scholarship_id, award_amount FROM applications WHERE award_amount IS NOT NULL AND award_amount > 0"
        ),
        runQuery(`
          SELECT scholarship_id,
            EXTRACT(EPOCH FROM (disbursed_at - COALESCE(status_updated_at, created_at))) / 86400 AS lead_days
          FROM applications
          WHERE disbursed_at IS NOT NULL
        `),
      ]);

      const scholarshipsById = new Map(
        scholarships.map((scholarship) => [Number(scholarship.id), scholarship])
      );

      const awardHistoryByScholarship = new Map();
      awardRows.forEach((row) => {
        const key = Number(row.scholarship_id);
        const list = awardHistoryByScholarship.get(key) || [];
        list.push(toNumber(row.award_amount));
        awardHistoryByScholarship.set(key, list);
      });

      const leadTimesByScholarship = new Map();
      const campusLeadTimes = [];
      leadRows.forEach((row) => {
        const days = toNumber(row.lead_days);
        if (days == null || days < 0) return;
        campusLeadTimes.push(days);
        const key = Number(row.scholarship_id);
        const list = leadTimesByScholarship.get(key) || [];
        list.push(days);
        leadTimesByScholarship.set(key, list);
      });

      const enriched = applications.map((row) => ({
        ...row,
        gpa: toNumber(row.gpa),
        award_amount: toNumber(row.award_amount),
        uploaded_files: parseUploadedFiles(row),
      }));

      res.json({
        ...analytics.buildStudentAnalytics({
          applications: enriched,
          scholarshipsById,
          awardHistoryByScholarship,
          leadTimesByScholarship,
          campusLeadTimes,
        }),
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.log("Student Analytics Error:", err);
      res.status(500).json({ message: "Failed to load your analytics" });
    }
  };

  // The office records the academic facts an application is judged on.
  // Students never write to these fields: a self-reported GPA driving a
  // renewal prediction would make the prediction worthless.
  const updateApplicationAcademics = async (req, res) => {
    const { id } = req.params;
    const body = req.body || {};

    const gpa = toNumber(body.gpa);
    if (body.gpa != null && body.gpa !== "" && gpa == null) {
      return res.status(400).json({ message: "GPA must be a number." });
    }
    if (gpa != null && (gpa < analytics.GPA_SCALE.min || gpa > analytics.GPA_SCALE.max)) {
      return res.status(400).json({
        message: `GPA must be between ${analytics.GPA_SCALE.min.toFixed(2)} and ${analytics.GPA_SCALE.max.toFixed(2)}.`,
      });
    }

    const awardAmount = toNumber(body.awardAmount);
    if (awardAmount != null && awardAmount < 0) {
      return res.status(400).json({ message: "Award amount cannot be negative." });
    }

    const applicationType = body.applicationType === "Renewal" ? "Renewal" : "New";
    const semester = analytics.SEMESTER_ORDER.includes(body.semester) ? body.semester : null;
    const academicYear = String(body.academicYear || "").trim().slice(0, 20) || null;
    const program = String(body.program || "").trim().slice(0, 120) || null;

    const documents = Array.isArray(body.documents)
      ? body.documents.slice(0, 20).map((item) => ({
          name: String(item?.name || "Requirement").slice(0, 180),
          submitted: Boolean(item?.submitted),
        }))
      : null;

    const disbursedAt = body.disbursedAt ? new Date(body.disbursedAt) : null;
    if (disbursedAt && Number.isNaN(disbursedAt.getTime())) {
      return res.status(400).json({ message: "Disbursement date is not a valid date." });
    }

    try {
      const result = await runQuery(
        `
          UPDATE applications
          SET academic_year = ?, semester = ?, program = ?, application_type = ?,
              gpa = ?, award_amount = ?, disbursed_at = ?, documents_json = ?
          WHERE id = ?
        `,
        [
          academicYear,
          semester,
          program,
          applicationType,
          gpa,
          awardAmount,
          disbursedAt ? disbursedAt.toISOString() : null,
          documents ? JSON.stringify(documents) : null,
          id,
        ]
      );

      if (!result.affectedRows) {
        return res.status(404).json({ message: "Application not found" });
      }

      // The grade and the award recorded here are what every prediction and
      // every disbursement figure is computed from, so "who entered this" is
      // as worth recording as who approved the application.
      recordAudit(req, {
        action: "application.academics",
        entityType: "application",
        entityId: id,
        summary: `Recorded the academic record for application #${id}${
          gpa == null ? "" : ` (GPA ${gpa})`
        }`,
        metadata: {
          academicYear,
          semester,
          program,
          applicationType,
          gpa,
          awardAmount,
          disbursedAt: disbursedAt ? disbursedAt.toISOString() : null,
          documentCount: documents ? documents.length : null,
        },
      });

      return res.json({ message: "Academic record saved." });
    } catch (err) {
      console.log("Application Academics Update Error:", err);
      return res.status(500).json({ message: "Failed to save the academic record." });
    }
  };

  return { getAdminAnalytics, getStudentAnalytics, updateApplicationAcademics };
};

module.exports.buildAdminAnalytics = buildAdminAnalytics;
module.exports.applyFilters = applyFilters;
module.exports.buildFilterOptions = buildFilterOptions;
