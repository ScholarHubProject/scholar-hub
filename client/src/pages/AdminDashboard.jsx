import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api";
import { SYNC_CHANNELS, useLiveSync } from "../liveSync";
import { getSavedSettings, subscribeToSettings } from "../settings";
import {
  BarListChart,
  ChartCard,
  ColumnChart,
  DonutChart,
  LineChart,
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
  StatTile,
} from "../components/ui";
import {
  CheckIcon,
  ClockIcon,
  CrossIcon,
  RenewIcon,
  StarIcon,
  UsersIcon,
} from "../components/icons";
import {
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

const AUTO_SYNC_MS = 30000;

const EMPTY_ANALYTICS = {
  summary: {
    totalApplicants: 0,
    totalApplications: 0,
    qualifiedStudents: 0,
    approvedApplications: 0,
    rejectedApplications: 0,
    pendingApplications: 0,
    renewalApplications: 0,
    newApplications: 0,
    scholarshipsPosted: 0,
    totalAwarded: 0,
    totalDisbursed: 0,
    disbursedCount: 0,
    approvalRate: null,
  },
  charts: {
    byProgram: [],
    byStatus: [],
    byTerm: [],
    recipientsByProgram: [],
    byType: [],
    trend: [],
    qualifiedVsRejected: [],
    gpaByProgram: [],
  },
  documents: { total: 0, complete: 0, partial: 0, missing: 0, averagePercent: 0 },
  filterOptions: {
    academicYears: [],
    semesters: [],
    programs: [],
    scholarships: [],
    statuses: [],
    applicationTypes: [],
  },
};

const FILTER_KEYS = ["academicYear", "semester", "program", "scholarship", "status", "applicationType"];
const EMPTY_FILTERS = Object.fromEntries(FILTER_KEYS.map((key) => [key, ""]));

const AdminDashboard = () => {
  const [data, setData] = useState(EMPTY_ANALYTICS);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [settings, setSettings] = useState(getSavedSettings);
  const syncingRef = useRef(false);

  const loadAnalytics = useCallback(
    async ({ initial = false, silent = false } = {}) => {
      if (syncingRef.current) return;
      syncingRef.current = true;

      if (initial) setLoading(true);
      setRefreshing(true);

      try {
        const response = await api.get("/admin/analytics", { params: filters });
        setData({ ...EMPTY_ANALYTICS, ...response.data });
        setNotice(null);
        setLastUpdated(new Date());
      } catch (error) {
        console.log("Admin analytics error:", error);
        if (!silent) {
          setNotice("Unable to reach live analytics right now. The last figures are still shown.");
        }
      } finally {
        syncingRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [filters]
  );

  useEffect(() => subscribeToSettings(setSettings), []);

  // Deferred by a microtask so the first fetch does not set state
  // synchronously inside the effect body.
  useEffect(() => {
    Promise.resolve().then(() => loadAnalytics({ initial: true }));
  }, [loadAnalytics]);

  // The figures move when an application is decided or a scholarship
  // changes, so those broadcasts refresh immediately; the tick covers
  // everything written from another browser.
  useLiveSync(loadAnalytics, {
    channels: [SYNC_CHANNELS.applications, SYNC_CHANNELS.scholarships],
    intervalMs: AUTO_SYNC_MS,
    enabled: settings.autoRefresh,
  });

  const { summary, charts, documents, filterOptions } = data;

  const handleFilterChange = (name, value) =>
    setFilters((current) => ({ ...current, [name]: value }));

  const activeFilterCount = FILTER_KEYS.filter((key) => filters[key]).length;

  // Status is a state, so it wears the reserved status colours rather
  // than a categorical slot, and each slice is labelled in the legend.
  const statusSegments = useMemo(
    () =>
      (charts.byStatus || []).map((slice) => ({
        ...slice,
        color: STATUS_TONES[slice.label] || SERIES_COLORS[0],
      })),
    [charts.byStatus]
  );

  // "Qualified" is a statement about a person, so this breakdown counts
  // students, not forms. The three states are exclusive and add up to the
  // applicant total, which is why the shares below use that denominator.
  const outcomeSegments = useMemo(
    () => [
      { label: "Qualified", value: summary.qualifiedStudents || 0, color: "var(--viz-good)" },
      { label: "Not qualified", value: summary.notQualifiedStudents || 0, color: "var(--viz-critical)" },
      { label: "Awaiting decision", value: summary.awaitingStudents || 0, color: "var(--viz-warning)" },
    ],
    [summary]
  );

  const trendLabels = (charts.trend || []).map((point) => point.label);
  const hasTrendData = (charts.trend || []).some((point) => point.submitted > 0);

  // Two groups, because the unit changes between them: the first counts
  // people, the second counts forms. Mixing "64 applicants" with "106 not
  // qualified" in one row is what made the summary unreadable.
  const studentTiles = [
    {
      label: "Students who applied",
      value: formatNumber(summary.totalApplicants),
      caption: `${formatNumber(summary.totalApplications)} applications on file`,
      tone: "accent",
      icon: UsersIcon,
      emphasis: true,
    },
    {
      label: "Qualified students",
      value: formatNumber(summary.qualifiedStudents),
      caption: "At least one approved application",
      tone: "good",
      icon: CheckIcon,
    },
    {
      label: "Not qualified",
      value: formatNumber(summary.notQualifiedStudents),
      caption: "Every application decided, none approved",
      tone: "critical",
      icon: CrossIcon,
    },
    {
      label: "Awaiting decision",
      value: formatNumber(summary.awaitingStudents),
      caption: "Still waiting on this office",
      tone: "warning",
      icon: ClockIcon,
    },
  ];

  const applicationTiles = [
    {
      label: "Applications received",
      value: formatNumber(summary.totalApplications),
      caption: `${formatNumber(summary.newApplications)} new · ${formatNumber(
        summary.renewalApplications
      )} renewing`,
      tone: "accent",
      icon: RenewIcon,
    },
    {
      label: "Approved",
      value: formatNumber(summary.approvedApplications),
      caption:
        summary.approvalRate == null
          ? "No decisions recorded yet"
          : `${summary.approvalRate}% of decided applications`,
      tone: "good",
      icon: StarIcon,
    },
    {
      label: "Rejected",
      value: formatNumber(summary.rejectedApplications),
      caption: "Reviewed and turned down",
      tone: "critical",
      icon: CrossIcon,
    },
    {
      label: "Pending review",
      value: formatNumber(summary.pendingApplications),
      caption: "Waiting for a decision from this office",
      tone: "warning",
      icon: ClockIcon,
    },
  ];

  return (
    <div style={pageStyle}>
      <main style={shellStyle}>
        <HeroBanner
          eyebrow="Office of Scholarships · Coordinator"
          title="Scholarship Analytics"
          subtitle="Every figure on this page is counted from the applications on file and moves with the filters below."
          aside={
            <div style={heroFigureStyle}>
              <span style={heroLabelStyle}>Applicants in view</span>
              <strong style={heroFigureValueStyle}>{formatNumber(summary.totalApplicants)}</strong>
              <span style={heroCaptionStyle}>
                {summary.approvalRate == null
                  ? "No decisions recorded yet"
                  : `${summary.approvalRate}% approval rate on decided applications`}
              </span>
            </div>
          }
          actions={
            <>
              <span style={liveDotStyle(refreshing, settings.autoRefresh)}>
                {refreshing ? "Syncing" : settings.autoRefresh ? "Live" : "Manual"}
              </span>
              <span style={mastheadMetaStyle}>
                {lastUpdated
                  ? `Updated ${lastUpdated.toLocaleTimeString()}`
                  : "Waiting for first sync…"}
              </span>
              <span style={mastheadMetaStyle}>
                {formatNumber(data.totalUnfiltered ?? summary.totalApplications)} total records
              </span>
              <div style={{ marginLeft: "auto", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <Link to="/reports" style={{ textDecoration: "none" }}>
                  <button type="button" style={buttonSecondaryStyle}>
                    Open reports
                  </button>
                </Link>
                <button
                  type="button"
                  style={buttonSecondaryStyle}
                  onClick={() => loadAnalytics()}
                  disabled={refreshing}
                >
                  {refreshing ? "Refreshing…" : "Refresh"}
                </button>
              </div>
            </>
          }
        />

        {notice && <div style={noticeStyle}>{notice}</div>}

        <FilterBar
          filters={[
            { name: "academicYear", label: "Academic year", options: filterOptions.academicYears },
            { name: "semester", label: "Semester", options: filterOptions.semesters },
            { name: "program", label: "Program", options: filterOptions.programs },
            { name: "scholarship", label: "Scholarship", options: filterOptions.scholarships },
            { name: "status", label: "Status", options: filterOptions.statuses },
            { name: "applicationType", label: "Type", options: filterOptions.applicationTypes },
          ]}
          values={filters}
          onChange={handleFilterChange}
          onReset={() => setFilters(EMPTY_FILTERS)}
          summary={
            activeFilterCount === 0
              ? "Showing every application on file."
              : `${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"} applied · ${formatNumber(
                  summary.totalApplications
                )} of ${formatNumber(data.totalUnfiltered ?? summary.totalApplications)} applications`
          }
        />

        <SectionHeading
          eyebrow="At a glance"
          title="Students"
          description="Counts people. Every student who has applied is qualified, not qualified, or still awaiting a decision — the three add up to the total."
        />

        {loading ? (
          <LoadingRows rows={1} height={104} />
        ) : (
          <PanelGrid min={228} gap={14}>
            {studentTiles.map((tile) => (
              <StatTile key={tile.label} {...tile} />
            ))}
          </PanelGrid>
        )}

        <SectionHeading
          eyebrow="At a glance"
          title="Applications"
          description="Counts forms. A student who renews across three terms is one student above and three applications here."
        />

        {loading ? (
          <LoadingRows rows={1} height={104} />
        ) : (
          <PanelGrid min={228} gap={14}>
            {applicationTiles.map((tile) => (
              <StatTile key={tile.label} {...tile} />
            ))}
          </PanelGrid>
        )}

        <SectionHeading
          eyebrow="Volume"
          title="Application trends"
          description="Where applications are coming from and how they are moving through review."
        />

        <div style={{ display: "grid", gap: "18px" }}>
          <ChartCard
            title="Applications over time"
            subtitle="Submitted and approved per month, last 12 months"
            stale={refreshing}
            legend={[
              { label: "Submitted", color: SERIES_COLORS[0], shape: "line" },
              { label: "Approved", color: "var(--viz-good)", shape: "line" },
            ]}
            table={{
              columns: ["Month", "Submitted", "Approved"],
              rows: (charts.trend || []).map((point) => [
                point.label,
                formatNumber(point.submitted),
                formatNumber(point.approved),
              ]),
            }}
            footnote="Months with no applications are kept on the axis so a quiet period reads as a gap rather than closing up."
          >
            {hasTrendData ? (
              <LineChart
                height={280}
                xLabels={trendLabels}
                showArea={false}
                series={[
                  {
                    label: "Submitted",
                    color: SERIES_COLORS[0],
                    values: (charts.trend || []).map((point) => point.submitted),
                  },
                  {
                    label: "Approved",
                    color: "var(--viz-good)",
                    values: (charts.trend || []).map((point) => point.approved),
                  },
                ]}
              />
            ) : (
              <LineChart height={280} xLabels={[]} series={[]} />
            )}
          </ChartCard>

          <PanelGrid min={340} gap={18}>
            <ChartCard
              title="Applications by program"
              subtitle="Applications received per course, year levels combined"
              stale={refreshing}
              table={{
                columns: ["Program", "Applications"],
                rows: (charts.byProgram || []).map((row) => [row.label, formatNumber(row.value)]),
              }}
            >
              <ColumnChart
                data={(charts.byProgram || []).slice(0, 7)}
                height={280}
                axisLabel="Applications"
              />
            </ChartCard>

            <ChartCard
              title="Applications by status"
              subtitle="Where every application in view currently sits"
              stale={refreshing}
              legend={statusSegments.map((slice) => ({
                label: slice.label,
                color: slice.color,
                value: formatNumber(slice.value),
              }))}
              table={{
                columns: ["Status", "Applications", "Share"],
                rows: statusSegments.map((slice) => [
                  slice.label,
                  formatNumber(slice.value),
                  formatPercent(
                    summary.totalApplications ? (slice.value / summary.totalApplications) * 100 : 0,
                    1
                  ),
                ]),
              }}
              footnote="Approved, pending and rejected use the reserved status colours, never a series colour, and every slice is named in the legend."
            >
              <DonutChart
                data={statusSegments}
                size={230}
                centerLabel="Applications"
                centerValue={formatNumber(summary.totalApplications)}
              />
            </ChartCard>
          </PanelGrid>

          <ChartCard
            title="Qualified vs. not qualified"
            subtitle="Every student in view, by where they stand"
            stale={refreshing}
            legend={outcomeSegments.map((segment) => ({
              label: segment.label,
              color: segment.color,
              value: formatNumber(segment.value),
            }))}
            table={{
              columns: ["Outcome", "Students", "Share"],
              rows: outcomeSegments.map((segment) => [
                segment.label,
                formatNumber(segment.value),
                formatPercent(
                  summary.totalApplicants ? (segment.value / summary.totalApplicants) * 100 : 0,
                  1
                ),
              ]),
            }}
            footnote={
              summary.approvalRate == null
                ? "The approval rate is shown once at least one application has been decided."
                : `A student counts as qualified once any one of their applications is approved. Separately, ${summary.approvalRate}% of decided applications were approved.`
            }
          >
            <ShareBar segments={outcomeSegments} height={26} />
            <div style={outcomeRowStyle}>
              {outcomeSegments.map((segment) => (
                <div key={segment.label} style={outcomeItemStyle}>
                  <span style={{ ...outcomeSwatchStyle, background: segment.color }} aria-hidden="true" />
                  <div>
                    <strong style={outcomeValueStyle}>{formatNumber(segment.value)}</strong>
                    <span style={outcomeLabelStyle}>{segment.label}</span>
                  </div>
                </div>
              ))}
            </div>
          </ChartCard>

          <PanelGrid min={340} gap={18}>
            <ChartCard
              title="Applications per semester"
              subtitle="Applications grouped by the term they cover"
              stale={refreshing}
              table={{
                columns: ["Term", "Applications", "Approved"],
                rows: (charts.byTerm || []).map((row) => [
                  row.label,
                  formatNumber(row.value),
                  formatNumber(row.approved),
                ]),
              }}
              footnote="Applications with no term recorded are grouped under “Unassigned term”. Set the term from Manage Applicants to move them out."
            >
              <ColumnChart
                data={(charts.byTerm || []).slice(-8).map(splitTermLabel)}
                height={280}
                labelChars={10}
                axisLabel="Applications"
              />
            </ChartCard>

            <ChartCard
              title="Scholarship recipients per program"
              subtitle="Approved applications by course"
              stale={refreshing}
              table={{
                columns: ["Program", "Recipients"],
                rows: (charts.recipientsByProgram || []).map((row) => [
                  row.label,
                  formatNumber(row.value),
                ]),
              }}
            >
              <BarListChart
                data={charts.recipientsByProgram}
                color="var(--viz-good)"
                maxRows={8}
              />
            </ChartCard>
          </PanelGrid>

          <PanelGrid min={300} gap={18}>
            <ChartCard
              title="New vs. renewal"
              subtitle="How much of the load is returning scholars"
              stale={refreshing}
              legend={[
                { label: "New", color: SERIES_COLORS[0], value: formatNumber(summary.newApplications) },
                {
                  label: "Renewal",
                  color: SERIES_COLORS[1],
                  value: formatNumber(summary.renewalApplications),
                },
              ]}
              table={{
                columns: ["Type", "Applications"],
                rows: [
                  ["New", formatNumber(summary.newApplications)],
                  ["Renewal", formatNumber(summary.renewalApplications)],
                ],
              }}
            >
              <DonutChart
                size={200}
                centerLabel="Applications"
                centerValue={formatNumber(summary.totalApplications)}
                data={[
                  { label: "New", value: summary.newApplications, color: SERIES_COLORS[0] },
                  { label: "Renewal", value: summary.renewalApplications, color: SERIES_COLORS[1] },
                ]}
              />
            </ChartCard>

            <ChartCard
              title="Requirements on file"
              subtitle="How complete applicants' document folders are"
              stale={refreshing}
              table={{
                columns: ["Completeness", "Applications"],
                rows: [
                  ["Complete", formatNumber(documents.complete)],
                  ["Partial (50–99%)", formatNumber(documents.partial)],
                  ["Under 50%", formatNumber(documents.missing)],
                ],
              }}
            >
              <div style={{ display: "grid", gap: "18px", paddingTop: "4px" }}>
                <Meter
                  value={documents.averagePercent}
                  label="Average completion"
                  tone={
                    documents.averagePercent >= 80
                      ? "good"
                      : documents.averagePercent >= 50
                        ? "warning"
                        : "critical"
                  }
                  caption={`Across ${formatNumber(documents.total)} applications in view.`}
                />
                <div style={docBreakdownStyle}>
                  {[
                    ["Complete", documents.complete, "var(--viz-good)"],
                    ["Partial", documents.partial, "var(--viz-warning)"],
                    ["Under 50%", documents.missing, "var(--viz-critical)"],
                  ].map(([label, value, color]) => (
                    <div key={label} style={docBreakdownItemStyle}>
                      <span style={{ ...outcomeSwatchStyle, background: color }} aria-hidden="true" />
                      <strong style={outcomeValueStyle}>{formatNumber(value)}</strong>
                      <span style={outcomeLabelStyle}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </ChartCard>

            <ChartCard
              title="Awards released"
              subtitle="Amounts recorded against approved applications"
              stale={refreshing}
              table={{
                columns: ["Measure", "Amount"],
                rows: [
                  ["Total awarded", formatPeso(summary.totalAwarded)],
                  ["Released so far", formatPeso(summary.totalDisbursed)],
                  ["Awaiting release", formatPeso(summary.totalAwarded - summary.totalDisbursed)],
                ],
              }}
              footnote="Only awards the office has recorded an amount for are counted here."
            >
              <div style={{ display: "grid", gap: "16px", paddingTop: "4px" }}>
                <div>
                  <span style={heroLabelStyle}>Total awarded</span>
                  <strong style={awardFigureStyle}>{formatPeso(summary.totalAwarded)}</strong>
                </div>
                <Meter
                  value={summary.totalAwarded ? (summary.totalDisbursed / summary.totalAwarded) * 100 : 0}
                  label="Released"
                  tone="accent"
                  caption={`${formatNumber(summary.disbursedCount)} of ${formatNumber(
                    summary.approvedApplications
                  )} approved applications have been released.`}
                />
              </div>
            </ChartCard>
          </PanelGrid>
        </div>

        <p style={footNoteStyle}>
          Applications are counted from the records this office holds. Terms, grades and award
          amounts come from the academic record saved on each application in{" "}
          <Link to="/manage-applicants" style={inlineLinkStyle}>
            Manage Applicants
          </Link>
          .
        </p>
      </main>
    </div>
  );
};






const heroFigureStyle = {
  display: "grid",
  gap: "2px",
  alignContent: "start",
  minWidth: "190px",
  padding: "14px 18px",
  borderRadius: "14px",
  background: colors.surface,
  backdropFilter: "var(--sh-glass-filter)",
  WebkitBackdropFilter: "var(--sh-glass-filter)",
  border: `1px solid ${colors.glassBorder}`,
};

const heroLabelStyle = {
  color: colors.muted,
  fontSize: "12px",
  fontWeight: 700,
  letterSpacing: "0.03em",
};

// One hero figure per view, in the same sans as the rest of the page.
const heroFigureValueStyle = {
  fontSize: "clamp(40px, 8vw, 52px)",
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

const awardFigureStyle = {
  display: "block",
  fontSize: "clamp(26px, 5vw, 32px)",
  color: colors.text,
  letterSpacing: "-0.02em",
  marginTop: "4px",
};


const liveDotStyle = (refreshing, autoRefresh) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: "7px",
  background: colors.surface,
  backdropFilter: "var(--sh-glass-filter)",
  WebkitBackdropFilter: "var(--sh-glass-filter)",
  border: `1px solid ${colors.glassBorder}`,
  borderRadius: "999px",
  padding: "5px 12px",
  fontSize: "12px",
  fontWeight: 800,
  color: refreshing ? colors.primary : autoRefresh ? "var(--viz-good-ink)" : colors.muted,
});

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

const outcomeRowStyle = {
  display: "flex",
  gap: "26px",
  flexWrap: "wrap",
  marginTop: "18px",
};

const outcomeItemStyle = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
};

const outcomeSwatchStyle = {
  width: "10px",
  height: "10px",
  borderRadius: "3px",
  flex: "0 0 auto",
};

const outcomeValueStyle = {
  display: "block",
  fontSize: "19px",
  color: colors.text,
  lineHeight: 1.2,
};

const outcomeLabelStyle = {
  display: "block",
  fontSize: "12.5px",
  color: colors.muted,
};

const docBreakdownStyle = {
  display: "flex",
  gap: "20px",
  flexWrap: "wrap",
  borderTop: `1px solid ${colors.border}`,
  paddingTop: "14px",
};

const docBreakdownItemStyle = {
  display: "flex",
  alignItems: "center",
  gap: "9px",
};

const footNoteStyle = {
  ...mutedTextStyle,
  fontSize: "12.5px",
  marginTop: "26px",
};

const inlineLinkStyle = {
  color: colors.primary,
  fontWeight: 700,
};

export default AdminDashboard;
