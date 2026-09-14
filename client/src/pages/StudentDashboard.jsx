import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api, { getStoredUser } from "../api";
import { getSavedSettings, subscribeToSettings } from "../settings";
import { Meter, MiniTrendChart } from "../components/charts";
import {
  STATUS_TONES,
  formatNumber,
  formatPercent,
  formatPeso,
  toneColor,
} from "../components/vizTokens";
import {
  Callout,
  HeroBanner,
  IconRow,
  InsightCard,
  LoadingRows,
  PanelGrid,
  EstimateNote,
  RequirementList,
  SectionHeading,
  StatusBadge,
} from "../components/ui";
import {
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  DocumentIcon,
  RenewIcon,
  SearchIcon,
  ShieldIcon,
  TrendIcon,
  WalletIcon,
  WarningIcon,
} from "../components/icons";
import {
  buttonSecondaryStyle,
  cardStyle,
  colors,
  mutedTextStyle,
  pageStyle,
  shellStyle,
} from "../sharedStyles";

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"];

const AUTO_SYNC_MS = 30000;
const USER_CHANGED_EVENT = "scholarHubUserChanged";

const STATUS_TONE_NAMES = {
  Approved: "good",
  "Pending Review": "warning",
  Rejected: "critical",
};

const TREND_COPY = {
  improving: { label: "Improving", tone: "good", icon: "▲" },
  declining: { label: "Declining", tone: "critical", icon: "▼" },
  stable: { label: "Stable", tone: "neutral", icon: "▬" },
  new: { label: "First term", tone: "neutral", icon: "◆" },
  unknown: { label: "Not recorded", tone: "neutral", icon: "–" },
};

const getCurrentUser = () => {
  try {
    return getStoredUser();
  } catch {
    return null;
  }
};

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "—";

const formatDisbursementWindow = (disbursement) => {
  if (!disbursement?.date) return "Not scheduled yet";
  const date = new Date(disbursement.date).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
  if (!disbursement.isEstimate) return `Released ${date}`;
  return `${date} ± ${disbursement.marginDays}d`;
};

const formatAwardRange = (award) => {
  if (award?.min == null) return "Not published";
  if (award.min === award.max) return formatPeso(award.min);
  return `${formatPeso(award.min)} – ${formatPeso(award.max)}`;
};

