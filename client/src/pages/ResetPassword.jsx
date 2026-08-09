import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useState } from "react";
import api from "../api";
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

const ResetPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isDone, setIsDone] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    if (password !== confirmPassword) {
      setMessage("The two passwords do not match");
      return;
    }

    setIsLoading(true);
    setMessage("");

    try {
      const response = await api.post("/password/reset", { token, password });
      setIsDone(true);
      setMessage(response.data.message);
      setTimeout(() => navigate("/login"), 2000);
    } catch (error) {
      setMessage(
        error.response?.data?.message ||
          "Cannot connect to the server. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={authWithLogoPageStyle}>
      <img src="/design.png" alt="Scholar Hub" style={logoStyle} />

      <div style={cardStyle}>
        <h1 style={brandStyle}>Choose a new password</h1>

        {!token ? (
          <>
            <p style={errorStyle}>
              This reset link is missing its token. Please request a new one.
            </p>
            <Link to="/forgot-password" style={linkStyle}>
              <button type="button" style={backButtonStyle}>
                Request a new link
              </button>
            </Link>
          </>
        ) : (
          <>
            <p style={subtitleStyle}>
              Use at least 8 characters, including a letter and a number.
            </p>

            <div style={formStackStyle}>
              {!isDone && (
                <>
                  <input
                    style={authInputStyle}
                    type="password"
                    placeholder="New password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setMessage("");
                    }}
                  />

                  <input
                    style={authInputStyle}
                    type="password"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      setMessage("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSubmit();
                    }}
                  />
                </>
              )}

              {message && (
                <p style={isDone ? noticeStyle : errorStyle}>{message}</p>
              )}

              {!isDone && (
                <button
                  onClick={handleSubmit}
                  style={submitStyle}
                  disabled={isLoading}
                >
                  {isLoading ? "Saving..." : "Save new password"}
                </button>
              )}

              <Link to="/login" style={linkStyle}>
                <button type="button" style={backButtonStyle}>
                  Back to login
                </button>
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const cardStyle = {
  ...authCardStyle,
  width: "430px",
  maxWidth: "100%",
  padding: "clamp(22px, 6vw, 34px)",
};

const logoStyle = {
  ...authLogoStyle,
  transform: "translateY(26px)",
};

const brandStyle = {
  color: colors.primary,
  textAlign: "center",
  margin: "0 0 8px",
  fontSize: "26px",
};

const subtitleStyle = {
  ...mutedTextStyle,
  textAlign: "center",
  marginBottom: "24px",
  fontSize: "14px",
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

const baseMessageStyle = {
  margin: "0 0 16px",
  padding: "12px 14px",
  borderRadius: "10px",
  fontWeight: "700",
  fontSize: "14px",
  textAlign: "center",
};

const errorStyle = {
  ...baseMessageStyle,
  background: "#fee2e2",
  color: "#b91c1c",
  border: "1px solid #fecaca",
};

const noticeStyle = {
  ...baseMessageStyle,
  background: "#dcfce7",
  color: "#166534",
  border: "1px solid #bbf7d0",
};

const submitStyle = {
  ...buttonPrimaryStyle,
  width: "100%",
  height: "48px",
  marginTop: "4px",
};

const linkStyle = {
  display: "block",
  width: "100%",
};

const backButtonStyle = {
  ...buttonSecondaryStyle,
  width: "100%",
  height: "48px",
};

export default ResetPassword;
