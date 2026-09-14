// ---------------------------------------------------------------
// Visualisation tokens and formatters
// ---------------------------------------------------------------
// Split out of charts.jsx so that file exports nothing but components:
// a module mixing components with plain constants defeats fast refresh,
// and these are wanted on pages that draw no chart at all.
//
// Colours are assigned by slot, in a fixed order, and never cycled. A
// series keeps its hue when a filter removes the series next to it.

import { colors } from "../sharedStyles";

export const SERIES_COLORS = [
  "var(--viz-series-1)",
  "var(--viz-series-2)",
  "var(--viz-series-3)",
  "var(--viz-series-4)",
  "var(--viz-series-5)",
  "var(--viz-series-6)",
];

// Application state is a state, not an identity, so it wears the
// reserved status colours instead of a categorical slot. Each one is
// always paired with its label so the colour never carries the meaning
// on its own.
export const STATUS_TONES = {
  Approved: "var(--viz-good)",
  Qualified: "var(--viz-good)",
  "Pending Review": "var(--viz-warning)",
  Pending: "var(--viz-warning)",
  "Under Review": "var(--viz-serious)",
  Rejected: "var(--viz-critical)",
  "Not Qualified": "var(--viz-critical)",
  Renewal: "var(--viz-series-2)",
  New: "var(--viz-series-1)",
};

export const toneColor = (tone) =>
  ({
    good: "var(--viz-good)",
    warning: "var(--viz-warning)",
    serious: "var(--viz-serious)",
    critical: "var(--viz-critical)",
    accent: "var(--viz-series-1)",
    neutral: "var(--viz-ink-muted)",
  })[tone] || "var(--viz-series-1)";

export const toneWash = (tone) =>
  ({
    good: "var(--viz-good-wash)",
    warning: "var(--viz-warning-wash)",
    serious: "var(--viz-warning-wash)",
    critical: "var(--viz-critical-wash)",
  })[tone] || "var(--sh-primary-soft)";

export const toneInk = (tone) =>
  ({
    good: "var(--viz-good-ink)",
    warning: "var(--viz-warning-ink)",
    serious: "var(--viz-warning-ink)",
    critical: "var(--viz-critical-ink)",
  })[tone] || colors.primaryDark;

// ---------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------
export const formatNumber = (value) =>
  Number.isFinite(Number(value)) ? Number(value).toLocaleString("en-US") : "0";

export const formatCompact = (value) => {
  const number = Number(value) || 0;
  if (Math.abs(number) >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`;
  if (Math.abs(number) >= 10_000) return `${Math.round(number / 1000)}K`;
  if (Math.abs(number) >= 1000) return `${(number / 1000).toFixed(1)}K`;
  return formatNumber(number);
};

export const formatPeso = (value) =>
  `₱${Math.round(Number(value) || 0).toLocaleString("en-US")}`;

export const formatPercent = (value, digits = 0) =>
  `${(Number(value) || 0).toFixed(digits)}%`;

// Axis ticks are only readable when they land on round numbers, so the
// top of the scale is rounded up to the next 1/2/5 × 10^n step.
export const niceCeiling = (value) => {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
};

export const buildTicks = (maxValue, count = 4) => {
  const top = niceCeiling(maxValue || 1);
  return Array.from({ length: count + 1 }, (_, index) => (top / count) * index);
};