// The student dashboard is a summary, not a second analytics page: one
// small chart, everything else a number with a sentence next to it.
// Anything that needs a chart to be understood lives on /analytics and
// is linked from here.
const StudentDashboard = () => {
  const [user, setUser] = useState(getCurrentUser);
  const [scholarships, setScholarships] = useState([]);
  const [applications, setApplications] = useState([]);
  const [insight, setInsight] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [settings, setSettings] = useState(getSavedSettings);
  const [scholarshipQuery, setScholarshipQuery] = useState("");
  const syncingRef = useRef(false);

  const loadDashboard = useCallback(async ({ initial = false, silent = false } = {}) => {
    if (syncingRef.current) return;
    syncingRef.current = true;

    if (initial) setLoading(true);
    setRefreshing(true);

    try {
      const [scholarshipsResult, applicationsResult, analyticsResult] = await Promise.allSettled([
        api.get("/scholarships"),
        api.get("/applications/student"),
        api.get("/student/analytics"),
      ]);

      if (scholarshipsResult.status === "fulfilled") {
        setScholarships(
          Array.isArray(scholarshipsResult.value.data) ? scholarshipsResult.value.data : []
        );
      }

      if (applicationsResult.status === "fulfilled") {
        setApplications(
          Array.isArray(applicationsResult.value.data) ? applicationsResult.value.data : []
        );
      }

      if (analyticsResult.status === "fulfilled") {
        setInsight(analyticsResult.value.data);
      }

      const allFailed = [scholarshipsResult, applicationsResult, analyticsResult].every(
        (result) => result.status === "rejected"
      );

      if (allFailed) {
        throw scholarshipsResult.reason;
      }

      const someFailed = [scholarshipsResult, applicationsResult, analyticsResult].some(
        (result) => result.status === "rejected"
      );
      setNotice(
        someFailed && !silent
          ? "Some of your dashboard could not sync. Everything else below is current."
          : null
      );
      setLastUpdated(new Date());
    } catch (error) {
      console.log("Student dashboard sync error:", error);
      if (!silent) setNotice("Unable to sync your dashboard right now.");
    } finally {
      syncingRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => subscribeToSettings(setSettings), []);

  useEffect(() => {
    Promise.resolve().then(() => loadDashboard({ initial: true }));
  }, [loadDashboard]);

  useEffect(() => {
    if (!settings.autoRefresh) return undefined;

    const intervalId = window.setInterval(() => loadDashboard({ silent: true }), AUTO_SYNC_MS);
    const handleFocus = () => {
      if (document.visibilityState === "visible") loadDashboard({ silent: true });
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [loadDashboard, settings.autoRefresh]);

  useEffect(() => {
    const syncUserFromStorage = () => setUser(getCurrentUser());
    const handleStorageChange = (event) => {
      if (event.key === "currentUser") syncUserFromStorage();
    };

    window.addEventListener(USER_CHANGED_EVENT, syncUserFromStorage);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener(USER_CHANGED_EVENT, syncUserFromStorage);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  const openScholarships = useMemo(
    () => scholarships.filter((scholarship) => scholarship.status !== "Closed"),
    [scholarships]
  );

  // Title and description both, because students search for the thing the
  // grant is for ("tuition", "board exam") far more often than for its
  // official title.
  const matchedScholarships = useMemo(() => {
    const query = scholarshipQuery.trim().toLowerCase();
    if (!query) return openScholarships;
    return openScholarships.filter((scholarship) =>
      `${scholarship.title} ${scholarship.description || ""}`.toLowerCase().includes(query)
    );
  }, [openScholarships, scholarshipQuery]);

  const searching = scholarshipQuery.trim().length > 0;

  // Unsearched, this is a preview panel and three cards is the whole
  // point of it. A search is a question, so it gets every answer rather
  // than the first three.
  const visibleScholarships = searching ? matchedScholarships : matchedScholarships.slice(0, 3);

  const current = insight?.current;
  const gpa = insight?.gpa;
  const documents = insight?.documents;
  const eligibility = insight?.eligibility;
  const renewal = insight?.renewal;
  const scale = gpa?.scale || { max: 4, retentionMinimum: 2 };
  const trend = TREND_COPY[gpa?.direction || "unknown"];
  const warnings = insight?.warnings || [];
  const actions = insight?.actions || [];
  const missingDocuments = (documents?.items || []).filter((item) => !item.submitted);

  const documentTone =
    (documents?.percent ?? 0) >= 100 ? "good" : (documents?.percent ?? 0) >= 60 ? "warning" : "critical";
  const gpaTone =
    gpa?.latest == null
      ? "accent"
      : gpa.latest >= scale.retentionMinimum + 0.25
        ? "good"
        : gpa.latest >= scale.retentionMinimum
          ? "warning"
          : "critical";
  const eligibilityTone =
    (eligibility?.score ?? 0) >= 75 ? "good" : (eligibility?.score ?? 0) >= 50 ? "warning" : "critical";
  const renewalTone =
    (renewal?.probability ?? 0) >= 75 ? "good" : (renewal?.probability ?? 0) >= 50 ? "warning" : "critical";

  return (
    <div style={pageStyle}>
      <main style={shellStyle}>
        <HeroBanner
          eyebrow="Student workspace"
          title={`Welcome back, ${user?.name?.split(" ")[0] || "Scholar"}`}
          subtitle={
            current
              ? `Your ${current.scholarshipTitle} application is ${current.status.toLowerCase()}.`
              : "You have not applied for a scholarship yet. Open scholarships are listed below."
          }
          aside={
            current ? (
              <div style={statusCardStyle}>
                <span style={heroLabelStyle}>Scholarship status</span>
                <div style={{ marginTop: "8px" }}>
                  <StatusBadge
                    tone={STATUS_TONE_NAMES[current.status] || "neutral"}
                    icon={
                      current.status === "Approved" ? (
                        <CheckIcon size={13} />
                      ) : current.status === "Rejected" ? (
                        <WarningIcon size={13} />
                      ) : (
                        <ClockIcon size={13} />
                      )
                    }
                  >
                    {current.status}
                  </StatusBadge>
                </div>
                <span style={statusMetaStyle}>
                  {current.semester || current.academicYear
                    ? `${current.semester} ${current.academicYear}`.trim()
                    : "Term not recorded"}{" "}
                  · {current.applicationType}
                </span>
              </div>
            ) : null
          }
          actions={
            <>
              <span style={mastheadMetaStyle}>
                {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : "Syncing…"}
              </span>
              <div style={{ marginLeft: "auto", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <Link to="/analytics" style={{ textDecoration: "none" }}>
                  <button type="button" style={buttonSecondaryStyle}>
                    Full analytics
                  </button>
                </Link>
                <button
                  type="button"
                  style={buttonSecondaryStyle}
                  onClick={() => loadDashboard()}
                  disabled={refreshing}
                >
                  {refreshing ? "Refreshing…" : "Refresh"}
                </button>
              </div>
            </>
          }
        />

        {notice && <div style={noticeStyle}>{notice}</div>}

        {/* The most urgent thing on the page goes first, before any
            number the student has to interpret for themselves. */}
        {warnings.length > 0 && (
          <div style={{ display: "grid", gap: "12px", marginBottom: "18px" }}>
            <Callout
              tone={warnings[0].tone}
              title={warnings[0].title}
              icon={warnings[0].tone === "critical" ? "!" : "▲"}
              actions={
                <Link to="/outlook#next-steps" style={{ textDecoration: "none" }}>
                  <button type="button" style={buttonSecondaryStyle}>
                    See what to do
                  </button>
                </Link>
              }
            >
              <p style={{ margin: 0 }}>{warnings[0].message}</p>
              {warnings[0].action && <p style={warningActionStyle}>{warnings[0].action}</p>}
            </Callout>
          </div>
        )}

        {loading ? (
          <LoadingRows rows={2} height={104} />
        ) : (
          <PanelGrid min={236} gap={14}>
            <InsightCard
              title="Eligibility score"
              icon={ShieldIcon}
              tone={eligibilityTone}
              value={eligibility ? formatPercent(eligibility.score) : "—"}
              valueLabel={eligibility ? `Rated “${eligibility.band}”` : "Apply to get a score"}
              emphasis
              compact
            />
            <InsightCard
              title="Current GPA"
              icon={TrendIcon}
              tone={gpaTone}
              value={gpa?.latest != null ? gpa.latest.toFixed(2) : "—"}
              valueLabel={
                gpa?.latest != null
                  ? `${scale.retentionMinimum.toFixed(2)} needed to stay eligible`
                  : "No grade recorded yet"
              }
              caption={
                gpa?.change != null
                  ? `${trend.icon} ${gpa.change > 0 ? "+" : ""}${gpa.change.toFixed(2)} from last term`
                  : null
              }
              compact
            />
            <InsightCard
              title="Documents complete"
              icon={DocumentIcon}
              tone={documentTone}
              value={formatPercent(documents?.percent ?? 0)}
              valueLabel={
                documents?.requiredCount
                  ? `${documents.submittedCount} of ${documents.requiredCount} submitted`
                  : "No requirement list published"
              }
              compact
            />
            <InsightCard
              title="Renewal outlook"
              icon={RenewIcon}
              tone={renewalTone}
              value={renewal ? formatPercent(renewal.probability) : "—"}
              valueLabel={
                renewal ? `Estimate · ${renewal.confidence} confidence` : "Apply to get an estimate"
              }
              compact
            />
          </PanelGrid>
        )}

        {insight?.hasApplication && (
          <>
            <SectionHeading
              eyebrow="Your award"
              title="What you can expect"
              description="Both figures are estimates from your record, not a confirmed payment."
            />

            <PanelGrid min={280} gap={16}>
              <InsightCard
                title="Estimated award"
                icon={WalletIcon}
                tone="accent"
                valueLabel="Per semester"
                value={formatAwardRange(insight.award)}
                caption={insight.award?.basis}
              />

              <InsightCard
                title="Expected disbursement"
                icon={CalendarIcon}
                tone="accent"
                valueLabel={
                  insight.disbursement?.isEstimate ? "Estimated window" : "Confirmed"
                }
                value={formatDisbursementWindow(insight.disbursement)}
                caption={insight.disbursement?.basis}
                footer={
                  <IconRow
                    icon={ClockIcon}
                    label="Application approved"
                    tone={current?.status === "Approved" ? "good" : "neutral"}
                    value={
                      current?.status === "Approved"
                        ? formatDate(current.statusUpdatedAt)
                        : "Not yet"
                    }
                  />
                }
              />

            </PanelGrid>

            <SectionHeading
              eyebrow="Requirements"
              title="What is still outstanding"
              description="Missing documents are the most common reason an application stalls."
              actions={
                <Link to="/application-form" style={{ textDecoration: "none" }}>
                  <button type="button" style={buttonSecondaryStyle}>
                    Upload documents
                  </button>
                </Link>
              }
            />

            <PanelGrid min={320} gap={18}>
              <section style={panelStyle} className="sh-print-block">
                <Meter
                  value={documents?.percent ?? 0}
                  tone={documentTone}
                  label="Document completion"
                  caption={
                    missingDocuments.length === 0
                      ? "Your folder is complete. Nothing outstanding."
                      : `${missingDocuments.length} document${
                          missingDocuments.length === 1 ? "" : "s"
                        } still needed.`
                  }
                />
                <div style={{ marginTop: "18px" }}>
                  <RequirementList
                    items={documents?.items}
                    emptyMessage="This scholarship has no published requirement list, so completion is measured on the files you uploaded."
                  />
                </div>
              </section>

              <section style={panelStyle} className="sh-print-block">
                <h3 style={panelTitleStyle}>GPA against the minimum</h3>
                <p style={panelCopyStyle}>
                  You have to stay above {scale.retentionMinimum.toFixed(2)} to keep your
                  scholarship. The red rule is that line.
                </p>
                <MiniTrendChart
                  height={150}
                  points={(gpa?.series || []).map((point, index) => ({
                    label: point.label,
                    shortLabel: ORDINALS[index] || `${index + 1}`,
                    value: point.gpa,
                  }))}
                  domain={[0, scale.max]}
                  color={toneColor(gpaTone)}
                  valueFormat={(value) => Number(value).toFixed(2)}
                  referenceLine={{ value: scale.retentionMinimum }}
                  emptyMessage="No grades have been recorded on your applications yet."
                />
              </section>
            </PanelGrid>

            {actions.length > 0 && (
              <>
                <SectionHeading
                  eyebrow="Next steps"
                  title="Recommended actions"
                  description="Ordered by what would move your standing the most."
                />
                <div style={{ display: "grid", gap: "10px" }}>
                  {actions.map((action, index) => (
                    <Link key={action.id} to={action.to} style={actionCardStyle}>
                      <span style={actionIndexStyle}>{index + 1}</span>
                      <span style={{ minWidth: 0 }}>
                        <strong style={actionLabelStyle}>{action.label}</strong>
                        {action.detail && <span style={actionDetailStyle}>{action.detail}</span>}
                      </span>
                      <span aria-hidden="true" style={actionArrowStyle}>
                        →
                      </span>
                    </Link>
                  ))}
                </div>
              </>
            )}

            <EstimateNote>
              The eligibility score and renewal outlook are estimates calculated from the grades,
              documents and decisions recorded by the scholarship office. They are not a decision —
              only the scholarship committee can approve or renew an award.{" "}
              <Link to="/outlook" style={inlineLinkStyle}>
                See how they are calculated
              </Link>
              .
            </EstimateNote>
          </>
        )}

        <SectionHeading
          eyebrow="Opportunities"
          title="Open scholarships"
          description={
            searching
              ? `${formatNumber(matchedScholarships.length)} of ${formatNumber(
                  openScholarships.length
                )} scholarship${openScholarships.length === 1 ? "" : "s"} match “${scholarshipQuery.trim()}”.`
              : `${formatNumber(openScholarships.length)} scholarship${
                  openScholarships.length === 1 ? "" : "s"
                } currently accepting applications.`
          }
          actions={
            <>
              {/* The label wraps the input, so clicking the magnifier
                  focuses the field rather than being a dead decoration. */}
              <label style={searchFieldStyle} className="sh-search-field sh-no-print">
                <span aria-hidden="true" style={searchIconStyle}>
                  <SearchIcon size={16} />
                </span>
                <input
                  type="search"
                  value={scholarshipQuery}
                  onChange={(event) => setScholarshipQuery(event.target.value)}
                  placeholder="Search scholarships"
                  aria-label="Search open scholarships"
                  style={searchInputStyle}
                />
              </label>
              <Link to="/scholarships" style={{ textDecoration: "none" }}>
                <button type="button" style={buttonSecondaryStyle}>
                  View all
                </button>
              </Link>
            </>
          }
        />

        <PanelGrid min={280} gap={16}>
          {loading ? (
            <LoadingRows rows={2} height={110} />
          ) : visibleScholarships.length === 0 ? (
            <p style={{ ...mutedTextStyle, fontSize: "13.5px" }}>
              {searching
                ? `No open scholarship matches “${scholarshipQuery.trim()}”. Try a shorter word, or view all scholarships.`
                : "No scholarships are open right now. New posts appear here as soon as the office publishes them."}
            </p>
          ) : (
            visibleScholarships.map((scholarship) => (
              <article key={scholarship.id} style={scholarshipCardStyle} className="sh-print-block">
                <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                  <strong style={scholarshipTitleStyle}>{scholarship.title}</strong>
                  {settings.showStatusBadges && (
                    <StatusBadge tone={scholarship.status === "Open" ? "good" : "neutral"}>
                      {scholarship.status}
                    </StatusBadge>
                  )}
                </div>
                <p style={scholarshipCopyStyle}>{scholarship.description}</p>
                <span style={scholarshipMetaStyle}>
                  {scholarship.available_slots} slot
                  {Number(scholarship.available_slots) === 1 ? "" : "s"} · closes{" "}
                  {formatDate(scholarship.deadline)}
                </span>
              </article>
            ))
          )}
        </PanelGrid>

        {applications.length > 0 && (
          <>
            <SectionHeading
              eyebrow="History"
              title="My applications"
              actions={
                <Link to="/track-status" style={{ textDecoration: "none" }}>
                  <button type="button" style={buttonSecondaryStyle}>
                    Track status
                  </button>
                </Link>
              }
            />
            <ul style={applicationListStyle}>
              {applications.slice(0, 4).map((application) => (
                <li key={application.id} style={applicationItemStyle}>
                  <span
                    aria-hidden="true"
                    style={{
                      ...statusDotStyle,
                      background: STATUS_TONES[application.status] || colors.muted,
                    }}
                  />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <strong style={applicationTitleStyle}>{application.scholarship_title}</strong>
                    <span style={applicationMetaStyle}>
                      Submitted {formatDate(application.created_at)}
                      {application.remarks ? ` · ${application.remarks}` : ""}
                    </span>
                  </span>
                  <StatusBadge tone={STATUS_TONE_NAMES[application.status] || "neutral"}>
                    {application.status}
                  </StatusBadge>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
};









const statusCardStyle = {
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: "14px",
  padding: "14px 18px",
  minWidth: "200px",
  display: "grid",
  alignContent: "start",
};

const heroLabelStyle = {
  color: colors.muted,
  fontSize: "12px",
  fontWeight: 700,
  letterSpacing: "0.03em",
};

const statusMetaStyle = {
  fontSize: "12px",
  color: colors.muted,
  marginTop: "10px",
};


const mastheadMetaStyle = {
  fontSize: "12.5px",
  color: colors.muted,
};

const noticeStyle = {
  background: "var(--viz-warning-wash)",
  border: "1px solid var(--viz-warning)",
  color: "var(--viz-warning-ink)",
  borderRadius: "12px",
  padding: "12px 16px",
  marginBottom: "16px",
  fontSize: "13.5px",
};

const warningActionStyle = {
  margin: "6px 0 0",
  fontSize: "12.5px",
  color: colors.muted,
};





const panelStyle = {
  ...cardStyle,
  borderRadius: "16px",
  boxShadow: "var(--sh-shadow-md)",
};

const panelTitleStyle = {
  margin: "0 0 6px",
  fontSize: "15px",
  color: colors.text,
};

const panelCopyStyle = {
  ...mutedTextStyle,
  margin: "0 0 14px",
  fontSize: "12.5px",
};

const actionCardStyle = {
  display: "flex",
  alignItems: "center",
  gap: "14px",
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: "13px",
  padding: "14px 16px",
  textDecoration: "none",
  color: colors.text,
};

const actionIndexStyle = {
  width: "26px",
  height: "26px",
  borderRadius: "8px",
  background: colors.primarySoft,
  color: colors.primaryDark,
  display: "grid",
  placeItems: "center",
  fontSize: "13px",
  fontWeight: 800,
  flex: "0 0 auto",
};

const actionLabelStyle = {
  display: "block",
  fontSize: "14px",
  lineHeight: 1.4,
};

const actionDetailStyle = {
  display: "block",
  fontSize: "12.5px",
  color: colors.muted,
  marginTop: "2px",
};

const actionArrowStyle = {
  marginLeft: "auto",
  color: colors.primary,
  fontWeight: 800,
};

const searchFieldStyle = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "0 12px",
  height: "38px",
  minWidth: "min(100%, 220px)",
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: "999px",
  boxShadow: "var(--sh-shadow-sm)",
  cursor: "text",
};

const searchIconStyle = {
  display: "flex",
  color: colors.primary,
  flex: "0 0 auto",
};

const searchInputStyle = {
  border: "none",
  outline: "none",
  background: "transparent",
  color: colors.text,
  fontSize: "13.5px",
  width: "100%",
  minWidth: 0,
  padding: 0,
};

const scholarshipCardStyle = {
  ...cardStyle,
  borderRadius: "14px",
  padding: "18px 20px",
  display: "grid",
  gap: "8px",
  alignContent: "start",
  boxShadow: "var(--sh-shadow-sm)",
};

const scholarshipTitleStyle = {
  fontSize: "14.5px",
  color: colors.text,
  lineHeight: 1.35,
};

const scholarshipCopyStyle = {
  ...mutedTextStyle,
  margin: 0,
  fontSize: "12.5px",
  display: "-webkit-box",
  WebkitLineClamp: 3,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

const scholarshipMetaStyle = {
  fontSize: "12px",
  color: colors.muted,
};

const applicationListStyle = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: "10px",
};

const applicationItemStyle = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: "13px",
  padding: "13px 16px",
};

const statusDotStyle = {
  width: "9px",
  height: "9px",
  borderRadius: "50%",
  flex: "0 0 auto",
};

const applicationTitleStyle = {
  display: "block",
  fontSize: "14px",
  color: colors.text,
};

const applicationMetaStyle = {
  display: "block",
  fontSize: "12px",
  color: colors.muted,
  marginTop: "2px",
};

const inlineLinkStyle = {
  color: colors.primary,
  fontWeight: 700,
};

export default StudentDashboard;
