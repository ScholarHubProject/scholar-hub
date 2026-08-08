import { useEffect, useState } from "react";
import api, { getApiUrl } from "../api";
import {
  buttonDangerStyle,
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  eyebrowStyle,
  mutedTextStyle,
  pageHeaderStyle,
  pageStyle,
  shellStyle,
  statusPillStyle,
  tableStyle,
  tableWrapStyle,
  tdStyle,
  thStyle,
  titleStyle,
} from "../sharedStyles";

const formatDate = (date) => {
  if (!date) return "Not available";
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const formatTimestamp = (date) => {
  if (!date) return "Not available";
  return new Date(date).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const escapeSpreadsheetText = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const spreadsheetCell = (value, type = "String") =>
  `<Cell><Data ss:Type="${type}">${escapeSpreadsheetText(value)}</Data></Cell>`;

const spreadsheetRow = (values, header = false) => {
  const styleAttribute = header ? ' ss:StyleID="Header"' : "";

  return `<Row${styleAttribute}>${values
    .map((value) =>
      typeof value === "number" && Number.isFinite(value)
        ? spreadsheetCell(value, "Number")
        : spreadsheetCell(value)
    )
    .join("")}</Row>`;
};

const formatStatusLabel = (status) => {
  if (status === "Rejected") return "Disapproved";
  if (status === "Pending Review") return "Pending";
  return status || "Unknown";
};

const formatFileSize = (bytes) => {
  const size = Number(bytes);

  if (!Number.isFinite(size) || size <= 0) {
    return "Size not available";
  }

  const units = ["B", "KB", "MB", "GB"];
  let normalizedSize = size;
  let unitIndex = 0;

  while (normalizedSize >= 1024 && unitIndex < units.length - 1) {
    normalizedSize /= 1024;
    unitIndex += 1;
  }

  const precision = normalizedSize >= 10 || unitIndex === 0 ? 0 : 1;
  return `${normalizedSize.toFixed(precision)} ${units[unitIndex]}`;
};

const getApplicationFiles = (application) => {
  if (Array.isArray(application.uploaded_files) && application.uploaded_files.length > 0) {
    return application.uploaded_files;
  }

  if (application.uploaded_file_path) {
    return [
      {
        name: application.uploaded_file_name,
        path: application.uploaded_file_path,
        type: application.uploaded_file_type,
        size: application.uploaded_file_size,
      },
    ];
  }

  return [];
};

const getFolderSize = (application) =>
  getApplicationFiles(application).reduce(
    (total, file) => total + (Number(file.size) || 0),
    0
  );

const getFolderDownloadUrl = (application) =>
  getApiUrl(`/applications/${application.id}/files/download`);

const EmailIcon = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    width="16"
    height="16"
    style={iconStyle}
  >
    <path
      d="M4 6.5h16v11H4v-11Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path d="m4.75 7.25 7.25 6 7.25-6" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);

const ManageApplicants = () => {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState(null);
  const pendingCount = applications.filter(
    (application) => application.status === "Pending Review"
  ).length;
  const disapprovedCount = applications.filter(
    (application) => application.status === "Rejected"
  ).length;

  const showNotice = (type, message) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 3000);
  };

  const loadApplications = async () => {
    setLoading(true);

    try {
      const response = await api.get("/applications");
      setApplications(response.data);
    } catch (error) {
      console.log("Applications load error:", error);
      showNotice("error", "Failed to load applications");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isActive = true;

    api
      .get("/applications")
      .then((response) => {
        if (isActive) {
          setApplications(response.data);
        }
      })
      .catch((error) => {
        console.log("Applications load error:", error);
        if (isActive) {
          setNotice({ type: "error", message: "Failed to load applications" });
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

  const updateStatus = async (id, status) => {
    try {
      await api.put(`/applications/${id}/status`, {
        status,
        remarks:
          status === "Approved"
            ? "Congratulations! Your application was approved."
            : "Your application was rejected by the scholarship office.",
      });

      showNotice("success", `Application ${status.toLowerCase()} successfully`);
      loadApplications();
    } catch (error) {
      console.log("Application status update error:", error);
      showNotice("error", "Failed to update application status");
    }
  };

  const requestDeleteApplication = (application) => {
    setPendingDelete(application);
  };

  const closeDeleteDialog = () => {
    if (deleting) {
      return;
    }

    setPendingDelete(null);
  };

  const confirmDeleteApplication = async () => {
    if (!pendingDelete) {
      return;
    }

    setDeleting(true);

    try {
      await api.delete(`/applications/${pendingDelete.id}`);
      showNotice("success", "Application entry deleted successfully");
      setPendingDelete(null);
      loadApplications();
    } catch (error) {
      console.log("Application delete error:", error);
      showNotice(
        "error",
        error.response?.data?.message || "Failed to delete application entry"
      );
    } finally {
      setDeleting(false);
    }
  };

  const getApplicantExportData = () => {
    const headers = [
      "Application ID",
      "Student Name",
      "School ID Number",
      "Email",
      "Course and Year",
      "Contact Number",
      "Scholarship ID",
      "Scholarship Title",
      "Status",
      "Remarks",
      "Attachment Name",
      "Attachment Type",
      "Submitted At",
    ];

    const rows = applications.map((application) => {
      const uploadedFiles = getApplicationFiles(application);

      return [
        application.id,
        application.student_name,
        application.school_id_number,
        application.email,
        application.course_year,
        application.contact_number,
        application.scholarship_code || application.scholarship_id || "",
        application.scholarship_title,
        formatStatusLabel(application.status),
        application.remarks,
        uploadedFiles.map((file) => file.name).join("; "),
        uploadedFiles.map((file) => file.type || "File uploaded").join("; "),
        formatTimestamp(application.created_at),
      ];
    });

    return { headers, rows };
  };

  const downloadFile = (content, type, filename) => {
    const blob = new Blob([content], { type });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const downloadApplicantSpreadsheet = () => {
    if (applications.length === 0) {
      showNotice("error", "No applicant information to download");
      return;
    }

    const { headers, rows } = getApplicantExportData();
    const spreadsheet = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Header">
      <Font ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#D97706" ss:Pattern="Solid"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="Applicant List">
    <Table>
      <Column ss:Width="90"/>
      <Column ss:Width="160"/>
      <Column ss:Width="130"/>
      <Column ss:Width="190"/>
      <Column ss:Width="150"/>
      <Column ss:Width="130"/>
      <Column ss:Width="110"/>
      <Column ss:Width="190"/>
      <Column ss:Width="100"/>
      <Column ss:Width="220"/>
      <Column ss:Width="220"/>
      <Column ss:Width="180"/>
      <Column ss:Width="150"/>
      ${spreadsheetRow(headers, true)}
      ${rows.map((row) => spreadsheetRow(row)).join("")}
    </Table>
    <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
      <FreezePanes/>
      <FrozenNoSplit/>
      <SplitHorizontal>1</SplitHorizontal>
      <TopRowBottomPane>1</TopRowBottomPane>
      <ActivePane>2</ActivePane>
    </WorksheetOptions>
  </Worksheet>
</Workbook>`;
    const generatedAt = new Date().toISOString().slice(0, 10);

    downloadFile(
      spreadsheet,
      "application/vnd.ms-excel;charset=utf-8;",
      `scholar-applicants-${generatedAt}.xls`
    );
    showNotice("success", "Applicant XLS spreadsheet downloaded");
  };

  return (
    <div style={pageStyle}>
      <main style={shellStyle}>
        <header style={pageHeaderStyle}>
          <span style={eyebrowStyle}>Applicant Review</span>
          <h1 style={titleStyle}>Manage Applicants</h1>
          <p style={mutedTextStyle}>
            Review student applications and update approval status.
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

        <section style={summaryRowStyle}>
          <div style={summaryCardsStyle}>
            <div style={summaryCardStyle}>
              <span style={eyebrowStyle}>Total</span>
              <strong style={summaryNumberStyle}>{applications.length}</strong>
              <p style={mutedTextStyle}>Applications</p>
            </div>
            <div style={summaryCardStyle}>
              <span style={eyebrowStyle}>Pending</span>
              <strong style={summaryNumberStyle}>{pendingCount}</strong>
              <p style={mutedTextStyle}>Waiting review</p>
            </div>
            <div style={summaryCardStyle}>
              <span style={eyebrowStyle}>Disapproved</span>
              <strong style={summaryNumberStyle}>{disapprovedCount}</strong>
              <p style={mutedTextStyle}>Rejected applications</p>
            </div>
          </div>
          <div style={summaryActionsStyle}>
            <button
              type="button"
              style={buttonPrimaryStyle}
              onClick={downloadApplicantSpreadsheet}
              disabled={loading || applications.length === 0}
            >
              Export Applicant List
            </button>
            <button type="button" style={buttonSecondaryStyle} onClick={loadApplications}>
              Refresh
            </button>
          </div>
        </section>

        {loading ? (
          <div style={emptyStateStyle}>Loading applications...</div>
        ) : applications.length === 0 ? (
          <div style={emptyStateStyle}>No student applications yet.</div>
        ) : (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Student</th>
                  <th style={thStyle}>Scholarship</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Remarks</th>
                  <th style={thStyle}>Attachment</th>
                  <th style={thStyle}>Notify Email</th>
                  <th style={thStyle}>Submitted</th>
                  <th style={thStyle}>Action</th>
                </tr>
              </thead>

              <tbody>
                {applications.map((application) => (
                  <tr key={application.id}>
                    <td style={attachmentCellStyle}>
                      <strong>{application.student_name}</strong>
                      <p style={tableSubtextStyle}>{application.email}</p>
                      <p style={tableSubtextStyle}>
                        School ID: {application.school_id_number || "Not available"}
                      </p>
                    </td>
                    <td style={tdStyle}>{application.scholarship_title}</td>
                    <td style={tdStyle}>
                      <span style={getApplicantStatusStyle(application.status)}>
                        {formatStatusLabel(application.status)}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <p style={tableSubtextStyle}>{application.remarks || "No remarks yet."}</p>
                    </td>
                    <td style={tdStyle}>
                      {getApplicationFiles(application).length > 0 ? (
                        <div style={attachmentStackStyle}>
                          <div style={folderItemStyle}>
                            <strong style={folderTitleStyle}>
                              {application.student_name || "Student"} Requirements Folder
                            </strong>
                            <p style={tableSubtextStyle}>
                              {getApplicationFiles(application).length} uploaded file
                              {getApplicationFiles(application).length === 1 ? "" : "s"}
                              {" · "}
                              {formatFileSize(getFolderSize(application))}
                            </p>
                            <a
                              href={getFolderDownloadUrl(application)}
                              style={downloadLinkStyle}
                            >
                              Download Folder
                            </a>
                          </div>
                        </div>
                      ) : (
                        <p style={tableSubtextStyle}>No file uploaded.</p>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <a
                        href={`mailto:${application.email}?subject=${encodeURIComponent(
                          `Scholarship Application #SCH-${String(application.id).padStart(4, "0")}`
                        )}`}
                        style={emailButtonStyle}
                      >
                        <EmailIcon />
                        <span>Notify</span>
                      </a>
                    </td>
                    <td style={tdStyle}>{formatDate(application.created_at)}</td>
                    <td style={tdStyle}>
                      <div style={actionsStyle}>
                        <button
                          style={approveBtnStyle}
                          onClick={() => updateStatus(application.id, "Approved")}
                        >
                          Approve
                        </button>
                        <button
                          style={rejectBtnStyle}
                          onClick={() => updateStatus(application.id, "Rejected")}
                        >
                          Reject
                        </button>
                        <button
                          style={deleteBtnStyle}
                          onClick={() => requestDeleteApplication(application)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pendingDelete && (
          <div style={modalOverlayStyle} role="dialog" aria-modal="true">
            <div style={deleteDialogStyle}>
              <span style={eyebrowStyle}>Delete Entry</span>
              <h2 style={dialogTitleStyle}>Remove applicant record?</h2>
              <p style={mutedTextStyle}>
                This will permanently delete the application entry for{" "}
                <strong>{pendingDelete.student_name}</strong>.
              </p>
              <div style={dialogDetailsStyle}>
                <p style={tableSubtextStyle}>
                  <strong>Scholarship:</strong> {pendingDelete.scholarship_title}
                </p>
                <p style={tableSubtextStyle}>
                  <strong>Email:</strong> {pendingDelete.email}
                </p>
              </div>
              <div style={dialogActionsStyle}>
                <button
                  type="button"
                  style={deleteBtnStyle}
                  onClick={confirmDeleteApplication}
                  disabled={deleting}
                >
                  {deleting ? "Deleting..." : "Delete Entry"}
                </button>
                <button
                  type="button"
                  style={buttonSecondaryStyle}
                  onClick={closeDeleteDialog}
                  disabled={deleting}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

const summaryRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "16px",
  flexWrap: "wrap",
  marginBottom: "18px",
};

const summaryCardStyle = {
  ...cardStyle,
  display: "grid",
  gap: "4px",
  minWidth: "min(220px, 100%)",
};

const summaryCardsStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(190px, 100%), 1fr))",
  gap: "14px",
  flex: "1 1 620px",
};

const summaryNumberStyle = {
  color: colors.primary,
  fontSize: "36px",
};

const summaryActionsStyle = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
};

const approveBtnStyle = {
  ...buttonPrimaryStyle,
  background: colors.primary,
  borderColor: colors.primary,
  color: "#ffffff",
  minWidth: "98px",
  padding: "9px 12px",
  textAlign: "center",
};

const rejectBtnStyle = {
  ...buttonDangerStyle,
  minWidth: "98px",
  padding: "9px 12px",
  textAlign: "center",
};

const deleteBtnStyle = {
  ...buttonDangerStyle,
  background: "#7f1d1d",
  minWidth: "98px",
  padding: "9px 12px",
  textAlign: "center",
};

const modalOverlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(31, 41, 55, 0.42)",
  display: "grid",
  placeItems: "center",
  padding: "clamp(12px, 4vw, 24px)",
  zIndex: 50,
};

const deleteDialogStyle = {
  ...cardStyle,
  width: "min(100%, 460px)",
  display: "grid",
  gap: "14px",
};

const dialogTitleStyle = {
  margin: 0,
  color: colors.text,
  fontSize: "24px",
};

const dialogDetailsStyle = {
  display: "grid",
  gap: "6px",
  padding: "12px",
  borderRadius: "10px",
  background: colors.field,
  border: `1px solid ${colors.border}`,
};

const dialogActionsStyle = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const getApplicantStatusStyle = (status) => {
  const normalizedStatus = String(status || "").toLowerCase();
  const statusColors =
    normalizedStatus === "approved"
      ? {
          background: "#dcfce7",
          color: "#166534",
          border: "1px solid #bbf7d0",
        }
      : normalizedStatus === "rejected"
        ? {
            background: "#fee2e2",
            color: "#991b1b",
            border: "1px solid #fecaca",
          }
        : {
            background: "#ffedd5",
            color: colors.primaryDark,
            border: "1px solid #fed7aa",
          };

  return {
    ...statusPillStyle,
    ...statusColors,
    minWidth: "108px",
    justifyContent: "center",
    borderRadius: "999px",
    padding: "7px 12px",
    lineHeight: 1,
    whiteSpace: "nowrap",
    textAlign: "center",
  };
};

const actionsStyle = {
  display: "flex",
  gap: "8px",
  flexWrap: "wrap",
};

const attachmentStackStyle = {
  display: "grid",
  gap: "10px",
  alignItems: "stretch",
  justifyItems: "stretch",
  width: "100%",
  minWidth: "min(210px, 100%)",
  maxWidth: "260px",
  margin: "0 auto",
};

const folderItemStyle = {
  display: "grid",
  gap: "8px",
  justifyItems: "stretch",
  padding: "12px",
  borderRadius: "8px",
  border: `1px solid ${colors.border}`,
  background: colors.field,
  width: "100%",
  minHeight: "118px",
  boxSizing: "border-box",
  textAlign: "left",
};

const folderTitleStyle = {
  color: colors.text,
  display: "block",
  fontSize: "13px",
  lineHeight: "1.35",
  overflowWrap: "anywhere",
};

const downloadLinkStyle = {
  ...buttonSecondaryStyle,
  alignSelf: "end",
  boxSizing: "border-box",
  minHeight: "34px",
  width: "100%",
  padding: "7px 10px",
  fontSize: "12px",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  lineHeight: "1.2",
  textAlign: "center",
  whiteSpace: "nowrap",
};

const emailButtonStyle = {
  ...buttonPrimaryStyle,
  padding: "8px 10px",
  fontSize: "12px",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "6px",
};

const iconStyle = {
  display: "block",
};

const tableSubtextStyle = {
  ...mutedTextStyle,
  fontSize: "13px",
};

const attachmentCellStyle = {
  ...tdStyle,
  textAlign: "center",
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

export default ManageApplicants;
