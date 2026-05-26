import { useCallback, useEffect, useState } from "react";
import api from "../api";
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardGridStyle,
  cardStyle,
  eyebrowStyle,
  mutedTextStyle,
  pageHeaderStyle,
  pageStyle,
  shellStyle,
  titleStyle,
} from "../sharedStyles";

const Reports = () => {
  const [stats, setStats] = useState({
    total_applicants: 0,
    approved_students: 0,
    pending_applications: 0,
    disapproved_applications: 0,
    old_scholars: 0,
    new_scholars: 0,
  });
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);

  const loadReportData = useCallback(async () => {
    setLoading(true);

    try {
      const response = await api.get("/admin/dashboard-stats");
      setStats({
        total_applicants: response.data?.total_applicants || 0,
        approved_students: response.data?.approved_students || 0,
        pending_applications: response.data?.pending_applications || 0,
        disapproved_applications: response.data?.disapproved_applications || 0,
        old_scholars: response.data?.old_scholars || 0,
        new_scholars: response.data?.new_scholars || 0,
      });
      setNotice(null);
    } catch (error) {
      console.log("Reports load error:", error);
      setNotice("Failed to load report data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReportData();
  }, [loadReportData]);

  const formatTimestamp = (date) =>
    date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const generateReport = () => {
    const generatedAt = new Date();
    const rows = [
      ["Report Name", "Scholarship Applications Summary"],
      ["Generated At", formatTimestamp(generatedAt)],
      ["Total Applicants", String(stats.total_applicants)],
      ["Approved Applications", String(stats.approved_students)],
      ["Pending Applications", String(stats.pending_applications)],
      ["Disapproved Applications", String(stats.disapproved_applications)],
      ["Old Scholars", String(stats.old_scholars)],
      ["New Scholars", String(stats.new_scholars)],
    ];

    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `scholarship-report-${generatedAt.toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const reportCards = [
    ["Total Applicants", `${stats.total_applicants} student applications`],
    ["Approved Applications", `${stats.approved_students} approved`],
    ["Pending Applications", `${stats.pending_applications} waiting review`],
    ["Disapproved Applications", `${stats.disapproved_applications} disapproved`],
    ["Old Scholars", `${stats.old_scholars} approved over 6 months ago`],
    ["New Scholars", `${stats.new_scholars} recent approved applicants`],
  ];

  return (
    <div style={pageStyle}>
      <main style={shellStyle}>
        <header style={pageHeaderStyle}>
          <span style={eyebrowStyle}>Reporting</span>
          <h1 style={titleStyle}>Reports</h1>
          <p style={mutedTextStyle}>
            Admin can generate and view scholarship application reports.
          </p>
        </header>

        {notice && <div style={noticeStyle}>{notice}</div>}

        <section style={cardGridStyle}>
          {reportCards.map(([title, copy]) => (
            <article key={title} style={cardStyle}>
              <h3 style={cardTitleStyle}>{title}</h3>
              <p style={reportValueStyle}>{loading ? "Loading..." : copy}</p>
            </article>
          ))}
        </section>

        <div style={actionRowStyle}>
          <button style={buttonPrimaryStyle} onClick={generateReport} disabled={loading}>
            Generate Report
          </button>
          <button style={buttonSecondaryStyle} onClick={loadReportData} disabled={loading}>
            Refresh Data
          </button>
        </div>
      </main>
    </div>
  );
};

const cardTitleStyle = {
  marginTop: 0,
};

const reportValueStyle = {
  ...mutedTextStyle,
  marginTop: 0,
};

const actionRowStyle = {
  display: "flex",
  gap: "12px",
  flexWrap: "wrap",
  marginTop: "20px",
};

const noticeStyle = {
  ...cardStyle,
  marginBottom: "18px",
  color: "#991b1b",
  borderColor: "#fecaca",
  background: "#fee2e2",
};

export default Reports;
