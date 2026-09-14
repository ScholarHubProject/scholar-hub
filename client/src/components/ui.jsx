import { colors, glassStyle, mutedTextStyle } from "../sharedStyles";
import {
  Sparkline,
} from "./charts";
import { ScholarshipArt } from "./icons";
import {
  formatNumber,
  toneColor,
  toneInk,
  toneWash,
} from "./vizTokens";

// ---------------------------------------------------------------
// Building blocks shared by the analytics, dashboard and report views
// ---------------------------------------------------------------
// These are deliberately plain: a registrar's office screen earns trust
// by being legible and consistent, not by being novel. Everything here
// reuses the app's existing tokens so a theme or accent change still
// reaches the new pages.

// The page banner: a soft wash, a pill, the title, and the illustration
// on the right. It is the one place on a page allowed to be decorative,
// which is what buys the restraint everywhere below it.
export const HeroBanner = ({ eyebrow, title, subtitle, actions, aside, art = true }) => (
  <header style={heroStyle} className="sh-print-block">
    {/* A wash behind the illustration rather than a second border: it
        gives the right-hand side of the banner some depth without
        drawing a box the art then has to sit inside. */}
    <span aria-hidden="true" style={heroBloomStyle} />
    <div style={heroRowStyle}>
      <div style={heroCopyStyle}>
        {eyebrow && <span style={heroPillStyle}>{eyebrow}</span>}
        <h1 style={heroTitleStyle}>{title}</h1>
        {subtitle && <p style={heroSubtitleStyle}>{subtitle}</p>}
      </div>

      {aside}

      {art && (
        <div style={heroArtStyle} className="sh-hero-art">
          <ScholarshipArt width={230} />
        </div>
      )}
    </div>

    {actions && (
      <div style={heroActionsStyle} className="sh-no-print">
        {actions}
      </div>
    )}
  </header>
);

// A tinted rounded square holding one line icon. Small enough to sit in a
// card header without competing with the title.
export const IconBadge = ({ icon: IconComponent, tone = "accent", size = 34 }) => (
  <span
    aria-hidden="true"
    style={{
      width: size,
      height: size,
      borderRadius: Math.round(size * 0.3),
      display: "grid",
      placeItems: "center",
      flex: "0 0 auto",
      background: toneWash(tone),
      color: toneColor(tone),
    }}
  >
    <IconComponent size={Math.round(size * 0.55)} />
  </span>
);

// The workhorse card of the analytics screens: title on the left, a
// tinted icon on the right, one large accent figure, and whatever the
// card is actually about underneath.
export const InsightCard = ({
  title,
  icon,
  tone = "accent",
  value,
  valueLabel,
  caption,
  children,
  footer,
  emphasis = false,
  compact = false,
}) => (
  <article
    style={{
      ...insightCardStyle,
      padding: compact ? "16px 18px" : "18px 20px",
      borderColor: emphasis ? toneColor(tone) : colors.border,
    }}
    className="sh-print-block sh-card-lift"
  >
    <div style={insightHeadStyle}>
      <h3 style={insightTitleStyle}>{title}</h3>
      {icon && <IconBadge icon={icon} tone={tone} />}
    </div>

    {(value != null || valueLabel) && (
      <div style={insightValueBlockStyle}>
        {valueLabel && <span style={insightValueLabelStyle}>{valueLabel}</span>}
        {value != null && (
          <strong style={{ ...insightValueStyle, color: toneColor(tone) }}>{value}</strong>
        )}
      </div>
    )}

    {caption && <p style={insightCaptionStyle}>{caption}</p>}

    {children && <div style={{ marginTop: "12px" }}>{children}</div>}

    {footer && <div style={insightFooterStyle}>{footer}</div>}
  </article>
);

// One labelled fact with a small icon, used for the date rows inside the
// disbursement card.
export const IconRow = ({ icon: IconComponent, label, value, tone = "accent" }) => (
  <div style={iconRowStyle}>
    <span aria-hidden="true" style={{ color: toneColor(tone), display: "flex" }}>
      <IconComponent size={15} />
    </span>
    <span style={iconRowLabelStyle}>{label}</span>
    <strong style={iconRowValueStyle}>{value}</strong>
  </div>
);

