import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import api, { getStoredUser } from "../api";
import { ChartCard, MiniDonut, MiniTrendChart, Meter } from "../components/charts";
import { STATUS_TONES, formatPercent, formatPeso, toneColor } from "../components/vizTokens";
import {
  Callout,
  HeroBanner,
  IconBadge,
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
  ChartIcon,
  CheckIcon,
  ClockIcon,
  CrossIcon,
  DocumentIcon,
  ShieldIcon,
  TrendIcon,
  WalletIcon,
  WarningIcon,
} from "../components/icons";
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  mutedTextStyle,
  pageStyle,
  shellStyle,
} from "../sharedStyles";

const STATUS_TONE_NAMES = {
  Approved: "good",
  "Pending Review": "warning",
  Rejected: "critical",
};

const STATUS_ICONS = {
  Approved: CheckIcon,
  "Pending Review": ClockIcon,
  Rejected: CrossIcon,
};

const TREND_COPY = {
  improving: { label: "Improving", tone: "good", arrow: "▲" },
  declining: { label: "Declining", tone: "critical", arrow: "▼" },
  stable: { label: "Stable", tone: "neutral", arrow: "▬" },
  new: { label: "First term", tone: "neutral", arrow: "◆" },
  unknown: { label: "Not recorded", tone: "neutral", arrow: "–" },
};

// The two halves are separate pages, not two halves of one scroll: a
// recorded number and an estimated one are never on screen together, so a
// projection is never read as something the office has already decided.
const VIEWS = {
  analytics: {
    eyebrow: "Your record",
    title: "Analytics",
    subtitle: (name) =>
      name
        ? `${name}, everything here is counted from the grades, documents and decisions already saved on your file.`
        : "Everything counted from what is already saved on a student file.",
  },
  outlook: {
    eyebrow: "Estimates",
    title: "Outlook",
    subtitle: (name) =>
      name
        ? `${name}, everything here is estimated from your record. None of it is a decision.`
        : "What a student record suggests next. None of it is a decision.",
  },
};

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"];

const scoreTone = (ratio) => (ratio >= 0.75 ? "good" : ratio >= 0.5 ? "warning" : "critical");
const factorTone = (factor) => scoreTone(factor.earned / factor.weight);

const formatDate = (value, options = { month: "long", day: "numeric", year: "numeric" }) =>
  value ? new Date(value).toLocaleDateString("en-US", options) : "—";

// "October 20 ± 2 days" - the margin is part of the number, not a
// footnote, so the window is never mistaken for a promised date.
const formatDisbursementWindow = (disbursement) => {
  if (!disbursement?.date) return "Not scheduled yet";
  const date = formatDate(disbursement.date, { month: "long", day: "numeric" });
  if (!disbursement.isEstimate) return `Released ${date}`;
  return `${date} ± ${disbursement.marginDays} day${disbursement.marginDays === 1 ? "" : "s"}`;
};

const formatAwardRange = (award) => {
  if (award?.min == null) return "Not published";
  if (award.min === award.max) return formatPeso(award.min);
  return `${formatPeso(award.min)} – ${formatPeso(award.max)}`;
};

// The tick row under a mini chart is numbered by position - "1st", "2nd"
// - because "1st Sem 2024-2025" and "1st Sem 2025-2026" both truncate to
// the same thing in a 60px cell. The full term stays in the tooltip, the
// aria label and the card's caption.
const toSeriesPoints = (rows, getValue) =>
  rows.map((row, index) => ({
    label: row.label,
    shortLabel: ORDINALS[index] || `${index + 1}`,
    value: getValue(row),
  }));

const termRangeCaption = (rows) => {
  if (!rows.length) return "";
  const first = rows[0].academicYear || rows[0].label;
  const last = rows[rows.length - 1].academicYear || rows[rows.length - 1].label;
  return first === last ? first : `${first} → ${last}`;
};

