import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useState } from "react";
import api, { saveSession } from "../api";
import { getSavedSettings } from "../settings";
import {
  authCardStyle,
  authLogoStyle,
  authWithLogoPageStyle,
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  colors,
  inputStyle,
  mutedTextStyle,
} from "../sharedStyles";

const Login = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [userType, setUserType] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // ?expired=1 is set by the axios interceptor when a request comes back 401,
  // so the user is told why they were bounced back here.
  const [message, setMessage] = useState(
    searchParams.get("expired") ? "Your session has expired. Please log in again." : ""
  );
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    setMessage("");

    if (!email.trim() || !password.trim()) {
      setMessage("Please enter your email and password");
      return;
    }

    if (!userType) {
      setMessage("Please select user type");
      return;
    }

    setIsLoading(true);

    try {
      const response = await api.post("/login", {
        email: email.trim(),
        password: password.trim(),
        role: userType,
      });

      const currentUser = response.data.user;
      const settings = getSavedSettings();

      saveSession(response.data.token, currentUser);
      navigate(
        currentUser.role === "Student" && settings.defaultDashboard === "Scholarships"
          ? "/scholarships"
          : currentUser.role === "Student"
            ? "/student-dashboard"
            : "/admin-dashboard"
      );
    } catch (error) {
      setMessage(
        error.response?.data?.message ||
          "Cannot connect to the server. Please start the backend first."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={authWithLogoPageStyle}>
      <img src="/design.png" alt="Scholar Hub" style={loginLogoStyle} />

      <div style={loginCardStyle}>
        <h1 style={brandStyle}>
          Scholar Hub
        </h1>

        <p style={subtitleStyle}>
          Online Scholarship Monitoring System
        </p>

        <div style={formStackStyle}>
          <input
            style={authInputStyle}
            type="email"
            placeholder="Email Address"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setMessage("");
            }}
          />

          <input
            style={authInputStyle}
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setMessage("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleLogin();
            }}
          />

          <select
            style={authInputStyle}
            value={userType}
            onChange={(e) => setUserType(e.target.value)}
          >
            <option value="">Select User Type</option>
            <option value="Student">Student</option>
            <option value="Admin">Admin</option>
          </select>

          {message && <p style={messageStyle}>{message}</p>}

          <button onClick={handleLogin} style={buttonStyle} disabled={isLoading}>
            {isLoading ? "Checking Account..." : "Login"}
          </button>

          <Link to="/forgot-password" style={forgotLinkStyle}>
            Forgot your password?
          </Link>

          <Link to="/register" style={registerLinkStyle}>
            <button type="button" style={registerButtonStyle}>
              Register
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
};

const loginCardStyle = {
  ...authCardStyle,
  width: "430px",
  maxWidth: "100%",
  padding: "clamp(22px, 6vw, 34px)",
};

const loginLogoStyle = {
  ...authLogoStyle,
  transform: "translateY(26px)",
};

const brandStyle = {
  color: colors.primary,
  textAlign: "center",
  margin: "0 0 8px",
};

const subtitleStyle = {
  ...mutedTextStyle,
  textAlign: "center",
  marginBottom: "24px",
};

const formStackStyle = {
  display: "grid",
  gap: "16px",
};

const authInputStyle = {
  ...inputStyle,
  height: "48px",
  background: "var(--sh-auth-field-bg)",
};

const messageStyle = {
  margin: 0,
  padding: "12px 14px",
  background: "#fee2e2",
  color: "#b91c1c",
  border: "1px solid #fecaca",
  borderRadius: "10px",
  fontWeight: "700",
  fontSize: "14px",
  textAlign: "center",
};

const buttonStyle = {
  ...buttonPrimaryStyle,
  width: "100%",
  height: "48px",
  marginTop: "4px",
};

const forgotLinkStyle = {
  color: colors.primary,
  textAlign: "center",
  fontSize: "14px",
  fontWeight: "600",
  textDecoration: "none",
};

const registerLinkStyle = {
  display: "block",
  width: "100%",
};

const registerButtonStyle = {
  ...buttonSecondaryStyle,
  width: "100%",
  height: "48px",
};

export default Login;
