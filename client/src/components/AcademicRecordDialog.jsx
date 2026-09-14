import { useEffect, useMemo, useState } from "react";
import api from "../api";
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  inputStyle,
  mutedTextStyle,
} from "../sharedStyles";

// ---------------------------------------------------------------
// Academic record editor
// ---------------------------------------------------------------
// The analytics pages are only as good as what is recorded here. This is
// the one place the term, the reported grade, the award and the document
// checklist are entered, and it is admin-only on purpose: a self-reported
// GPA feeding a renewal prediction would make the prediction worthless.

const SEMESTERS = ["1st Semester", "2nd Semester", "Summer"];
const GPA_MIN = 0;
const GPA_MAX = 4;

// Mirrors parseRequirements() in server/analytics.js. It is duplicated
// rather than shared because the client and the server are separate
// bundles here; if a third caller ever needs it, lift it into a package.
const parseRequirements = (requirementsText) =>
  String(requirementsText || "")
    .split(/\r?\n|(?:^|\s)[•·]\s|;\s*/)
    .map((line) =>
      line
        .replace(/^\s*(?:[-*–—]|\d+[.)])\s*/, "")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter((line) => line.length > 2)
    .slice(0, 12);

// Two academic years either side of the current one covers the terms an
// office is realistically still editing.
const academicYearOptions = () => {
  const now = new Date();
  // A Philippine academic year starts in August, so anything before then
  // still belongs to the year that began the previous calendar year.
  const startYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return Array.from({ length: 5 }, (_, index) => {
    const year = startYear + 1 - index;
    return `${year}-${year + 1}`;
  });
};

const programFromCourseYear = (courseYear) =>
  String(courseYear || "")
    .replace(/[-–—,|]?\s*\b([1-6])(st|nd|rd|th)?\s*[- ]?\s*year\b.*$/i, "")
    .replace(/[-–—,|\s]+$/, "")
    .trim();

const toDateInput = (value) => (value ? new Date(value).toISOString().slice(0, 10) : "");

