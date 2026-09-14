// Run with: npm test  (from the server directory)
//
// The rules in rules.js decide who gets an award, so the cases below are the
// ones where being wrong is silent: a slot charged twice, a renewal refused as
// a duplicate, a coordinator deactivating the last admin account and locking
// the office out of its own system.

const test = require("node:test");
const assert = require("node:assert");

const rules = require("./rules");

// ------------------------------------------------------------------
// Passwords and email
// ------------------------------------------------------------------
test("describePasswordProblem accepts a real password and names each failure", () => {
  assert.equal(rules.describePasswordProblem("scholar2026"), null);

  assert.match(rules.describePasswordProblem("short1"), /at least 8/);
  assert.match(rules.describePasswordProblem("nodigitshere"), /letter and one number/);
  assert.match(rules.describePasswordProblem("12345678"), /letter and one number/);
  assert.match(rules.describePasswordProblem("a1".repeat(120)), /shorter than/);
  assert.match(rules.describePasswordProblem(""), /at least 8/);
});

test("describeEmailProblem skips the domain check when no domain is configured", () => {
  assert.equal(rules.describeEmailProblem("student@gmail.com"), null);
  assert.equal(rules.describeEmailProblem("student@gmail.com", { allowedDomains: [] }), null);
  assert.match(rules.describeEmailProblem("not-an-email"), /valid email/);
  assert.match(rules.describeEmailProblem("two@@at.com"), /valid email/);
});

test("describeEmailProblem allows subdomains of a configured school domain", () => {
  const allowedDomains = ["university.edu.ph"];

  assert.equal(
    rules.describeEmailProblem("me@university.edu.ph", { allowedDomains }),
    null
  );
  assert.equal(
    rules.describeEmailProblem("me@students.university.edu.ph", { allowedDomains }),
    null
  );
  // A domain that merely ends with the same letters is a different domain.
  assert.match(
    rules.describeEmailProblem("me@notuniversity.edu.ph", { allowedDomains }),
    /school email/
  );
  assert.match(rules.describeEmailProblem("me@gmail.com", { allowedDomains }), /school email/);
});

// ------------------------------------------------------------------
// Applying
// ------------------------------------------------------------------
test("a closed or expired scholarship takes no applications", () => {
  const open = { status: "Open", past_deadline: false };

  assert.equal(rules.describeScholarshipAvailability(open), null);
  // The status arrives from the database with whatever casing was typed.
  assert.equal(rules.describeScholarshipAvailability({ ...open, status: " open " }), null);

  assert.equal(
    rules.describeScholarshipAvailability({ ...open, status: "Closed" }).status,
    409
  );
  assert.equal(rules.describeScholarshipAvailability(null).status, 404);

  const expired = rules.describeScholarshipAvailability({
    ...open,
    past_deadline: true,
    deadline: "2026-01-31",
  });
  assert.equal(expired.status, 409);
  assert.match(expired.message, /2026-01-31/);
});

test("a rejected or withdrawn application does not block a new one", () => {
  const term = { academicYear: "2025-2026", semester: "1st Semester" };

  // Three earlier attempts, none of them pending and none approved this term.
  assert.equal(
    rules.describeDuplicateApplication(
      { total: 3, pending: 0, approved_this_term: 0 },
      term
    ),
    null
  );

  const pending = rules.describeDuplicateApplication(
    { total: 1, pending: 1, approved_this_term: 0 },
    term
  );
  assert.equal(pending.status, 409);
  assert.match(pending.message, /waiting for review/);

  const held = rules.describeDuplicateApplication(
    { total: 2, pending: 0, approved_this_term: 1 },
    term
  );
  assert.equal(held.status, 409);
  assert.match(held.message, /1st Semester, 2025-2026/);
});

test("an approval from an earlier term leaves a renewal free to apply", () => {
  // total counts every prior attempt; approved_this_term counts only the term
  // being applied for. A scholar renewing has the first and not the second.
  const counts = { total: 1, pending: 0, approved_this_term: 0 };

  assert.equal(rules.describeDuplicateApplication(counts, {}), null);
  assert.equal(rules.resolveApplicationType(counts), "Renewal");
  assert.equal(rules.resolveApplicationType({ total: 0 }), "New");
  assert.equal(rules.resolveApplicationType({}), "New");
});

