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
-- 6. Indexes for the lookups the app does most
-- ------------------------------------------------------------
CREATE INDEX idx_users_email ON users (LOWER(email));
CREATE INDEX idx_applications_email ON applications (LOWER(email));
CREATE INDEX idx_applications_user_id ON applications (user_id);
CREATE INDEX idx_applications_scholarship_id ON applications (scholarship_id);


-- ------------------------------------------------------------
-- 7. Default admin account
-- ------------------------------------------------------------
-- Login with:  admin@scholarhub.com  /  admin123  /  user type "Admin"
INSERT INTO users (fullname, email, password, role)
VALUES ('Admin User', 'admin@scholarhub.com', 'admin123', 'Admin');


-- ------------------------------------------------------------
-- 8. Confirm it worked
-- ------------------------------------------------------------
-- Expect four rows: announcements, applications, scholarships, users.
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
