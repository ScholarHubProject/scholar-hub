import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api";
import {
  BarListChart,
  ChartCard,
  ColumnChart,
  DonutChart,
  Meter,
  ShareBar,
} from "../components/charts";
import {
  SERIES_COLORS,
  STATUS_TONES,
  formatNumber,
  formatPercent,
  formatPeso,
} from "../components/vizTokens";
import {
  FilterBar,
  HeroBanner,
  LoadingRows,
  PanelGrid,
  SectionHeading,
  StatusBadge,
} from "../components/ui";
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  colors,
  mutedTextStyle,
  pageStyle,
  shellStyle,
} from "../sharedStyles";

// "1st Sem 2024-2025" does not survive truncation to a category axis:
// every term collapses to "1st Sem 2…" and the years become
// indistinguishable. Split the year onto a second line instead.
const splitTermLabel = (term) => {
  const label = String(term.label || "");
  const lastSpace = label.lastIndexOf(" ");
  if (lastSpace === -1) return { ...term, label };
  return { ...term, label: label.slice(0, lastSpace), sublabel: label.slice(lastSpace + 1) };
};

const FILTER_KEYS = ["academicYear", "semester", "program", "scholarship", "status", "applicationType"];
const EMPTY_FILTERS = Object.fromEntries(FILTER_KEYS.map((key) => [key, ""]));

const EMPTY_DATA = {
  summary: {},
  charts: {
    byProgram: [],
    byStatus: [],
    byTerm: [],
    recipientsByProgram: [],
    byType: [],
    trend: [],
    gpaByProgram: [],
  },
  documents: { total: 0, complete: 0, partial: 0, missing: 0, averagePercent: 0 },
  details: [],
  filterOptions: {
    academicYears: [],
    semesters: [],
    programs: [],
    scholarships: [],
    statuses: [],
    applicationTypes: [],
  },
};

const dash = (value) => (value == null || value === "" ? "—" : value);
const gpaCell = (value) => (value == null ? "—" : Number(value).toFixed(2));
const dateCell = (value) =>
  value ? new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "—";

