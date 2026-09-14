-- ============================================================
-- ScholarHub - fresh start schema for Supabase (PostgreSQL)
-- ============================================================
-- Paste this whole file into the Supabase SQL Editor and click Run.
--
-- WARNING: this is a FRESH START. The DROP statements below delete
-- every ScholarHub table and everything inside them. On a new
-- project there is nothing to lose. On a project with real data,
-- back it up first.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Clear out any previous version of these tables
-- ------------------------------------------------------------
-- CASCADE also removes the foreign key from applications.
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS notification_reads CASCADE;
DROP TABLE IF EXISTS email_verification_tokens CASCADE;
DROP TABLE IF EXISTS password_reset_tokens CASCADE;
DROP TABLE IF EXISTS rate_limits CASCADE;
-- Superseded by rate_limits, which counts any throttled action rather than
-- only sign-in. Dropped here so an upgraded database does not keep a stale copy.
DROP TABLE IF EXISTS login_attempts CASCADE;
DROP TABLE IF EXISTS applications CASCADE;
DROP TABLE IF EXISTS announcements CASCADE;
DROP TABLE IF EXISTS scholarships CASCADE;
DROP TABLE IF EXISTS users CASCADE;


-- ------------------------------------------------------------
-- 2. Accounts (students and admins)
-- ------------------------------------------------------------
-- Emails are stored in lower case. Postgres compares text exactly,
-- so the app lower-cases every email before saving or looking it up.
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  fullname VARCHAR(150) NOT NULL,
  school_id_number VARCHAR(80),
  email VARCHAR(150) NOT NULL UNIQUE,
  course_year VARCHAR(120),
  contact_number VARCHAR(50),
  avatar_path VARCHAR(255),
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'Student',

  -- An account is never deleted: applications, awards and the audit trail all
  -- point back at it, and removing the row would orphan the record of who was
  -- given what. Graduating a scholar or removing a coordinator deactivates
  -- them instead, which stops sign-in and leaves the history intact.
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  deactivated_at TIMESTAMP,

  -- Set when the address is confirmed. NULL means unverified, which blocks
  -- filing an application but not signing in - a student who mistypes their
  -- email must still be able to get in and correct it.
  email_verified_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ------------------------------------------------------------
