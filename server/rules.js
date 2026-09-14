// The rules the app refuses on.
//
// Everything here is a pure function: no Express, no Postgres, no clock it did
// not receive as an argument. That is the whole point. These are the decisions
// that decide whether a student can apply, whether a slot moves, whether a
// coordinator can demote another coordinator — the places where a silent
// mistake costs somebody an award — and they were previously reachable only by
// standing up a database and posting a multipart form at it, which is why they
// had no tests.
//
// Each `describe*Problem` returns null when the action is allowed, or
// { status, message } naming the HTTP status and the sentence the caller sees.
// Returning the message rather than throwing keeps the phrasing next to the
// rule it belongs to instead of scattered across handlers.

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 200;

// Deliberately loose. The authority on whether an address exists is whether the
// verification email arrives; a stricter pattern only rejects real addresses.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STUDENT_EDITABLE_STATUSES = new Set(["Pending Review"]);
const APPLICATION_STATUSES = ["Approved", "Rejected", "Pending Review", "Withdrawn"];
// Only a coordinator sets these. A student's own actions are withdrawal and
// nothing else, so "Withdrawn" is absent here on purpose.
const ADMIN_SETTABLE_STATUSES = ["Approved", "Rejected", "Pending Review"];
const USER_ROLES = ["Student", "Admin"];
const ANNOUNCEMENT_AUDIENCES = ["All", "Students", "Admins"];

const MAX_APPLICATION_FILES = 10;

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const normalizeStatus = (value) => String(value || "").trim();

const describePasswordProblem = (password) => {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`;
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Password must be shorter than ${MAX_PASSWORD_LENGTH} characters.`;
  }

  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must contain at least one letter and one number.";
  }

  return null;
};

// `allowedDomains` is empty on a campus that has not restricted registration,
// and the check is skipped entirely rather than defaulting to some guessed
// domain — locking every student out of a new deployment is worse than
// accepting a personal address.
const describeEmailProblem = (email, { allowedDomains = [] } = {}) => {
  const cleanEmail = normalizeEmail(email);

  if (!cleanEmail || !EMAIL_PATTERN.test(cleanEmail)) {
    return "Please enter a valid email address.";
  }

  if (allowedDomains.length === 0) return null;

  const domain = cleanEmail.split("@")[1] || "";
  const permitted = allowedDomains.some(
    (allowed) => domain === allowed || domain.endsWith(`.${allowed}`)
  );

  if (!permitted) {
    return `Registration is limited to ${allowedDomains
      .map((allowed) => `@${allowed}`)
      .join(", ")} addresses. Use your school email address.`;
  }

  return null;
};

// The client hides a closed scholarship, but hiding a card is not a rule: the
// form posts an id and the API has to answer for itself.
//
// `pastDeadline` is computed in SQL against the campus calendar date rather
// than passed as a Date, because Postgres runs in UTC and comparing there would
// close a scholarship eight hours early for the students applying to it.
const describeScholarshipAvailability = (scholarship) => {
  if (!scholarship) {
    return { status: 404, message: "Selected scholarship not found" };
  }

  if (normalizeStatus(scholarship.status).toLowerCase() !== "open") {
    return {
      status: 409,
      message: "This scholarship is no longer accepting applications.",
    };
  }

  if (scholarship.past_deadline) {
    return {
      status: 409,
      message: `The deadline for this scholarship passed on ${scholarship.deadline}.`,
    };
  }

  return null;
};

// A duplicate is a narrower question than "has applied before". Two counts make
// a submission a duplicate:
//
//   pending            - one is already in the queue, so a second is the same
//                        request filed twice
//   approvedThisTerm   - they already hold this scholarship for the term they
//                        are applying for
//
// A rejected application counts for neither, so a student who was turned down
// can apply again; a withdrawn one counts for neither either, which is what
// makes withdrawal usable as a correction. An approval from an *earlier* term
// counts for neither, which is what keeps renewals working.
const describeDuplicateApplication = (priorCounts = {}, term = {}) => {
  if (Number(priorCounts.pending) > 0) {
    return {
      status: 409,
      message:
        "You already have an application for this scholarship waiting for review.",
    };
  }

  if (Number(priorCounts.approved_this_term ?? priorCounts.approvedThisTerm) > 0) {
    return {
      status: 409,
      message: `You have already been approved for this scholarship for ${term.semester}, ${term.academicYear}.`,
    };
  }

  return null;
};

// Anyone who has filed for this scholarship before is renewing, whatever came
// of the earlier attempt.
const resolveApplicationType = (priorCounts = {}) =>
  Number(priorCounts.total) > 0 ? "Renewal" : "New";

// available_slots counts awards still to be given, so exactly one thing moves
// it: an application entering or leaving the Approved state. The transition is
// what matters, never the new value on its own — re-approving an already
// approved application must not take a second slot.
const slotTransition = (previousStatus, nextStatus) => {
  const from = normalizeStatus(previousStatus);
  const to = normalizeStatus(nextStatus);

  return {
    claims: to === "Approved" && from !== "Approved",
    releases: from === "Approved" && to !== "Approved",
  };
};

const isApplicationOwner = (application, user) => {
  if (!application || !user) return false;
  if (application.user_id != null && Number(application.user_id) === Number(user.id)) {
    return true;
  }

  // Applications filed before user_id was recorded carry only an email. The
  // token's email is the one compared, never one from the request.
  return (
    application.user_id == null &&
    Boolean(user.email) &&
    normalizeEmail(application.email) === normalizeEmail(user.email)
  );
};

