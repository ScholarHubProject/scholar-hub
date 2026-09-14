// ============================================================
// Scholarship analytics and prediction
// ============================================================
// Every number a student sees on the analytics page is produced here,
// from data the office already holds. Nothing in this file talks to the
// database or to Express: it takes plain records in and returns plain
// objects out, so the rules can be read, argued with, and unit tested
// without a server running.
//
// Two principles the office asked for, encoded rather than assumed:
//
//   1. A prediction is never presented as a decision. Every predictive
//      function returns a `basis` string explaining what it was computed
//      from, and the client is required to print it beside the number.
//   2. A missing input lowers confidence, it does not invent a value.
//      A student with no recorded grades gets "not enough history",
//      not a guess dressed up as 92%.

// ------------------------------------------------------------
// Grading scale
// ------------------------------------------------------------
// The office runs a 4.00-point scale where a higher number is better and
// 2.00 is the retention minimum ("maintain a GPA above 2.0"). A campus on
// the 1.00-5.00 scale, where 1.00 is highest, changes these four values
// and nothing else: every comparison below goes through isBetterGpa(),
// gpaQuality() and the constants here.
const GPA_SCALE = {
  max: 4.0,
  min: 0.0,
  retentionMinimum: 2.0,
  higherIsBetter: true,
};

// A grade this close to the cut-off is a warning, not yet a failure.
const GPA_WARNING_MARGIN = 0.25;

const STATUS = {
  PENDING: "Pending Review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

const SEMESTER_ORDER = ["1st Semester", "2nd Semester", "Summer"];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const round = (value, digits = 0) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
};

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

// Withdrawn has to be named here rather than falling through to Pending. It is
// the one status the office did not choose, and counting it as pending would
// put an application nobody is waiting on into the review backlog and into the
// "awaiting decision" figure on every dashboard.
const normalizeStatus = (value) => {
  const status = String(value || "").trim().toLowerCase();
  if (status === "approved") return STATUS.APPROVED;
  if (status === "rejected" || status === "disapproved") return STATUS.REJECTED;
  if (status === "withdrawn") return STATUS.WITHDRAWN;
  return STATUS.PENDING;
};

// A course_year field holds things like "BS Information Technology - 3rd
// Year" or "BSIT 4". The program is everything before the year, so the
// per-program charts group "BSIT 2" and "BSIT 4" together instead of
// treating each year level as its own course.
const programFromCourseYear = (courseYear) => {
  const raw = String(courseYear || "").trim();
  if (!raw) return "Unspecified";

  const withoutYear = raw
    .replace(/[-–—,|]?\s*\b([1-6])(st|nd|rd|th)?\s*[- ]?\s*year\b.*$/i, "")
    .replace(/[-–—,|]?\s*\byear\s*[1-6]\b.*$/i, "")
    .replace(/[-–—,|]\s*[1-6]\s*$/i, "")
    .replace(/\s+[1-6]\s*$/i, "")
    .replace(/[-–—,|\s]+$/, "")
    .trim();

  return withoutYear || raw;
};

const yearLevelFromCourseYear = (courseYear) => {
  const raw = String(courseYear || "");
  const ordinal = raw.match(/\b([1-6])(?:st|nd|rd|th)?\s*[- ]?\s*year\b/i);
  if (ordinal) return `${ordinal[1]}`;
  const trailing = raw.match(/\b([1-6])\s*$/);
  return trailing ? trailing[1] : "";
};

// The term a date falls in, on a Philippine academic calendar: the year
// opens in August, the second semester in January, and June-July is the
// summer term. Used to stamp a new application with the term it covers so
// it lands in the per-semester charts straight away; the coordinator can
// correct it from the academic record editor.
const termForDate = (value = new Date()) => {
  const date = new Date(value);
  const month = date.getMonth();
  const year = date.getFullYear();

  if (month >= 7) return { academicYear: `${year}-${year + 1}`, semester: "1st Semester" };
  if (month <= 4) return { academicYear: `${year - 1}-${year}`, semester: "2nd Semester" };
  return { academicYear: `${year - 1}-${year}`, semester: "Summer" };
};

