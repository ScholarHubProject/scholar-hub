import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import api, { saveSession } from "../api";
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

const Register = () => {
  const navigate = useNavigate();

  const [showNotification, setShowNotification] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    schoolIdNumber: "",
    email: "",
    courseYear: "",
    contactNumber: "",
    password: "",
  });
  const passwordIssues = getPasswordIssues(formData.password);
  const showPasswordWarning = formData.password.length > 0 && passwordIssues.length > 0;

  const updateField = (field, value) => {
    setFormData((current) => ({
      ...current,
      [field]:
        field === "name"
          ? formatFullName(value)
          : field === "courseYear"
            ? value.toUpperCase()
            : field === "contactNumber"
              ? formatContactInput(value)
            : value,
    }));
  };

  const handleRegister = async () => {
    if (
      !formData.name.trim() ||
      !formData.schoolIdNumber.trim() ||
      !formData.email.trim() ||
      !formData.password.trim()
    ) {
      alert("Please enter your name, school ID number, email, and password");
      return;
    }

    if (passwordIssues.length > 0) {
      alert(`Password must include ${formatPasswordIssues(passwordIssues)}.`);
      return;
    }

    const cleanContactNumber = formatContactForSubmit(formData.contactNumber);

    const newUser = {
      name: formData.name.trim(),
      schoolIdNumber: formData.schoolIdNumber.trim(),
      email: formData.email.trim(),
      courseYear: formData.courseYear.trim(),
      contactNumber: cleanContactNumber,
      role: "Student",
    };

    try {
      // `role` is deliberately not sent: the server always creates a Student,
      // and used to take this field straight from the body.
      const response = await api.post("/register", {
        fullname: formData.name.trim(),
        schoolIdNumber: formData.schoolIdNumber.trim(),
        email: formData.email.trim(),
        courseYear: formData.courseYear.trim(),
        contactNumber: cleanContactNumber,
        password: formData.password.trim(),
      });

      saveSession(response.data?.token, response.data?.user || newUser);
      setShowNotification(true);

      setTimeout(() => {
        navigate("/student-dashboard");
      }, 1200);
    } catch (error) {
      console.log("Registration error:", error);

      if (error.response?.status === 409) {
        alert(
          error.response?.data?.message ||
            `The email ${formData.email.trim()} is already registered. Please log in instead or sign up with a different email address.`
        );
        return;
      }

      alert(error.response?.data?.message || "Registration Failed");
    }
  };

  return (
    <div style={registerPageStyle}>
      {showNotification && (
        <div style={notificationStyle}>
          Registration Successful!
        </div>
      )}

      <img src="/design.png" alt="Scholar Hub" style={registerLogoStyle} />

      <div style={registerCardStyle}>
        <h1 style={brandStyle}>Student Registration</h1>

        <p style={subtitleStyle}>
          Create an account to apply for scholarships.
        </p>

        <div style={formStackStyle}>
          <input
            style={authInputStyle}
            type="text"
            placeholder="Full Name"
            value={formData.name}
            autoCapitalize="characters"
            onChange={(e) => updateField("name", e.target.value)}
          />

          <input
            style={authInputStyle}
            type="text"
            placeholder="School ID Number"
            value={formData.schoolIdNumber}
            onChange={(e) => updateField("schoolIdNumber", e.target.value)}
          />

          <input
            style={authInputStyle}
            type="email"
            placeholder="Email Address"
            value={formData.email}
            onChange={(e) => updateField("email", e.target.value)}
          />

          <div style={twoColumnFieldStyle}>
            <input
              style={authInputStyle}
              type="text"
              placeholder="Course and Year"
              value={formData.courseYear}
              autoCapitalize="characters"
              onChange={(e) => updateField("courseYear", e.target.value)}
            />

            <div style={contactFieldWrapStyle}>
              <span style={contactPrefixStyle}>+63</span>
              <input
                style={contactInputStyle}
                type="text"
                placeholder="Contact Number"
                value={formData.contactNumber}
                onChange={(e) => updateField("contactNumber", e.target.value)}
              />
            </div>
          </div>

          <div style={passwordFieldWrapStyle}>
            <input
              style={passwordInputStyle}
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={formData.password}
              onChange={(e) => updateField("password", e.target.value)}
            />
            <button
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              title={showPassword ? "Hide password" : "Show password"}
              style={passwordToggleStyle}
              onClick={() => setShowPassword((current) => !current)}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {showPassword ? (
                  <>
                    <path d="M2 2l20 20" />
                    <path d="M10.6 10.6A2 2 0 0 0 13.4 13.4" />
                    <path d="M9.9 4.2A10.5 10.5 0 0 1 12 4c5 0 9 4.5 10 8a13.6 13.6 0 0 1-3 4.7" />
                    <path d="M6.6 6.6A13.3 13.3 0 0 0 2 12c1 3.5 5 8 10 8 1.6 0 3.1-.4 4.4-1.1" />
                  </>
                ) : (
                  <>
                    <path d="M2 12s4-8 10-8 10 8 10 8-4 8-10 8S2 12 2 12Z" />
                    <circle cx="12" cy="12" r="3" />
                  </>
                )}
              </svg>
            </button>
          </div>

          {showPasswordWarning && (
            <p style={passwordWarningStyle}>
              Password must include {formatPasswordIssues(passwordIssues)}.
            </p>
          )}

          <button onClick={handleRegister} style={buttonStyle}>
            Create Account
          </button>

          <div style={loginPromptStyle}>
            <p style={loginTextStyle}>Already have an account?</p>
            <Link to="/login" style={loginLinkStyle}>
              <button type="button" style={loginButtonStyle}>
                Login
              </button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

const formatFullName = (value) => value.toUpperCase().replace(/[^A-Z\s]/g, "");

const formatContactInput = (value) =>
  value.replace(/^\s*\+?63\s*/, "").replace(/^\s*0+/, "");

const formatContactForSubmit = (value) => {
  const cleanContact = formatContactInput(value).trim();
  return cleanContact ? `+63${cleanContact}` : "";
};

const getPasswordIssues = (password) => {
  const issues = [];

  if (!/[A-Z]/.test(password)) {
    issues.push("a capital letter");
  }

  if (!/\d/.test(password)) {
    issues.push("a number");
  }

  if (!/[^A-Za-z0-9]/.test(password)) {
    issues.push("a special character");
  }

  return issues;
};

const formatPasswordIssues = (issues) => {
  if (issues.length <= 1) return issues[0] || "";
  if (issues.length === 2) return `${issues[0]} and ${issues[1]}`;
  return `${issues.slice(0, -1).join(", ")}, and ${issues[issues.length - 1]}`;
};

const registerCardStyle = {
  ...authCardStyle,
  width: "470px",
  maxWidth: "100%",
  padding: "clamp(22px, 6vw, 34px)",
};

const registerPageStyle = {
  ...authWithLogoPageStyle,
  justifyContent: "flex-start",
  gap: "6px",
  padding: "8px clamp(16px, 5vw, 32px) 24px",
};

const registerLogoStyle = {
  ...authLogoStyle,
  transform: "translateY(18px)",
};

const notificationStyle = {
  position: "fixed",
  top: "30px",
  left: "50%",
  transform: "translateX(-50%)",
  background: colors.primary,
  color: "white",
  padding: "16px 28px",
  borderRadius: "14px",
  boxShadow: "0 8px 25px rgba(249,115,22,0.35)",
  fontWeight: "600",
  fontSize: "16px",
  zIndex: 1000,
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
  gap: "15px",
};

const twoColumnFieldStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))",
  gap: "15px",
};

