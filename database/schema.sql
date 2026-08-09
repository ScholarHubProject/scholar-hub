-- ============================================================
-- ScholarHub - fresh start schema for Supabase (PostgreSQL)
-- ============================================================
-- Paste this whole file into the Supabase SQL Editor and click Run.
--
-- WARNING: this is a FRESH START. The DROP statements below delete
-- the four ScholarHub tables and everything inside them. On a new
-- project there is nothing to lose. On a project with real data,
-- back it up first.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Clear out any previous version of these tables
-- ------------------------------------------------------------
-- CASCADE also removes the foreign key from applications.
DROP TABLE IF EXISTS password_reset_tokens CASCADE;
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
  status VARCHAR(50) NOT NULL DEFAULT 'Pending Review',
  remarks TEXT,
  uploaded_file_name VARCHAR(255),
  uploaded_file_path VARCHAR(255),
  uploaded_file_type VARCHAR(120),
  uploaded_file_size INT,
  uploaded_files_json TEXT,
  status_updated_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ------------------------------------------------------------
-- 5. Announcements
-- ------------------------------------------------------------
CREATE TABLE announcements (
  id SERIAL PRIMARY KEY,
  title VARCHAR(180) NOT NULL,
  content TEXT NOT NULL,
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
-- 7. Failed sign-in counters
-- ------------------------------------------------------------
-- Kept in the database rather than in memory because each serverless function
-- instance has its own memory, so an in-process counter would reset whenever
-- the platform started another one.
CREATE TABLE login_attempts (
  identifier VARCHAR(200) PRIMARY KEY,
  attempts INT NOT NULL DEFAULT 0,
  first_attempt_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  locked_until TIMESTAMP
);


-- ------------------------------------------------------------
-- 8. Indexes for the lookups the app does most
-- ------------------------------------------------------------
CREATE INDEX idx_users_email ON users (LOWER(email));
CREATE INDEX idx_applications_email ON applications (LOWER(email));
CREATE INDEX idx_applications_user_id ON applications (user_id);
CREATE INDEX idx_applications_scholarship_id ON applications (scholarship_id);
CREATE INDEX idx_reset_token_hash ON password_reset_tokens (token_hash);


-- ------------------------------------------------------------
-- 9. Default admin account
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
-- 10. Confirm it worked
-- ------------------------------------------------------------
-- Expect six rows: announcements, applications, login_attempts,
-- password_reset_tokens, scholarships, users.
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