-- 3. Scholarship programs
-- ------------------------------------------------------------
-- Created before applications, which points at this table.
CREATE TABLE scholarships (
  id SERIAL PRIMARY KEY,
  scholarship_code VARCHAR(80),
  title VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  benefits TEXT,
  qualification TEXT,
  requirements TEXT,
  available_slots INT NOT NULL DEFAULT 0,
  deadline DATE NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'Open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ------------------------------------------------------------
-- 4. Student applications
-- ------------------------------------------------------------
-- Deleting a scholarship leaves its applications in place and just
-- blanks the link, so application history is never lost.
CREATE TABLE applications (
  id SERIAL PRIMARY KEY,
  user_id INT,
  student_name VARCHAR(150) NOT NULL,
  school_id_number VARCHAR(80),
  email VARCHAR(150) NOT NULL,
  course_year VARCHAR(120),
  contact_number VARCHAR(50),
  scholarship_id INT REFERENCES scholarships(id) ON DELETE SET NULL,
  scholarship_title VARCHAR(180) NOT NULL,
  -- 'Pending Review' | 'Approved' | 'Rejected' | 'Withdrawn'.
  -- Withdrawn is the student's own action and is only reachable from
  -- Pending Review, so it never has to give a slot back.
  status VARCHAR(50) NOT NULL DEFAULT 'Pending Review',
  remarks TEXT,
  withdrawn_at TIMESTAMP,
  uploaded_file_name VARCHAR(255),
  uploaded_file_path VARCHAR(255),
  uploaded_file_type VARCHAR(120),
  uploaded_file_size INT,
  uploaded_files_json TEXT,
  status_updated_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Analytics and reporting.
  --
  -- An application is the unit the office already works in, so the term it
  -- covers, the grade reported for that term and the award attached to it
  -- live here rather than in a separate academic-record table. That keeps
  -- a student's GPA history readable as the ordered list of their own
  -- applications, and it means the coordinator records these facts in the
  -- same place they already approve or reject the application.
  academic_year VARCHAR(20),                          -- '2025-2026'
  semester VARCHAR(30),                               -- '1st Semester' | '2nd Semester' | 'Summer'
  program VARCHAR(120),                               -- course without the year level
  application_type VARCHAR(20) NOT NULL DEFAULT 'New',-- 'New' | 'Renewal'
  gpa NUMERIC(4,2),                                   -- 4.00 scale, 2.00 is the retention minimum
  award_amount NUMERIC(12,2),
  disbursed_at TIMESTAMP,
  documents_json TEXT                                 -- [{ "name": "...", "submitted": true }]
);


-- ------------------------------------------------------------
-- 5. Announcements
-- ------------------------------------------------------------
-- An announcement carries its own window and audience rather than being a
-- bare pair of strings that is visible to everyone forever. Both times may be
-- NULL, which is the common case: post it now, leave it up.
CREATE TABLE announcements (
  id SERIAL PRIMARY KEY,
  title VARCHAR(180) NOT NULL,
  content TEXT NOT NULL,
  audience VARCHAR(20) NOT NULL DEFAULT 'All',  -- 'All' | 'Students' | 'Admins'
  publish_at TIMESTAMP,                          -- NULL: visible immediately
  expires_at TIMESTAMP,                          -- NULL: never comes down
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ------------------------------------------------------------
-- 6. Password reset links
-- ------------------------------------------------------------
-- Only the SHA-256 of each token is stored, so a copy of this table cannot be
-- replayed to take over an account. Rows expire after an hour and are marked
-- used once redeemed.
CREATE TABLE password_reset_tokens (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(128) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ------------------------------------------------------------
-- 7. Email confirmation links
-- ------------------------------------------------------------
-- Same shape and same reasoning as password_reset_tokens: only the SHA-256 is
-- stored, so a copy of this table cannot be replayed to confirm an address
-- somebody else owns.
CREATE TABLE email_verification_tokens (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(128) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ------------------------------------------------------------
-- 8. Throttling counters
-- ------------------------------------------------------------
-- Kept in the database rather than in memory because each serverless function
-- instance has its own memory, so an in-process counter would reset whenever
-- the platform started another one.
--
-- This replaces the old login_attempts table. Sign-in was never the only
-- endpoint worth a ceiling: registration and the password-reset request both
-- cost an email and both were unlimited. The identifier is namespaced by the
-- action ("login:ace@x.com|1.2.3.4"), so one table counts them all.
CREATE TABLE rate_limits (
  identifier VARCHAR(220) PRIMARY KEY,
  attempts INT NOT NULL DEFAULT 0,
  first_attempt_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  locked_until TIMESTAMP
);


-- ------------------------------------------------------------
-- 9. Notification read state
-- ------------------------------------------------------------
-- The notification feed is derived rather than stored: an item is an
-- announcement, or a decision on an application, both of which already exist
-- as rows. What could not be derived was whether a person had seen one, so
-- that - and only that - is recorded here.
--
-- notification_key is the synthetic id the feed builds ("announcement-14",
-- "application-88-Approved"). Keying on the status as well as the id means a
-- later decision on the same application arrives as a new unread item instead
-- of inheriting the read state of the old one.
CREATE TABLE notification_reads (
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_key VARCHAR(120) NOT NULL,
  read_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, notification_key)
);


-- ------------------------------------------------------------
-- 10. Audit trail
-- ------------------------------------------------------------
-- Who did what, to which record, and when. status_updated_at answered "when"
-- and nothing answered "who", which is the first question asked about any
-- award. Rows are written by the server and never updated or deleted by it.
--
-- actor_email is denormalised on purpose: it is the address that held the
-- account at the time, and it has to survive a later rename or deactivation
-- for the entry to still mean anything.
CREATE TABLE audit_log (
  id SERIAL PRIMARY KEY,
  actor_id INT REFERENCES users(id) ON DELETE SET NULL,
  actor_email VARCHAR(150),
  actor_role VARCHAR(50),
  action VARCHAR(60) NOT NULL,      -- 'application.status', 'user.deactivate', ...
  entity_type VARCHAR(40) NOT NULL, -- 'application' | 'scholarship' | 'announcement' | 'user'
  entity_id VARCHAR(40),
  summary TEXT NOT NULL,            -- one readable sentence
  metadata_json TEXT,               -- the before/after values, when they matter
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ------------------------------------------------------------
-- 11. Indexes for the lookups the app does most
-- ------------------------------------------------------------
CREATE INDEX idx_users_email ON users (LOWER(email));
CREATE INDEX idx_applications_email ON applications (LOWER(email));
CREATE INDEX idx_applications_user_id ON applications (user_id);
CREATE INDEX idx_applications_scholarship_id ON applications (scholarship_id);
-- The analytics endpoints scan applications by term and by status.
CREATE INDEX idx_applications_term ON applications (academic_year, semester);
CREATE INDEX idx_applications_status ON applications (status);
CREATE INDEX idx_reset_token_hash ON password_reset_tokens (token_hash);
CREATE INDEX idx_verify_token_hash ON email_verification_tokens (token_hash);
-- The account list filters on role and active state and sorts by name.
CREATE INDEX idx_users_role ON users (role, is_active);
-- Every announcement read filters on the publish window.
CREATE INDEX idx_announcements_window ON announcements (publish_at, expires_at);
-- The audit page reads newest first, and filters to one record when opened
-- from that record.
CREATE INDEX idx_audit_created_at ON audit_log (created_at DESC);
CREATE INDEX idx_audit_entity ON audit_log (entity_type, entity_id);


-- ------------------------------------------------------------
-- 12. Default admin account
-- ------------------------------------------------------------
-- Deliberately not seeded here. Passwords are stored as scrypt hashes, and a
-- hash cannot be written by hand in SQL.
--
-- Instead, set ADMIN_EMAIL and ADMIN_PASSWORD in the server environment and
-- start the server once: it creates the admin account with a proper hash, and
-- leaves it alone on every later start. Then remove ADMIN_PASSWORD.
--
-- The old version of this file inserted 'admin123' as plain text.  If you ran
-- it, that row is still there: log in with it once (the server will re-hash the
-- password automatically) and then change the password from the profile menu.


-- ------------------------------------------------------------
-- 13. Confirm it worked
-- ------------------------------------------------------------
-- Expect nine rows: announcements, applications, audit_log,
-- email_verification_tokens, notification_reads, password_reset_tokens,
-- rate_limits, scholarships, users.
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