export const SectionHeading = ({ eyebrow, title, description, actions, id }) => (
  <div style={sectionHeadingStyle}>
    <div style={{ minWidth: 0 }}>
      {eyebrow && <span style={sectionEyebrowStyle}>{eyebrow}</span>}
      <h2 id={id} style={sectionTitleStyle}>
        {title}
      </h2>
      {description && <p style={sectionDescriptionStyle}>{description}</p>}
    </div>
    {actions && <div style={sectionActionsStyle}>{actions}</div>}
  </div>
);

export const StatTile = ({
  label,
  value,
  caption,
  tone = "neutral",
  spark,
  delta,
  icon,
  compact = false,
  emphasis = false,
}) => (
  <article
    style={{
      ...statTileStyle,
      padding: compact ? "14px 16px" : "18px 20px",
      borderColor: emphasis ? toneColor(tone) : colors.border,
      boxShadow: emphasis ? `0 10px 26px ${toneWash(tone)}` : statTileStyle.boxShadow,
    }}
    className="sh-print-block sh-card-lift"
  >
    <div style={statTileHeadStyle}>
      <span style={statTileLabelStyle}>{label}</span>
      {icon && <IconBadge icon={icon} tone={tone} size={30} />}
    </div>

    <div style={statTileValueRowStyle}>
      <strong style={{ ...statTileValueStyle, fontSize: compact ? "24px" : "30px" }}>{value}</strong>
      {spark?.length > 1 && <Sparkline values={spark} color={toneColor(tone)} />}
    </div>

    {(caption || delta) && (
      <p style={statTileCaptionStyle}>
        {delta && (
          <span style={{ ...deltaStyle, color: toneInk(delta.tone), background: toneWash(delta.tone) }}>
            {delta.label}
          </span>
        )}
        {caption}
      </p>
    )}
  </article>
);

// Status is shown as a shape plus a word, never as a colour on its own.
export const StatusBadge = ({ status, tone, icon, children }) => (
  <span
    style={{
      ...badgeStyle,
      background: toneWash(tone),
      color: toneInk(tone),
      borderColor: toneColor(tone),
    }}
  >
    {icon && <span aria-hidden="true">{icon}</span>}
    {children || status}
  </span>
);

export const Callout = ({ tone = "warning", title, children, icon = "!", actions }) => (
  <div
    style={{
      ...calloutStyle,
      background: toneWash(tone),
      borderColor: toneColor(tone),
    }}
    role={tone === "critical" ? "alert" : "note"}
    className="sh-print-block"
  >
    <span aria-hidden="true" style={{ ...calloutIconStyle, background: toneColor(tone) }}>
      {icon}
    </span>
    <div style={{ minWidth: 0, flex: 1 }}>
      <strong style={{ ...calloutTitleStyle, color: toneInk(tone) }}>{title}</strong>
      <div style={calloutBodyStyle}>{children}</div>
      {actions && <div style={calloutActionsStyle}>{actions}</div>}
    </div>
  </div>
);

// One filter row above everything it scopes. No chart carries its own
// filter, so every panel on the page always shows the same slice.
export const FilterBar = ({ filters, values, onChange, onReset, summary }) => (
  <section style={filterBarStyle} className="sh-no-print" aria-label="Filters">
    <div style={filterFieldsStyle}>
      {filters.map((filter) => (
        <label key={filter.name} style={filterFieldStyle}>
          <span style={filterLabelStyle}>{filter.label}</span>
          <select
            value={values[filter.name] ?? ""}
            onChange={(event) => onChange(filter.name, event.target.value)}
            style={selectStyle}
          >
            <option value="">{filter.allLabel || `All ${filter.label.toLowerCase()}`}</option>
            {filter.options.map((option) => {
              const optionValue = typeof option === "string" ? option : option.value;
              const optionLabel = typeof option === "string" ? option : option.label;
              return (
                <option key={optionValue} value={optionValue}>
                  {optionLabel}
                </option>
              );
            })}
          </select>
        </label>
      ))}
    </div>

    <div style={filterFooterStyle}>
      {summary && <p style={filterSummaryStyle}>{summary}</p>}
      <button type="button" style={resetButtonStyle} onClick={onReset}>
        Reset filters
      </button>
    </div>
  </section>
);

