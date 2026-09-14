// ---------------------------------------------------------------
// Sign-up and password rules
// ---------------------------------------------------------------
// These mirror describePasswordProblem() and EMAIL_PATTERN in
// server/server.js. The registration page used to enforce a different
// set — a capital, a number and a symbol, with no length floor — so
// "Aa1!" passed the form and was rejected by the server, while a
// perfectly acceptable "starryknight7" was refused by the form the
// server would have taken. One rule, written once, in both places.

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 200;

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const getPasswordChecks = (password) => [
  {
    key: "length",
    label: `At least ${MIN_PASSWORD_LENGTH} characters`,
    met: password.length >= MIN_PASSWORD_LENGTH,
  },
  { key: "letter", label: "Contains a letter", met: /[a-zA-Z]/.test(password) },
  { key: "number", label: "Contains a number", met: /\d/.test(password) },
];

export const describePasswordProblem = (password) => {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`;
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Password must be shorter than ${MAX_PASSWORD_LENGTH} characters.`;
  }

  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    return "Password must contain at least one letter and one number.";
  }

  return null;
};

// Strength is advice, not a rule. "abcdefg1" clears every requirement
// and still reads Weak — the three ticks say it will be accepted, the
// bar says it is not much of a password. Nothing here can block a
// submit, so the meter never becomes a fourth rule the server does not
// know about.
//
// Length is worth more than variety, which is why it scores three of
// the six points: a 26-character passphrase of plain words is a harder
// password than "Abc12!x", and a meter that says otherwise teaches the
// wrong lesson. A password that fails the requirements can never read
// above Weak, so the bar and the checklist cannot contradict.
export const getPasswordStrength = (password) => {
  if (!password) return { score: 0, label: "", tone: "var(--sh-muted)" };

  const weak = { score: 1, label: "Weak", tone: "var(--viz-critical)" };

  if (describePasswordProblem(password)) return weak;

  let score = 0;
  if (password.length >= MIN_PASSWORD_LENGTH) score += 1;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 2) return weak;
  if (score === 3) return { score: 2, label: "Fair", tone: "var(--viz-warning)" };
  if (score === 4) return { score: 3, label: "Good", tone: "var(--viz-series-3)" };
  return { score: 4, label: "Strong", tone: "var(--viz-good)" };
};

// ---------------------------------------------------------------
// Input formatters
// ---------------------------------------------------------------
// The registration form normalises as the user types so the stored row
// matches what the coordinator lists elsewhere in the app.

// The old formatter stripped everything outside A-Z and a space, which
// quietly deleted the hyphen from DELA CRUZ-REYES, the apostrophe from
// D'SOUZA, the period from JR. and — on a roll of Filipino students —
// the Ñ from NUÑEZ. Uppercase is kept, because that is how names are
// recorded everywhere else in the system; the punctuation now survives.
export const formatFullName = (value) =>
  value
    .toUpperCase()
    .replace(/[^\p{L}\s'.,-]/gu, "")
    .replace(/\s{2,}/g, " ");

export const formatCourseYear = (value) =>
  value
    .toUpperCase()
    .replace(/[^\p{L}\p{N}\s&.-]/gu, "")
    .replace(/\s{2,}/g, " ");

// Whatever the user pastes — 0917..., +63 917..., 63917... — reduces to
// the ten digits that sit after the +63 the field already shows.
export const formatContactInput = (value) =>
  value
    .replace(/\D/g, "")
    .replace(/^63/, "")
    .replace(/^0+/, "")
    .slice(0, 10);

// A school ID is nine digits written as an admission year and a serial:
// 2026-00454. Only digits can be typed; the dash is punched in after the
// fourth one so the user never types it, and a pasted "2026-00454" or
// "202600454" both land in the same shape.
export const SCHOOL_ID_LENGTH = 9;
const SCHOOL_ID_YEAR_LENGTH = 4;

export const schoolIdDigits = (value) =>
  String(value ?? "").replace(/\D/g, "").slice(0, SCHOOL_ID_LENGTH);

export const formatSchoolId = (value) => {
  const digits = schoolIdDigits(value);

  // The dash appears only once there is a digit to put after it.
  // Adding it at the fourth digit would make it impossible to delete:
  // backspace would remove it and the next keystroke would put it back.
  if (digits.length <= SCHOOL_ID_YEAR_LENGTH) return digits;

  return `${digits.slice(0, SCHOOL_ID_YEAR_LENGTH)}-${digits.slice(SCHOOL_ID_YEAR_LENGTH)}`;
};

export const isCompleteSchoolId = (value) =>
  schoolIdDigits(value).length === SCHOOL_ID_LENGTH;