// Sorts "2024-2025 · 1st Semester" style terms chronologically.
const termKey = (academicYear, semester) => {
  const startYear = Number(String(academicYear || "").slice(0, 4)) || 0;
  const index = SEMESTER_ORDER.indexOf(String(semester || "").trim());
  return startYear * 10 + (index === -1 ? 9 : index);
};

const termLabel = (academicYear, semester) => {
  const year = String(academicYear || "").trim();
  const term = String(semester || "").trim();
  if (year && term) return `${term.replace(" Semester", " Sem")} ${year}`;
  return year || term || "Unassigned term";
};

// ------------------------------------------------------------
// Requirements and document completion
// ------------------------------------------------------------
// A scholarship's requirements are stored as free text because that is
// how the coordinator writes them. Split it into one line per document so
// the checklist has something to check against.
const parseRequirements = (requirementsText) => {
  const text = String(requirementsText || "").trim();
  if (!text) return [];

  return text
    .split(/\r?\n|(?:^|\s)[•·]\s|;\s*/)
    .map((line) =>
      line
        .replace(/^\s*(?:[-*–—]|\d+[.)])\s*/, "")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter((line) => line.length > 2)
    .slice(0, 12);
};

const parseJson = (value, fallback) => {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

// The checklist the coordinator ticks off is authoritative. When it has
// not been filled in yet, fall back to counting uploads against the
// requirement list so a brand new application still reports something
// honest rather than 0%.
const documentCompletion = (application, scholarship) => {
  const required = parseRequirements(
    application?.requirements || scholarship?.requirements || ""
  );
  const checklist = parseJson(application?.documents_json, null);
  const uploadCount = Array.isArray(application?.uploaded_files)
    ? application.uploaded_files.length
    : parseJson(application?.uploaded_files_json, []).length ||
      (application?.uploaded_file_path ? 1 : 0);

  if (Array.isArray(checklist) && checklist.length > 0) {
    const items = checklist.map((item) => ({
      name: String(item.name || "Requirement"),
      submitted: Boolean(item.submitted),
    }));
    const submitted = items.filter((item) => item.submitted).length;

    return {
      percent: round((submitted / items.length) * 100),
      submittedCount: submitted,
      requiredCount: items.length,
      items,
      completed: items.filter((item) => item.submitted).map((item) => item.name),
      missing: items.filter((item) => !item.submitted).map((item) => item.name),
      source: "checklist",
    };
  }

  if (required.length === 0) {
    // Nothing to check against: report on uploads alone rather than
    // claiming a percentage that has no denominator.
    return {
      percent: uploadCount > 0 ? 100 : 0,
      submittedCount: uploadCount,
      requiredCount: uploadCount,
      items: [],
      completed: [],
      missing: [],
      source: "uploads-only",
    };
  }

  const covered = Math.min(uploadCount, required.length);
  const items = required.map((name, index) => ({
    name,
    submitted: index < covered,
  }));

  return {
    percent: round((covered / required.length) * 100),
    submittedCount: covered,
    requiredCount: required.length,
    items,
    completed: items.filter((item) => item.submitted).map((item) => item.name),
    missing: items.filter((item) => !item.submitted).map((item) => item.name),
    source: "uploads-vs-requirements",
  };
};

// How complete the folder was each term, for the small trend on the
// analytics card. One point per term, ordered chronologically, so a
// student can see whether their paperwork is getting better or worse
// rather than only where it stands today.
const documentCompletionHistory = (applications, scholarshipsById = new Map()) => {
  const byTerm = new Map();

  (applications || []).forEach((application) => {
    const scholarship = scholarshipsById.get(Number(application.scholarship_id)) || null;
    const completion = documentCompletion(application, scholarship);

    // "uploads-only" means the scholarship published no requirement
    // list, so its percentage has no real denominator. Plotting it would
    // draw a term at 100% next to terms measured against four documents.
    if (completion.requiredCount === 0 || completion.source === "uploads-only") return;

    byTerm.set(termKey(application.academic_year, application.semester), {
      key: termKey(application.academic_year, application.semester),
      label: termLabel(application.academic_year, application.semester),
      percent: completion.percent,
      submittedCount: completion.submittedCount,
      requiredCount: completion.requiredCount,
    });
  });

  return [...byTerm.values()].sort((a, b) => a.key - b.key);
};

// ------------------------------------------------------------
// GPA trend
// ------------------------------------------------------------
// Each application carries the grade the student reported for the term it
// covers, so the sequence of a student's applications is their academic
// record as the office knows it. Ordering is by term, not by submission
// date, because a late renewal filed in March still describes first
// semester.
const gpaTrend = (applications) => {
  const points = (applications || [])
    .map((application) => ({
      gpa: toNumber(application.gpa),
      academicYear: application.academic_year,
      semester: application.semester,
      key: termKey(application.academic_year, application.semester),
      label: termLabel(application.academic_year, application.semester),
    }))
    .filter((point) => point.gpa != null && point.gpa > 0);

  // One row per term: a student may file two applications in the same
  // semester and the grade is a property of the term, not the form.
  const byTerm = new Map();
  points.forEach((point) => {
    byTerm.set(point.key, point);
  });

  const series = [...byTerm.values()].sort((a, b) => a.key - b.key);

  if (series.length === 0) {
    return {
      series: [],
      latest: null,
      previous: null,
      average: null,
      change: null,
      direction: "unknown",
      summary: "No grades recorded yet.",
      scale: GPA_SCALE,
    };
  }

  const values = series.map((point) => point.gpa);
  const latest = values[values.length - 1];
  const previous = values.length > 1 ? values[values.length - 2] : null;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const change = previous == null ? null : round(latest - previous, 2);

  // A movement smaller than a tenth of a point is term-to-term noise on a
  // 4.00 scale, so it is reported as stable rather than as a trend.
  let direction = "stable";
  if (change != null && Math.abs(change) >= 0.1) {
    const rising = change > 0;
    direction = rising === GPA_SCALE.higherIsBetter ? "improving" : "declining";
  } else if (change == null) {
    direction = "new";
  }

  const summary =
    direction === "improving"
      ? `Up ${Math.abs(change).toFixed(2)} from last term.`
      : direction === "declining"
        ? `Down ${Math.abs(change).toFixed(2)} from last term.`
        : direction === "new"
          ? "First recorded term - no trend yet."
          : "Holding steady across the last two terms.";

  return {
    series,
    latest: round(latest, 2),
    previous: previous == null ? null : round(previous, 2),
    average: round(average, 2),
    change,
    direction,
    summary,
    scale: GPA_SCALE,
  };
};

// Maps a grade onto 0-1, where 1 is the top of the scale and 0 is the
// retention minimum. Everything below the minimum scores 0.
const gpaQuality = (gpa) => {
  if (gpa == null) return null;
  const { max, retentionMinimum, higherIsBetter } = GPA_SCALE;

  if (higherIsBetter) {
    return clamp((gpa - retentionMinimum) / (max - retentionMinimum), 0, 1);
  }

  return clamp((retentionMinimum - gpa) / (retentionMinimum - GPA_SCALE.min), 0, 1);
};

const isBetterGpa = (gpa, threshold) =>
  GPA_SCALE.higherIsBetter ? gpa >= threshold : gpa <= threshold;

// ------------------------------------------------------------
// Eligibility score
// ------------------------------------------------------------
// A weighted read of the four things the committee actually looks at.
// The weights are stated here so a student who asks "why 78?" can be
// given the same four numbers the system used.
const ELIGIBILITY_WEIGHTS = {
  academic: 40,
  documents: 30,
  standing: 20,
  history: 10,
};

const eligibilityScore = ({ gpa, documentPercent, status, trendDirection, priorApprovals = 0 }) => {
  const factors = [];

  const academicQuality = gpaQuality(gpa);
  // With no grade on file the academic block is scored at the midpoint
  // rather than at zero: an unknown is not a failure, but it cannot earn
  // full marks either. The factor list says so out loud.
  const academicRatio = academicQuality == null ? 0.5 : academicQuality;
  factors.push({
    label: "Academic standing",
    weight: ELIGIBILITY_WEIGHTS.academic,
    earned: round(academicRatio * ELIGIBILITY_WEIGHTS.academic, 1),
    detail:
      academicQuality == null
        ? "No grade on file - scored at the midpoint until one is recorded."
        : `GPA ${gpa.toFixed(2)} against a ${GPA_SCALE.retentionMinimum.toFixed(2)} minimum.`,
  });

  const documentRatio = clamp((Number(documentPercent) || 0) / 100, 0, 1);
  factors.push({
    label: "Requirements submitted",
    weight: ELIGIBILITY_WEIGHTS.documents,
    earned: round(documentRatio * ELIGIBILITY_WEIGHTS.documents, 1),
    detail: `${round(documentPercent)}% of the required documents are on file.`,
  });

  const normalized = normalizeStatus(status);
  // A withdrawn application scores the same as a pending one rather than as a
  // rejection: nobody judged it. Scoring it as a refusal would mean a student
  // who corrected their own mistake is penalised for having done so.
  const standingRatio =
    normalized === STATUS.APPROVED ? 1 : normalized === STATUS.REJECTED ? 0.15 : 0.6;
  factors.push({
    label: "Application standing",
    weight: ELIGIBILITY_WEIGHTS.standing,
    earned: round(standingRatio * ELIGIBILITY_WEIGHTS.standing, 1),
    detail:
      normalized === STATUS.APPROVED
        ? "Current application is approved."
        : normalized === STATUS.REJECTED
          ? "Latest application was not approved."
          : normalized === STATUS.WITHDRAWN
            ? "Latest application was withdrawn."
            : "Application is still under review.",
  });

  const historyRatio = clamp(priorApprovals / 2, 0, 1);
  const trendBonus =
    trendDirection === "improving" ? 0.15 : trendDirection === "declining" ? -0.15 : 0;
  const historyEarned = clamp(historyRatio + trendBonus, 0, 1) * ELIGIBILITY_WEIGHTS.history;
  factors.push({
    label: "Scholarship history",
    weight: ELIGIBILITY_WEIGHTS.history,
    earned: round(historyEarned, 1),
    detail:
      priorApprovals > 0
        ? `${priorApprovals} previously approved application${priorApprovals === 1 ? "" : "s"}.`
        : "No previously approved application on record.",
  });

  const score = round(factors.reduce((sum, factor) => sum + factor.earned, 0));
  const band = score >= 80 ? "strong" : score >= 60 ? "on track" : score >= 40 ? "needs work" : "at risk";

  return {
    score,
    band,
    factors,
    basis:
      "Weighted from academic standing (40), requirements submitted (30), application standing (20) and scholarship history (10).",
  };
};

// ------------------------------------------------------------
// Renewal prediction
// ------------------------------------------------------------
// Deliberately simple and legible: the eligibility score carries most of
// it, then the two things that most often cost a student a renewal in
// practice - a grade near the cut-off, and missing paperwork - are
// applied as explicit adjustments. Confidence drops when the inputs are
// thin, and the client prints the confidence alongside the number.
const renewalPrediction = ({
  eligibility,
  gpa,
  trendDirection,
  documentPercent,
  priorApprovals = 0,
  termsRecorded = 0,
}) => {
  const drivers = [];
  let probability = clamp(eligibility, 0, 100) * 0.85;

  if (gpa != null) {
    if (!isBetterGpa(gpa, GPA_SCALE.retentionMinimum)) {
      probability -= 30;
      drivers.push({
        tone: "critical",
        label: `GPA ${gpa.toFixed(2)} is below the ${GPA_SCALE.retentionMinimum.toFixed(2)} retention minimum.`,
      });
    } else if (!isBetterGpa(gpa, GPA_SCALE.retentionMinimum + GPA_WARNING_MARGIN)) {
      probability -= 12;
      drivers.push({
        tone: "warning",
        label: `GPA ${gpa.toFixed(2)} is close to the retention minimum.`,
      });
    } else {
      probability += 6;
      drivers.push({ tone: "good", label: `GPA ${gpa.toFixed(2)} clears the retention minimum comfortably.` });
    }
  }

  if (trendDirection === "improving") {
    probability += 5;
    drivers.push({ tone: "good", label: "Grades are trending up." });
  } else if (trendDirection === "declining") {
    probability -= 8;
    drivers.push({ tone: "warning", label: "Grades are trending down." });
  }

  if (documentPercent >= 100) {
    probability += 6;
    drivers.push({ tone: "good", label: "All required documents are on file." });
  } else if (documentPercent < 60) {
    probability -= 10;
    drivers.push({
      tone: "warning",
      label: `Only ${round(documentPercent)}% of the required documents are on file.`,
    });
  }

  if (priorApprovals >= 2) {
    probability += 5;
    drivers.push({ tone: "good", label: "Renewed successfully more than once before." });
  }

  probability = round(clamp(probability, 2, 97));

  // Two terms of grades plus a filled-in checklist is what this model
  // needs to say anything firm. Less than that and it says so.
  const inputScore = (termsRecorded >= 2 ? 2 : termsRecorded) + (documentPercent > 0 ? 1 : 0);
  const confidence = inputScore >= 3 ? "high" : inputScore === 2 ? "moderate" : "low";

  return {
    probability,
    confidence,
    band: probability >= 75 ? "likely" : probability >= 50 ? "borderline" : "unlikely",
    drivers,
    basis:
      "Estimated from the eligibility score, the latest GPA against the retention minimum, the grade trend, document completion and past renewals.",
  };
};

// ------------------------------------------------------------
// Estimated award
// ------------------------------------------------------------
// Preference order: the amount already recorded on the application, then
// what this scholarship has actually paid other students, then any peso
// figure written into the benefits text. If none of those exist there is
// no estimate - an invented number here would be read as a promise.
const PESO_PATTERN = /(₱|\bphp\b|\bp)?\s*(\d{1,3}(?:[,\s]\d{3})+|\d{4,7})(?:\.\d{2})?/gi;
const MIN_PLAUSIBLE_AWARD = 1000;
const MAX_PLAUSIBLE_AWARD = 500000;
const YEAR_RANGE = [1900, 2100];

const parseBenefitAmounts = (benefitsText) => {
  const text = String(benefitsText || "");
  const amounts = [];
  let match = PESO_PATTERN.exec(text);

  while (match) {
    const [, marker, digits] = match;
    const value = Number(String(digits).replace(/[,\s]/g, ""));
    const isMarked = Boolean(marker) || /[,\s]/.test(digits);
    // "AY 2025" and "for 2026" are the common false positives: a bare
    // four-digit number in the calendar range with no currency marker and
    // no thousands separator is a year, not a stipend.
    const looksLikeYear =
      !isMarked && value >= YEAR_RANGE[0] && value <= YEAR_RANGE[1];

    if (
      Number.isFinite(value) &&
      !looksLikeYear &&
      value >= MIN_PLAUSIBLE_AWARD &&
      value <= MAX_PLAUSIBLE_AWARD
    ) {
      amounts.push(value);
    }

    match = PESO_PATTERN.exec(text);
  }

  PESO_PATTERN.lastIndex = 0;
  return amounts;
};

const estimatedAward = ({ recordedAmount, historicalAmounts = [], benefitsText }) => {
  const recorded = toNumber(recordedAmount);
  if (recorded && recorded > 0) {
    return {
      min: round(recorded),
      max: round(recorded),
      isEstimate: false,
      basis: "Amount recorded on this application by the scholarship office.",
    };
  }

  const history = historicalAmounts.map(toNumber).filter((value) => value && value > 0);
  if (history.length >= 2) {
    const sorted = [...history].sort((a, b) => a - b);
    // The middle 80% of what this scholarship has actually paid. The tails
    // are usually a partial award or a one-off top-up.
    const low = sorted[Math.floor(sorted.length * 0.1)];
    const high = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.9) - 1)];

    return {
      min: round(low),
      max: round(high),
      isEstimate: true,
      basis: `Range of the ${history.length} awards this scholarship has released.`,
    };
  }

  const stated = parseBenefitAmounts(benefitsText);
  if (stated.length > 0) {
    return {
      min: round(Math.min(...stated)),
      max: round(Math.max(...stated)),
      isEstimate: true,
      basis: "Read from the benefits published with this scholarship.",
    };
  }

  return {
    min: null,
    max: null,
    isEstimate: true,
    basis: "No award amount has been published or released for this scholarship yet.",
  };
};

