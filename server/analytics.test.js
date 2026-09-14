// Run with: npm test  (from the server directory)
//
// The scoring and prediction rules are the part of this feature a reader
// cannot check by looking at the screen: a wrong weight or an inverted
// comparison produces a number that looks perfectly plausible and is
// wrong for every student. These tests pin the behaviour that matters -
// that a missing input never becomes an invented one, that the retention
// minimum is compared in the right direction, and that a prediction
// always arrives with the basis it was computed from.

const test = require("node:test");
const assert = require("node:assert");

const analytics = require("./analytics");

test("programFromCourseYear strips the year level so courses group together", () => {
  const cases = [
    ["BS Information Technology - 3rd Year", "BS Information Technology"],
    ["BS Information Technology 4th year", "BS Information Technology"],
    ["BSIT - 2", "BSIT"],
    ["BS Education, Year 1", "BS Education"],
    ["BS Nursing", "BS Nursing"],
    ["", "Unspecified"],
  ];

  cases.forEach(([input, expected]) => {
    assert.equal(analytics.programFromCourseYear(input), expected, `for "${input}"`);
  });
});

test("terms sort chronologically, not alphabetically", () => {
  const terms = [
    ["2025-2026", "2nd Semester"],
    ["2024-2025", "1st Semester"],
    ["2025-2026", "1st Semester"],
  ];

  const sorted = terms
    .map(([year, semester]) => ({ key: analytics.termKey(year, semester), year, semester }))
    .sort((a, b) => a.key - b.key)
    .map((entry) => `${entry.semester} ${entry.year}`);

  assert.deepEqual(sorted, [
    "1st Semester 2024-2025",
    "1st Semester 2025-2026",
    "2nd Semester 2025-2026",
  ]);
});

test("termForDate maps a submission date onto the academic calendar", () => {
  const cases = [
    ["2025-08-20", "2025-2026", "1st Semester"],
    ["2025-12-02", "2025-2026", "1st Semester"],
    ["2026-01-15", "2025-2026", "2nd Semester"],
    ["2026-05-30", "2025-2026", "2nd Semester"],
    ["2026-06-10", "2025-2026", "Summer"],
  ];

  cases.forEach(([date, year, semester]) => {
    const term = analytics.termForDate(`${date}T04:00:00`);
    assert.equal(term.academicYear, year, `year for ${date}`);
    assert.equal(term.semester, semester, `semester for ${date}`);
  });
});

test("gpaTrend reports direction and ignores movement inside the noise band", () => {
  const build = (grades) =>
    grades.map(([academic_year, semester, gpa]) => ({ academic_year, semester, gpa }));

  const improving = analytics.gpaTrend(
    build([
      ["2024-2025", "1st Semester", 2.5],
      ["2024-2025", "2nd Semester", 3.2],
    ])
  );
  assert.equal(improving.direction, "improving");
  assert.equal(improving.latest, 3.2);

  const declining = analytics.gpaTrend(
    build([
      ["2024-2025", "1st Semester", 3.4],
      ["2024-2025", "2nd Semester", 2.6],
    ])
  );
  assert.equal(declining.direction, "declining");

  // A five-hundredths move is term-to-term noise, not a trend.
  const stable = analytics.gpaTrend(
    build([
      ["2024-2025", "1st Semester", 3.0],
      ["2024-2025", "2nd Semester", 3.05],
    ])
  );
  assert.equal(stable.direction, "stable");

  const none = analytics.gpaTrend([]);
  assert.equal(none.direction, "unknown");
  assert.equal(none.latest, null, "no grades must not produce a grade");
});

test("gpaTrend keeps one point per term even with two applications in a semester", () => {
  const trend = analytics.gpaTrend([
    { academic_year: "2024-2025", semester: "1st Semester", gpa: 3.1 },
    { academic_year: "2024-2025", semester: "1st Semester", gpa: 3.1 },
    { academic_year: "2024-2025", semester: "2nd Semester", gpa: 3.3 },
  ]);

  assert.equal(trend.series.length, 2);
});

test("documentCompletion prefers the coordinator's checklist over upload counting", () => {
  const completion = analytics.documentCompletion(
    {
      documents_json: JSON.stringify([
        { name: "Form 137", submitted: true },
        { name: "Certificate of Indigency", submitted: false },
      ]),
      uploaded_files: [{}, {}, {}, {}],
    },
    { requirements: "Form 137\nCertificate of Indigency" }
  );

  assert.equal(completion.source, "checklist");
  assert.equal(completion.percent, 50);
  assert.deepEqual(completion.missing, ["Certificate of Indigency"]);
});