// ---------------------------------------------------------------
// Report catalogue
// ---------------------------------------------------------------
// Each entry turns the one analytics payload into a titled table. They
// all read the same filtered slice, so two reports opened side by side
// can never disagree - which is the usual failure of a reports page that
// queries the database once per report.
const REPORTS = [
  {
    id: "summary",
    group: "Overview",
    label: "Applications summary",
    description: "Headline counts for the selected slice.",
    build: (data) => ({
      columns: ["Measure", "Value"],
      rows: [
        // Students first, then forms. Each block adds up to its own total, so
        // an exported summary cannot be read as 64 applicants of whom 106
        // were turned down.
        ["Students who applied", formatNumber(data.summary.totalApplicants)],
        ["Qualified students", formatNumber(data.summary.qualifiedStudents)],
        ["Not qualified students", formatNumber(data.summary.notQualifiedStudents)],
        ["Students awaiting a decision", formatNumber(data.summary.awaitingStudents)],
        ["Total applications", formatNumber(data.summary.totalApplications)],
        ["Approved applications", formatNumber(data.summary.approvedApplications)],
        ["Rejected applications", formatNumber(data.summary.rejectedApplications)],
        ["Pending applications", formatNumber(data.summary.pendingApplications)],
        ["New applications", formatNumber(data.summary.newApplications)],
        ["Renewal applications", formatNumber(data.summary.renewalApplications)],
        ["Scholarships posted", formatNumber(data.summary.scholarshipsPosted)],
        [
          "Approval rate",
          data.summary.approvalRate == null ? "—" : `${data.summary.approvalRate}%`,
        ],
        ["Total awarded", formatPeso(data.summary.totalAwarded)],
        ["Released so far", formatPeso(data.summary.totalDisbursed)],
      ],
    }),
  },
  {
    id: "applicants",
    group: "Applicants",
    label: "Total applicants",
    description: "Every application in the selected slice.",
    build: (data) => ({
      columns: ["Student", "School ID", "Program", "Scholarship", "Term", "Type", "Status", "Submitted"],
      rows: data.details.map((row) => [
        row.studentName,
        dash(row.schoolId),
        row.program,
        row.scholarship,
        row.term,
        row.applicationType,
        row.status,
        dateCell(row.submittedAt),
      ]),
    }),
  },
  {
    id: "qualified",
    group: "Applicants",
    label: "Qualified applicants",
    description: "Applications the committee approved.",
    filterRows: (rows) => rows.filter((row) => row.status === "Approved"),
    build: (data, rows) => ({
      columns: ["Student", "Program", "Scholarship", "Term", "GPA", "Award", "Approved"],
      rows: rows.map((row) => [
        row.studentName,
        row.program,
        row.scholarship,
        row.term,
        gpaCell(row.gpa),
        row.awardAmount ? formatPeso(row.awardAmount) : "—",
        dateCell(row.decidedAt || row.submittedAt),
      ]),
    }),
  },
  {
    id: "rejected",
    group: "Applicants",
    label: "Rejected applicants",
    description: "Applications reviewed and not qualified, with the recorded reason.",
    filterRows: (rows) => rows.filter((row) => row.status === "Rejected"),
    build: (data, rows) => ({
      columns: ["Student", "Program", "Scholarship", "Term", "GPA", "Documents", "Reason recorded"],
      rows: rows.map((row) => [
        row.studentName,
        row.program,
        row.scholarship,
        row.term,
        gpaCell(row.gpa),
        `${row.documentsSubmitted}/${row.documentsRequired}`,
        dash(row.remarks),
      ]),
    }),
  },
  {
    id: "by-program",
    group: "Breakdowns",
    label: "Applicants by program",
    description: "Applications and approvals per course.",
    build: (data) => {
      const recipients = new Map(
        (data.charts.recipientsByProgram || []).map((row) => [row.label, row.value])
      );
      return {
        columns: ["Program", "Applications", "Approved", "Approval rate"],
        rows: (data.charts.byProgram || []).map((row) => {
          const approved = recipients.get(row.label) || 0;
          return [
            row.label,
            formatNumber(row.value),
            formatNumber(approved),
            row.value ? `${Math.round((approved / row.value) * 100)}%` : "—",
          ];
        }),
      };
    },
  },
  {
    id: "by-status",
    group: "Breakdowns",
    label: "Applicants by status",
    description: "Where every application currently sits.",
    build: (data) => ({
      columns: ["Status", "Applications", "Share"],
      rows: (data.charts.byStatus || []).map((row) => [
        row.label,
        formatNumber(row.value),
        formatPercent(
          data.summary.totalApplications ? (row.value / data.summary.totalApplications) * 100 : 0,
          1
        ),
      ]),
    }),
  },
  {
    id: "recipients",
    group: "Awards",
    label: "Scholarship recipients",
    description: "Approved students and the award recorded against each.",
    filterRows: (rows) => rows.filter((row) => row.status === "Approved"),
    build: (data, rows) => ({
      columns: ["Student", "School ID", "Program", "Scholarship", "Term", "Type", "Award", "Released"],
      rows: rows.map((row) => [
        row.studentName,
        dash(row.schoolId),
        row.program,
        row.scholarship,
        row.term,
        row.applicationType,
        row.awardAmount ? formatPeso(row.awardAmount) : "—",
        row.disbursedAt ? dateCell(row.disbursedAt) : "Not released",
      ]),
    }),
  },
  {
    id: "renewals",
    group: "Awards",
    label: "Renewal statistics",
    description: "How returning scholars compare with first-time applicants.",
    build: (data) => {
      const rows = data.details;
      const forType = (type) => rows.filter((row) => row.applicationType === type);
      const line = (type) => {
        const scoped = forType(type);
        const approved = scoped.filter((row) => row.status === "Approved").length;
        const rejected = scoped.filter((row) => row.status === "Rejected").length;
        const decided = approved + rejected;
        return [
          type,
          formatNumber(scoped.length),
          formatNumber(approved),
          formatNumber(rejected),
          decided ? `${Math.round((approved / decided) * 100)}%` : "—",
        ];
      };

      return {
        columns: ["Type", "Applications", "Approved", "Rejected", "Approval rate"],
        rows: [line("New"), line("Renewal")],
        note: "Counted from the detail rows below the row cap, so very large slices may be sampled.",
      };
    },
  },
  {
    id: "gpa",
    group: "Academics",
    label: "GPA performance",
    description: "Average recorded GPA per program and how many sit below the retention minimum.",
    build: (data) => ({
      columns: ["Program", "Students with a grade", "Average GPA", "Below minimum"],
      rows: (data.charts.gpaByProgram || []).map((row) => [
        row.label,
        formatNumber(row.count),
        row.value.toFixed(2),
        formatNumber(row.atRisk),
      ]),
    }),
  },
  {
    id: "disbursement",
    group: "Awards",
    label: "Scholarship disbursement",
    description: "Awards recorded, released and still outstanding.",
    filterRows: (rows) => rows.filter((row) => row.status === "Approved" && row.awardAmount),
    build: (data, rows) => ({
      columns: ["Student", "Scholarship", "Term", "Award", "Status", "Released"],
      rows: rows.map((row) => [
        row.studentName,
        row.scholarship,
        row.term,
        formatPeso(row.awardAmount),
        row.disbursedAt ? "Released" : "Awaiting release",
        row.disbursedAt ? dateCell(row.disbursedAt) : "—",
      ]),
    }),
  },
  {
    id: "documents",
    group: "Academics",
    label: "Document completion",
    description: "How complete applicants' requirement folders are.",
    build: (data) => ({
      columns: ["Completeness", "Applications", "Share"],
      rows: [
        ["Complete (100%)", formatNumber(data.documents.complete), share(data.documents.complete, data.documents.total)],
        ["Partial (50–99%)", formatNumber(data.documents.partial), share(data.documents.partial, data.documents.total)],
        ["Under 50%", formatNumber(data.documents.missing), share(data.documents.missing, data.documents.total)],
        ["Average completion", `${data.documents.averagePercent}%`, "—"],
      ],
    }),
  },
];