// ------------------------------------------------------------
// Disbursement prediction
// ------------------------------------------------------------
// How long approval-to-release has actually taken, applied to this
// student's approval date. The margin is the spread of those same
// releases, so a scholarship that always pays on time shows a tight
// window and an erratic one shows a wide one.
const DEFAULT_RELEASE_DAYS = 30;
const MIN_MARGIN_DAYS = 2;
const MAX_MARGIN_DAYS = 21;

const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const disbursementPrediction = ({ approvedAt, historicalLeadDays = [], alreadyDisbursedAt }) => {
  if (alreadyDisbursedAt) {
    return {
      date: new Date(alreadyDisbursedAt).toISOString(),
      marginDays: 0,
      isEstimate: false,
      basis: "This award has already been released.",
    };
  }

  if (!approvedAt) {
    return {
      date: null,
      marginDays: null,
      isEstimate: true,
      basis: "A release date is estimated once the application is approved.",
    };
  }

  const leadDays = historicalLeadDays.map(toNumber).filter((value) => value != null && value >= 0);
  const typicalLead = leadDays.length >= 2 ? median(leadDays) : DEFAULT_RELEASE_DAYS;

  // Median absolute deviation rather than a standard deviation: a single
  // release that sat for six months should widen the window a little, not
  // swamp it.
  const deviations = leadDays.map((value) => Math.abs(value - typicalLead));
  const margin = leadDays.length >= 3 ? median(deviations) : MIN_MARGIN_DAYS;

  const predicted = new Date(approvedAt);
  predicted.setDate(predicted.getDate() + Math.round(typicalLead));

  return {
    date: predicted.toISOString(),
    marginDays: clamp(Math.round(margin) || MIN_MARGIN_DAYS, MIN_MARGIN_DAYS, MAX_MARGIN_DAYS),
    isEstimate: true,
    basis:
      leadDays.length >= 2
        ? `Typical ${Math.round(typicalLead)}-day gap between approval and release across ${leadDays.length} past awards.`
        : `No release history yet, so the office's standard ${DEFAULT_RELEASE_DAYS}-day processing window is used.`,
  };
};

