import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import api, { saveSession } from "../api";
import { getSavedSettings } from "../settings";
import {
  AuthField,
  AuthMessage,
  AuthShell,
  FormStack,
  PasswordField,
  SecondaryButton,
  SegmentedChoice,
  SubmitButton,
} from "../components/authUi";
import { AccountHeader, AccountPicker } from "../components/accountSwitcher";
import { CapIcon, MailIcon, ShieldIcon } from "../components/icons";
import { EMAIL_PATTERN } from "../authRules";
import {
  forgetAccount,
  getAccountLabel,
  getSavedAccounts,
  rememberAccount,
  subscribeToSavedAccounts,
} from "../savedAccounts";
import { colors } from "../sharedStyles";

const ROLE_OPTIONS = [
  { value: "Student", label: "Student", icon: CapIcon },
  { value: "Admin", label: "Admin", icon: ShieldIcon },
];

// The page is one form shown three ways:
//   picker   — the accounts already used on this browser, plus "+"
//   password — one of those accounts chosen; only the password is asked
//   form     — the full email-and-password form, used to add an account
// email and userType are shared state throughout, so submitting is the
// same request whichever way the user got there.
const VIEWS = { picker: "picker", password: "password", form: "form" };

const forgotPasswordLink = (email) =>
  email.trim() ? `/forgot-password?email=${encodeURIComponent(email.trim())}` : "/forgot-password";