const StudentAnalytics = ({ view = "analytics" }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState(null);
  const [user] = useState(() => {
    try {
      return getStoredUser();
    } catch {
      return null;
    }
  });
  const { hash } = useLocation();
  const isOutlook = view === "outlook";
  const copy = VIEWS[isOutlook ? "outlook" : "analytics"];

  // /outlook#next-steps has to wait for the data before it can scroll: the
  // recommended actions are not rendered while the page is still loading.
  const scrolledRef = useRef(false);

  useEffect(() => {
    if (scrolledRef.current || loading || hash !== "#next-steps") return;
    scrolledRef.current = true;
    document.getElementById("next-steps")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [hash, loading]);

  const loadAnalytics = useCallback(async ({ initial = false } = {}) => {
    if (initial) setLoading(true);
    setRefreshing(true);

    try {
      const response = await api.get("/student/analytics");
      setData(response.data);
      setNotice(null);
    } catch (error) {
      console.log("Student analytics error:", error);
      setNotice("We could not load your analytics right now. Please try again in a moment.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => loadAnalytics({ initial: true }));
  }, [loadAnalytics]);

  const current = data?.current;
  const gpa = data?.gpa;
  const documents = data?.documents;
  const eligibility = data?.eligibility;
  const renewal = data?.renewal;
  const award = data?.award;
  const disbursement = data?.disbursement;
  const warnings = data?.warnings || [];
  const actions = data?.actions || [];
  const trend = TREND_COPY[gpa?.direction || "unknown"];
  const scale = gpa?.scale || { max: 4, retentionMinimum: 2 };

  const gpaTone =
    gpa?.latest == null
      ? "accent"
      : gpa.latest >= scale.retentionMinimum + 0.25
        ? "good"
        : gpa.latest >= scale.retentionMinimum
          ? "warning"
          : "critical";
  const eligibilityTone = scoreTone((eligibility?.score ?? 0) / 100);
  const renewalTone = scoreTone((renewal?.probability ?? 0) / 100);
  const documentTone = scoreTone((documents?.percent ?? 0) / 100);

  // Card titles switch on whether the office has recorded the fact or this
  // page is estimating it. An amount already released is not a projection,
  // and calling it one makes the real projections look softer than they are.
  const awardRecorded = award?.isEstimate === false;
  const releaseRecorded = disbursement?.isEstimate === false;

  const gpaPoints = toSeriesPoints(gpa?.series || [], (row) => row.gpa);
  const documentPoints = toSeriesPoints(documents?.history || [], (row) => row.percent);
  const missingCount = (documents?.items || []).filter((item) => !item.submitted).length;

  const heroActions = (
    <>
      <span style={heroMetaStyle}>
        {data?.generatedAt ? `Calculated ${new Date(data.generatedAt).toLocaleString()}` : ""}
      </span>
      <div style={{ marginLeft: "auto", display: "flex", gap: "10px", flexWrap: "wrap" }}>
        <Link to="/track-status" style={{ textDecoration: "none" }}>
          <button type="button" style={buttonSecondaryStyle}>
            Track application
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
  );

  const heroAside = current ? (
    <div style={heroCardStyle}>
      <span style={heroCardLabelStyle}>Current application</span>
      <strong style={heroCardTitleStyle}>{current.scholarshipTitle}</strong>
      <div style={{ display: "flex", gap: "7px", flexWrap: "wrap", marginTop: "9px" }}>
        <StatusBadge tone={STATUS_TONE_NAMES[current.status] || "neutral"}>
          {current.status}
        </StatusBadge>
        <StatusBadge tone="neutral">{current.applicationType}</StatusBadge>
      </div>
      <span style={heroCardMetaStyle}>
        {current.academicYear || current.semester
          ? `${current.semester} ${current.academicYear}`.trim()
          : "Term not yet recorded"}
      </span>
    </div>
  ) : null;

  if (loading) {
    return (
      <div style={pageStyle}>
        <main style={shellStyle}>
          <LoadingRows rows={5} height={92} />
        </main>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <main style={shellStyle}>
        <HeroBanner
          eyebrow={copy.eyebrow}
          title={copy.title}
          subtitle={copy.subtitle(user?.name ? user.name.split(" ")[0] : "")}
          aside={heroAside}
          actions={heroActions}
        />

        {notice && <div style={noticeStyle}>{notice}</div>}

        {!data?.hasApplication ? (
          <section style={{ ...cardStyle, textAlign: "center", padding: "44px 24px" }}>
            <h2 style={{ margin: "0 0 8px", fontSize: "19px" }}>
              {isOutlook ? "Nothing to estimate from yet" : "Nothing to analyse yet"}
            </h2>
            <p style={{ ...mutedTextStyle, maxWidth: "48ch", margin: "0 auto 18px" }}>
              {isOutlook
                ? "An outlook is estimated from your record. Once you submit an application and your first grade is on file, your renewal chance, award and release window appear here."
                : "Your analytics are built from your scholarship applications. Once you submit one, your GPA trend and requirement completion appear here."}
            </p>
            <Link to="/scholarships" style={{ textDecoration: "none" }}>
              <button type="button" style={buttonSecondaryStyle}>
                Browse scholarships
              </button>
            </Link>
          </section>
        ) : (
          <>
            {/* The most urgent thing on the page sits directly under the
                banner. A warning below the fold is a warning nobody acts on. */}
            {warnings.length > 0 && (
              <div style={warningBandStyle(warnings[0].tone)} role="alert">
                <IconBadge icon={WarningIcon} tone={warnings[0].tone} size={38} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <strong style={warningTitleStyle}>{warnings[0].title}</strong>
                  <p style={warningMessageStyle}>{warnings[0].message}</p>
                  {warnings[0].action && (
                    <p style={warningActionStyle}>{warnings[0].action}</p>
                  )}
                </div>
                {isOutlook ? (
                  <a href="#next-steps" style={{ textDecoration: "none" }} className="sh-no-print">
                    <button type="button" style={buttonPrimaryStyle}>
                      What to do
                    </button>
                  </a>
                ) : (
                  <Link
                    to="/outlook#next-steps"
                    style={{ textDecoration: "none" }}
                    className="sh-no-print"
                  >
                    <button type="button" style={buttonPrimaryStyle}>
                      What to do
                    </button>
                  </Link>
                )}
              </div>
            )}

            {!isOutlook && (
              <div>
                <SectionHeading
                  eyebrow="Your record"
                  title="What is on file today"
                  description="Counted from the grades, documents and decisions the scholarship office has already saved. Nothing in this section is estimated."
                />

                <PanelGrid min={250} gap={16}>
                  <InsightCard
                    title="GPA trend over semesters"
                    icon={TrendIcon}
                    tone={gpaTone}
                    valueLabel="Current GPA"
                    value={gpa?.latest != null ? gpa.latest.toFixed(2) : "—"}
                    caption={
                      gpaPoints.length
                        ? `${trend.arrow} ${trend.label} · ${termRangeCaption(gpa.series)}`
                        : "No grade has been recorded on your applications yet."
                    }
                  >
                    <MiniTrendChart
                      points={gpaPoints}
                      domain={[0, scale.max]}
                      color={toneColor(gpaTone)}
                      valueFormat={(value) => Number(value).toFixed(2)}
                      referenceLine={{ value: scale.retentionMinimum }}
                      emptyMessage="A trend appears once your grade is recorded for a term."
                      ariaLabel={`GPA by term. ${gpaPoints
                        .map((point) => `${point.label}: ${point.value.toFixed(2)}`)
                        .join(", ")}`}
                    />
                  </InsightCard>

                  <InsightCard
                    title="Document completion"
                    icon={DocumentIcon}
                    tone={documentTone}
                    valueLabel="Completion rate"
                    value={formatPercent(documents?.percent ?? 0)}
                    caption={
                      documents?.requiredCount
                        ? `${documents.submittedCount} of ${documents.requiredCount} requirements on file.`
                        : "This scholarship has no published requirement list."
                    }
                  >
                    {documentPoints.length > 1 ? (
                      <MiniTrendChart
                        points={documentPoints}
                        domain={[0, 100]}
                        color={toneColor(documentTone)}
                        valueFormat={(value) => `${Math.round(value)}%`}
                        ariaLabel={`Document completion by term. ${documentPoints
                          .map((point) => `${point.label}: ${point.value}%`)
                          .join(", ")}`}
                      />
                    ) : (
                      <Meter
                        value={documents?.percent ?? 0}
                        tone={documentTone}
                        showValue={false}
                        caption={
                          missingCount === 0
                            ? "Nothing outstanding on your folder."
                            : `${missingCount} document${missingCount === 1 ? "" : "s"} still needed.`
                        }
                      />
                    )}
                  </InsightCard>
                </PanelGrid>

                <SectionHeading
                  eyebrow="Requirements"
                  title="What your folder holds"
                  description="Counted from the files the scholarship office has received. Nothing here is estimated."
                />

                <PanelGrid min={330} gap={18}>
                  <ChartCard
                    title="Your requirements"
                    subtitle={
                      documents?.requiredCount
                        ? `${documents.submittedCount} of ${documents.requiredCount} submitted`
                        : "No requirement list published for this scholarship"
                    }
                    footnote="Missing documents are the most common reason a renewal stalls."
                  >
                    <RequirementList
                      items={documents?.items}
                      emptyMessage="This scholarship has no published requirement list, so completion is measured on the files you uploaded."
                    />
                  </ChartCard>
                  <InsightCard
                    title="Requirements submitted vs missing"
                    icon={DocumentIcon}
                    tone={documentTone}
                  >
                    <div style={donutRowStyle}>
                      <MiniDonut
                        size={86}
                        segments={[
                          {
                            label: "Submitted",
                            value: documents?.submittedCount ?? 0,
                            color: "var(--viz-good)",
                          },
                          {
                            label: "Missing",
                            value: Math.max(
                              0,
                              (documents?.requiredCount ?? 0) - (documents?.submittedCount ?? 0)
                            ),
                            color: "var(--viz-warning)",
                          },
                        ]}
                        ariaLabel={`${documents?.submittedCount ?? 0} submitted, ${missingCount} missing`}
                      />
                      <ul style={donutLegendStyle}>
                        <li style={donutLegendItemStyle}>
                          <span style={{ ...swatchStyle, background: "var(--viz-good)" }} aria-hidden="true" />
                          <span style={donutLegendLabelStyle}>Submitted</span>
                          <strong style={donutLegendValueStyle}>{documents?.submittedCount ?? 0}</strong>
                        </li>
                        <li style={donutLegendItemStyle}>
                          <span
                            style={{ ...swatchStyle, background: "var(--viz-warning)" }}
                            aria-hidden="true"
                          />
                          <span style={donutLegendLabelStyle}>Missing</span>
                          <strong style={donutLegendValueStyle}>{missingCount}</strong>
                        </li>
                        <li style={{ ...donutLegendItemStyle, borderTop: `1px solid ${colors.border}`, paddingTop: "8px" }}>
                          <span style={donutLegendLabelStyle}>Completion rate</span>
                          <strong style={{ ...donutLegendValueStyle, color: toneColor(documentTone) }}>
                            {formatPercent(documents?.percent ?? 0)}
                          </strong>
                        </li>
                      </ul>
                    </div>
                  </InsightCard>
                </PanelGrid>

                {warnings.length > 1 && (
                  <>
                    <SectionHeading
                      eyebrow="Watch list"
                      title="Everything flagged on your file"
                      description="The banner above shows the most serious one; here is the rest."
                    />
                    <div style={{ display: "grid", gap: "12px" }}>
                      {warnings.slice(1).map((warning) => (
                        <Callout key={warning.id} tone={warning.tone} title={warning.title} icon="▲">
                          <p style={{ margin: 0 }}>{warning.message}</p>
                          {warning.action && <p style={warningActionStyle}>{warning.action}</p>}
                        </Callout>
                      ))}
                    </div>
                  </>
                )}

                {data.history?.length > 1 && (
                  <>
                    <SectionHeading
                      eyebrow="Record"
                      title="Your application history"
                      description="Every scholarship application on your file, newest first."
                    />
                    <ChartCard
                      title="Applications"
                      subtitle={`${data.history.length} applications on record`}
                      table={{
                        columns: ["Scholarship", "Term", "Type", "GPA", "Status"],
                        rows: data.history.map((item) => [
                          item.scholarshipTitle,
                          item.term,
                          item.applicationType,
                          item.gpa != null ? item.gpa.toFixed(2) : "—",
                          item.status,
                        ]),
                      }}
                    >
                      <ul style={historyListStyle}>
                        {data.history.map((item) => {
                          const StatusIcon = STATUS_ICONS[item.status] || ClockIcon;
                          return (
                            <li key={item.id} style={historyItemStyle}>
                              <span
                                aria-hidden="true"
                                style={{
                                  ...historyDotStyle,
                                  background: STATUS_TONES[item.status] || colors.muted,
                                }}
                              />
                              <span style={{ minWidth: 0, flex: 1 }}>
                                <strong style={historyTitleStyle}>{item.scholarshipTitle}</strong>
                                <span style={historyMetaStyle}>
                                  {item.term} · {item.applicationType}
                                  {item.gpa != null ? ` · GPA ${item.gpa.toFixed(2)}` : ""}
                                </span>
                              </span>
                              <StatusBadge tone={STATUS_TONE_NAMES[item.status] || "neutral"}>
                                <StatusIcon size={13} />
                                {item.status}
                              </StatusBadge>
                            </li>
                          );
                        })}
                      </ul>
                    </ChartCard>
                  </>
                )}
              </div>
            )}

            {isOutlook && (
              <div>
                <SectionHeading
                  eyebrow="Outlook"
                  title="What your record suggests next"
                  description="Estimates calculated from the record on the Analytics tab. Each one names what it was calculated from, and none of them is a decision."
                />

                <PanelGrid min={280} gap={16}>
                  <InsightCard
                    title="Eligibility score"
                    icon={ShieldIcon}
                    tone={eligibilityTone}
                    value={formatPercent(eligibility?.score ?? 0)}
                    valueLabel={`Rated “${eligibility?.band ?? "unrated"}”`}
                    caption="Weighted from academic standing, requirements, application standing and history."
                    footer={
                      <Meter value={eligibility?.score ?? 0} tone={eligibilityTone} showValue={false} />
                    }
                  />

                  <InsightCard
                    title="Renewal outlook"
                    icon={ChartIcon}
                    tone={renewalTone}
                    value={renewal ? formatPercent(renewal.probability) : "—"}
                    valueLabel="Estimated chance of renewal"
                    caption="Weighed from your eligibility score, latest GPA, grade trend, documents on file and past renewals."
                    footer={
                      <span style={outlookFooterStyle}>
                        <StatusBadge tone={renewalTone}>
                          Renewal looks {renewal?.band ?? "unrated"}
                        </StatusBadge>
                        <span style={outlookConfidenceStyle}>
                          {renewal?.confidence ?? "low"} confidence
                        </span>
                      </span>
                    }
                  >
                    <ul style={driverListStyle}>
                      {(renewal?.drivers || []).slice(0, 3).map((driver) => (
                        <li key={driver.label} style={driverItemStyle}>
                          <span
                            aria-hidden="true"
                            style={{ ...driverMarkStyle, background: toneColor(driver.tone) }}
                          >
                            {driver.tone === "good" ? "+" : "−"}
                          </span>
                          <span>{driver.label}</span>
                        </li>
                      ))}
                      {(renewal?.drivers || []).length === 0 && (
                        <li style={{ ...driverItemStyle, color: colors.muted }}>
                          Not enough on your file yet to explain this estimate.
                        </li>
                      )}
                    </ul>
                  </InsightCard>

                  <InsightCard
                    title={awardRecorded ? "Award on this application" : "Projected award"}
                    icon={WalletIcon}
                    tone="accent"
                    value={formatAwardRange(award)}
                    valueLabel={
                      awardRecorded
                        ? "Recorded by the office"
                        : award?.min == null
                          ? "Not published yet"
                          : "Estimate per semester"
                    }
                    caption={award?.basis}
                  />

                  <InsightCard
                    title={releaseRecorded ? "Award release" : "Expected release"}
                    icon={CalendarIcon}
                    tone="accent"
                    value={formatDisbursementWindow(disbursement)}
                    valueLabel={
                      releaseRecorded
                        ? "Released and confirmed"
                        : disbursement?.date
                          ? "Estimated window"
                          : "Waiting on approval"
                    }
                    caption={disbursement?.basis}
                    footer={
                      <>
                        <IconRow
                          icon={CheckIcon}
                          label="Application approved"
                          tone={current?.status === "Approved" ? "good" : "neutral"}
                          value={
                            current?.status === "Approved" ? formatDate(current.statusUpdatedAt) : "Not yet"
                          }
                        />
                        <IconRow
                          icon={ClockIcon}
                          label="Scholarship deadline"
                          value={current?.deadline ? formatDate(current.deadline) : "—"}
                        />
                      </>
                    }
                  />

                </PanelGrid>

                <SectionHeading
                  eyebrow="Breakdown"
                  title="How your eligibility score is built"
                  description="The same four numbers the committee weighs, so a score can always be explained."
                />

                <PanelGrid min={330} gap={18}>
                  <ChartCard
                    title="Score by factor"
                    subtitle={eligibility?.basis}
                    table={{
                      columns: ["Factor", "Earned", "Weight"],
                      rows: (eligibility?.factors || []).map((factor) => [
                        factor.label,
                        factor.earned.toFixed(1),
                        factor.weight,
                      ]),
                    }}
                  >
                    <ul style={factorListStyle}>
                      {(eligibility?.factors || []).map((factor) => (
                        <li key={factor.label} style={factorItemStyle}>
                          <div style={factorHeadStyle}>
                            <span style={factorLabelStyle}>{factor.label}</span>
                            <strong style={factorValueStyle}>
                              {factor.earned.toFixed(1)}
                              <span style={factorWeightStyle}> / {factor.weight}</span>
                            </strong>
                          </div>
                          <div style={factorTrackStyle}>
                            {/* Coloured by how this factor scored, not by the
                                overall band: a full documents bar drawn in red
                                because the total is low reads as a problem
                                where there is none. */}
                            <div
                              style={{
                                width: `${(factor.earned / factor.weight) * 100}%`,
                                height: "100%",
                                borderRadius: "999px",
                                background: toneColor(factorTone(factor)),
                              }}
                            />
                          </div>
                          <span style={factorDetailStyle}>{factor.detail}</span>
                        </li>
                      ))}
                    </ul>
                  </ChartCard>
                </PanelGrid>

                <EstimateNote>
                  The eligibility score, renewal likelihood and release date are{" "}
                  <strong>estimates</strong> calculated from the grades, documents and decisions the
                  scholarship office has recorded. They are not a decision — only the scholarship
                  committee can approve or renew an award, and the office confirms the exact release
                  date.
                </EstimateNote>

                {actions.length > 0 && (
                  <>
                    <SectionHeading
                      id="next-steps"
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
              </div>
            )}

            <Link to={isOutlook ? "/analytics" : "/outlook"} style={crossLinkStyle}>
              <IconBadge icon={isOutlook ? ChartIcon : TrendIcon} tone="accent" size={38} />
              <span style={{ minWidth: 0, flex: 1 }}>
                <strong style={crossLinkTitleStyle}>
                  {isOutlook ? "Back to your analytics" : "See your outlook"}
                </strong>
                <span style={crossLinkDetailStyle}>
                  {isOutlook
                    ? "The grades, documents and applications these estimates were calculated from."
                    : "What this record suggests about your renewal chance, award and release date."}
                </span>
              </span>
              <span aria-hidden="true" style={actionArrowStyle}>
                →
              </span>
            </Link>

            <p style={footNoteStyle}>
              If something here looks wrong, the record is what needs correcting — contact the
              scholarship office through{" "}
              <Link to="/notifications" style={inlineLinkStyle}>
                Notifications
              </Link>
              .
            </p>
          </>
        )}
      </main>
    </div>
  );
};

const crossLinkStyle = {
  ...cardStyle,
  display: "flex",
  alignItems: "center",
  gap: "14px",
  marginTop: "30px",
  textDecoration: "none",
  color: "inherit",
};

const crossLinkTitleStyle = {
  display: "block",
  color: colors.text,
  fontSize: "15px",
};

const crossLinkDetailStyle = {
  display: "block",
  marginTop: "3px",
  color: colors.muted,
  fontSize: "13px",
  lineHeight: 1.5,
};

const outlookFooterStyle = {
  display: "flex",
  alignItems: "center",
  gap: "9px",
  flexWrap: "wrap",
};

const outlookConfidenceStyle = {
  color: colors.muted,
  fontSize: "12px",
};

const heroMetaStyle = {
  fontSize: "12.5px",
  color: colors.muted,
};

const heroCardStyle = {
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: "14px",
  padding: "14px 18px",
  minWidth: "215px",
  maxWidth: "320px",
  display: "grid",
  alignContent: "start",
};

const heroCardLabelStyle = {
  color: colors.muted,
  fontSize: "11.5px",
  fontWeight: 700,
  letterSpacing: "0.03em",
};

const heroCardTitleStyle = {
  fontSize: "15px",
  color: colors.text,
  lineHeight: 1.35,
  marginTop: "5px",
};

const heroCardMetaStyle = {
  fontSize: "12px",
  color: colors.muted,
  marginTop: "9px",
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

const warningBandStyle = (tone) => ({
  display: "flex",
  alignItems: "center",
  gap: "15px",
  flexWrap: "wrap",
  background: colors.surface,
  border: `1px solid ${toneColor(tone)}`,
  borderLeft: `5px solid ${toneColor(tone)}`,
  borderRadius: "16px",
  padding: "16px 20px",
  boxShadow: "var(--sh-shadow-md)",
});

const warningTitleStyle = {
  display: "block",
  fontSize: "14px",
  color: colors.text,
  marginBottom: "3px",
};

const warningMessageStyle = {
  margin: 0,
  fontSize: "13.5px",
  color: colors.text,
  lineHeight: 1.55,
};

const warningActionStyle = {
  margin: "5px 0 0",
  fontSize: "12.5px",
  color: colors.muted,
  lineHeight: 1.5,
};

const driverListStyle = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: "8px",
};

const driverItemStyle = {
  display: "flex",
  gap: "9px",
  alignItems: "flex-start",
  fontSize: "12.5px",
  color: colors.text,
  lineHeight: 1.45,
};

const driverMarkStyle = {
  width: "17px",
  height: "17px",
  borderRadius: "5px",
  display: "grid",
  placeItems: "center",
  color: "#ffffff",
  fontWeight: 800,
  fontSize: "11px",
  flex: "0 0 auto",
  marginTop: "1px",
};

const donutRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: "18px",
  flexWrap: "wrap",
};

const donutLegendStyle = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: "8px",
  flex: "1 1 130px",
  minWidth: "130px",
};

const donutLegendItemStyle = {
  display: "flex",
  alignItems: "center",
  gap: "9px",
  fontSize: "12.5px",
};

const swatchStyle = {
  width: "9px",
  height: "9px",
  borderRadius: "3px",
  flex: "0 0 auto",
};

const donutLegendLabelStyle = {
  color: colors.muted,
};

const donutLegendValueStyle = {
  marginLeft: "auto",
  color: colors.text,
  fontVariantNumeric: "tabular-nums",
};

const factorListStyle = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: "14px",
};

const factorItemStyle = {
  display: "grid",
  gap: "5px",
};

const factorHeadStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  gap: "10px",
};

const factorLabelStyle = {
  fontSize: "13px",
  color: colors.text,
  fontWeight: 600,
};

const factorValueStyle = {
  fontSize: "13px",
  color: colors.text,
  fontVariantNumeric: "tabular-nums",
};

const factorWeightStyle = {
  color: colors.muted,
  fontWeight: 500,
};

const factorTrackStyle = {
  height: "6px",
  borderRadius: "999px",
  background: "var(--viz-track)",
  overflow: "hidden",
};

const factorDetailStyle = {
  fontSize: "11.5px",
  color: colors.muted,
  lineHeight: 1.5,
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

const historyListStyle = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: "12px",
};

const historyItemStyle = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  paddingBottom: "12px",
  borderBottom: `1px solid ${colors.border}`,
};

const historyDotStyle = {
  width: "9px",
  height: "9px",
  borderRadius: "50%",
  flex: "0 0 auto",
};

const historyTitleStyle = {
  display: "block",
  fontSize: "14px",
  color: colors.text,
};

const historyMetaStyle = {
  display: "block",
  fontSize: "12px",
  color: colors.muted,
  marginTop: "2px",
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

export default StudentAnalytics;