test("documentCompletion falls back to uploads against the requirement list", () => {
  const completion = analytics.documentCompletion(
    { uploaded_files: [{}, {}] },
    { requirements: "1. Form 137\n2. Certificate of Indigency\n3. Grade slip\n4. Photo" }
  );

  assert.equal(completion.requiredCount, 4);
  assert.equal(completion.submittedCount, 2);
  assert.equal(completion.percent, 50);
});

test("documentCompletion does not claim a percentage with no denominator", () => {
  const completion = analytics.documentCompletion({ uploaded_files: [{}] }, { requirements: "" });

  assert.equal(completion.source, "uploads-only");
  assert.equal(completion.requiredCount, 1);
});

test("documentCompletionHistory returns one ordered point per term", () => {
  const scholarships = new Map([[1, { id: 1, requirements: "Form 137\nPhoto\nGrade slip\nClearance" }]]);

  const history = analytics.documentCompletionHistory(
    [
      {
        scholarship_id: 1,
        academic_year: "2025-2026",
        semester: "1st Semester",
        documents_json: JSON.stringify([
          { name: "Form 137", submitted: true },
          { name: "Photo", submitted: true },
          { name: "Grade slip", submitted: true },
          { name: "Clearance", submitted: false },
        ]),
      },
      {
        scholarship_id: 1,
        academic_year: "2024-2025",
        semester: "1st Semester",
        documents_json: JSON.stringify([
          { name: "Form 137", submitted: true },
          { name: "Photo", submitted: false },
          { name: "Grade slip", submitted: false },
          { name: "Clearance", submitted: false },
        ]),
      },
    ],
    scholarships
  );

  assert.deepEqual(
    history.map((point) => point.percent),
    [25, 75],
    "oldest term first, so the card reads left to right"
  );
});

test("documentCompletionHistory skips terms with nothing to check against", () => {
  const history = analytics.documentCompletionHistory(
    [{ scholarship_id: 9, academic_year: "2025-2026", semester: "1st Semester", uploaded_files: [{}] }],
    new Map()
  );

  assert.deepEqual(history, [], "a percentage with no denominator is not a data point");
});

test("eligibilityScore scores a missing grade at the midpoint and says so", () => {
  const scored = analytics.eligibilityScore({
    gpa: null,
    documentPercent: 100,
    status: "Pending Review",
    trendDirection: "unknown",
  });

  const academic = scored.factors.find((factor) => factor.label === "Academic standing");
  assert.equal(academic.earned, 20, "half of the 40-point academic block");
  assert.match(academic.detail, /No grade on file/);
  assert.ok(scored.basis.includes("40"), "the weights must be stated back to the reader");
});

test("eligibilityScore is bounded and its factors add up to the score", () => {
  const best = analytics.eligibilityScore({
    gpa: 4.0,
    documentPercent: 100,
    status: "Approved",
    trendDirection: "improving",
    priorApprovals: 3,
  });
  assert.equal(best.score, 100);
  assert.equal(best.band, "strong");

  const worst = analytics.eligibilityScore({
    gpa: 0,
    documentPercent: 0,
    status: "Rejected",
    trendDirection: "declining",
    priorApprovals: 0,
  });
  assert.ok(worst.score >= 0 && worst.score < 40, `expected a low score, got ${worst.score}`);

  const total = best.factors.reduce((sum, factor) => sum + factor.earned, 0);
  assert.equal(Math.round(total), best.score);
});

test("renewalPrediction penalises a grade below the retention minimum", () => {
  const shared = { documentPercent: 100, trendDirection: "stable", termsRecorded: 3 };

  const safe = analytics.renewalPrediction({ ...shared, eligibility: 70, gpa: 3.5 });
  const atRisk = analytics.renewalPrediction({ ...shared, eligibility: 70, gpa: 1.5 });

  assert.ok(
    atRisk.probability < safe.probability - 20,
    `below-minimum GPA should cost a lot: ${atRisk.probability} vs ${safe.probability}`
  );
  assert.ok(atRisk.drivers.some((driver) => driver.tone === "critical"));
  assert.ok(safe.basis.length > 0, "a prediction must carry its basis");
});

