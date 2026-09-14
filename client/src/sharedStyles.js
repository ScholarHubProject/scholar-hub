export const colors = {
  page: "var(--sh-page)",
  pageAlt: "var(--sh-page-alt)",
  surface: "var(--sh-surface)",
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
  filter: "drop-shadow(0 18px 28px rgba(124, 45, 18, 0.2))",
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
  position: "relative",
  overflow: "hidden",
  background: "linear-gradient(112deg, var(--sh-header-start) 30%, var(--sh-header-end))",
  border: `1px solid ${colors.border}`,
  borderRadius: "var(--sh-radius-xl)",
  padding: "clamp(20px, 4vw, 30px)",
  marginBottom: "20px",
  boxShadow: "var(--sh-shadow-md)",
};

export const eyebrowStyle = {
  display: "inline-block",
  background: colors.surface,
  color: colors.primaryDark,
  border: `1px solid ${colors.border}`,
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
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: "var(--sh-radius-lg)",
  padding: "clamp(18px, 4vw, 24px)",
  boxShadow: "var(--sh-shadow-md)",
};

export const authCardStyle = {
  ...cardStyle,
  background: "var(--sh-auth-card-bg)",
  border: "1px solid var(--sh-auth-card-border)",
  boxShadow: "0 26px 60px rgba(124, 45, 18, 0.22)",
  backdropFilter: "blur(18px) saturate(1.12)",
  WebkitBackdropFilter: "blur(18px) saturate(1.12)",
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
  // The focus ring is a :focus-visible rule in index.css so it can carry
  // a box-shadow; an inline style cannot express a pseudo-class.
};

export const buttonPrimaryStyle = {
  background: "linear-gradient(135deg, var(--sh-primary), var(--sh-primary-dark))",
  color: "#ffffff",
  padding: "12px 18px",
  border: "none",
  borderRadius: "var(--sh-radius-sm)",
  fontSize: "14px",
  fontWeight: 700,
  letterSpacing: "0.01em",
  boxShadow: "var(--sh-shadow-accent)",
  cursor: "pointer",
};

export const buttonSecondaryStyle = {
  background: colors.surface,
  color: colors.primaryDark,
  padding: "12px 18px",
  border: `1px solid ${colors.border}`,
  borderRadius: "var(--sh-radius-sm)",
  fontSize: "14px",
  fontWeight: 700,
  boxShadow: "var(--sh-shadow-sm)",
  cursor: "pointer",
};

export const buttonDangerStyle = {
  background: colors.danger,
  color: "#ffffff",
  padding: "9px 14px",
  border: "none",
  borderRadius: "var(--sh-radius-sm)",
  fontSize: "13.5px",
  fontWeight: 700,
};

export const statusPillStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  width: "fit-content",
  background: colors.primarySoft,
  color: colors.primaryDark,
  border: `1px solid ${colors.border}`,
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
