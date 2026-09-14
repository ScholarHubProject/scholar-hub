import { Link, useSearchParams } from "react-router-dom";
import { useRef, useState } from "react";
import api from "../api";
import {
  AuthField,
  AuthMessage,
  AuthShell,
  FormStack,
  SecondaryButton,
  SubmitButton,
} from "../components/authUi";
import { MailIcon } from "../components/icons";
import { EMAIL_PATTERN } from "../authRules";

const ForgotPassword = () => {
  const emailRef = useRef(null);
  const [searchParams] = useSearchParams();

  // The login page sends the address of whichever account the user was
  // trying to open, so arriving here from a saved account tile does not
  // mean typing it out again.
  const [email, setEmail] = useState(() => searchParams.get("email")?.trim() || "");
  const [fieldError, setFieldError] = useState("");
  const [notice, setNotice] = useState(null);
  const [isDone, setIsDone] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();

    const cleanEmail = email.trim();

    if (!cleanEmail) {
      setFieldError("Enter the email address on your account.");
      emailRef.current?.focus();
      return;
    }

    if (!EMAIL_PATTERN.test(cleanEmail)) {
      setFieldError("That does not look like an email address.");
      emailRef.current?.focus();
      return;
    }

    setFieldError("");
    setNotice(null);
    setIsLoading(true);

    try {
      const response = await api.post("/password/forgot", { email: cleanEmail });
      setIsDone(true);
      setNotice({ tone: "success", text: response.data.message });
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

  return (
    <AuthShell
      title="Forgot Password"
      subtitle="Enter the email address on your account and we will send you a link to choose a new password."
    >
      <form onSubmit={handleSubmit} noValidate>
        <FormStack gap={16}>
          {!isDone && (
            <AuthField
              id="forgot-email"
              name="email"
              label="Email address"
              type="email"
              icon={MailIcon}
              placeholder="you@school.edu.ph"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
              autoFocus
              inputRef={emailRef}
              value={email}
              error={fieldError}
              onChange={(e) => {
                setEmail(e.target.value);
                setFieldError("");
                setNotice(null);
              }}
            />
          )}

          {notice && <AuthMessage tone={notice.tone}>{notice.text}</AuthMessage>}

          {!isDone && (
            <SubmitButton loading={isLoading} loadingLabel="Sending...">
              Send reset link
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

export default ForgotPassword;