const Login = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const emailRef = useRef(null);
  const passwordRef = useRef(null);

  const [savedAccounts, setSavedAccounts] = useState(getSavedAccounts);
  // A session that expired belonged to whoever signed in last, which is
  // the first tile — so that account is opened at its password prompt
  // rather than making the user pick themselves out of their own list.
  const [activeAccount, setActiveAccount] = useState(() =>
    searchParams.get("expired") ? getSavedAccounts()[0] || null : null
  );
  const [view, setView] = useState(() => {
    const accounts = getSavedAccounts();
    if (accounts.length === 0) return VIEWS.form;
    return searchParams.get("expired") ? VIEWS.password : VIEWS.picker;
  });

  // Students are the overwhelming majority of sign-ins, so the form opens
  // on the answer that is almost always right. An admin who forgets to
  // switch is put right by handleRoleMismatch below rather than being
  // left to guess.
  const [userType, setUserType] = useState(
    () => (searchParams.get("expired") ? getSavedAccounts()[0]?.role : null) || "Student"
  );
  const [email, setEmail] = useState(
    () => (searchParams.get("expired") ? getSavedAccounts()[0]?.email : "") || ""
  );
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  // ?expired=1 is set by the axios interceptor when a request comes back
  // 401, so the user is told why they were bounced back here. It is an
  // explanation, not a failure, and is toned accordingly.
  const [notice, setNotice] = useState(
    searchParams.get("expired")
      ? { tone: "info", text: "Your session has expired. Please sign in again." }
      : null
  );
  const [isLoading, setIsLoading] = useState(false);

  // Signing in or removing an account in another tab should not leave
  // this tab's tiles showing a list that no longer exists.
  useEffect(() => subscribeToSavedAccounts(setSavedAccounts), []);

  // The password field is the only thing to do on that screen, so the
  // cursor starts there. autoFocus would not fire on a view change,
  // because React keeps the same input element between views.
  // After a failed sign-in the form view mounts with the email already
  // filled in, so the cursor goes to the password rather than the email
  // field's autoFocus.
  const focusPasswordOnFormRef = useRef(false);
  useEffect(() => {
    if (view === VIEWS.password) passwordRef.current?.focus();
    if (view === VIEWS.form && focusPasswordOnFormRef.current) {
      focusPasswordOnFormRef.current = false;
      passwordRef.current?.focus();
    }
  }, [view]);

  const clearErrors = () => {
    setFieldErrors({});
    setNotice(null);
  };

  const openAccount = (account) => {
    setActiveAccount(account);
    setEmail(account.email);
    setUserType(account.role);
    setPassword("");
    clearErrors();
    setView(VIEWS.password);
  };

  const openAddAccount = () => {
    setActiveAccount(null);
    setEmail("");
    setPassword("");
    setUserType("Student");
    clearErrors();
    setView(VIEWS.form);
  };

  const openPicker = () => {
    setActiveAccount(null);
    setPassword("");
    clearErrors();
    setView(VIEWS.picker);
  };

  const handleForget = (account) => {
    const remaining = forgetAccount(account.email);
    setSavedAccounts(remaining);

    if (remaining.length === 0) {
      openAddAccount();
    } else if (activeAccount?.email === account.email) {
      openPicker();
    }
  };

  const validate = () => {
    const errors = {};

    // On the password screen the address came from a tile, so there is
    // no email field on show to complain about.
    if (view !== VIEWS.password) {
      if (!email.trim()) {
        errors.email = "Enter the email address on your account.";
      } else if (!EMAIL_PATTERN.test(email.trim())) {
        errors.email = "That does not look like an email address.";
      }
    }

    if (!password) {
      errors.password = "Enter your password.";
    }

    return errors;
  };

  // A 403 from the server means the account exists and the password was
  // right — only the role picker was wrong. Flipping it for the user
  // costs one press instead of a second failed attempt, which matters
  // because failed attempts count towards a 15-minute lockout.
  const handleRoleMismatch = (message) => {
    const matched = /registered as (\w+)/i.exec(message || "");
    const actualRole = ROLE_OPTIONS.find(
      (option) => option.value.toLowerCase() === matched?.[1]?.toLowerCase()
    );

    if (!actualRole) return false;

    setUserType(actualRole.value);
    setNotice({
      tone: "info",
      text: `This is an ${actualRole.value} account — switched for you. Press Sign in again.`,
    });
    return true;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const errors = validate();

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setNotice(null);
      (errors.email ? emailRef : passwordRef).current?.focus();
      return;
    }

    setFieldErrors({});
    setNotice(null);
    setIsLoading(true);

    try {
      const response = await api.post("/login", {
        email: email.trim(),
        password,
        role: userType,
      });

      const currentUser = response.data.user;
      const settings = getSavedSettings();

      saveSession(response.data.token, currentUser);
      // Saved only once the password has been accepted, so a tile always
      // stands for an account that really signed in here.
      rememberAccount(currentUser);
      navigate(
        currentUser.role === "Student" && settings.defaultDashboard === "Scholarships"
          ? "/scholarships"
          : currentUser.role === "Student"
            ? "/student-dashboard"
            : "/admin-dashboard"
      );
    } catch (error) {
      const message = error.response?.data?.message;

      if (error.response?.status === 403 && handleRoleMismatch(message)) {
        return;
      }

      setNotice({
        tone: "error",
        text:
          message ||
          "Cannot reach the server right now. Check your connection and try again.",
      });

      // A failed sign-in always lands back on the full sign-in form, with
      // the email and role kept, so the user can correct whichever was
      // wrong instead of being stuck on a saved account's password prompt.
      setPassword("");
      setActiveAccount(null);
      focusPasswordOnFormRef.current = true;
      if (view === VIEWS.form) {
        passwordRef.current?.focus();
      } else {
        setView(VIEWS.form);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const subtitle = {
    [VIEWS.picker]: "Choose an account to continue.",
    [VIEWS.password]: "Enter your password to continue.",
    [VIEWS.form]:
      savedAccounts.length > 0
        ? "Sign in with another account, or create a new one."
        : "Online Scholarship Monitoring System",
  }[view];

  if (view === VIEWS.picker) {
    return (
      <AuthShell title="Scholar Hub" subtitle={subtitle}>
        <FormStack gap={16}>
          <AccountPicker
            accounts={savedAccounts}
            onSelect={openAccount}
            onForget={handleForget}
            onAddAccount={openAddAccount}
          />

          {notice && <AuthMessage tone={notice.tone}>{notice.text}</AuthMessage>}

          <p style={pickerNoteStyle}>
            Your password is still asked for every time. Remove an account with the
            &times; on its tile.
          </p>
        </FormStack>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Scholar Hub" subtitle={subtitle}>
      {view === VIEWS.form && savedAccounts.length > 0 && (
        <button type="button" style={backButtonStyle} onClick={openPicker}>
          &larr; Back to saved accounts
        </button>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <FormStack gap={15}>
          {view === VIEWS.password ? (
            <AccountHeader account={activeAccount} onSwitch={openPicker} />
          ) : (
            <>
              <SegmentedChoice
                label="I am signing in as"
                name="role"
                options={ROLE_OPTIONS}
                value={userType}
                onChange={(value) => {
                  setUserType(value);
                  setNotice(null);
                }}
              />

              <AuthField
                id="login-email"
                name="email"
                label="Email address"
                type="email"
                icon={MailIcon}
                placeholder="you@school.edu.ph"
                autoComplete="username"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                autoFocus
                inputRef={emailRef}
                value={email}
                error={fieldErrors.email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  clearErrors();
                }}
              />
            </>
          )}

          <PasswordField
            id="login-password"
            name="password"
            label="Password"
            placeholder="Your password"
            autoComplete="current-password"
            inputRef={passwordRef}
            value={password}
            error={fieldErrors.password}
            onChange={(e) => {
              setPassword(e.target.value);
              clearErrors();
            }}
          />

          <div style={forgotRowStyle}>
            <Link to={forgotPasswordLink(email)} style={forgotLinkStyle}>
              Forgot your password?
            </Link>
          </div>

          {notice && <AuthMessage tone={notice.tone}>{notice.text}</AuthMessage>}

          <SubmitButton loading={isLoading} loadingLabel="Checking account...">
            {view === VIEWS.password ? (
              // A long registered name must not push the label onto a
              // second line inside a fixed-height button.
              <span style={submitLabelStyle}>
                Sign in as {getAccountLabel(activeAccount)}
              </span>
            ) : (
              "Sign in"
            )}
          </SubmitButton>
        </FormStack>
      </form>

      {view === VIEWS.password ? (
        <div style={forgetRowStyle}>
          <button
            type="button"
            style={forgetButtonStyle}
            onClick={() => handleForget(activeAccount)}
          >
            Remove this account from this device
          </button>
        </div>
      ) : (
        <>
          <div style={dividerStyle} aria-hidden="true">
            <span style={dividerRuleStyle} />
            <span style={dividerTextStyle}>New to Scholar Hub?</span>
            <span style={dividerRuleStyle} />
          </div>

          <Link to="/register" style={registerLinkStyle}>
            <SecondaryButton>Create a student account</SecondaryButton>
          </Link>
        </>
      )}
    </AuthShell>
  );
};

const submitLabelStyle = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const forgotRowStyle = {
  display: "flex",
  justifyContent: "flex-end",
  marginTop: "-4px",
};

const forgotLinkStyle = {
  color: colors.primaryDark,
  fontSize: "13px",
  fontWeight: 600,
};

const pickerNoteStyle = {
  margin: 0,
  color: colors.muted,
  fontSize: "12.5px",
  lineHeight: 1.5,
  textAlign: "center",
};

const backButtonStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  marginBottom: "14px",
  padding: "5px 12px",
  border: `1px solid ${colors.border}`,
  borderRadius: "999px",
  background: colors.surface,
  color: colors.primaryDark,
  fontSize: "12.5px",
  fontWeight: 700,
  cursor: "pointer",
};

const forgetRowStyle = {
  display: "flex",
  justifyContent: "center",
  marginTop: "16px",
};

const forgetButtonStyle = {
  padding: "6px 12px",
  border: "none",
  borderRadius: "8px",
  background: "transparent",
  color: colors.muted,
  fontSize: "12.5px",
  fontWeight: 600,
  cursor: "pointer",
};

const dividerStyle = {
  display: "grid",
  gridTemplateColumns: "1fr auto 1fr",
  alignItems: "center",
  gap: "12px",
  margin: "20px 0 14px",
};

const dividerRuleStyle = {
  height: "1px",
  background: colors.border,
};

const dividerTextStyle = {
  color: colors.muted,
  fontSize: "12.5px",
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const registerLinkStyle = {
  display: "block",
  width: "100%",
};

export default Login;