// ------------------------------------------------------------------
// Slots
// ------------------------------------------------------------------
test("a slot moves on the transition, never on the new value", () => {
  assert.deepEqual(rules.slotTransition("Pending Review", "Approved"), {
    claims: true,
    releases: false,
  });
  assert.deepEqual(rules.slotTransition("Approved", "Rejected"), {
    claims: false,
    releases: true,
  });
  assert.deepEqual(rules.slotTransition("Approved", "Pending Review"), {
    claims: false,
    releases: true,
  });

  // Re-approving an approved application must not take a second slot: this is
  // the bug the whole read-before-write in updateApplicationStatus exists for.
  assert.deepEqual(rules.slotTransition("Approved", "Approved"), {
    claims: false,
    releases: false,
  });

  // Neither side approved: nothing moves.
  assert.deepEqual(rules.slotTransition("Pending Review", "Rejected"), {
    claims: false,
    releases: false,
  });
});

// ------------------------------------------------------------------
// Ownership
// ------------------------------------------------------------------
test("ownership comes from the token, never from the row's email alone", () => {
  const user = { id: 7, email: "ace@school.edu" };

  assert.equal(rules.isApplicationOwner({ user_id: 7, email: "other@x.com" }, user), true);
  assert.equal(rules.isApplicationOwner({ user_id: 9, email: "ace@school.edu" }, user), false);

  // Rows filed before user_id existed fall back to the email — but only when
  // the row genuinely has no owner id to compare against.
  assert.equal(
    rules.isApplicationOwner({ user_id: null, email: "ACE@School.edu" }, user),
    true
  );
  assert.equal(rules.isApplicationOwner({ user_id: null, email: "x@y.com" }, user), false);
  assert.equal(rules.isApplicationOwner(null, user), false);
  assert.equal(rules.isApplicationOwner({ user_id: 7 }, null), false);
});

// ------------------------------------------------------------------
// Withdrawal and documents
// ------------------------------------------------------------------
test("only the owner may withdraw, and only while the application is pending", () => {
  const user = { id: 4, email: "ace@school.edu" };
  const pending = { id: 1, user_id: 4, status: "Pending Review" };

  assert.equal(rules.describeWithdrawProblem(pending, user), null);

  assert.equal(
    rules.describeWithdrawProblem(pending, { id: 5, email: "other@x.com" }).status,
    403
  );
  assert.equal(rules.describeWithdrawProblem(null, user).status, 404);

  const approved = rules.describeWithdrawProblem({ ...pending, status: "Approved" }, user);
  assert.equal(approved.status, 409);
  assert.match(approved.message, /scholarship office/);

  assert.equal(
    rules.describeWithdrawProblem({ ...pending, status: "Withdrawn" }, user).status,
    409
  );
});

test("documents can be added while pending and are frozen once decided", () => {
  const user = { id: 4 };
  const pending = { id: 1, user_id: 4, status: "Pending Review" };

  assert.equal(
    rules.describeDocumentChangeProblem(pending, user, { existingCount: 3, addedCount: 2 }),
    null
  );

  // The application form is index 0, so the cap is ten requirements plus it.
  const tooMany = rules.describeDocumentChangeProblem(pending, user, {
    existingCount: 11,
    addedCount: 1,
  });
  assert.equal(tooMany.status, 400);
  assert.match(tooMany.message, /at most 10/);

  assert.equal(
    rules.describeDocumentChangeProblem({ ...pending, status: "Approved" }, user, {}).status,
    409
  );
  assert.equal(
    rules.describeDocumentChangeProblem(pending, { id: 99 }, {}).status,
    403
  );
});

test("a document removal cannot reach the application form or a missing index", () => {
  const user = { id: 4 };
  const pending = { id: 1, user_id: 4, status: "Pending Review" };

  assert.equal(
    rules.describeDocumentRemovalProblem(pending, user, { index: 1, fileCount: 3 }),
    null
  );

  // Index 0 is the application form itself.
  assert.equal(
    rules.describeDocumentRemovalProblem(pending, user, { index: 0, fileCount: 3 }).status,
    404
  );
  assert.equal(
    rules.describeDocumentRemovalProblem(pending, user, { index: 3, fileCount: 3 }).status,
    404
  );
  assert.equal(
    rules.describeDocumentRemovalProblem(pending, user, { index: -1, fileCount: 3 }).status,
    404
  );
});