export const PanelGrid = ({ children, min = 320, gap = 18, style }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))`,
      gap: `${gap}px`,
      ...style,
    }}
  >
    {children}
  </div>
);

export const KeyValueList = ({ items }) => (
  <dl style={keyValueListStyle}>
    {items.map((item) => (
      <div key={item.label} style={keyValueRowStyle}>
        <dt style={keyValueTermStyle}>{item.label}</dt>
        <dd style={keyValueValueStyle}>{item.value}</dd>
      </div>
    ))}
  </dl>
);

// A requirement is either in or out; a checklist says which, and reading
// it should not depend on telling green from red.
export const RequirementList = ({ items, emptyMessage = "No requirements recorded." }) => {
  if (!items?.length) return <p style={{ ...mutedTextStyle, fontSize: "13px" }}>{emptyMessage}</p>;

  return (
    <ul style={requirementListStyle}>
      {items.map((item) => (
        <li key={item.name} style={requirementItemStyle}>
          <span
            aria-hidden="true"
            style={{
              ...requirementMarkStyle,
              background: item.submitted ? "var(--viz-good-wash)" : "var(--viz-warning-wash)",
              color: item.submitted ? "var(--viz-good-ink)" : "var(--viz-warning-ink)",
              borderColor: item.submitted ? "var(--viz-good)" : "var(--viz-warning)",
            }}
          >
            {item.submitted ? "✓" : "•"}
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={requirementNameStyle}>{item.name}</span>
            <span style={requirementStateStyle}>{item.submitted ? "Submitted" : "Missing"}</span>
          </span>
        </li>
      ))}
    </ul>
  );
};

// Prints under any block of estimated figures. Named for what it says -
// these are estimates - rather than for "prediction", a word that reads as
// a verdict to a student waiting on one.
export const EstimateNote = ({ children }) => (
  <p style={estimateNoteStyle}>
    <span aria-hidden="true" style={estimateNoteIconStyle}>
      ⓘ
    </span>
    {/* One flex item for the whole sentence. Left as bare children, each
        text node and inline element becomes its own flex item and the
        sentence breaks into columns. */}
    <span style={{ minWidth: 0 }}>{children}</span>
  </p>
);

export const LoadingRows = ({ rows = 3, height = 58 }) => (
  <div style={{ display: "grid", gap: "10px" }} aria-hidden="true">
    {Array.from({ length: rows }, (_, index) => (
      <div key={index} style={{ ...skeletonStyle, height }} />
    ))}
  </div>
);

export const CountUpValue = ({ value, format = formatNumber }) => (
  <span style={{ fontVariantNumeric: "proportional-nums" }}>{format(value)}</span>
);

const heroStyle = {
  ...glassStyle,
  position: "relative",
  overflow: "hidden",
  background: "linear-gradient(112deg, var(--sh-header-start) 30%, var(--sh-header-end))",
  borderRadius: "var(--sh-radius-xl)",
  padding: "clamp(20px, 4vw, 30px)",
  marginBottom: "20px",
};

const heroBloomStyle = {
  position: "absolute",
  insetInlineEnd: "-90px",
  insetBlockStart: "-110px",
  width: "340px",
  height: "340px",
  borderRadius: "50%",
  background:
    "radial-gradient(circle, rgba(var(--sh-primary-rgb), 0.22), rgba(var(--sh-primary-rgb), 0) 68%)",
  pointerEvents: "none",
};

const heroRowStyle = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "clamp(16px, 4vw, 32px)",
  flexWrap: "wrap",
};

const heroCopyStyle = {
  minWidth: "min(100%, 280px)",
  flex: "1 1 320px",
};

const heroPillStyle = {
  display: "inline-block",
  background: "var(--sh-glass-bg-strong)",
  color: colors.primaryDark,
  border: `1px solid ${colors.glassBorder}`,
  boxShadow: "var(--sh-glass-highlight)",
  borderRadius: "999px",
  padding: "5px 13px",
  fontSize: "11.5px",
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  marginBottom: "12px",
};

const heroTitleStyle = {
  fontFamily: "var(--sh-font-display)",
  margin: "0 0 8px",
  fontSize: "clamp(26px, 5vw, 36px)",
  lineHeight: 1.1,
  letterSpacing: "-0.03em",
  color: colors.text,
};

const heroSubtitleStyle = {
  ...mutedTextStyle,
  margin: 0,
  fontSize: "14px",
  maxWidth: "52ch",
};

const heroArtStyle = {
  flex: "0 1 auto",
  display: "flex",
  justifyContent: "flex-end",
};

const heroActionsStyle = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap",
  marginTop: "20px",
  paddingTop: "16px",
  borderTop: `1px solid ${colors.border}`,
};

const insightCardStyle = {
  ...glassStyle,
  borderRadius: "var(--sh-radius-lg)",
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
};

const insightHeadStyle = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "12px",
  marginBottom: "10px",
};

const insightTitleStyle = {
  margin: 0,
  fontSize: "13.5px",
  fontWeight: 700,
  color: colors.text,
  lineHeight: 1.35,
};

const insightValueBlockStyle = {
  display: "grid",
  gap: "2px",
};

const insightValueLabelStyle = {
  fontSize: "11.5px",
  fontWeight: 700,
  color: colors.muted,
  letterSpacing: "0.03em",
};

// Proportional figures: tabular ones make a display-size number look gappy.
const insightValueStyle = {
  fontFamily: "var(--sh-font-display)",
  fontWeight: 800,
  fontSize: "clamp(26px, 4vw, 32px)",
  lineHeight: 1.1,
  letterSpacing: "-0.03em",
};

const insightCaptionStyle = {
  margin: "8px 0 0",
  fontSize: "12px",
  color: colors.muted,
  lineHeight: 1.55,
};

const insightFooterStyle = {
  marginTop: "auto",
  paddingTop: "14px",
};

const iconRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: "9px",
  padding: "8px 0",
  borderTop: `1px solid ${colors.border}`,
  fontSize: "12.5px",
};

const iconRowLabelStyle = {
  color: colors.muted,
  minWidth: 0,
};

const iconRowValueStyle = {
  marginLeft: "auto",
  color: colors.text,
  fontSize: "12.5px",
  whiteSpace: "nowrap",
};

const sectionHeadingStyle = {
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: "16px",
  flexWrap: "wrap",
  margin: "30px 0 16px",
};

const sectionEyebrowStyle = {
  display: "block",
  color: colors.primary,
  fontSize: "11.5px",
  fontWeight: 800,
  letterSpacing: "0.09em",
  textTransform: "uppercase",
  marginBottom: "6px",
};

const sectionTitleStyle = {
  fontFamily: "var(--sh-font-display)",
  margin: 0,
  fontSize: "clamp(18px, 3vw, 21px)",
  color: colors.text,
  letterSpacing: "-0.02em",
};

const sectionDescriptionStyle = {
  ...mutedTextStyle,
  margin: "6px 0 0",
  fontSize: "13.5px",
  maxWidth: "62ch",
};

const sectionActionsStyle = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  flexWrap: "wrap",
};

const statTileStyle = {
  ...glassStyle,
  borderRadius: "var(--sh-radius-md)",
  boxShadow: "var(--sh-shadow-sm)",
  display: "grid",
  gap: "8px",
  alignContent: "start",
};

const statTileHeadStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "10px",
};

const statTileLabelStyle = {
  color: colors.muted,
  fontSize: "12.5px",
  fontWeight: 700,
  letterSpacing: "0.02em",
};

const statTileValueRowStyle = {
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: "12px",
};

const statTileValueStyle = {
  fontFamily: "var(--sh-font-display)",
  fontWeight: 800,
  color: colors.text,
  lineHeight: 1.1,
  letterSpacing: "-0.025em",
};

const statTileCaptionStyle = {
  margin: 0,
  fontSize: "12.5px",
  color: colors.muted,
  lineHeight: 1.55,
  display: "flex",
  alignItems: "center",
  gap: "8px",
  flexWrap: "wrap",
};

const deltaStyle = {
  borderRadius: "999px",
  padding: "2px 8px",
  fontSize: "11.5px",
  fontWeight: 800,
};

const badgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  border: "1px solid",
  borderRadius: "999px",
  padding: "4px 11px",
  fontSize: "12.5px",
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const calloutStyle = {
  display: "flex",
  gap: "13px",
  border: "1px solid",
  borderRadius: "var(--sh-radius-md)",
  padding: "16px 18px",
};

const calloutIconStyle = {
  width: "24px",
  height: "24px",
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  color: "#ffffff",
  fontWeight: 800,
  fontSize: "13px",
  flex: "0 0 auto",
  marginTop: "1px",
};

const calloutTitleStyle = {
  display: "block",
  fontSize: "14px",
  marginBottom: "4px",
};

const calloutBodyStyle = {
  color: colors.text,
  fontSize: "13.5px",
  lineHeight: 1.6,
};

const calloutActionsStyle = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
  marginTop: "12px",
};

const filterBarStyle = {
  ...glassStyle,
  borderRadius: "var(--sh-radius-md)",
  padding: "16px 18px",
  display: "grid",
  gap: "14px",
  boxShadow: "var(--sh-shadow-sm)",
};

const filterFieldsStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(170px, 100%), 1fr))",
  gap: "12px",
};

const filterFieldStyle = {
  display: "grid",
  gap: "6px",
  minWidth: 0,
};

const filterLabelStyle = {
  fontSize: "11.5px",
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: colors.muted,
};

const selectStyle = {
  width: "100%",
  padding: "9px 11px",
  borderRadius: "var(--sh-radius-sm)",
  border: `1px solid ${colors.border}`,
  background: colors.field,
  color: colors.text,
  fontSize: "13.5px",
  fontWeight: 600,
};

const filterFooterStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
  flexWrap: "wrap",
  borderTop: `1px solid ${colors.border}`,
  paddingTop: "12px",
};

const filterSummaryStyle = {
  margin: 0,
  fontSize: "12.5px",
  color: colors.muted,
};

const resetButtonStyle = {
  background: "var(--sh-glass-bg-soft)",
  border: `1px solid ${colors.border}`,
  color: colors.primaryDark,
  borderRadius: "999px",
  padding: "7px 12px",
  fontSize: "12.5px",
  fontWeight: 700,
};

const keyValueListStyle = {
  margin: 0,
  display: "grid",
  gap: "1px",
  background: colors.border,
  border: `1px solid ${colors.glassBorder}`,
  borderRadius: "var(--sh-radius-sm)",
  overflow: "hidden",
};

const keyValueRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "14px",
  background: "var(--sh-glass-bg-soft)",
  padding: "11px 14px",
};

const keyValueTermStyle = {
  margin: 0,
  fontSize: "13px",
  color: colors.muted,
};

const keyValueValueStyle = {
  margin: 0,
  fontSize: "13.5px",
  fontWeight: 700,
  color: colors.text,
  textAlign: "right",
};

const requirementListStyle = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: "9px",
};

const requirementItemStyle = {
  display: "flex",
  alignItems: "center",
  gap: "11px",
  fontSize: "13.5px",
};

const requirementMarkStyle = {
  width: "22px",
  height: "22px",
  borderRadius: "7px",
  border: "1px solid",
  display: "grid",
  placeItems: "center",
  fontSize: "12px",
  fontWeight: 800,
  flex: "0 0 auto",
};

const requirementNameStyle = {
  display: "block",
  color: colors.text,
  lineHeight: 1.4,
};

const requirementStateStyle = {
  display: "block",
  color: colors.muted,
  fontSize: "11.5px",
  marginTop: "1px",
};

const estimateNoteStyle = {
  display: "flex",
  gap: "8px",
  alignItems: "flex-start",
  margin: "12px 0 0",
  padding: "10px 12px",
  borderRadius: "10px",
  background: colors.pageAlt,
  border: `1px dashed ${colors.border}`,
  color: colors.muted,
  fontSize: "12px",
  lineHeight: 1.6,
};

const estimateNoteIconStyle = {
  flex: "0 0 auto",
  color: colors.primary,
  fontWeight: 800,
};

const skeletonStyle = {
  borderRadius: "12px",
  background: `linear-gradient(90deg, ${colors.pageAlt}, ${colors.surface}, ${colors.pageAlt})`,
  backgroundSize: "200% 100%",
  animation: "shSkeleton 1.4s ease-in-out infinite",
};