const authInputStyle = {
  ...inputStyle,
  height: "48px",
  background: "var(--sh-auth-field-bg)",
};

const contactFieldWrapStyle = {
  display: "grid",
  gridTemplateColumns: "auto minmax(0, 1fr)",
  alignItems: "center",
  width: "100%",
  height: "48px",
  borderRadius: "10px",
  border: "1px solid #fdba74",
  background: "var(--sh-auth-field-bg)",
  overflow: "hidden",
};

const contactPrefixStyle = {
  display: "grid",
  placeItems: "center",
  alignSelf: "stretch",
  padding: "0 12px",
  borderRight: "1px solid #fdba74",
  color: colors.primaryDark,
  fontWeight: "800",
  background: "rgba(255, 237, 213, 0.82)",
};

const contactInputStyle = {
  ...authInputStyle,
  height: "100%",
  border: "none",
  borderRadius: 0,
  background: "transparent",
};

const passwordFieldWrapStyle = {
  position: "relative",
};

const passwordInputStyle = {
  ...authInputStyle,
  paddingRight: "48px",
};

const passwordToggleStyle = {
  position: "absolute",
  top: "50%",
  right: "12px",
  transform: "translateY(-50%)",
  width: "34px",
  height: "34px",
  border: "none",
  borderRadius: "8px",
  background: "transparent",
  color: colors.muted,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

const passwordWarningStyle = {
  margin: "-6px 0 0",
  padding: "10px 12px",
  background: "#fff7ed",
  color: colors.primaryDark,
  border: `1px solid ${colors.border}`,
  borderRadius: "10px",
  fontSize: "13px",
  fontWeight: "700",
};

const buttonStyle = {
  ...buttonPrimaryStyle,
  width: "100%",
  height: "48px",
  marginTop: "4px",
};

const loginPromptStyle = {
  display: "grid",
  gap: "10px",
  marginTop: "4px",
};

const loginTextStyle = {
  ...mutedTextStyle,
  textAlign: "center",
  fontSize: "14px",
};

const loginLinkStyle = {
  display: "block",
  width: "100%",
};

const loginButtonStyle = {
  ...buttonSecondaryStyle,
  width: "100%",
  height: "48px",
};

export default Register;