// ------------------------------------------------------------
// Warnings and recommended actions
// ------------------------------------------------------------
// Ordered by severity so the page can print the first one as the banner.
const atRiskWarnings = ({ gpa, trendDirection, documentCompletion: docs, status, deadline }) => {
  const warnings = [];
  const minimum = GPA_SCALE.retentionMinimum.toFixed(2);

  if (gpa != null && !isBetterGpa(gpa, GPA_SCALE.retentionMinimum)) {
    warnings.push({
      id: "gpa-below-minimum",
      tone: "critical",
      title: "At-risk warning",
      message: `Your GPA of ${gpa.toFixed(2)} is below the retention minimum. Maintain a GPA above ${minimum} to keep your scholarship.`,
      action: "Speak to your adviser about a grade recovery plan before the term ends.",
    });
  } else if (gpa != null && !isBetterGpa(gpa, GPA_SCALE.retentionMinimum + GPA_WARNING_MARGIN)) {
    warnings.push({
      id: "gpa-near-minimum",
      tone: "warning",
      title: "At-risk warning",
      message: `Your GPA of ${gpa.toFixed(2)} is close to the cut-off. Maintain a GPA above ${minimum} to keep your scholarship.`,
      action: "A single low grade this term could drop you below the minimum.",
    });
  }

  if (trendDirection === "declining") {
    warnings.push({
      id: "gpa-declining",
      tone: "warning",
      title: "Grades are slipping",
      message: "Your GPA has gone down compared with last semester.",
      action: "Renewal reviews look at the trend, not just the latest number.",
    });
  }

  if (docs && docs.requiredCount > 0 && docs.percent < 100) {
    const missingCount = docs.requiredCount - docs.submittedCount;
    warnings.push({
      id: "documents-missing",
      tone: docs.percent < 60 ? "critical" : "warning",
      title: "Requirements incomplete",
      message: `${missingCount} of ${docs.requiredCount} required document${missingCount === 1 ? " is" : "s are"} still missing.`,
      action: docs.missing.length ? `Still needed: ${docs.missing.join(", ")}.` : "Upload the remaining documents.",
    });
  }

  if (deadline) {
    const daysLeft = Math.ceil((new Date(deadline) - Date.now()) / 86400000);
    if (daysLeft >= 0 && daysLeft <= 14 && normalizeStatus(status) === STATUS.PENDING) {
      warnings.push({
        id: "deadline-near",
        tone: daysLeft <= 5 ? "critical" : "warning",
        title: "Deadline approaching",
        message: `The deadline for this scholarship is in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`,
        action: "Anything still missing has to be in before then.",
      });
    }
  }

  const severity = { critical: 0, warning: 1, good: 2 };
  return warnings.sort((a, b) => severity[a.tone] - severity[b.tone]);
};

