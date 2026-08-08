import { useEffect, useState } from "react";
import api from "../api";
import {
  buttonDangerStyle,
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardGridStyle,
  cardStyle,
  colors,
  eyebrowStyle,
  inputStyle,
  mutedTextStyle,
  pageHeaderStyle,
  pageStyle,
  shellStyle,
  statusPillStyle,
  titleStyle,
} from "../sharedStyles";

const emptyForm = {
  scholarship_code: "",
  title: "",
  description: "",
  benefits: "",
  qualification: "",
  requirements: "",
  available_slots: "",
  deadline: "",
  status: "Open",
};

const formatDeadline = (deadline) => {
  if (!deadline) return "No deadline set";
  return new Date(deadline).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const toDateInputValue = (deadline) => {
  if (!deadline) return "";
  return new Date(deadline).toISOString().slice(0, 10);
};

const ManageScholarship = () => {
  const [scholarships, setScholarships] = useState([]);
  const [formData, setFormData] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  const showNotice = (type, message) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 3000);
  };

  const loadScholarships = async () => {
    setLoading(true);

    try {
      const response = await api.get("/scholarships");
      setScholarships(response.data);
    } catch (error) {
      console.log("Scholarship load error:", error);
      showNotice("error", "Failed to load scholarships");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isActive = true;

    api
      .get("/scholarships")
      .then((response) => {
        if (isActive) {
          setScholarships(response.data);
        }
      })
      .catch((error) => {
        console.log("Scholarship load error:", error);
        if (isActive) {
          setNotice({ type: "error", message: "Failed to load scholarships" });
        }
      })
      .finally(() => {
        if (isActive) {
          setLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  const updateField = (field, value) => {
    setFormData((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const resetForm = () => {
    setFormData(emptyForm);
    setEditingId(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formData.title.trim() || !formData.description.trim() || !formData.deadline) {
      showNotice("error", "Please complete the title, description, and deadline");
      return;
    }

    setSaving(true);

    try {
      if (editingId) {
        await api.put(`/scholarships/${editingId}`, formData);
        showNotice("success", "Scholarship updated successfully");
      } else {
        await api.post("/scholarships", formData);
        showNotice("success", "Scholarship added successfully");
      }

      resetForm();
      loadScholarships();
    } catch (error) {
      console.log("Scholarship save error:", error);
      showNotice(
        "error",
        error.response?.data?.message || "Failed to save scholarship"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (scholarship) => {
    setEditingId(scholarship.id);
    setFormData({
      scholarship_code: scholarship.scholarship_code || "",
      title: scholarship.title,
      description: scholarship.description,
      benefits: scholarship.benefits || "",
      qualification: scholarship.qualification || "",
      requirements: scholarship.requirements || "",
      available_slots:
        scholarship.available_slots === null || scholarship.available_slots === undefined
          ? ""
          : String(scholarship.available_slots),
      deadline: toDateInputValue(scholarship.deadline),
      status: scholarship.status,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id) => {
    const confirmed = window.confirm("Delete this scholarship record?");

    if (!confirmed) {
      return;
    }

    try {
      await api.delete(`/scholarships/${id}`);
      showNotice("success", "Scholarship deleted successfully");
      loadScholarships();
    } catch (error) {
      console.log("Scholarship delete error:", error);
      showNotice("error", "Failed to delete scholarship");
    }
  };

  return (
    <div style={pageStyle}>
      <main style={shellStyle}>
        <header style={pageHeaderStyle}>
          <span style={eyebrowStyle}>Admin Section</span>
          <h1 style={titleStyle}>Scholarship Management</h1>
          <p style={mutedTextStyle}>
            Create, update, and organize scholarship programs.
          </p>
        </header>

        {notice && (
          <div
            style={{
              ...noticeStyle,
              ...(notice.type === "error" ? errorNoticeStyle : successNoticeStyle),
            }}
          >
            {notice.message}
          </div>
        )}

        <section style={managerGridStyle}>
          <form onSubmit={handleSubmit} style={formCardStyle}>
            <div>
              <span style={eyebrowStyle}>
                {editingId ? "Edit Record" : "New Scholarship"}
              </span>
              <h2 style={formTitleStyle}>
                {editingId ? "Update Scholarship" : "Add Scholarship"}
              </h2>
            </div>

            <input
              style={inputStyle}
              type="text"
              placeholder="Scholarship ID"
              value={formData.scholarship_code}
              onChange={(event) => updateField("scholarship_code", event.target.value)}
            />

            <input
              style={inputStyle}
              type="text"
              placeholder="Scholarship Title"
              value={formData.title}
              onChange={(event) => updateField("title", event.target.value)}
            />

            <textarea
              style={textareaStyle}
              placeholder="Scholarship Description"
              value={formData.description}
              onChange={(event) => updateField("description", event.target.value)}
            />

            <div style={textFieldGridStyle}>
              <textarea
                style={textareaStyle}
                placeholder="Benefits"
                value={formData.benefits}
                onChange={(event) => updateField("benefits", event.target.value)}
              />

              <textarea
                style={textareaStyle}
                placeholder="Qualification"
                value={formData.qualification}
                onChange={(event) => updateField("qualification", event.target.value)}
              />

              <textarea
                style={textareaStyle}
                placeholder="Requirements"
                value={formData.requirements}
                onChange={(event) => updateField("requirements", event.target.value)}
              />
            </div>

            <div style={fieldGridStyle}>
              <input
                style={inputStyle}
                type="number"
                min="0"
                placeholder="Available Slots"
                value={formData.available_slots}
                onChange={(event) => updateField("available_slots", event.target.value)}
              />

              <input
                style={inputStyle}
                type="date"
                value={formData.deadline}
                onChange={(event) => updateField("deadline", event.target.value)}
              />

              <select
                style={inputStyle}
                value={formData.status}
                onChange={(event) => updateField("status", event.target.value)}
              >
                <option value="Open">Open</option>
                <option value="Closed">Closed</option>
                <option value="Upcoming">Upcoming</option>
              </select>
            </div>

            <div style={actionsStyle}>
              <button type="submit" style={buttonPrimaryStyle} disabled={saving}>
                {saving
                  ? "Saving..."
                  : editingId
                    ? "Save Changes"
                    : "Add Scholarship"}
              </button>

              {editingId && (
                <button type="button" style={buttonSecondaryStyle} onClick={resetForm}>
                  Cancel
                </button>
              )}
            </div>
          </form>

          <aside style={summaryCardStyle}>
            <span style={eyebrowStyle}>Records</span>
            <h2 style={summaryNumberStyle}>{scholarships.length}</h2>
            <p style={mutedTextStyle}>Total scholarship programs in the database.</p>
          </aside>
        </section>

        <section style={sectionHeaderStyle}>
          <div>
            <h2 style={listTitleStyle}>Scholarship Records</h2>
            <p style={mutedTextStyle}>Review all posted scholarship opportunities.</p>
          </div>
          <button style={buttonSecondaryStyle} onClick={loadScholarships}>
            Refresh
          </button>
        </section>

        {loading ? (
          <div style={emptyStateStyle}>Loading scholarships...</div>
        ) : scholarships.length === 0 ? (
          <div style={emptyStateStyle}>No scholarships posted yet.</div>
        ) : (
          <section style={cardGridStyle}>
            {scholarships.map((scholarship) => (
              <article key={scholarship.id} style={programCardStyle}>
                <span style={statusPillStyle}>{scholarship.status}</span>
                <p style={scholarshipIdStyle}>
                  Scholarship ID: {scholarship.scholarship_code || `#${scholarship.id}`}
                </p>
                <h3 style={cardTitleStyle}>{scholarship.title}</h3>
                <p style={slotsStyle}>
                  <strong>Available Slots:</strong> {Number(scholarship.available_slots) || 0}
                </p>
                <p style={mutedTextStyle}>{scholarship.description}</p>
                <div style={detailsGridStyle}>
                  <div>
                    <h4 style={detailTitleStyle}>Benefits</h4>
                    <p style={detailTextStyle}>
                      {scholarship.benefits || "No benefits listed yet."}
                    </p>
                  </div>
                  <div>
                    <h4 style={detailTitleStyle}>Qualification</h4>
                    <p style={detailTextStyle}>
                      {scholarship.qualification || "No qualification listed yet."}
                    </p>
                  </div>
                  <div>
                    <h4 style={detailTitleStyle}>Requirements</h4>
                    <p style={detailTextStyle}>
                      {scholarship.requirements || "No requirements listed yet."}
                    </p>
                  </div>
                </div>
                <p style={deadlineStyle}>
                  <strong>Deadline:</strong> {formatDeadline(scholarship.deadline)}
                </p>
                <div style={actionsStyle}>
                  <button
                    type="button"
                    style={buttonSecondaryStyle}
                    onClick={() => handleEdit(scholarship)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    style={buttonDangerStyle}
                    onClick={() => handleDelete(scholarship.id)}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </section>
        )}
      </main>
    </div>
  );
};

const managerGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))",
  gap: "20px",
  alignItems: "start",
  marginBottom: "30px",
};

const formCardStyle = {
  ...cardStyle,
  display: "grid",
  gap: "16px",
};

const formTitleStyle = {
  margin: 0,
  color: colors.text,
};

const textareaStyle = {
  ...inputStyle,
  minHeight: "130px",
  resize: "vertical",
  fontFamily: "inherit",
};

const textFieldGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))",
  gap: "14px",
};

const fieldGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))",
  gap: "14px",
};

const actionsStyle = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
};

const summaryCardStyle = {
  ...cardStyle,
  minHeight: "190px",
};

const summaryNumberStyle = {
  margin: "8px 0",
  color: colors.primary,
  fontSize: "clamp(40px, 12vw, 54px)",
  lineHeight: 1,
};

const sectionHeaderStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "16px",
  flexWrap: "wrap",
  marginBottom: "18px",
};

const listTitleStyle = {
  margin: "0 0 6px",
  color: colors.text,
};

const programCardStyle = {
  ...cardStyle,
  display: "grid",
  gap: "14px",
};

const cardTitleStyle = {
  margin: 0,
  color: colors.text,
};

const scholarshipIdStyle = {
  margin: 0,
  color: colors.primaryDark,
  fontWeight: "700",
  fontSize: "13px",
};

const deadlineStyle = {
  margin: 0,
};

const slotsStyle = {
  margin: 0,
  color: colors.text,
};

const detailsGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))",
  gap: "14px",
};

const detailTitleStyle = {
  margin: "0 0 6px",
  color: colors.primaryDark,
  fontSize: "14px",
};

const detailTextStyle = {
  ...mutedTextStyle,
  whiteSpace: "pre-wrap",
};

const emptyStateStyle = {
  ...cardStyle,
  color: colors.muted,
  textAlign: "center",
};

const noticeStyle = {
  padding: "14px 16px",
  borderRadius: "12px",
  fontWeight: "700",
  marginBottom: "18px",
};

const successNoticeStyle = {
  background: "#dcfce7",
  color: "#166534",
  border: "1px solid #bbf7d0",
};

const errorNoticeStyle = {
  background: "#fee2e2",
  color: "#991b1b",
  border: "1px solid #fecaca",
};

export default ManageScholarship;
