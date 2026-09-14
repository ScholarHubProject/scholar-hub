export const colors = {
  page: "var(--sh-page)",
  pageAlt: "var(--sh-page-alt)",
  surface: "var(--sh-surface)",
  surfaceSolid: "var(--sh-surface-solid)",
  glassBorder: "var(--sh-glass-border)",
  field: "var(--sh-field)",
  primary: "var(--sh-primary)",
  primaryDark: "var(--sh-primary-dark)",
  primarySoft: "var(--sh-primary-soft)",
  border: "var(--sh-border)",
  text: "var(--sh-text)",
  muted: "var(--sh-muted)",
  success: "var(--sh-success)",
  danger: "var(--sh-danger)",
};

// The frosted-glass material, as an inline fragment. A panel spreads
// this in and then sets its own padding and radius; the fill, blur,
// hairline and top highlight are what make it read as the same sheet
// as the app bar and the sidebar. index.css owns the token values, so
// "Reduce transparency" in Settings turns every one of these opaque
// without a component changing.
export const glassStyle = {
  background: colors.surface,
  border: `1px solid ${colors.glassBorder}`,
  boxShadow: "var(--sh-shadow-md)",
  backdropFilter: "var(--sh-glass-filter)",
  WebkitBackdropFilter: "var(--sh-glass-filter)",
};

export const glassStrongStyle = {
  ...glassStyle,
  background: "var(--sh-glass-bg-strong)",
  boxShadow: "var(--sh-shadow-lg)",
  backdropFilter: "var(--sh-glass-filter-strong)",
  WebkitBackdropFilter: "var(--sh-glass-filter-strong)",
};

export const pageStyle = {
  minHeight: "100vh",
  background: colors.page,
  // Top padding clears the fixed app bar plus the institutional strip
  // above it, so a page never starts underneath them.
  padding:
    "calc(clamp(86px, 12vw, 96px) + var(--sh-utility-strip)) clamp(14px, 4vw, 32px) clamp(28px, 6vw, 48px)",
};

export const authPageStyle = {
  minHeight: "100vh",
  backgroundColor: colors.page,
  backgroundImage: "var(--sh-auth-bg-overlay), url('/bg.png')",
  backgroundSize: "cover, cover",
  backgroundPosition: "center, center",
  backgroundRepeat: "no-repeat",
  backgroundAttachment: "fixed",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  padding: "clamp(18px, 5vw, 32px)",
  overflow: "hidden auto",
};

export const authWithLogoPageStyle = {
  ...authPageStyle,
  flexDirection: "column",
  gap: "18px",
};

export const authLogoStyle = {
  display: "block",
  width: "clamp(132px, 20vw, 164px)",
  height: "clamp(132px, 20vw, 164px)",
  objectFit: "contain",
  margin: "0 auto",
  flex: "0 0 auto",
  filter: "drop-shadow(0 18px 28px rgba(var(--sh-primary-rgb), 0.28))",
};

export const shellStyle = {
  width: "100%",
  maxWidth: "1120px",
  margin: "0 auto",
};

export const narrowShellStyle = {
  width: "100%",
  maxWidth: "720px",
  margin: "0 auto",
};

// Kept in step with HeroBanner in components/ui.jsx: the pages that
// still build their own header get the same wash, radius and shadow, so
// a user moving between an analytics page and an admin form does not
// cross a visual seam.
export const pageHeaderStyle = {
  ...glassStyle,
  position: "relative",
  overflow: "hidden",
  background: "linear-gradient(112deg, var(--sh-header-start) 30%, var(--sh-header-end))",
  borderRadius: "var(--sh-radius-xl)",
  padding: "clamp(20px, 4vw, 30px)",
  marginBottom: "20px",
};

export const eyebrowStyle = {
  display: "inline-block",
  background: "var(--sh-glass-bg-strong)",
  color: colors.primaryDark,
  border: `1px solid ${colors.glassBorder}`,
  boxShadow: "var(--sh-glass-highlight)",
  padding: "5px 13px",
  borderRadius: "999px",
  fontWeight: 800,
  fontSize: "11.5px",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  marginBottom: "12px",
};

