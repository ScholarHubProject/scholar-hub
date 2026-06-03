import { useCallback, useEffect, useRef, useState } from "react";
import api, { getApiUrl } from "../api";
import {
  buttonSecondaryStyle,
  cardGridStyle,
  cardStyle,
  colors,
  eyebrowStyle,
  mutedTextStyle,
  pageHeaderStyle,
  pageStyle,
  shellStyle,
  statusPillStyle,
  titleStyle,
} from "../sharedStyles";

const AUTO_SYNC_MS = 5000;

const getCurrentUser = () => {
  try {
    return JSON.parse(localStorage.getItem("currentUser"));
  } catch {
    return null;
  }
};

const formatDate = (date) => {
  if (!date) return "Not available";
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const getApplicationFiles = (application) => {
  if (Array.isArray(application.uploaded_files) && application.uploaded_files.length > 0) {
    return application.uploaded_files;
  }

  if (application.uploaded_file_path) {
    return [{ name: application.uploaded_file_name }];
  }

  return [];
};

const getFileUrl = (application, fileIndex) =>
  getApiUrl(`/applications/${application.id}/file?file=${fileIndex}`);

const getApplicationFormFiles = (application) => getApplicationFiles(application).slice(0, 1);

const getRequirementFiles = (application) => getApplicationFiles(application).slice(1);

const getStatusLabel = (status) => {
  if (status === "Rejected") return "Disapproved";
  if (status === "Pending Review") return "Pending";
  return status || "Pending";
};

const getProgressSteps = (application) => {
  const applicationFormFiles = getApplicationFormFiles(application);
  const requirementFiles = getRequirementFiles(application);
  const normalizedStatus = String(application.status || "").toLowerCase();
  const isApproved = normalizedStatus === "approved";
  const isDisapproved = normalizedStatus === "rejected" || normalizedStatus === "disapproved";
  const hasFinalStatus = isApproved || isDisapproved;

  return [
    {
      title: "Submit Application Form",
      type: "applicationForm",
      description:
        applicationFormFiles.length > 0
          ? "Scholarship application form uploaded"
          : `Submitted ${formatDate(application.created_at)}`,
      state: "completed",
    },
    {
      title: "Upload Documents",
      type: "documents",
      description:
        requirementFiles.length > 0
          ? `${requirementFiles.length} requirement${requirementFiles.length === 1 ? "" : "s"} uploaded`
          : "No documents uploaded yet",
      state: requirementFiles.length > 0 ? "completed" : "pending",
    },
    {
      title: "Pending",
      description: hasFinalStatus ? "Admin review completed" : "Waiting for admin review",
      state: hasFinalStatus ? "completed" : "current",
    },
    {
      title: hasFinalStatus ? getStatusLabel(application.status) : "Final Result",
      description: hasFinalStatus
        ? application.remarks || `${getStatusLabel(application.status)} by admin`
        : "Approved or Disapproved status will appear here",
      state: isApproved ? "completed" : isDisapproved ? "rejected" : "pending",
    },
  ];
};

const TrackStatus = () => {
  const user = getCurrentUser();
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [applicationFormOpen, setApplicationFormOpen] = useState(true);
  const [documentsOpen, setDocumentsOpen] = useState(true);
  const syncingRef = useRef(false);

  const loadApplications = useCallback(
    async ({ initial = false, silent = false } = {}) => {
      if (syncingRef.current) {
        return;
      }

      syncingRef.current = true;

      if (initial) {
        setLoading(true);
      }
      setRefreshing(true);
      if (!silent) {
        setError("");
      }

      try {
        if (!user?.email) {
          setApplications([]);
          setLastUpdated(new Date());
          return;
        }

        const response = await api.get("/applications/student", {
          params: { email: user.email },
        });

        setApplications(Array.isArray(response.data) ? response.data : []);
        setError("");
        setLastUpdated(new Date());
      } catch (requestError) {
        console.log("Track status load error:", requestError);
        if (!silent) {
          setError("Unable to load your application status.");
        }
      } finally {
        syncingRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user?.email]
  );

  useEffect(() => {
    loadApplications({ initial: true });

    const intervalId = window.setInterval(() => {
      loadApplications({ silent: true });
    }, AUTO_SYNC_MS);

    const handleFocus = () => {
      if (document.visibilityState === "visible") {
        loadApplications({ silent: true });
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [loadApplications]);

  return (
    <div style={pageStyle}>
      <main style={shellStyle}>
        <header style={pageHeaderStyle}>
          <span style={eyebrowStyle}>Application Progress</span>
          <h1 style={titleStyle}>Track Application Status</h1>
          <p style={mutedTextStyle}>
            View your submitted applications and admin approval updates.
          </p>

          <div style={headerActionsStyle}>
            <span style={statusBadgeStyle}>{refreshing ? "Syncing..." : "Live"}</span>
            <button type="button" style={buttonSecondaryStyle} onClick={() => loadApplications()} disabled={refreshing}>
              Refresh
            </button>
          </div>

          <p style={updatedTextStyle}>
            {lastUpdated
              ? `Last synced ${lastUpdated.toLocaleTimeString()}`
              : "Waiting for first sync..."}
          </p>
        </header>

        {loading ? (
          <div style={stateCardStyle}>Loading your applications...</div>
        ) : error ? (
          <div style={errorCardStyle}>
            <p style={errorTextStyle}>{error}</p>
            <button type="button" style={buttonSecondaryStyle} onClick={() => loadApplications()} disabled={refreshing}>
              Try Again
            </button>
          </div>
        ) : applications.length === 0 ? (
          <div style={stateCardStyle}>You have not submitted an application yet.</div>
        ) : (
          <section style={cardGridStyle}>
            {applications.map((application) => (
              <article key={application.id} style={applicationCardStyle}>
                <span style={statusPillStyle}>{application.status}</span>
                <h3 style={cardTitleStyle}>{application.scholarship_title}</h3>
                <p style={mutedTextStyle}>
                  <strong>Application No:</strong> SCH-{String(application.id).padStart(4, "0")}
                </p>
                <p style={mutedTextStyle}>
                  <strong>Submitted:</strong> {formatDate(application.created_at)}
                </p>
                <p style={mutedTextStyle}>
                  <strong>Requirements Uploaded:</strong>{" "}
                  {getRequirementFiles(application).length || "None"}
                </p>
                <p style={mutedTextStyle}>
                  <strong>Remarks:</strong> {application.remarks || "Waiting for admin review."}
                </p>
                <button
                  type="button"
                  style={buttonSecondaryStyle}
                  onClick={() => {
                    setSelectedApplication(application);
                    setApplicationFormOpen(true);
                    setDocumentsOpen(true);
                  }}
                >
                  View Application
                </button>
              </article>
            ))}
          </section>
        )}

        {selectedApplication && (
          <div style={modalOverlayStyle} role="dialog" aria-modal="true">
            <div style={applicationDialogStyle}>
              <div style={modalHeaderStyle}>
                <div>
                  <span style={eyebrowStyle}>Application Preview</span>
                  <h2 style={modalTitleStyle}>
                    SCH-{String(selectedApplication.id).padStart(4, "0")}
                  </h2>
                </div>
                <button
                  type="button"
                  style={closeButtonStyle}
                  onClick={() => setSelectedApplication(null)}
                >
                  X
                </button>
              </div>

              <div style={detailGridStyle}>
                <p style={detailItemStyle}>
                  <strong>Student:</strong> {selectedApplication.student_name}
                </p>
                <p style={detailItemStyle}>
                  <strong>School ID:</strong>{" "}
                  {selectedApplication.school_id_number || "Not available"}
                </p>
                <p style={detailItemStyle}>
                  <strong>Email:</strong> {selectedApplication.email}
                </p>
                <p style={detailItemStyle}>
                  <strong>Course / Year:</strong>{" "}
                  {selectedApplication.course_year || "Not available"}
                </p>
                <p style={detailItemStyle}>
                  <strong>Contact:</strong>{" "}
                  {selectedApplication.contact_number || "Not available"}
                </p>
                <p style={detailItemStyle}>
                  <strong>Scholarship:</strong> {selectedApplication.scholarship_title}
                </p>
                <p style={detailItemStyle}>
                  <strong>Status:</strong> {selectedApplication.status}
                </p>
                <p style={detailItemStyle}>
                  <strong>Submitted:</strong> {formatDate(selectedApplication.created_at)}
                </p>
              </div>

              <div style={progressSectionStyle}>
                <h3 style={sectionTitleStyle}>In Progress</h3>
                <div style={progressListStyle}>
                  {getProgressSteps(selectedApplication).map((step, stepIndex, steps) => (
                    <div key={step.title} style={progressItemStyle}>
                      <div style={progressRailStyle}>
                        <span style={getProgressMarkerStyle(step.state)}>
                          {step.state === "pending" ? "" : "✓"}
                        </span>
                        {stepIndex < steps.length - 1 && (
                          <span style={getProgressLineStyle(step.state)} />
                        )}
                      </div>
                      <div style={progressContentStyle}>
                        <div style={progressTitleRowStyle}>
                          <strong style={getProgressTitleStyle(step.state)}>
                            {step.title}
                          </strong>
                          {step.type === "applicationForm" && (
                            <button
                              type="button"
                              aria-label={
                                applicationFormOpen
                                  ? "Hide scholarship application form"
                                  : "Show scholarship application form"
                              }
                              aria-expanded={applicationFormOpen}
                              style={documentToggleStyle}
                              onClick={() => setApplicationFormOpen((current) => !current)}
                            >
                              <span
                                aria-hidden="true"
                                style={getDocumentArrowStyle(applicationFormOpen)}
                              />
                            </button>
                          )}
                          {step.type === "documents" && (
                            <button
                              type="button"
                              aria-label={
                                documentsOpen
                                  ? "Hide uploaded requirements"
                                  : "Show uploaded requirements"
                              }
                              aria-expanded={documentsOpen}
                              style={documentToggleStyle}
                              onClick={() => setDocumentsOpen((current) => !current)}
                            >
                              <span aria-hidden="true" style={getDocumentArrowStyle(documentsOpen)} />
                            </button>
                          )}
                        </div>
                        <p style={progressDescriptionStyle}>{step.description}</p>
                        {step.type === "applicationForm" && applicationFormOpen && (
                          <div style={progressFilesStyle}>
                            {getApplicationFormFiles(selectedApplication).length > 0 ? (
                              getApplicationFormFiles(selectedApplication).map((file, fileIndex) => (
                                <div
                                  key={`${selectedApplication.id}-application-form-${file.path || file.name}`}
                                  style={progressFileItemStyle}
                                >
                                  <div>
                                    <strong>{file.name || "Scholarship application form"}</strong>
                                    <p style={progressFileMetaStyle}>
                                      {file.type || "File uploaded"}
                                    </p>
                                  </div>
                                  <a
                                    href={getFileUrl(selectedApplication, fileIndex)}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={fileButtonStyle}
                                  >
                                    View
                                  </a>
                                </div>
                              ))
                            ) : (
                              <p style={progressEmptyFilesStyle}>
                                No scholarship application form uploaded.
                              </p>
                            )}
                          </div>
                        )}
                        {step.type === "documents" && documentsOpen && (
                          <div style={progressFilesStyle}>
                            {getRequirementFiles(selectedApplication).length > 0 ? (
                              getRequirementFiles(selectedApplication).map((file, fileIndex) => (
                                <div
                                  key={`${selectedApplication.id}-requirement-${file.path || file.name}`}
                                  style={progressFileItemStyle}
                                >
                                  <div>
                                    <strong>{file.name || "Uploaded requirement"}</strong>
                                    <p style={progressFileMetaStyle}>
                                      {file.type || "File uploaded"}
                                    </p>
                                  </div>
                                  <a
                                    href={getFileUrl(selectedApplication, fileIndex + 1)}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={fileButtonStyle}
                                  >
                                    View
                                  </a>
                                </div>
                              ))
                            ) : (
                              <p style={progressEmptyFilesStyle}>No files uploaded.</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        )}
      </main>
    </div>
  );
};

const applicationCardStyle = {
  ...cardStyle,
  display: "grid",
  gap: "12px",
};

const cardTitleStyle = {
  margin: 0,
  color: colors.text,
};

const modalOverlayStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 50,
  display: "grid",
  placeItems: "center",
  padding: "clamp(12px, 4vw, 24px)",
  background: "rgba(15, 23, 42, 0.58)",
  backdropFilter: "blur(4px)",
};

const applicationDialogStyle = {
  ...cardStyle,
  width: "min(100%, 720px)",
  maxHeight: "86vh",
  overflowY: "auto",
  display: "grid",
  gap: "16px",
};

const modalHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: "16px",
  alignItems: "start",
};

const modalTitleStyle = {
  margin: 0,
  color: colors.text,
  fontSize: "24px",
};

const closeButtonStyle = {
  background: "transparent",
  color: colors.primary,
  border: "none",
  borderRadius: "999px",
  width: "36px",
  height: "36px",
  fontWeight: "700",
  fontSize: "16px",
  lineHeight: 1,
  cursor: "pointer",
};

const detailGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))",
  gap: "10px",
};

const detailItemStyle = {
  ...mutedTextStyle,
  padding: "10px 12px",
  borderRadius: "10px",
  border: `1px solid ${colors.border}`,
  background: colors.field,
};

const progressSectionStyle = {
  display: "grid",
  gap: "12px",
  padding: "14px",
  borderRadius: "10px",
  border: `1px solid ${colors.border}`,
  background: colors.field,
};

const progressListStyle = {
  display: "grid",
  gap: "0",
};

const progressItemStyle = {
  display: "grid",
  gridTemplateColumns: "32px minmax(0, 1fr)",
  gap: "10px",
  minHeight: "58px",
};

const progressRailStyle = {
  position: "relative",
  display: "grid",
  justifyItems: "center",
};

const progressContentStyle = {
  paddingBottom: "16px",
};

const progressDescriptionStyle = {
  ...mutedTextStyle,
  margin: "4px 0 0",
};

const progressTitleRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "10px",
};

const documentToggleStyle = {
  display: "grid",
  placeItems: "center",
  width: "28px",
  height: "28px",
  borderRadius: "999px",
  border: `1px solid ${colors.border}`,
  background: colors.surface,
  color: colors.primaryDark,
  cursor: "pointer",
  flex: "0 0 auto",
};

const getDocumentArrowStyle = (isOpen) => ({
  display: "block",
  width: "8px",
  height: "8px",
  borderStyle: "solid",
  borderWidth: "0 2px 2px 0",
  transform: isOpen ? "rotate(225deg)" : "rotate(45deg)",
  transition: "transform 160ms ease",
});

const progressFilesStyle = {
  display: "grid",
  gap: "8px",
  marginTop: "10px",
};

const progressFileItemStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: "10px",
  alignItems: "center",
  padding: "10px",
  borderRadius: "10px",
  border: `1px solid ${colors.border}`,
  background: colors.surface,
};

const progressFileMetaStyle = {
  ...mutedTextStyle,
  margin: "3px 0 0",
  fontSize: "13px",
};

const progressEmptyFilesStyle = {
  ...mutedTextStyle,
  margin: 0,
  padding: "10px",
  borderRadius: "10px",
  border: `1px solid ${colors.border}`,
  background: colors.surface,
};

const getProgressMarkerStyle = (state) => {
  const isRejected = state === "rejected";
  const isPending = state === "pending";

  return {
    position: "relative",
    zIndex: 1,
    display: "grid",
    placeItems: "center",
    width: "24px",
    height: "24px",
    borderRadius: "999px",
    border: `2px solid ${isRejected ? colors.danger : isPending ? colors.border : colors.primary}`,
    background: isRejected ? "rgba(248,113,113,0.16)" : isPending ? colors.field : colors.primarySoft,
    color: isRejected ? colors.danger : colors.primaryDark,
    fontSize: "14px",
    fontWeight: "800",
    lineHeight: 1,
  };
};

const getProgressLineStyle = (state) => ({
  position: "absolute",
  top: "24px",
  bottom: "-34px",
  width: "2px",
  background: state === "pending" ? colors.border : colors.primary,
});

const getProgressTitleStyle = (state) => ({
  color: state === "rejected" ? colors.danger : colors.text,
});

const sectionTitleStyle = {
  margin: 0,
  color: colors.text,
  fontSize: "18px",
};

const fileButtonStyle = {
  ...buttonSecondaryStyle,
  padding: "8px 10px",
  fontSize: "12px",
  textDecoration: "none",
};

const stateCardStyle = {
  ...cardStyle,
  color: colors.muted,
  textAlign: "center",
};

const errorCardStyle = {
  ...cardStyle,
  display: "grid",
  gap: "14px",
  justifyItems: "start",
};

const errorTextStyle = {
  margin: 0,
  color: colors.danger,
  fontWeight: "700",
};

const headerActionsStyle = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap",
  marginTop: "10px",
};

const statusBadgeStyle = {
  ...eyebrowStyle,
  marginBottom: 0,
};

const updatedTextStyle = {
  ...mutedTextStyle,
  marginTop: "12px",
  fontSize: "13px",
};

export default TrackStatus;