const share = (value, total) => (total ? formatPercent((value / total) * 100, 1) : "—");

// Excel opens a bare UTF-8 CSV as Latin-1 and mangles the peso sign, so
// the byte order mark goes in front.
const toCsv = (columns, rows) => {
  const escape = (cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`;
  return `\uFEFF${[columns, ...rows].map((row) => row.map(escape).join(",")).join("\r\n")}`;
};

const Reports = () => {
  const [data, setData] = useState(EMPTY_DATA);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [activeReport, setActiveReport] = useState(REPORTS[0].id);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState(null);
  const [generatedAt, setGeneratedAt] = useState(null);

  const loadReports = useCallback(
    async ({ initial = false } = {}) => {
      if (initial) setLoading(true);
      setRefreshing(true);

      try {
        const response = await api.get("/admin/analytics", { params: filters });
        setData({ ...EMPTY_DATA, ...response.data });
        setGeneratedAt(new Date());
        setNotice(null);
      } catch (error) {
        console.log("Reports load error:", error);
        setNotice("Failed to load report data. The figures below may be out of date.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [filters]
  );

  useEffect(() => {
    Promise.resolve().then(() => loadReports({ initial: true }));
  }, [loadReports]);

  const report = REPORTS.find((entry) => entry.id === activeReport) || REPORTS[0];
  const scopedRows = useMemo(
    () => (report.filterRows ? report.filterRows(data.details) : data.details),
    [report, data.details]
  );
  const table = useMemo(() => report.build(data, scopedRows), [report, data, scopedRows]);

  const filterSummary = useMemo(() => {
    const active = FILTER_KEYS.filter((key) => filters[key]).map((key) => filters[key]);
    return active.length ? active.join(" · ") : "All records";
  }, [filters]);

  const downloadCsv = () => {
    const stamp = new Date();
    const meta = [
      ["ScholarHub report", report.label],
      ["Filters", filterSummary],
      ["Generated", stamp.toLocaleString()],
      [],
    ];
    const csv = toCsv(table.columns, [...meta.map((row) => padRow(row, table.columns.length)), ...table.rows]);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `scholarhub-${report.id}-${stamp.toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const groups = [...new Set(REPORTS.map((entry) => entry.group))];

  return (
    <div style={pageStyle}>
      <main style={shellStyle}>
        <HeroBanner
          eyebrow="Office of Scholarships · Reporting"
          title="Reports"
          subtitle="Ten standing reports, all drawn from the same filtered set of applications, so any two of them always agree."
          aside={
            <div style={heroFigureStyle}>
              <span style={heroLabelStyle}>Applications in scope</span>
              <strong style={heroFigureValueStyle}>
                {formatNumber(data.summary.totalApplications || 0)}
              </strong>
              <span style={heroCaptionStyle}>{filterSummary}</span>
            </div>
          }
          actions={
            <>
              <span style={mastheadMetaStyle}>
                {generatedAt ? `Generated ${generatedAt.toLocaleString()}` : "Loading…"}
              </span>
              <div style={{ marginLeft: "auto", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <Link to="/admin-dashboard" style={{ textDecoration: "none" }}>
                  <button type="button" style={buttonSecondaryStyle}>
                    Back to analytics
                  </button>
                </Link>
                <button
                  type="button"
                  style={buttonSecondaryStyle}
                  onClick={() => window.print()}
                  disabled={loading}
                >
                  Print / PDF
                </button>
                <button
                  type="button"
                  style={buttonPrimaryStyle}
                  onClick={downloadCsv}
                  disabled={loading || table.rows.length === 0}
                >
                  Download CSV
                </button>
              </div>
            </>
          }
        />

        {notice && <div style={noticeStyle}>{notice}</div>}

        <FilterBar
          filters={[
            { name: "academicYear", label: "Academic year", options: data.filterOptions.academicYears },
            { name: "semester", label: "Semester", options: data.filterOptions.semesters },
            { name: "program", label: "Program", options: data.filterOptions.programs },
            { name: "scholarship", label: "Scholarship", options: data.filterOptions.scholarships },
            { name: "status", label: "Status", options: data.filterOptions.statuses },
            { name: "applicationType", label: "Type", options: data.filterOptions.applicationTypes },
          ]}
          values={filters}
          onChange={(name, value) => setFilters((current) => ({ ...current, [name]: value }))}
          onReset={() => setFilters(EMPTY_FILTERS)}
          summary={`Filters apply to every report and to the export. Currently: ${filterSummary}.`}
        />

        <div className="sh-reports-layout">
          <nav
            style={reportNavStyle}
            aria-label="Reports"
            className="sh-reports-nav sh-no-print"
          >
            {groups.map((group) => (
              <div key={group} style={{ marginBottom: "16px" }}>
                <span style={navGroupLabelStyle}>{group}</span>
                <ul style={navListStyle}>
                  {REPORTS.filter((entry) => entry.group === group).map((entry) => {
                    const isActive = entry.id === activeReport;
                    return (
                      <li key={entry.id}>
                        <button
                          type="button"
                          onClick={() => setActiveReport(entry.id)}
                          style={navButtonStyle(isActive)}
                          aria-current={isActive ? "page" : undefined}
                        >
                          {entry.label}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          <section style={{ minWidth: 0 }}>
            <SectionHeading
              eyebrow={report.group}
              title={report.label}
              description={report.description}
              actions={
                <StatusBadge tone="neutral">
                  {formatNumber(table.rows.length)} row{table.rows.length === 1 ? "" : "s"}
                </StatusBadge>
              }
            />

            {loading ? (
              <LoadingRows rows={4} height={54} />
            ) : (
              <>
                <ReportVisual report={report} data={data} stale={refreshing} />

                <div
                  style={tableCardStyle}
                  className={`sh-print-block${refreshing ? " viz-stale" : ""}`}
                >
                  <div style={{ overflowX: "auto" }}>
                    <table style={tableStyle} className="viz-table">
                      <caption style={tableCaptionStyle}>
                        {report.label} · {filterSummary} ·{" "}
                        {generatedAt ? generatedAt.toLocaleDateString() : ""}
                      </caption>
                      <thead>
                        <tr>
                          {table.columns.map((column, index) => (
                            <th
                              key={column}
                              scope="col"
                              style={{ ...thStyle, textAlign: index === 0 ? "left" : "right" }}
                            >
                              {column}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {table.rows.length === 0 ? (
                          <tr>
                            <td colSpan={table.columns.length} style={emptyCellStyle}>
                              No records match the current filters.
                            </td>
                          </tr>
                        ) : (
                          table.rows.map((row, rowIndex) => (
                            <tr key={`${row[0]}-${rowIndex}`} style={rowIndex % 2 ? zebraRowStyle : undefined}>
                              {row.map((cell, cellIndex) => (
                                <td
                                  key={`${rowIndex}-${cellIndex}`}
                                  style={{ ...tdStyle, textAlign: cellIndex === 0 ? "left" : "right" }}
                                >
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <p style={tableFootStyle}>
                    {table.note ? `${table.note} ` : ""}
                    {data.detailsTruncated
                      ? `Detail reports show the ${formatNumber(
                          data.detailRowLimit
                        )} most recent applications. Narrow the filters for a complete list.`
                      : "All matching records are shown."}
                  </p>
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
};

// A chart sits above the table only where it says something the table
// does not. The summary and detail listings get no chart: a table of
// twelve names is not improved by drawing it.
const ReportVisual = ({ report, data, stale }) => {
  if (report.id === "by-program") {
    return (
      <ChartCard
        stale={stale}
        title="Applications per program"
        subtitle="Year levels combined"
        table={{
          columns: ["Program", "Applications"],
          rows: (data.charts.byProgram || []).map((row) => [row.label, formatNumber(row.value)]),
        }}
      >
        <ColumnChart data={(data.charts.byProgram || []).slice(0, 7)} height={250} />
      </ChartCard>
    );
  }

  if (report.id === "by-status") {
    const segments = (data.charts.byStatus || []).map((slice) => ({
      ...slice,
      color: STATUS_TONES[slice.label] || SERIES_COLORS[0],
    }));

    return (
      <ChartCard
        stale={stale}
        title="Status split"
        subtitle="Every application in scope"
        legend={segments.map((slice) => ({
          label: slice.label,
          color: slice.color,
          value: formatNumber(slice.value),
        }))}
      >
        <DonutChart
          data={segments}
          size={210}
          centerLabel="Applications"
          centerValue={formatNumber(data.summary.totalApplications || 0)}
        />
      </ChartCard>
    );
  }

  if (report.id === "recipients" || report.id === "qualified") {
    return (
      <ChartCard
        stale={stale}
        title="Recipients per program" subtitle="Approved applications by course">
        <BarListChart data={data.charts.recipientsByProgram} color="var(--viz-good)" maxRows={8} />
      </ChartCard>
    );
  }

  if (report.id === "gpa") {
    return (
      <ChartCard
        stale={stale}
        title="Average GPA per program"
        subtitle="Higher is better on the 4.00 scale"
        footnote="Only students with a recorded grade are included, so a program with no grades on file does not appear."
      >
        <BarListChart
          data={data.charts.gpaByProgram}
          color={SERIES_COLORS[1]}
          valueFormat={(value) => Number(value).toFixed(2)}
          maxRows={8}
        />
      </ChartCard>
    );
  }

  if (report.id === "renewals") {
    return (
      <ChartCard
        stale={stale}
        title="New vs. renewal"
        subtitle="Share of the caseload that is returning scholars"
        legend={[
          { label: "New", color: SERIES_COLORS[0], value: formatNumber(data.summary.newApplications) },
          {
            label: "Renewal",
            color: SERIES_COLORS[1],
            value: formatNumber(data.summary.renewalApplications),
          },
        ]}
      >
        <ShareBar
          height={26}
          segments={[
            { label: "New", value: data.summary.newApplications, color: SERIES_COLORS[0] },
            { label: "Renewal", value: data.summary.renewalApplications, color: SERIES_COLORS[1] },
          ]}
        />
      </ChartCard>
    );
  }

  if (report.id === "documents") {
    return (
      <ChartCard
        stale={stale}
        title="Requirement folders" subtitle="Average completion across the slice">
        <Meter
          value={data.documents.averagePercent}
          label="Average completion"
          tone={
            data.documents.averagePercent >= 80
              ? "good"
              : data.documents.averagePercent >= 50
                ? "warning"
                : "critical"
          }
          caption={`${formatNumber(data.documents.complete)} of ${formatNumber(
            data.documents.total
          )} applications have a complete folder.`}
        />
      </ChartCard>
    );
  }

  if (report.id === "disbursement") {
    const awarded = data.summary.totalAwarded || 0;
    const released = data.summary.totalDisbursed || 0;

    return (
      <ChartCard
        stale={stale}
        title="Released against awarded"
        subtitle="Peso value of approved awards"
        legend={[
          { label: "Released", color: "var(--viz-good)", value: formatPeso(released) },
          { label: "Awaiting release", color: "var(--viz-warning)", value: formatPeso(awarded - released) },
        ]}
      >
        <ShareBar
          height={26}
          valueFormat={formatPeso}
          segments={[
            { label: "Released", value: released, color: "var(--viz-good)" },
            { label: "Awaiting release", value: Math.max(0, awarded - released), color: "var(--viz-warning)" },
          ]}
        />
      </ChartCard>
    );
  }

  if (report.id === "summary") {
    return (
      <PanelGrid min={300} gap={18} style={{ marginBottom: "18px" }}>
        <ChartCard
        stale={stale}
        title="Applications over time" subtitle="Last 12 months">
          <ColumnChart
            data={(data.charts.trend || []).map((point) => ({
              label: point.label.split(" ")[0],
              sublabel: point.label.split(" ")[1],
              value: point.submitted,
            }))}
            height={230}
            labelChars={4}
          />
        </ChartCard>
        <ChartCard
        stale={stale}
        title="Applicants per term" subtitle="Grouped by the term each application covers">
          <ColumnChart
            data={(data.charts.byTerm || []).slice(-6).map(splitTermLabel)}
            height={230}
            labelChars={9}
          />
        </ChartCard>
      </PanelGrid>
    );
  }

  return null;
};

const padRow = (row, length) => {
  const padded = [...row];
  while (padded.length < length) padded.push("");
  return padded;
};






const heroFigureStyle = {
  display: "grid",
  gap: "2px",
  alignContent: "start",
  minWidth: "190px",
  padding: "14px 18px",
  borderRadius: "14px",
  background: colors.surface,
  border: `1px solid ${colors.border}`,
};

const heroLabelStyle = {
  color: colors.muted,
  fontSize: "12px",
  fontWeight: 700,
  letterSpacing: "0.03em",
};

const heroFigureValueStyle = {
  fontSize: "clamp(36px, 7vw, 48px)",
  lineHeight: 1.05,
  color: colors.text,
  letterSpacing: "-0.03em",
};

const heroCaptionStyle = {
  color: colors.muted,
  fontSize: "12px",
  lineHeight: 1.5,
  marginTop: "4px",
};


const mastheadMetaStyle = {
  fontSize: "12.5px",
  color: colors.muted,
};

const noticeStyle = {
  background: "var(--viz-critical-wash)",
  border: "1px solid var(--viz-critical)",
  color: "var(--viz-critical-ink)",
  borderRadius: "12px",
  padding: "12px 16px",
  marginBottom: "16px",
  fontSize: "13.5px",
};

// Grid columns and the sticky offset are in index.css under
// .sh-reports-layout, which is where the tablet breakpoint lives.
const reportNavStyle = {
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: "14px",
  padding: "16px 14px",
};

const navGroupLabelStyle = {
  display: "block",
  fontSize: "11px",
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: colors.muted,
  marginBottom: "8px",
  paddingLeft: "10px",
};

const navListStyle = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: "2px",
};

const navButtonStyle = (isActive) => ({
  width: "100%",
  textAlign: "left",
  background: isActive ? colors.primarySoft : "transparent",
  color: isActive ? colors.primaryDark : colors.text,
  border: "none",
  borderRadius: "9px",
  padding: "9px 10px",
  fontSize: "13px",
  fontWeight: isActive ? 800 : 600,
  cursor: "pointer",
});

const tableCardStyle = {
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: "16px",
  padding: "clamp(14px, 3vw, 20px)",
  boxShadow: "var(--sh-shadow-md)",
  marginTop: "18px",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "13px",
  minWidth: "520px",
};

const tableCaptionStyle = {
  textAlign: "left",
  color: colors.muted,
  fontSize: "12px",
  paddingBottom: "10px",
};

const thStyle = {
  padding: "10px 12px",
  borderBottom: `1px solid ${colors.border}`,
  color: colors.primaryDark,
  fontSize: "11.5px",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  whiteSpace: "nowrap",
  position: "sticky",
  top: 0,
  background: colors.primarySoft,
};

const tdStyle = {
  padding: "10px 12px",
  borderBottom: `1px solid ${colors.border}`,
  color: colors.text,
};

const zebraRowStyle = {
  background: colors.pageAlt,
};

const emptyCellStyle = {
  ...tdStyle,
  textAlign: "center",
  color: colors.muted,
  padding: "28px 12px",
};

const tableFootStyle = {
  ...mutedTextStyle,
  fontSize: "12px",
  marginTop: "12px",
};

export default Reports;
