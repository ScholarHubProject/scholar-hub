import { Link } from "react-router-dom";
import { getStoredUser, isLoggedIn } from "../api";
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  mutedTextStyle,
  pageStyle,
} from "../sharedStyles";

// Any URL that matches no route lands here. Without it an unknown path rendered
// an empty page, which looked like the app had crashed.
const NotFound = () => {
  const user = isLoggedIn() ? getStoredUser() : null;
  const homePath = !user
    ? "/"
    : user.role === "Admin"
      ? "/admin-dashboard"
      : "/student-dashboard";

  return (
    <div style={wrapStyle}>
      <div style={panelStyle}>
        <p style={codeStyle}>404</p>
        <h1 style={titleStyle}>We can&apos;t find that page</h1>
        <p style={mutedTextStyle}>
          The link may be out of date, or the page may have been moved.
        </p>

        <div style={actionsStyle}>
          <Link to={homePath}>
            <button type="button" style={primaryButtonStyle}>
              {user ? "Back to dashboard" : "Back to home"}
            </button>
          </Link>

          {!user && (
            <Link to="/login">
              <button type="button" style={buttonSecondaryStyle}>
                Log in
              </button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
};

const wrapStyle = {
  ...pageStyle,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const panelStyle = {
  ...cardStyle,
  maxWidth: "480px",
  textAlign: "center",
};

const codeStyle = {
  color: colors.primary,
  fontSize: "clamp(48px, 12vw, 64px)",
  fontWeight: "800",
  margin: "0 0 4px",
  lineHeight: "1",
};

const titleStyle = {
  color: colors.text,
  fontSize: "clamp(22px, 5vw, 28px)",
  margin: "0 0 10px",
};

const actionsStyle = {
  display: "flex",
  gap: "12px",
  justifyContent: "center",
  flexWrap: "wrap",
  marginTop: "24px",
};

const primaryButtonStyle = {
  ...buttonPrimaryStyle,
  padding: "12px 22px",
};

export default NotFound;