test("renewalPrediction stays inside 2-97 and lowers confidence on thin inputs", () => {
  const thin = analytics.renewalPrediction({
    eligibility: 100,
    gpa: 4.0,
    trendDirection: "improving",
    documentPercent: 100,
    priorApprovals: 5,
    termsRecorded: 0,
  });

  assert.ok(thin.probability <= 97 && thin.probability >= 2);
  assert.equal(thin.confidence, "low", "one term of data cannot be high confidence");

  const solid = analytics.renewalPrediction({
    eligibility: 80,
    gpa: 3.5,
    trendDirection: "stable",
    documentPercent: 100,
    priorApprovals: 2,
    termsRecorded: 4,
  });
  assert.equal(solid.confidence, "high");
});

test("estimatedAward prefers a recorded amount and never invents one", () => {
  const recorded = analytics.estimatedAward({ recordedAmount: 7500 });
  assert.equal(recorded.isEstimate, false);
  assert.equal(recorded.min, 7500);
  assert.equal(recorded.max, 7500);

  const fromHistory = analytics.estimatedAward({
    historicalAmounts: [5000, 6000, 7000, 7500, 8000],
  });
  assert.equal(fromHistory.isEstimate, true);
  assert.ok(fromHistory.min >= 5000 && fromHistory.max <= 8000);

  const fromText = analytics.estimatedAward({
    benefitsText: "Stipend of ₱5,000 to ₱7,500 per semester, 20 slots available",
  });
  assert.equal(fromText.min, 5000);
  assert.equal(fromText.max, 7500);

  const nothing = analytics.estimatedAward({ benefitsText: "Tuition support" });
  assert.equal(nothing.min, null, "with no figure anywhere there must be no number");
  assert.match(nothing.basis, /No award amount/);
});

test("parseBenefitAmounts ignores slot counts and years", () => {
  assert.deepEqual(analytics.parseBenefitAmounts("20 slots for AY 2025 only"), []);
  assert.deepEqual(analytics.parseBenefitAmounts("Php 12,000 per year"), [12000]);
});

test("disbursementPrediction uses the historic lead time and widens with spread", () => {
  const approvedAt = new Date("2026-09-01T00:00:00Z").toISOString();

  const withHistory = analytics.disbursementPrediction({
    approvedAt,
    historicalLeadDays: [28, 30, 32, 31, 29],
  });
  const predicted = new Date(withHistory.date);
  assert.equal(predicted.getUTCMonth(), 9, "30 days after 1 September lands in October");
  assert.ok(withHistory.marginDays >= 2);
  assert.equal(withHistory.isEstimate, true);

  const noHistory = analytics.disbursementPrediction({ approvedAt, historicalLeadDays: [] });
  assert.match(noHistory.basis, /standard 30-day/);

  const notApproved = analytics.disbursementPrediction({ approvedAt: null });
  assert.equal(notApproved.date, null, "an undecided application gets no release date");

  const paid = analytics.disbursementPrediction({
    approvedAt,
    alreadyDisbursedAt: "2026-10-05T00:00:00Z",
  });
  assert.equal(paid.isEstimate, false);
  assert.equal(paid.marginDays, 0);
});

test("atRiskWarnings orders the most serious first and quotes the minimum", () => {
  const warnings = analytics.atRiskWarnings({
    gpa: 1.8,
    trendDirection: "declining",
    documentCompletion: {
      percent: 40,
      requiredCount: 5,
      submittedCount: 2,
      missing: ["Form 137", "Photo", "Grade slip"],
    },
    status: "Pending Review",
  });

  assert.equal(warnings[0].tone, "critical");
  assert.match(warnings[0].message, /above 2\.00/);
  assert.ok(warnings.some((warning) => warning.id === "documents-missing"));
});

test("a clean file produces no warnings", () => {
  const warnings = analytics.atRiskWarnings({
    gpa: 3.6,
    trendDirection: "improving",
    documentCompletion: { percent: 100, requiredCount: 4, submittedCount: 4, missing: [] },
    status: "Approved",
  });

  assert.deepEqual(warnings, []);
});

test("buildStudentAnalytics reports honestly when the file is empty", () => {
  const result = analytics.buildStudentAnalytics({ applications: [] });

  assert.equal(result.hasApplication, false);
  assert.equal(result.current, null);
  assert.equal(result.gpa.latest, null);
  assert.deepEqual(result.history, []);
});