export const titleStyle = {
  fontFamily: "var(--sh-font-display)",
  color: colors.text,
  fontSize: "clamp(26px, 5vw, 36px)",
  lineHeight: 1.1,
  letterSpacing: "-0.025em",
  margin: "0 0 8px",
};

export const mutedTextStyle = {
  color: colors.muted,
  fontSize: "14px",
  lineHeight: 1.6,
  margin: 0,
};

export const cardStyle = {
  ...glassStyle,
  borderRadius: "var(--sh-radius-lg)",
  padding: "clamp(18px, 4vw, 24px)",
};

export const authCardStyle = {
  ...cardStyle,
  background: "var(--sh-auth-card-bg)",
  border: "1px solid var(--sh-auth-card-border)",
  borderRadius: "var(--sh-radius-xl)",
  boxShadow: "var(--sh-shadow-lg), 0 30px 80px rgba(var(--sh-primary-rgb), 0.16)",
  backdropFilter: "var(--sh-glass-filter-strong)",
  WebkitBackdropFilter: "var(--sh-glass-filter-strong)",
};

export const cardGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))",
  gap: "clamp(14px, 3vw, 20px)",
};

export const sectionStyle = {
  ...cardStyle,
  marginTop: "22px",
};

export const formStyle = {
  ...cardStyle,
  display: "grid",
  gap: "14px",
};

export const inputStyle = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: "var(--sh-radius-sm)",
  border: `1px solid ${colors.border}`,
  background: colors.field,
  color: colors.text,
  fontSize: "14.5px",
  boxShadow: "inset 0 1px 2px rgba(0, 0, 0, 0.04)",
  // The focus ring is a :focus-visible rule in index.css so it can carry
  // a box-shadow; an inline style cannot express a pseudo-class.
};

// Buttons are capsules, the iOS shape. The primary is a tinted gradient
// with a light edge along the top; the secondary is a piece of the same
// glass the cards are cut from, so it never fights the panel it sits on.
export const buttonPrimaryStyle = {
  background:
    "linear-gradient(180deg, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0) 55%), linear-gradient(135deg, var(--sh-primary), var(--sh-primary-deep))",
  color: "#ffffff",
  padding: "12px 20px",
  border: "1px solid rgba(255, 255, 255, 0.28)",
  borderRadius: "999px",
  fontSize: "14px",
  fontWeight: 700,
  letterSpacing: "0.01em",
  boxShadow: "var(--sh-shadow-accent)",
  cursor: "pointer",
};

export const buttonSecondaryStyle = {
  background: "var(--sh-glass-bg-strong)",
  color: colors.primaryDark,
  padding: "12px 20px",
  border: `1px solid ${colors.glassBorder}`,
  borderRadius: "999px",
  fontSize: "14px",
  fontWeight: 700,
  boxShadow: "var(--sh-shadow-sm)",
  backdropFilter: "var(--sh-glass-filter)",
  WebkitBackdropFilter: "var(--sh-glass-filter)",
  cursor: "pointer",
};

export const buttonDangerStyle = {
  background:
    "linear-gradient(180deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0) 55%), var(--sh-danger)",
  color: "#ffffff",
  padding: "9px 16px",
  border: "1px solid rgba(255, 255, 255, 0.26)",
  borderRadius: "999px",
  fontSize: "13.5px",
  fontWeight: 700,
  boxShadow: "0 8px 20px rgba(220, 38, 38, 0.24)",
};

export const statusPillStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  width: "fit-content",
  background: colors.primarySoft,
  color: colors.primaryDark,
  border: `1px solid rgba(var(--sh-primary-rgb), 0.28)`,
  boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.35)",
  borderRadius: "999px",
  padding: "5px 11px",
  fontSize: "12.5px",
  fontWeight: 700,
};

export const tableWrapStyle = {
  ...cardStyle,
  overflowX: "auto",
};

export const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: "680px",
  fontSize: "14px",
};

export const thStyle = {
  textAlign: "left",
  color: colors.primaryDark,
  borderBottom: `1px solid ${colors.border}`,
  padding: "12px",
  background: colors.primarySoft,
  fontSize: "11.5px",
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};

export const tdStyle = {
  borderBottom: `1px solid ${colors.border}`,
  padding: "14px 12px",
  color: colors.text,
};
