import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useRef, useState } from "react";
import api from "../api";
import {
  AuthMessage,
  AuthShell,
  FormStack,
  PasswordField,
  PasswordMeter,
  SecondaryButton,
  SubmitButton,
} from "../components/authUi";
import { describePasswordProblem } from "../authRules";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const passwordRef = useRef(null);
  const confirmRef = useRef(null);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [notice, setNotice] = useState(null);
  const [isDone, setIsDone] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();

    // The same rule the server applies, so a password is never accepted
    // here only to come back as a 400.
    const passwordProblem = describePasswordProblem(password);
    const errors = {};

    if (passwordProblem) errors.password = passwordProblem;
    else if (password !== confirmPassword) {
      errors.confirmPassword = "The two passwords do not match.";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      (errors.password ? passwordRef : confirmRef).current?.focus();
      return;
    }

    setFieldErrors({});
    setNotice(null);
    setIsLoading(true);

    try {
      const response = await api.post("/password/reset", { token, password });
      setIsDone(true);
      setNotice({ tone: "success", text: response.data.message });
      setTimeout(() => navigate("/login"), 2000);
    } catch (error) {
      setNotice({
        tone: "error",
        text:
          error.response?.data?.message ||
          "Cannot reach the server right now. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <AuthShell title="Choose a new password">
        <FormStack gap={16}>
          <AuthMessage tone="error">
            This reset link is missing its token. Please request a new one.
          </AuthMessage>

          <Link to="/forgot-password" style={linkStyle}>
            <SecondaryButton>Request a new link</SecondaryButton>
          </Link>
        </FormStack>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Use at least 8 characters, including a letter and a number."
    >
      <form onSubmit={handleSubmit} noValidate>
        <FormStack gap={16}>
          {!isDone && (
            <>
              <PasswordField
                id="reset-password"
                name="password"
                label="New password"
                placeholder="At least 8 characters"
                autoComplete="new-password"
                autoFocus
                inputRef={passwordRef}
                value={password}
                error={fieldErrors.password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setFieldErrors({});
                  setNotice(null);
                }}
              />

              <PasswordMeter password={password} />

              <PasswordField
                id="reset-confirm-password"
                name="confirmPassword"
                label="Confirm new password"
                placeholder="Retype the new password"
                autoComplete="new-password"
                inputRef={confirmRef}
                value={confirmPassword}
                error={fieldErrors.confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setFieldErrors({});
                  setNotice(null);
                }}
              />
            </>
          )}

          {notice && <AuthMessage tone={notice.tone}>{notice.text}</AuthMessage>}

          {!isDone && (
            <SubmitButton loading={isLoading} loadingLabel="Saving...">
              Save new password
            </SubmitButton>
          )}

          <Link to="/login" style={linkStyle}>
            <SecondaryButton>Back to sign in</SecondaryButton>
          </Link>
        </FormStack>
      </form>
    </AuthShell>
  );
};

const linkStyle = {
  display: "block",
  width: "100%",
};

export default ResetPassword;