// ------------------------------------------------------------------
// Account administration
// ------------------------------------------------------------------
test("an admin cannot demote or deactivate themselves", () => {
  const actor = { id: 1, role: "Admin" };
  const self = { id: 1, role: "Admin", is_active: true };

  assert.match(
    rules.describeUserChangeProblem({
      actor,
      target: self,
      changes: { role: "Student" },
      activeAdminCount: 4,
    }).message,
    /your own role/
  );

  assert.match(
    rules.describeUserChangeProblem({
      actor,
      target: self,
      changes: { isActive: false },
      activeAdminCount: 4,
    }).message,
    /your own account/
  );

  // Editing their own name is fine.
  assert.equal(
    rules.describeUserChangeProblem({
      actor,
      target: self,
      changes: { fullname: "Ace" },
      activeAdminCount: 4,
    }),
    null
  );
});

test("the last active admin cannot be demoted or deactivated", () => {
  const actor = { id: 1, role: "Admin" };
  const otherAdmin = { id: 2, role: "Admin", is_active: true };

  for (const changes of [{ role: "Student" }, { isActive: false }]) {
    const problem = rules.describeUserChangeProblem({
      actor,
      target: otherAdmin,
      changes,
      activeAdminCount: 1,
    });

    assert.equal(problem.status, 409);
    assert.match(problem.message, /last active admin/);
  }

  // With a second admin in place, the same change is allowed.
  assert.equal(
    rules.describeUserChangeProblem({
      actor,
      target: otherAdmin,
      changes: { role: "Student" },
      activeAdminCount: 2,
    }),
    null
  );

  // A student is never the last admin, whatever the count says.
  assert.equal(
    rules.describeUserChangeProblem({
      actor,
      target: { id: 3, role: "Student", is_active: true },
      changes: { isActive: false },
      activeAdminCount: 1,
    }),
    null
  );
});

test("a role outside the two the app knows is refused", () => {
  const problem = rules.describeUserChangeProblem({
    actor: { id: 1, role: "Admin" },
    target: { id: 2, role: "Student", is_active: true },
    changes: { role: "Superuser" },
    activeAdminCount: 2,
  });

  assert.equal(problem.status, 400);
  assert.equal(rules.describeUserChangeProblem({ actor: {}, target: null }).status, 404);
});

// ------------------------------------------------------------------
// Announcements
// ------------------------------------------------------------------
test("an announcement is visible inside its window and to its audience only", () => {
  const now = new Date("2026-03-01T00:00:00Z");
  const live = { audience: "All", publish_at: null, expires_at: null };

  assert.equal(rules.isAnnouncementVisible(live, { role: "Student", now }), true);

  const scheduled = { ...live, publish_at: "2026-04-01T00:00:00Z" };
  assert.equal(rules.isAnnouncementVisible(scheduled, { role: "Student", now }), false);
  // An admin manages the schedule, so they see what has not gone out yet.
  assert.equal(rules.isAnnouncementVisible(scheduled, { role: "Admin", now }), true);

  const expired = { ...live, expires_at: "2026-02-01T00:00:00Z" };
  assert.equal(rules.isAnnouncementVisible(expired, { role: "Student", now }), false);

  const staffOnly = { ...live, audience: "Admins" };
  assert.equal(rules.isAnnouncementVisible(staffOnly, { role: "Student", now }), false);

  const studentsOnly = { ...live, audience: "Students" };
  assert.equal(rules.isAnnouncementVisible(studentsOnly, { role: "Student", now }), true);

  assert.equal(rules.isAnnouncementVisible(null, { role: "Student", now }), false);
});

test("an announcement cannot expire before it is published", () => {
  assert.equal(
    rules.describeAnnouncementProblem({
      content: "Orientation moved to Friday.",
      audience: "Students",
      publishAt: "2026-03-01T00:00:00Z",
      expiresAt: "2026-03-08T00:00:00Z",
    }),
    null
  );

  assert.match(
    rules.describeAnnouncementProblem({
      content: "Orientation moved to Friday.",
      publishAt: "2026-03-08T00:00:00Z",
      expiresAt: "2026-03-01T00:00:00Z",
    }).message,
    /expire before/
  );

  assert.match(
    rules.describeAnnouncementProblem({ content: "   " }).message,
    /content is required/
  );

  assert.match(
    rules.describeAnnouncementProblem({ content: "x", audience: "Everyone" }).message,
    /All, Students or Admins/
  );
});
