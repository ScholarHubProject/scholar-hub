import { Link, useSearchParams } from "react-router-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import api, { getStoredUser, isLoggedIn, saveUser } from "../api";
import {
  AuthMessage,
  AuthShell,
  FormStack,
  SecondaryButton,
  SubmitButton,
} from "../components/authUi";

// Where the link in the confirmation email lands.
//
// Public, and it has to be: most people open it on a phone that has never
// signed in to this app. So the page confirms the address from the token alone
// and only *then* offers a way back to the account.
const VerifyEmail = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [state, setState] = useState(token ? "checking" : "missing");
  const [notice, setNotice] = useState(null);
  const [resending, setResending] = useState(false);

  // React runs effects twice in development. Without this the second run
  // redeems the token the first run just consumed, and the page a student
  // actually sees is the "already used" error.
  const redeemedRef = useRef(false);

  const confirm = useCallback(async () => {
    if (redeemedRef.current) return;
    redeemedRef.current = true;

    try {
      const response = await api.post("/email/verify", { token });

      // The cached user is what the rest of the app reads to decide whether to
      // show the "confirm your address" prompt, so it has to be updated here
      // or the banner survives the confirmation.
      const storedUser = getStoredUser();

      if (storedUser && storedUser.email === response.data?.email) {
        saveUser({ ...storedUser, emailVerified: true });
      }

      setState("confirmed");
      setNotice({ tone: "success", text: response.data.message });
    } catch (error) {
      setState("failed");
      setNotice({
        tone: "error",
        text:
          error.response?.data?.message ||
          "Cannot reach the server right now. Please try again.",
      });
    }
  }, [token]);

  useEffect(() => {
    // Deferred by a microtask so nothing is set while the effect body is still
    // running. confirm() sets no state until its request resolves, but the
    // lint rule only checks whether a called function contains a setState
    // anywhere, so it cannot tell.
    if (token) Promise.resolve().then(confirm);
  }, [confirm, token]);

  const handleResend = async () => {
    setResending(true);
    setNotice(null);

    try {
      const response = await api.post("/email/resend");
      setNotice({
        tone: response.data?.sent ? "success" : "error",
        text: response.data?.message,
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text:
          error.response?.data?.message ||
          "Could not send a new confirmation email. Please try again.",
      });
    } finally {
      setResending(false);
    }
  };

  if (state === "missing") {
    return (
      <AuthShell title="Confirm your email address">
        <FormStack gap={16}>
          <AuthMessage tone="error">
            This confirmation link is missing its token. Open the link from your
            email exactly as it was sent, or ask for a new one after signing in.
          </AuthMessage>

          <Link to="/login" style={linkStyle}>
            <SecondaryButton>Back to sign in</SecondaryButton>
          </Link>
        </FormStack>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Confirm your email address"
      subtitle={
        state === "confirmed"
          ? "You can now submit scholarship applications."
          : "This is the address the scholarship office will use to tell you about your applications."
      }
    >
      <FormStack gap={16}>
        {state === "checking" && (
          <AuthMessage tone="info">Confirming your address...</AuthMessage>
        )}

        {notice && <AuthMessage tone={notice.tone}>{notice.text}</AuthMessage>}

        {/* Resending needs a session, because the address to send to comes from
            the token rather than from anything typed on this page - a form that
            emailed whatever address was entered would be an open relay. */}
        {state === "failed" && isLoggedIn() && (
          <SubmitButton
            type="button"
            loading={resending}
            loadingLabel="Sending..."
            onClick={handleResend}
          >
            Email me a new link
          </SubmitButton>
        )}

        {state === "failed" && !isLoggedIn() && (
          <AuthMessage tone="info">
            Sign in and use &ldquo;Resend confirmation&rdquo; in the profile menu
            to get a new link.
          </AuthMessage>
        )}

        <Link to={isLoggedIn() ? "/student-dashboard" : "/login"} style={linkStyle}>
          <SecondaryButton>
            {isLoggedIn() ? "Go to my dashboard" : "Go to sign in"}
          </SecondaryButton>
        </Link>
      </FormStack>
    </AuthShell>
  );
};

const linkStyle = {
  display: "block",
  width: "100%",
};

export default VerifyEmail;
