import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../api";
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  eyebrowStyle,
  inputStyle,
  mutedTextStyle,
  narrowShellStyle,
  pageHeaderStyle,
  pageStyle,
  titleStyle,
} from "../sharedStyles";

const getCurrentUser = () => {
  try {
    return JSON.parse(localStorage.getItem("currentUser"));
  } catch {
    return null;
  }
};

const getAttachmentId = (file) => `${file.name}-${file.size}-${file.lastModified}`;

const EyeIcon = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    width="17"
    height="17"
    fill="none"
  >
    <path
      d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ApplicationForm = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  const user = getCurrentUser();
  const selectedScholarshipId = query.get("scholarshipId") || "";
  const selectedScholarshipTitle = query.get("title") || "";

  const [scholarships, setScholarships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState(null);
  const [applicationFormAttachment, setApplicationFormAttachment] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [previewAttachment, setPreviewAttachment] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewZoom, setPreviewZoom] = useState(1);
  const [formData, setFormData] = useState({
    userId: user?.id || "",
    studentName: user?.name || "",
    schoolIdNumber: user?.schoolIdNumber || user?.school_id_number || "",
    email: user?.email || "",
    courseYear: user?.courseYear || "",
    contactNumber: user?.contactNumber || "",
    scholarshipId: selectedScholarshipId,
    scholarshipTitle: selectedScholarshipTitle,
  });

  const applyLoadedScholarships = (loadedScholarships) => {
    setScholarships(loadedScholarships);

    if (loadedScholarships.length === 0) {
      setNotice({
        type: "error",
        message: "No scholarships are available yet. Please check again later.",
      });
      return;
    }

    setNotice(null);
    setFormData((current) => {
      if (current.scholarshipId) {
        const selected = loadedScholarships.find(
          (scholarship) => String(scholarship.id) === String(current.scholarshipId)
        );

        return {
          ...current,
          scholarshipTitle: selected?.title || current.scholarshipTitle,
        };
      }

      return {
        ...current,
        scholarshipId: String(loadedScholarships[0].id),
        scholarshipTitle: loadedScholarships[0].title,
      };
    });
  };

  const reloadScholarships = async () => {
    setLoading(true);

    try {
      const response = await api.get("/scholarships");
      const loadedScholarships = Array.isArray(response.data) ? response.data : [];
      applyLoadedScholarships(loadedScholarships);
    } catch (error) {
      console.log("Application scholarship load error:", error);
      setNotice({ type: "error", message: "Failed to load scholarships" });
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
          const loadedScholarships = Array.isArray(response.data)
            ? response.data
            : [];

          applyLoadedScholarships(loadedScholarships);
        }
      })
      .catch((error) => {
        console.log("Application scholarship load error:", error);
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
  }, [selectedScholarshipId]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        window.URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const updateField = (field, value) => {
    setFormData((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const updateAttachments = (fileList) => {
    const nextAttachments = Array.from(fileList || []).map((file) => ({
      id: getAttachmentId(file),
      file,
      checked: true,
    }));

    setAttachments((current) => {
      const currentIds = new Set(current.map((item) => item.id));
      const addedAttachments = nextAttachments.filter(
        (item) => !currentIds.has(item.id)
      );

      return [...current, ...addedAttachments];
    });
  };

  const updateApplicationFormAttachment = (fileList) => {
    const [file] = Array.from(fileList || []);

    if (!file) {
      return;
    }

    setApplicationFormAttachment({
      id: getAttachmentId(file),
      file,
      checked: true,
    });
  };

  const toggleApplicationFormAttachment = () => {
    setApplicationFormAttachment((current) =>
      current ? { ...current, checked: !current.checked } : current
    );
  };

  const toggleAttachment = (attachmentId) => {
    setAttachments((current) =>
      current.map((item) =>
        item.id === attachmentId ? { ...item, checked: !item.checked } : item
      )
    );
  };

  const openPreview = (attachment) => {
    if (previewUrl) {
      window.URL.revokeObjectURL(previewUrl);
    }

    setPreviewAttachment(attachment);
    setPreviewUrl(window.URL.createObjectURL(attachment.file));
    setPreviewZoom(1);
  };

  const closePreview = () => {
    if (previewUrl) {
      window.URL.revokeObjectURL(previewUrl);
    }

    setPreviewAttachment(null);
    setPreviewUrl("");
    setPreviewZoom(1);
  };

  const removeApplicationFormAttachment = () => {
    if (previewAttachment?.id === applicationFormAttachment?.id) {
      closePreview();
    }

    setApplicationFormAttachment(null);
  };

  const removeAttachment = (attachmentId) => {
    if (previewAttachment?.id === attachmentId) {
      closePreview();
    }

    setAttachments((current) => current.filter((item) => item.id !== attachmentId));
  };

  const handleScholarshipChange = (scholarshipId) => {
    const selected = scholarships.find(
      (scholarship) => String(scholarship.id) === scholarshipId
    );

    setFormData((current) => ({
      ...current,
      scholarshipId,
      scholarshipTitle: selected?.title || "",
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setNotice(null);

    if (!formData.studentName.trim() || !formData.email.trim()) {
      setNotice({ type: "error", message: "Please enter your name and email" });
      return;
    }

    if (!formData.scholarshipId || !formData.scholarshipTitle) {
      setNotice({ type: "error", message: "Please select a scholarship" });
      return;
    }

    setSubmitting(true);

    try {
      const submission = new FormData();
      submission.append("userId", formData.userId);
      submission.append("studentName", formData.studentName);
      submission.append("schoolIdNumber", formData.schoolIdNumber);
      submission.append("email", formData.email);
      submission.append("courseYear", formData.courseYear);
      submission.append("contactNumber", formData.contactNumber);
      submission.append("scholarshipId", formData.scholarshipId);
      submission.append("scholarshipTitle", formData.scholarshipTitle);

      if (applicationFormAttachment?.checked) {
        submission.append(
          "attachments",
          applicationFormAttachment.file,
          applicationFormAttachment.file.name
        );
      }

      attachments.filter((item) => item.checked).forEach(({ file }) => {
        submission.append("attachments", file, file.webkitRelativePath || file.name);
      });

      const response = await api.post("/applications", submission);

      const syncedUser = {
        ...user,
        ...(response.data?.user || {}),
        id: formData.userId || user?.id,
        name: formData.studentName,
        fullname: formData.studentName,
        schoolIdNumber: formData.schoolIdNumber,
        email: formData.email,
        courseYear: formData.courseYear,
        contactNumber: formData.contactNumber,
        role: response.data?.user?.role || user?.role || "Student",
      };

      localStorage.setItem("currentUser", JSON.stringify(syncedUser));
      setNotice({
        type: "success",
        message: "Application submitted successfully. You can track your status now.",
      });

      setTimeout(() => {
        navigate("/track-status");
      }, 1200);
    } catch (error) {
      console.log("Application submit error:", error);
      setNotice({
        type: "error",
        message: error.response?.data?.message || "Failed to submit application",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={pageStyle}>
      <main style={narrowShellStyle}>
        <header style={pageHeaderStyle}>
          <span style={eyebrowStyle}>Online Application</span>
          <h1 style={titleStyle}>Scholarship Application Form</h1>
          <p style={mutedTextStyle}>
            Submit your scholarship application and monitor your application progress
            securely through the system.
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

        <form onSubmit={handleSubmit} style={formStyle}>
          <section style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <h2 style={sectionTitleStyle}>Student Information</h2>
              <p style={sectionNoteStyle}>You can edit the details below before submitting.</p>
            </div>

            <div style={sectionGridStyle}>
              <div style={studentIdContainerStyle}>
                <label style={fieldLabelStyle}>Student ID Number</label>
                <input
                  style={inputStyle}
                  type="text"
                  placeholder="Student ID Number"
                  value={formData.schoolIdNumber}
                  onChange={(event) => updateField("schoolIdNumber", event.target.value)}
                />
              </div>

              <input
                style={inputStyle}
                type="text"
                placeholder="Full Name"
                value={formData.studentName}
                onChange={(event) => updateField("studentName", event.target.value)}
              />

              <input
                style={inputStyle}
                type="text"
                placeholder="Course and Year"
                value={formData.courseYear}
                onChange={(event) => updateField("courseYear", event.target.value)}
              />

              <input
                style={inputStyle}
                type="email"
                placeholder="Email Address"
                value={formData.email}
                onChange={(event) => updateField("email", event.target.value)}
              />

              <input
                style={inputStyle}
                type="text"
                placeholder="Contact Number"
                value={formData.contactNumber}
                onChange={(event) => updateField("contactNumber", event.target.value)}
              />

              <div style={applicationFormUploadContainerStyle}>
                <label style={fieldLabelStyle}>Upload Scholarship Application Form</label>
                <input
                  style={fileInputStyle}
                  type="file"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
                  onChange={(event) => {
                    updateApplicationFormAttachment(event.target.files);
                    event.target.value = "";
                  }}
                />
                <p style={fileHelpTextStyle}>
                  Upload the completed scholarship application form separately.
                </p>

                {applicationFormAttachment && (
                  <div style={fileRowStyle}>
                    <div style={fileInfoStyle}>
                      <p style={fileSelectedTextStyle}>
                        {applicationFormAttachment.file.name}
                      </p>
                      <span style={fileStatusStyle}>
                        {applicationFormAttachment.checked
                          ? "Ready to submit"
                          : "Not included"}
                      </span>
                    </div>
                    <div style={fileActionStyle}>
                      <button
                        type="button"
                        style={fileViewButtonStyle}
                        title="View file"
                        aria-label="View file"
                        onClick={() => openPreview(applicationFormAttachment)}
                      >
                        <EyeIcon />
                      </button>
                      <button
                        type="button"
                        style={
                          applicationFormAttachment.checked
                            ? checkedFileButtonStyle
                            : fileCheckButtonStyle
                        }
                        title={
                          applicationFormAttachment.checked ? "Included" : "Include file"
                        }
                        aria-label={
                          applicationFormAttachment.checked ? "Included" : "Include file"
                        }
                        onClick={toggleApplicationFormAttachment}
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        style={fileRemoveButtonStyle}
                        onClick={removeApplicationFormAttachment}
                      >
                        X
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          <div style={selectGroupStyle}>
            <div style={selectHeaderStyle}>
              <label style={labelStyle}>Select Scholarship</label>
              <button
                type="button"
                style={smallButtonStyle}
                onClick={reloadScholarships}
                disabled={loading}
              >
                {loading ? "Loading..." : "Refresh"}
              </button>
            </div>

            <select
              style={selectStyle}
              value={formData.scholarshipId}
              onChange={(event) => handleScholarshipChange(event.target.value)}
              disabled={loading || scholarships.length === 0}
            >
              <option value="">
                {loading
                  ? "Loading scholarships..."
                  : scholarships.length === 0
                    ? "No scholarships available"
                    : "Select Scholarship"}
              </option>
              {scholarships.map((scholarship) => (
                <option key={scholarship.id} value={String(scholarship.id)}>
                  {scholarship.title} - {scholarship.status}
                </option>
              ))}
            </select>

            {scholarships.length > 0 && (
              <div style={optionListStyle}>
                {scholarships.map((scholarship) => (
                  <button
                    key={scholarship.id}
                    type="button"
                    style={{
                      ...optionButtonStyle,
                      ...(String(scholarship.id) === String(formData.scholarshipId)
                        ? selectedOptionStyle
                        : {}),
                    }}
                    onClick={() => handleScholarshipChange(String(scholarship.id))}
                  >
                    {scholarship.title}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={fileGroupStyle}>
            <label style={labelStyle}>Upload Requirements</label>
            <input
              style={fileInputStyle}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
              onChange={(event) => {
                updateAttachments(event.target.files);
                event.target.value = "";
              }}
            />
            <p style={fileHelpTextStyle}>
              Upload all required documents, IDs, or image files. You may select more than one file.
              The system saves them together in a folder named after you.
            </p>
            {attachments.length > 0 && (
              <div style={fileListStyle}>
                {attachments.map((item) => (
                  <div key={item.id} style={fileRowStyle}>
                    <div style={fileInfoStyle}>
                      <p style={fileSelectedTextStyle}>
                        {item.file.webkitRelativePath || item.file.name}
                      </p>
                      <span style={fileStatusStyle}>
                        {item.checked ? "Ready to submit" : "Not included"}
                      </span>
                    </div>
                    <div style={fileActionStyle}>
                      <button
                        type="button"
                        style={fileViewButtonStyle}
                        title="View file"
                        aria-label="View file"
                        onClick={() => openPreview(item)}
                      >
                        <EyeIcon />
                      </button>
                      <button
                        type="button"
                        style={item.checked ? checkedFileButtonStyle : fileCheckButtonStyle}
                        title={item.checked ? "Included" : "Include file"}
                        aria-label={item.checked ? "Included" : "Include file"}
                        onClick={() => toggleAttachment(item.id)}
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        style={fileRemoveButtonStyle}
                        onClick={() => removeAttachment(item.id)}
                      >
                        X
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button type="submit" style={buttonStyle} disabled={submitting}>
            {submitting ? "Submitting..." : "Submit Application"}
          </button>
        </form>

        {previewAttachment && (
          <div style={previewOverlayStyle} role="dialog" aria-modal="true">
            <div style={previewDialogStyle}>
              <div style={previewHeaderStyle}>
                <div style={previewTitleWrapStyle}>
                  <span style={eyebrowStyle}>Preview</span>
                  <h2 style={previewTitleStyle}>{previewAttachment.file.name}</h2>
                </div>
                <button
                  type="button"
                  style={previewCloseButtonStyle}
                  onClick={closePreview}
                  aria-label="Close preview"
                >
                  X
                </button>
              </div>

              <div style={previewToolbarStyle}>
                <button
                  type="button"
                  style={smallButtonStyle}
                  onClick={() => setPreviewZoom((current) => Math.max(0.5, current - 0.25))}
                >
                  -
                </button>
                <button
                  type="button"
                  style={smallButtonStyle}
                  onClick={() => setPreviewZoom(1)}
                >
                  {Math.round(previewZoom * 100)}%
                </button>
                <button
                  type="button"
                  style={smallButtonStyle}
                  onClick={() => setPreviewZoom((current) => Math.min(3, current + 0.25))}
                >
                  +
                </button>
              </div>

              <div style={previewCanvasStyle}>
                {previewAttachment.file.type.startsWith("image/") ? (
                  <img
                    src={previewUrl}
                    alt={previewAttachment.file.name}
                    style={{
                      ...previewImageStyle,
                      transform: `scale(${previewZoom})`,
                    }}
                  />
                ) : previewAttachment.file.type === "application/pdf" ? (
                  <iframe
                    title={previewAttachment.file.name}
                    src={previewUrl}
                    style={{
                      ...previewFrameStyle,
                      transform: `scale(${previewZoom})`,
                    }}
                  />
                ) : (
                  <div style={previewFallbackStyle}>
                    This file type cannot be previewed here.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

const formStyle = {
  ...cardStyle,
  display: "grid",
  gap: "14px",
};

const sectionStyle = {
  display: "grid",
  gap: "14px",
};

const sectionHeaderStyle = {
  display: "grid",
  gap: "4px",
};

const sectionTitleStyle = {
  margin: 0,
  fontSize: "18px",
  color: colors.text,
};

const sectionNoteStyle = {
  ...mutedTextStyle,
  fontSize: "13px",
};

const sectionGridStyle = {
  display: "grid",
  gap: "12px",
};

const studentIdContainerStyle = {
  display: "grid",
  gap: "8px",
};

const applicationFormUploadContainerStyle = {
  display: "grid",
  gap: "8px",
};

const fieldLabelStyle = {
  fontWeight: "700",
  color: colors.text,
};

const buttonStyle = {
  ...buttonPrimaryStyle,
  marginTop: "6px",
  minHeight: "48px",
};

const selectStyle = {
  ...inputStyle,
  minHeight: "48px",
  color: colors.text,
  background: colors.field,
};

const selectGroupStyle = {
  display: "grid",
  gap: "10px",
};

const fileGroupStyle = {
  display: "grid",
  gap: "8px",
};

const selectHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
};

const labelStyle = {
  fontWeight: "700",
};

const smallButtonStyle = {
  ...buttonSecondaryStyle,
  padding: "8px 12px",
};

const fileInputStyle = {
  ...inputStyle,
  paddingTop: "12px",
  paddingBottom: "12px",
  lineHeight: 1.4,
};

const fileHelpTextStyle = {
  ...mutedTextStyle,
  fontSize: "13px",
};

const fileSelectedTextStyle = {
  color: colors.text,
  fontSize: "13px",
  fontWeight: "700",
  margin: 0,
};

const fileListStyle = {
  display: "grid",
  gap: "8px",
  padding: "10px 12px",
  borderRadius: "10px",
  border: `1px solid ${colors.border}`,
  background: colors.field,
};

const fileRowStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: "10px",
  alignItems: "center",
  padding: "8px 0",
  borderBottom: `1px solid ${colors.border}`,
};

const fileInfoStyle = {
  minWidth: 0,
};

const fileStatusStyle = {
  display: "block",
  color: colors.muted,
  fontSize: "12px",
  marginTop: "3px",
};

const fileActionStyle = {
  display: "flex",
  gap: "6px",
  alignItems: "center",
};

const fileCheckButtonStyle = {
  ...buttonSecondaryStyle,
  width: "34px",
  height: "34px",
  padding: 0,
  fontSize: "16px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const checkedFileButtonStyle = {
  ...fileCheckButtonStyle,
  background: "#dcfce7",
  color: "#166534",
  border: "1px solid #bbf7d0",
};

const fileViewButtonStyle = {
  ...fileCheckButtonStyle,
  background: colors.surface,
  color: colors.text,
  border: `1px solid ${colors.border}`,
};

const fileRemoveButtonStyle = {
  background: "transparent",
  color: colors.primary,
  border: "none",
  borderRadius: "999px",
  padding: "7px 10px",
  fontWeight: "700",
  fontSize: "16px",
  lineHeight: 1,
  cursor: "pointer",
};

const previewOverlayStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 50,
  display: "grid",
  placeItems: "center",
  padding: "clamp(12px, 4vw, 24px)",
  background: "rgba(15, 23, 42, 0.58)",
  backdropFilter: "blur(4px)",
};

const previewDialogStyle = {
  ...cardStyle,
  width: "min(100%, 560px)",
  maxHeight: "86vh",
  display: "grid",
  gap: "12px",
};

const previewHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  alignItems: "start",
};

const previewTitleWrapStyle = {
  minWidth: 0,
};

const previewTitleStyle = {
  margin: 0,
  color: colors.text,
  fontSize: "18px",
  overflowWrap: "anywhere",
};

const previewCloseButtonStyle = {
  ...fileRemoveButtonStyle,
  width: "34px",
  height: "34px",
  padding: 0,
};

const previewToolbarStyle = {
  display: "flex",
  gap: "8px",
  flexWrap: "wrap",
};

const previewCanvasStyle = {
  height: "min(56vh, 420px)",
  overflow: "auto",
  display: "grid",
  placeItems: "center",
  borderRadius: "12px",
  border: `1px solid ${colors.border}`,
  background: colors.field,
};

const previewImageStyle = {
  maxWidth: "100%",
  maxHeight: "100%",
  transformOrigin: "center",
};

const previewFrameStyle = {
  width: "100%",
  height: "100%",
  border: "none",
  transformOrigin: "center",
  background: colors.surface,
};

const previewFallbackStyle = {
  ...mutedTextStyle,
  padding: "clamp(16px, 5vw, 24px)",
  textAlign: "center",
};

const optionListStyle = {
  display: "flex",
  gap: "8px",
  flexWrap: "wrap",
};

const optionButtonStyle = {
  ...buttonSecondaryStyle,
  padding: "9px 12px",
  fontSize: "13px",
};

const selectedOptionStyle = {
  background: "#f97316",
  color: "white",
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

export default ApplicationForm;