const recommendedActions = ({ warnings, documentCompletion: docs, status, renewal, gpaTrend: trend }) => {
  const actions = [];

  if (docs && docs.missing.length > 0) {
    actions.push({
      id: "upload-documents",
      label: `Upload ${docs.missing.length} missing document${docs.missing.length === 1 ? "" : "s"}`,
      detail: docs.missing.slice(0, 3).join(", "),
      to: "/application-form",
      priority: 1,
    });
  }

  if (normalizeStatus(status) === STATUS.PENDING) {
    actions.push({
      id: "track-status",
      label: "Check your application status",
      detail: "Your application is still with the scholarship office.",
      to: "/track-status",
      priority: 3,
    });
  }

  if (trend?.direction === "declining" || warnings.some((warning) => warning.id.startsWith("gpa"))) {
    actions.push({
      id: "academic-support",
      label: "Book academic advising",
      detail: `Keep your GPA above ${GPA_SCALE.retentionMinimum.toFixed(2)} to stay eligible.`,
      to: "/notifications",
      priority: 2,
    });
  }

  if (renewal && renewal.probability >= 75 && (!docs || docs.percent >= 100)) {
    actions.push({
      id: "stay-the-course",
      label: "You are on track - keep it up",
      detail: "Nothing is outstanding on your file right now.",
      to: "/track-status",
      priority: 5,
    });
  }

  return actions.sort((a, b) => a.priority - b.priority).slice(0, 4);
};

