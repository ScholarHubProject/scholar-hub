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
  padding: "clamp(86px, 12vw, 96px) clamp(14px, 4vw, 32px) clamp(28px, 6vw, 48px)",
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

export const pageHeaderStyle = {
  background: "linear-gradient(90deg, var(--sh-header-start) 40%, var(--sh-header-end))",
  border: `1px solid ${colors.border}`,
  borderRadius: "clamp(14px, 3vw, 18px)",
  padding: "clamp(20px, 5vw, 32px)",
  marginBottom: "clamp(18px, 4vw, 24px)",
  boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
};

export const eyebrowStyle = {
  display: "inline-block",
  background: colors.primarySoft,
  color: colors.primary,
  padding: "8px 14px",
  borderRadius: "999px",
  fontWeight: "700",
  fontSize: "13px",
  marginBottom: "12px",
};

export const titleStyle = {
  color: colors.text,
  fontSize: "clamp(28px, 7vw, 36px)",
  lineHeight: "1.1",
  margin: "0 0 10px",
};

export const mutedTextStyle = {
  color: colors.muted,
  lineHeight: "1.6",
  margin: 0,
};

export const cardStyle = {
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: "clamp(14px, 3vw, 18px)",
  padding: "clamp(18px, 4vw, 24px)",
  boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
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
  borderRadius: "10px",
  border: `1px solid ${colors.border}`,
  background: colors.field,
  color: colors.text,
  outlineColor: colors.primary,
};

export const buttonPrimaryStyle = {
  background: colors.primary,
  color: "white",
  padding: "12px 16px",
  border: "none",
  borderRadius: "10px",
  fontWeight: "700",
  cursor: "pointer",
};

export const buttonSecondaryStyle = {
  background: colors.surface,
  color: colors.primary,
  padding: "12px 16px",
  border: `1px solid ${colors.border}`,
  borderRadius: "10px",
  fontWeight: "700",
  cursor: "pointer",
};

export const buttonDangerStyle = {
  background: colors.danger,
  color: "white",
  padding: "9px 12px",
  border: "none",
  borderRadius: "9px",
  fontWeight: "700",
};

export const statusPillStyle = {
  display: "inline-flex",
  alignItems: "center",
  width: "fit-content",
  background: colors.primarySoft,
  color: colors.primaryDark,
  border: `1px solid ${colors.border}`,
  borderRadius: "999px",
  padding: "6px 10px",
  fontSize: "13px",
  fontWeight: "700",
};

export const tableWrapStyle = {
  ...cardStyle,
  overflowX: "auto",
};

export const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: "680px",
};

export const thStyle = {
  textAlign: "left",
  color: colors.primaryDark,
  borderBottom: `1px solid ${colors.border}`,
  padding: "14px 12px",
  background: colors.primarySoft,
};

export const tdStyle = {
  borderBottom: `1px solid ${colors.border}`,
  padding: "14px 12px",
  color: colors.text,
};