// Withdrawal is deliberately limited to an application still awaiting review.
// Letting a student withdraw an approved one would mean a slot has to come back
// on a path a coordinator never sees, and letting them withdraw a rejected one
// would rewrite the record of a decision that was already made.
const describeWithdrawProblem = (application, user) => {
  if (!application) {
    return { status: 404, message: "Application not found" };
  }

  if (!isApplicationOwner(application, user)) {
    return { status: 403, message: "You can only withdraw your own application." };
  }

  const status = normalizeStatus(application.status);

  if (status === "Withdrawn") {
    return { status: 409, message: "This application has already been withdrawn." };
  }

  if (!STUDENT_EDITABLE_STATUSES.has(status)) {
    return {
      status: 409,
      message: `This application was already ${status.toLowerCase()}, so it can no longer be withdrawn. Contact the scholarship office if it needs to be changed.`,
    };
  }

  return null;
};

// The same window governs adding a document. Once a coordinator has decided,
// the file set is the evidence the decision was made on and stops being the
// student's to edit.
const describeDocumentChangeProblem = (
  application,
  user,
  { existingCount = 0, addedCount = 0 } = {}
) => {
  if (!application) {
    return { status: 404, message: "Application not found" };
  }

  if (!isApplicationOwner(application, user)) {
    return { status: 403, message: "You can only change your own application." };
  }

  const status = normalizeStatus(application.status);

  if (!STUDENT_EDITABLE_STATUSES.has(status)) {
    return {
      status: 409,
      message:
        status === "Withdrawn"
          ? "This application was withdrawn, so its documents can no longer be changed."
          : `This application was already ${status.toLowerCase()}. Contact the scholarship office if a document needs to be replaced.`,
    };
  }

  if (addedCount > 0 && existingCount + addedCount > MAX_APPLICATION_FILES + 1) {
    return {
      status: 400,
      message: `An application can hold at most ${MAX_APPLICATION_FILES} requirement files.`,
    };
  }

  return null;
};

// The application form itself is index 0 and is not a requirement file, so it
// is never the one being removed.
const describeDocumentRemovalProblem = (application, user, { index, fileCount }) => {
  const changeProblem = describeDocumentChangeProblem(application, user);

  if (changeProblem) return changeProblem;

  if (!Number.isInteger(index) || index < 1 || index >= fileCount) {
    return { status: 404, message: "That file is not part of this application." };
  }

  return null;
};

// Account administration, where the expensive mistake is locking the office out
// of its own system. Two things are refused for that reason: an admin changing
// their own role or active state (a slip that cannot be undone from inside the
// app), and any change that would leave zero active admins.
const describeUserChangeProblem = ({
  actor,
  target,
  changes = {},
  activeAdminCount = 0,
} = {}) => {
  if (!target) {
    return { status: 404, message: "That account was not found." };
  }

  const isSelf = Number(actor?.id) === Number(target.id);
  const wantsRole = changes.role !== undefined && changes.role !== target.role;
  const wantsDeactivate = changes.isActive === false && target.is_active !== false;

  if (changes.role !== undefined && !USER_ROLES.includes(changes.role)) {
    return { status: 400, message: "A role must be either Student or Admin." };
  }

  if (isSelf && wantsRole) {
    return {
      status: 409,
      message: "You cannot change your own role. Ask another admin to do it.",
    };
  }

  if (isSelf && wantsDeactivate) {
    return { status: 409, message: "You cannot deactivate your own account." };
  }

  const losesAnAdmin =
    target.role === "Admin" &&
    target.is_active !== false &&
    (wantsDeactivate || (wantsRole && changes.role !== "Admin"));

  if (losesAnAdmin && activeAdminCount <= 1) {
    return {
      status: 409,
      message:
        "This is the last active admin account. Promote another account to Admin before changing this one.",
    };
  }

  return null;
};

// An announcement is visible once its publish time has passed, until its expiry,
// and only to the audience it names. An admin sees everything regardless — the
// page they manage announcements on has to show the scheduled and expired ones
// or they could never be edited.
const isAnnouncementVisible = (announcement, { role, now = new Date() } = {}) => {
  if (!announcement) return false;
  if (role === "Admin") return true;

  const audience = announcement.audience || "All";

  if (audience !== "All") {
    if (audience === "Students" && role !== "Student") return false;
    if (audience === "Admins" && role !== "Admin") return false;
  }

  const at = now instanceof Date ? now.getTime() : new Date(now).getTime();

  if (announcement.publish_at && new Date(announcement.publish_at).getTime() > at) {
    return false;
  }

  if (announcement.expires_at && new Date(announcement.expires_at).getTime() <= at) {
    return false;
  }

  return true;
};

const describeAnnouncementProblem = ({ content, audience, publishAt, expiresAt } = {}) => {
  if (!String(content || "").trim()) {
    return { status: 400, message: "Announcement content is required" };
  }

  if (audience && !ANNOUNCEMENT_AUDIENCES.includes(audience)) {
    return { status: 400, message: "Audience must be All, Students or Admins." };
  }

  if (publishAt && expiresAt && new Date(expiresAt) <= new Date(publishAt)) {
    return {
      status: 400,
      message: "An announcement cannot expire before it is published.",
    };
  }

  return null;
};

module.exports = {
  ADMIN_SETTABLE_STATUSES,
  ANNOUNCEMENT_AUDIENCES,
  APPLICATION_STATUSES,
  EMAIL_PATTERN,
  MAX_APPLICATION_FILES,
  MIN_PASSWORD_LENGTH,
  USER_ROLES,
  describeAnnouncementProblem,
  describeDocumentChangeProblem,
  describeDocumentRemovalProblem,
  describeDuplicateApplication,
  describeEmailProblem,
  describePasswordProblem,
  describeScholarshipAvailability,
  describeUserChangeProblem,
  describeWithdrawProblem,
  isAnnouncementVisible,
  isApplicationOwner,
  resolveApplicationType,
  slotTransition,
};
