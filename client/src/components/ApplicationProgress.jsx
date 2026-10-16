import { Fragment } from "react";
import { colors } from "../sharedStyles";

// Submitted > Checking > Evaluation > Accepted / Rejected, for one application.
// The first three come from review_stage, which the office moves forward while
// the application is pending; the last comes from status, which is the only
// field that records a decision.
const STAGE_ORDER = ["Submitted", "Checking", "Evaluation"];

const getProgressSteps = (application) => {
  const status = String(application?.status || "").trim().toLowerCase();
  const decided =
    status === "approved"
      ? { label: "Accepted", state: "accepted" }
      : status === "rejected" || status === "disapproved"
        ? { label: "Rejected", state: "rejected" }
        : status === "withdrawn"
          ? { label: "Withdrawn", state: "withdrawn" }
          : null;

  // A decision means every review step before it happened, whatever stage
  // was last recorded.
  const reached = decided
    ? STAGE_ORDER.length
    : Math.max(0, STAGE_ORDER.indexOf(application?.review_stage || "Submitted"));

  const stages = STAGE_ORDER.map((label, index) => ({
    label,
    state:
      index === 0 || index < reached
        ? "done"
        : index === reached
          ? "current"
          : "upcoming",
  }));

  return [
    ...stages,
    decided || { label: "Accepted / Rejected", state: "upcoming" },
  ];
};

const TONES = {
  done: { ring: "var(--viz-good-line)", fill: "var(--viz-good-wash)", ink: "var(--viz-good-ink)", mark: "✓" },
  current: { ring: colors.primary, fill: colors.primarySoft, ink: colors.primaryDark, mark: "•" },
  upcoming: { ring: colors.border, fill: colors.surface, ink: colors.muted, mark: "" },
  accepted: { ring: "var(--viz-good-line)", fill: "var(--viz-good-wash)", ink: "var(--viz-good-ink)", mark: "✓" },
  rejected: { ring: "var(--viz-critical-line)", fill: "var(--viz-critical-wash)", ink: "var(--viz-critical-ink)", mark: "✕" },
  withdrawn: { ring: colors.border, fill: colors.field, ink: colors.muted, mark: "–" },
};

const ApplicationProgress = ({ application, compact = false }) => {
  const steps = getProgressSteps(application);

  return (
    <ol style={listStyle(compact)} aria-label="Application progress">
      {steps.map((step, index) => {
        const tone = TONES[step.state];

        return (
          <Fragment key={step.label}>
            {index > 0 && (
              <li aria-hidden="true" style={arrowStyle(compact)}>
                &rarr;
              </li>
            )}
            <li
              style={stepStyle(compact)}
              aria-current={step.state === "current" ? "step" : undefined}
            >
              <span style={markerStyle(tone, compact)}>{tone.mark}</span>
              <span style={labelStyle(tone, step.state, compact)}>{step.label}</span>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
};

const listStyle = (compact) => ({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: compact ? "4px 6px" : "6px 10px",
  margin: 0,
  padding: 0,
  listStyle: "none",
});

const stepStyle = (compact) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: compact ? "5px" : "7px",
});

const markerStyle = (tone, compact) => ({
  display: "grid",
  placeItems: "center",
  width: compact ? "18px" : "22px",
  height: compact ? "18px" : "22px",
  borderRadius: "999px",
  border: `1.5px solid ${tone.ring}`,
  background: tone.fill,
  color: tone.ink,
  fontSize: compact ? "10px" : "12px",
  fontWeight: 800,
  flex: "0 0 auto",
});

const labelStyle = (tone, state, compact) => ({
  color: state === "upcoming" ? colors.muted : tone.ink,
  fontSize: compact ? "12px" : "13px",
  fontWeight: state === "upcoming" ? 600 : 700,
  whiteSpace: "nowrap",
});

const arrowStyle = (compact) => ({
  color: colors.muted,
  fontSize: compact ? "12px" : "14px",
});

export default ApplicationProgress;