test("buildStudentAnalytics reads the newest application as the current one", () => {
  const scholarshipsById = new Map([
    [1, { id: 1, requirements: "Form 137\nPhoto", benefits: "₱6,000 per semester", deadline: null }],
  ]);

  const result = analytics.buildStudentAnalytics({
    applications: [
      {
        id: 1,
        scholarship_id: 1,
        scholarship_title: "Academic Grant",
        status: "Approved",
        academic_year: "2024-2025",
        semester: "1st Semester",
        gpa: 3.0,
        created_at: "2025-08-01",
        status_updated_at: "2025-08-10",
        application_type: "New",
        uploaded_files: [{}, {}],
      },
      {
        id: 2,
        scholarship_id: 1,
        scholarship_title: "Academic Grant",
        status: "Pending Review",
        academic_year: "2025-2026",
        semester: "1st Semester",
        gpa: 3.4,
        created_at: "2026-08-01",
        application_type: "Renewal",
        uploaded_files: [{}, {}],
      },
    ],
    scholarshipsById,
  });

  assert.equal(result.current.id, 2);
  assert.equal(result.current.applicationType, "Renewal");
  assert.equal(result.gpa.latest, 3.4);
  assert.equal(result.gpa.direction, "improving");
  assert.equal(result.documents.percent, 100);
  assert.equal(result.history.length, 2);
  assert.ok(result.renewal.probability > 0);
  assert.ok(result.eligibility.score > 0);
});

// ------------------------------------------------------------
// Admin summary: people vs forms
// ------------------------------------------------------------
// The dashboard prints these three side by side, so they have to be
// countable in the same unit. Counting the not-qualified as rejected forms
// produced "64 students applied, 106 not qualified", which is not a thing
// that can happen.
const { buildAdminAnalytics } = require("./analyticsRoutes");

test("the student states are exclusive and add up to the applicant total", () => {
  const rows = [
    // One student, three forms, one of them approved: qualified once.
    { user_id: 1, email: "a@x.test", status: "Rejected", created_at: "2026-01-05" },
    { user_id: 1, email: "a@x.test", status: "Rejected", created_at: "2026-01-06" },
    { user_id: 1, email: "a@x.test", status: "Approved", created_at: "2026-01-07" },
    // Every form decided, none approved: not qualified.
    { user_id: 2, email: "b@x.test", status: "Rejected", created_at: "2026-01-08" },
    { user_id: 2, email: "b@x.test", status: "Rejected", created_at: "2026-01-09" },
    // Nothing decided yet: awaiting, not "not qualified".
    { user_id: 3, email: "c@x.test", status: "Pending Review", created_at: "2026-01-10" },
    // A rejection and a pending form: still awaiting a decision.
    { user_id: 4, email: "d@x.test", status: "Rejected", created_at: "2026-01-11" },
    { user_id: 4, email: "d@x.test", status: "Pending Review", created_at: "2026-01-12" },
  ];

  const { summary } = buildAdminAnalytics(rows, 2);

  assert.equal(summary.totalApplicants, 4);
  assert.equal(summary.totalApplications, 8);
  assert.equal(summary.qualifiedStudents, 1);
  assert.equal(summary.notQualifiedStudents, 1);
  assert.equal(summary.awaitingStudents, 2);
  assert.equal(
    summary.qualifiedStudents + summary.notQualifiedStudents + summary.awaitingStudents,
    summary.totalApplicants,
    "every applicant sits in exactly one state"
  );

  // The form-level counts stay in their own unit.
  assert.equal(summary.approvedApplications, 1);
  assert.equal(summary.rejectedApplications, 5);
  assert.equal(summary.pendingApplications, 2);
});

test("a student counted once no matter how many terms they renew", () => {
  const rows = Array.from({ length: 4 }, (unused, index) => ({
    user_id: 7,
    email: "renewer@x.test",
    status: "Approved",
    application_type: "Renewal",
    created_at: `2026-0${index + 1}-01`,
  }));

  const { summary } = buildAdminAnalytics(rows, 1);

  assert.equal(summary.totalApplicants, 1);
  assert.equal(summary.totalApplications, 4);
  assert.equal(summary.qualifiedStudents, 1);
});