const AcademicRecordDialog = ({ application, onClose, onSaved }) => {
  const requirements = useMemo(
    () => parseRequirements(application?.requirements),
    [application?.requirements]
  );

  const [form, setForm] = useState(() => ({
    academicYear: application?.academic_year || "",
    semester: application?.semester || "",
    program: application?.program || programFromCourseYear(application?.course_year),
    applicationType: application?.application_type === "Renewal" ? "Renewal" : "New",
    gpa: application?.gpa != null ? String(application.gpa) : "",
    awardAmount: application?.award_amount != null ? String(application.award_amount) : "",
    disbursedAt: toDateInput(application?.disbursed_at),
  }));

  const [documents, setDocuments] = useState(() => {
    const saved = (() => {
      try {
        const parsed = JSON.parse(application?.documents_json || "null");
        return Array.isArray(parsed) ? parsed : null;
      } catch {
        return null;
      }
    })();

    if (saved) return saved.map((item) => ({ name: item.name, submitted: Boolean(item.submitted) }));
    return requirements.map((name) => ({ name, submitted: false }));
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const setField = (name, value) => setForm((current) => ({ ...current, [name]: value }));

  const toggleDocument = (index) =>
    setDocuments((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, submitted: !item.submitted } : item
      )
    );

  const submittedCount = documents.filter((item) => item.submitted).length;
  const completionPercent = documents.length
    ? Math.round((submittedCount / documents.length) * 100)
    : 0;

  const handleSubmit = async (event) => {
    event.preventDefault();

    const gpaValue = form.gpa === "" ? null : Number(form.gpa);
    if (gpaValue != null && (!Number.isFinite(gpaValue) || gpaValue < GPA_MIN || gpaValue > GPA_MAX)) {
      setError(`GPA must be between ${GPA_MIN.toFixed(2)} and ${GPA_MAX.toFixed(2)}.`);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await api.put(`/applications/${application.id}/academics`, {
        academicYear: form.academicYear,
        semester: form.semester,
        program: form.program,
        applicationType: form.applicationType,
        gpa: form.gpa === "" ? null : gpaValue,
        awardAmount: form.awardAmount === "" ? null : Number(form.awardAmount),
        disbursedAt: form.disbursedAt || null,
        documents: documents.length ? documents : null,
      });

      onSaved?.("success", "Academic record saved.");
      onClose();
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message || "Could not save the academic record. Try again."
      );
    } finally {
      setSaving(false);
    }
  };

  if (!application) return null;

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" aria-label="Academic record">
      <form style={dialogStyle} onSubmit={handleSubmit}>
        <header style={dialogHeaderStyle}>
          <div style={{ minWidth: 0 }}>
            <span style={eyebrowStyle}>Academic record</span>
            <h2 style={dialogTitleStyle}>{application.student_name}</h2>
            <p style={{ ...mutedTextStyle, fontSize: "13px", margin: 0 }}>
              {application.scholarship_title} · {application.email}
            </p>
          </div>
          <button type="button" style={closeButtonStyle} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <p style={helpTextStyle}>
          These fields feed the analytics dashboards and the student's eligibility, renewal and
          disbursement estimates. Leaving one blank is fine — the estimates say when an input is
          missing rather than guessing at it.
        </p>

        {error && <div style={errorStyle}>{error}</div>}

        <div style={fieldGridStyle}>
          <label style={fieldStyle}>
            <span style={labelStyle}>Academic year</span>
            <select
              style={inputStyle}
              value={form.academicYear}
              onChange={(event) => setField("academicYear", event.target.value)}
            >
              <option value="">Not set</option>
              {academicYearOptions().map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
              {form.academicYear && !academicYearOptions().includes(form.academicYear) && (
                <option value={form.academicYear}>{form.academicYear}</option>
              )}
            </select>
          </label>

          <label style={fieldStyle}>
            <span style={labelStyle}>Semester</span>
            <select
              style={inputStyle}
              value={form.semester}
              onChange={(event) => setField("semester", event.target.value)}
            >
              <option value="">Not set</option>
              {SEMESTERS.map((semester) => (
                <option key={semester} value={semester}>
                  {semester}
                </option>
              ))}
            </select>
          </label>

          <label style={fieldStyle}>
            <span style={labelStyle}>Program</span>
            <input
              style={inputStyle}
              value={form.program}
              onChange={(event) => setField("program", event.target.value)}
              placeholder="BS Information Technology"
            />
          </label>

          <label style={fieldStyle}>
            <span style={labelStyle}>Application type</span>
            <select
              style={inputStyle}
              value={form.applicationType}
              onChange={(event) => setField("applicationType", event.target.value)}
            >
              <option value="New">New</option>
              <option value="Renewal">Renewal</option>
            </select>
          </label>

          <label style={fieldStyle}>
            <span style={labelStyle}>GPA this term (4.00 scale)</span>
            <input
              style={inputStyle}
              type="number"
              min={GPA_MIN}
              max={GPA_MAX}
              step="0.01"
              value={form.gpa}
              onChange={(event) => setField("gpa", event.target.value)}
              placeholder="3.25"
            />
          </label>

          <label style={fieldStyle}>
            <span style={labelStyle}>Award amount (₱)</span>
            <input
              style={inputStyle}
              type="number"
              min="0"
              step="1"
              value={form.awardAmount}
              onChange={(event) => setField("awardAmount", event.target.value)}
              placeholder="7500"
            />
          </label>

          <label style={fieldStyle}>
            <span style={labelStyle}>Date released</span>
            <input
              style={inputStyle}
              type="date"
              value={form.disbursedAt}
              onChange={(event) => setField("disbursedAt", event.target.value)}
            />
          </label>
        </div>

        <section style={documentSectionStyle}>
          <div style={documentHeaderStyle}>
            <span style={labelStyle}>Requirements received</span>
            <strong style={completionStyle}>
              {submittedCount} of {documents.length} · {completionPercent}%
            </strong>
          </div>

          {documents.length === 0 ? (
            <p style={{ ...mutedTextStyle, fontSize: "13px", margin: 0 }}>
              This scholarship has no requirement list published, so completion falls back to
              counting the files the student uploaded. Add requirements to the scholarship to get a
              checklist here.
            </p>
          ) : (
            <ul style={documentListStyle}>
              {documents.map((item, index) => (
                <li key={item.name} style={documentItemStyle}>
                  <label style={checkboxLabelStyle}>
                    <input
                      type="checkbox"
                      checked={item.submitted}
                      onChange={() => toggleDocument(index)}
                      style={{ width: "17px", height: "17px", accentColor: colors.primary }}
                    />
                    <span>{item.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer style={dialogFooterStyle}>
          <button type="button" style={buttonSecondaryStyle} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" style={buttonPrimaryStyle} disabled={saving}>
            {saving ? "Saving…" : "Save record"}
          </button>
        </footer>
      </form>
    </div>
  );
};

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.55)",
  display: "grid",
  placeItems: "center",
  padding: "18px",
  zIndex: 60,
  overflowY: "auto",
};

const dialogStyle = {
  ...cardStyle,
  width: "min(660px, 100%)",
  maxHeight: "min(88vh, 900px)",
  overflowY: "auto",
  display: "grid",
  gap: "16px",
  borderRadius: "18px",
};

const dialogHeaderStyle = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "14px",
};

const eyebrowStyle = {
  display: "block",
  color: colors.primary,
  fontSize: "11.5px",
  fontWeight: 800,
  letterSpacing: "0.09em",
  textTransform: "uppercase",
  marginBottom: "6px",
};

const dialogTitleStyle = {
  margin: "0 0 4px",
  fontSize: "20px",
  color: colors.text,
};

const closeButtonStyle = {
  background: "transparent",
  border: `1px solid ${colors.border}`,
  borderRadius: "9px",
  width: "32px",
  height: "32px",
  color: colors.muted,
  flex: "0 0 auto",
};

const helpTextStyle = {
  ...mutedTextStyle,
  margin: 0,
  fontSize: "12.5px",
  background: colors.pageAlt,
  border: `1px dashed ${colors.border}`,
  borderRadius: "10px",
  padding: "10px 12px",
};

const errorStyle = {
  background: "var(--viz-critical-wash)",
  border: "1px solid var(--viz-critical)",
  color: "var(--viz-critical-ink)",
  borderRadius: "10px",
  padding: "10px 12px",
  fontSize: "13px",
};

const fieldGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))",
  gap: "13px",
};

const fieldStyle = {
  display: "grid",
  gap: "6px",
  minWidth: 0,
};

const labelStyle = {
  fontSize: "11.5px",
  fontWeight: 800,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: colors.muted,
};

const documentSectionStyle = {
  borderTop: `1px solid ${colors.border}`,
  paddingTop: "14px",
  display: "grid",
  gap: "10px",
};

const documentHeaderStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
};

const completionStyle = {
  fontSize: "13px",
  color: colors.text,
  fontVariantNumeric: "tabular-nums",
};

const documentListStyle = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: "8px",
};

const documentItemStyle = {
  fontSize: "13.5px",
};

const checkboxLabelStyle = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  cursor: "pointer",
  color: colors.text,
  lineHeight: 1.4,
};

const dialogFooterStyle = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "10px",
  borderTop: `1px solid ${colors.border}`,
  paddingTop: "14px",
};

export default AcademicRecordDialog;