// ------------------------------------------------------------
// The whole student picture
// ------------------------------------------------------------
// `applications` is every application the student has filed, newest
// first; `scholarships` is a lookup used for requirements, benefits and
// deadlines; `awardHistory` and `leadTimes` are campus-wide figures the
// two predictions calibrate against.
const buildStudentAnalytics = ({
  applications = [],
  scholarshipsById = new Map(),
  awardHistoryByScholarship = new Map(),
  leadTimesByScholarship = new Map(),
  campusLeadTimes = [],
}) => {
  const ordered = [...applications].sort(
    (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
  );
  const current = ordered[0] || null;
  const scholarship = current ? scholarshipsById.get(Number(current.scholarship_id)) || null : null;

  const trend = gpaTrend(ordered);
  const docs = documentCompletion(current, scholarship);
  const docsHistory = documentCompletionHistory(ordered, scholarshipsById);
  const priorApprovals = ordered
    .slice(1)
    .filter((application) => normalizeStatus(application.status) === STATUS.APPROVED).length;

  const eligibility = eligibilityScore({
    gpa: trend.latest,
    documentPercent: docs.percent,
    status: current?.status,
    trendDirection: trend.direction,
    priorApprovals,
  });

  const renewal = renewalPrediction({
    eligibility: eligibility.score,
    gpa: trend.latest,
    trendDirection: trend.direction,
    documentPercent: docs.percent,
    priorApprovals,
    termsRecorded: trend.series.length,
  });

  const scholarshipId = Number(current?.scholarship_id);
  const award = estimatedAward({
    recordedAmount: current?.award_amount,
    historicalAmounts: awardHistoryByScholarship.get(scholarshipId) || [],
    benefitsText: scholarship?.benefits,
  });

  const leadTimes = leadTimesByScholarship.get(scholarshipId) || campusLeadTimes;
  const disbursement = disbursementPrediction({
    approvedAt:
      normalizeStatus(current?.status) === STATUS.APPROVED
        ? current?.status_updated_at || current?.created_at
        : null,
    historicalLeadDays: leadTimes,
    alreadyDisbursedAt: current?.disbursed_at,
  });

  const warnings = atRiskWarnings({
    gpa: trend.latest,
    trendDirection: trend.direction,
    documentCompletion: docs,
    status: current?.status,
    deadline: scholarship?.deadline,
  });

  return {
    hasApplication: Boolean(current),
    current: current
      ? {
          id: current.id,
          scholarshipId: current.scholarship_id,
          scholarshipTitle: current.scholarship_title,
          status: normalizeStatus(current.status),
          rawStatus: current.status,
          remarks: current.remarks,
          applicationType: current.application_type || "New",
          academicYear: current.academic_year || "",
          semester: current.semester || "",
          program: current.program || programFromCourseYear(current.course_year),
          submittedAt: current.created_at,
          statusUpdatedAt: current.status_updated_at,
          deadline: scholarship?.deadline || null,
        }
      : null,
    gpa: trend,
    documents: { ...docs, history: docsHistory },
    eligibility,
    renewal,
    award,
    disbursement,
    warnings,
    actions: recommendedActions({
      warnings,
      documentCompletion: docs,
      status: current?.status,
      renewal,
      gpaTrend: trend,
    }),
    history: ordered.map((application) => ({
      id: application.id,
      scholarshipTitle: application.scholarship_title,
      status: normalizeStatus(application.status),
      term: termLabel(application.academic_year, application.semester),
      applicationType: application.application_type || "New",
      gpa: toNumber(application.gpa),
      submittedAt: application.created_at,
    })),
  };
};

module.exports = {
  GPA_SCALE,
  STATUS,
  SEMESTER_ORDER,
  atRiskWarnings,
  buildStudentAnalytics,
  disbursementPrediction,
  documentCompletion,
  documentCompletionHistory,
  eligibilityScore,
  estimatedAward,
  gpaQuality,
  gpaTrend,
  normalizeStatus,
  parseBenefitAmounts,
  parseRequirements,
  programFromCourseYear,
  recommendedActions,
  renewalPrediction,
  termForDate,
  termKey,
  termLabel,
  yearLevelFromCourseYear,
};
