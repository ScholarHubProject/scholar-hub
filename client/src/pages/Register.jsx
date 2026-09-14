import { Link, useNavigate } from "react-router-dom";
import { useRef, useState } from "react";
import api, { saveSession } from "../api";
import { rememberAccount } from "../savedAccounts";
import {
  AuthField,
  AuthMessage,
  AuthShell,
  FieldShell,
  FormGrid,
  FormSection,
  FormStack,
  PasswordField,
  PasswordMeter,
  SubmitButton,
} from "../components/authUi";
import {
  CapIcon,
  IdCardIcon,
  MailIcon,
  PhoneIcon,
  UserIcon,
} from "../components/icons";
import { colors, mutedTextStyle } from "../sharedStyles";
import {
  EMAIL_PATTERN,
  SCHOOL_ID_LENGTH,
  describePasswordProblem,
  isCompleteSchoolId,
  formatContactInput,
  formatCourseYear,
  formatFullName,
  formatSchoolId,
} from "../authRules";

const FIELD_ORDER = [
  "name",
  "schoolIdNumber",
  "email",
  "courseYear",
  "contactNumber",
  "password",
  "confirmPassword",
];

const Register = () => {
  const navigate = useNavigate();

  const nameRef = useRef(null);
  const schoolIdRef = useRef(null);
  const emailRef = useRef(null);
  const courseYearRef = useRef(null);
  const contactRef = useRef(null);
  const passwordRef = useRef(null);
  const confirmPasswordRef = useRef(null);

  const focusField = (field) =>
    ({
      name: nameRef,
      schoolIdNumber: schoolIdRef,
      email: emailRef,
      courseYear: courseYearRef,
      contactNumber: contactRef,
      password: passwordRef,
      confirmPassword: confirmPasswordRef,
    })[field]?.current?.focus();

  const [formData, setFormData] = useState({
    name: "",
    schoolIdNumber: "",
    email: "",
    courseYear: "",
    contactNumber: "",
    password: "",
    confirmPassword: "",
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [notice, setNotice] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const updateField = (field, rawValue) => {
    const value = formatters[field] ? formatters[field](rawValue) : rawValue;

    setFormData((current) => ({ ...current, [field]: value }));
    setNotice(null);
    setFieldErrors((current) => {
      const clearsConfirm = field === "password" && current.confirmPassword;
      if (!current[field] && !clearsConfirm) return current;

      const next = { ...current };
      delete next[field];
      // Retyping the password invalidates a "does not match" complaint
      // about the confirmation, which the user has not touched.
      if (field === "password") delete next.confirmPassword;
      return next;
    });
  };

  // Checked on blur so the user is told about one field while they are
  // still near it, rather than being handed six complaints at the end.
  const validateOne = (field, data = formData) => {
    const value = data[field]?.trim() || "";

    switch (field) {
      case "name":
        if (!value) return "Enter your full name.";
        if (value.length < 2) return "That name looks too short.";
        return null;
      case "schoolIdNumber":
        if (!value) return "Enter your school ID number.";
        // The formatter has already dropped anything that is not a digit
        // and stopped at nine, so a short value means it is unfinished.
        // The dash it inserts is not one of the nine, hence the digit count.
        if (!isCompleteSchoolId(value)) {
          return `A school ID number is ${SCHOOL_ID_LENGTH} digits, like 2026-00454.`;
        }
        return null;
      case "email":
        if (!value) return "Enter your email address.";
        if (!EMAIL_PATTERN.test(value)) return "That does not look like an email address.";
        return null;
      case "contactNumber":
        // Optional, but a half-typed number is worth catching here rather
        // than when a coordinator tries to ring it.
        if (value && value.length !== 10) {
          return "Enter the 10 digits after +63, starting with 9.";
        }
        if (value && !value.startsWith("9")) {
          return "A mobile number after +63 starts with 9.";
        }
        return null;
      case "password":
        return describePasswordProblem(data.password);
      case "confirmPassword":
        if (!data.confirmPassword) return "Retype your password.";
        if (data.confirmPassword !== data.password) return "The two passwords do not match.";
        return null;
      default:
        return null;
    }
  };

  const handleBlur = (field) => () => {
    setTouched((current) => ({ ...current, [field]: true }));

    const error = validateOne(field);
    setFieldErrors((current) => {
      const next = { ...current };
      if (error) next[field] = error;
      else delete next[field];
      return next;
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const errors = {};
    FIELD_ORDER.forEach((field) => {
      const error = validateOne(field);
      if (error) errors[field] = error;
    });

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setTouched(Object.fromEntries(FIELD_ORDER.map((field) => [field, true])));
      setNotice(null);

      focusField(FIELD_ORDER.find((field) => errors[field]));
      return;
    }

    setFieldErrors({});
    setNotice(null);
    setIsLoading(true);

    const contactNumber = formData.contactNumber.trim()
      ? `+63${formData.contactNumber.trim()}`
      : "";

    try {
      // `role` is deliberately not sent: the server always creates a
      // Student, and used to take this field straight from the body.
      const response = await api.post("/register", {
        fullname: formData.name.trim(),
        schoolIdNumber: formData.schoolIdNumber.trim(),
        email: formData.email.trim(),
        courseYear: formData.courseYear.trim(),
        contactNumber,
        password: formData.password,
      });

      setIsDone(true);

      // The account exists and is signed in either way; what changes is
      // whether a confirmation link is waiting. Reported from what the server
      // says it actually sent rather than assumed, so a deployment with no
      // mail provider does not promise an email that was never sent.
      const verificationSent = response.data?.emailVerificationSent;
      const verificationPending = response.data?.user?.emailVerified === false;

      setNotice({
        tone: verificationPending && !verificationSent ? "info" : "success",
        text: !verificationPending
          ? "Account created. Taking you to your dashboard..."
          : verificationSent
            ? `Account created. Confirm your address from the link sent to ${formData.email.trim()} before you submit an application.`
            : "Account created, but the confirmation email could not be sent. Ask the scholarship office to confirm your address before you apply.",
      });

      saveSession(response.data?.token, response.data?.user);
      // The new account joins the tiles on the login page, so the next
      // sign-in on this browser is one tap and a password.
      rememberAccount(response.data?.user);
      // Long enough to read the confirmation line, which is the one thing on
      // this screen the student has to act on later.
      setTimeout(() => navigate("/student-dashboard"), verificationPending ? 3200 : 1100);
    } catch (error) {
      const message = error.response?.data?.message;

      // A taken email is a problem with one field, so it is reported on
      // that field instead of in a dialog the user has to dismiss before
      // they can see which box to change.
      if (error.response?.status === 409) {
        setFieldErrors({ email: message || "That email is already registered." });
        focusField("email");
        setNotice({
          tone: "error",
          text: "That email already has an account. Sign in instead, or use another address.",
        });
        return;
      }

      setNotice({
        tone: "error",
        text:
          message ||
          "Cannot reach the server right now. Check your connection and try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const showError = (field) => (touched[field] ? fieldErrors[field] : undefined);

  return (
    <AuthShell
      title="Student Registration"
      subtitle="Create an account to apply for scholarships and track your status."
      width={840}
      logoLift={18}
    >
      <form onSubmit={handleSubmit} noValidate>
        <FormStack gap={22}>
          <FormSection
            title="Student details"
            caption="Enter these as they appear on your school records."
          >
            <FormGrid>
              <AuthField
                id="register-name"
                name="name"
                className="sh-span-all"
                label="Full name"
                icon={UserIcon}
                placeholder="DELA CRUZ, JUAN M."
                autoComplete="name"
                autoCapitalize="characters"
                autoFocus
                inputRef={nameRef}
                value={formData.name}
                error={showError("name")}
                onChange={(e) => updateField("name", e.target.value)}
                onBlur={handleBlur("name")}
              />

              <AuthField
                id="register-school-id"
                name="schoolIdNumber"
                label="School ID number"
                icon={IdCardIcon}
                placeholder="2026-00454"
                hint={`Numbers only — ${SCHOOL_ID_LENGTH} digits. The dash is added for you.`}
                inputMode="numeric"
                maxLength={SCHOOL_ID_LENGTH + 1}
                autoComplete="off"
                inputRef={schoolIdRef}
                value={formData.schoolIdNumber}
                error={showError("schoolIdNumber")}
                onChange={(e) => updateField("schoolIdNumber", e.target.value)}
                onBlur={handleBlur("schoolIdNumber")}
              />

              <AuthField
                id="register-email"
                name="email"
                label="Email address"
                type="email"
                icon={MailIcon}
                placeholder="you@school.edu.ph"
                hint="Approvals, remarks and password resets are sent here."
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                inputRef={emailRef}
                value={formData.email}
                error={showError("email")}
                onChange={(e) => updateField("email", e.target.value)}
                onBlur={handleBlur("email")}
              />

              <AuthField
                id="register-course"
                name="courseYear"
                label="Course and year"
                icon={CapIcon}
                placeholder="BSIT 3"
                optional
                autoCapitalize="characters"
                inputRef={courseYearRef}
                value={formData.courseYear}
                error={showError("courseYear")}
                onChange={(e) => updateField("courseYear", e.target.value)}
                onBlur={handleBlur("courseYear")}
              />

              <FieldShell
                id="register-contact"
                label="Contact number"
                icon={PhoneIcon}
                optional
                error={showError("contactNumber")}
              >
                <span style={dialCodeStyle}>+63</span>
                <input
                  id="register-contact"
                  name="contactNumber"
                  ref={contactRef}
                  type="tel"
                  inputMode="numeric"
                  placeholder="9XX XXX XXXX"
                  autoComplete="tel-national"
                  maxLength={10}
                  style={contactInputStyle}
                  value={formData.contactNumber}
                  aria-invalid={showError("contactNumber") ? "true" : undefined}
                  aria-describedby={
                    showError("contactNumber") ? "register-contact-note" : undefined
                  }
                  onChange={(e) => updateField("contactNumber", e.target.value)}
                  onBlur={handleBlur("contactNumber")}
                />
              </FieldShell>
            </FormGrid>
          </FormSection>

          <FormSection
            title="Account security"
            caption="You will sign in with the email above and this password."
            divided
          >
            <FormGrid>
              <PasswordField
                id="register-password"
                name="password"
                label="Password"
                placeholder="At least 8 characters"
                autoComplete="new-password"
                inputRef={passwordRef}
                value={formData.password}
                error={showError("password")}
                onChange={(e) => updateField("password", e.target.value)}
                onBlur={handleBlur("password")}
              />

              <PasswordField
                id="register-confirm-password"
                name="confirmPassword"
                label="Confirm password"
                placeholder="Retype your password"
                autoComplete="new-password"
                inputRef={confirmPasswordRef}
                value={formData.confirmPassword}
                error={showError("confirmPassword")}
                onChange={(e) => updateField("confirmPassword", e.target.value)}
                onBlur={handleBlur("confirmPassword")}
              />
            </FormGrid>

            {/* Outside the grid: the meter appears only once there is a
                password to measure, and a conditional grid item would
                leave its row gap behind when it is not there. */}
            <PasswordMeter password={formData.password} />
          </FormSection>

          {notice && <AuthMessage tone={notice.tone}>{notice.text}</AuthMessage>}

          <div className="sh-auth-actions">
            <p style={loginTextStyle}>
              Already have an account?{" "}
              <Link to="/login" style={loginLinkStyle}>
                Sign in
              </Link>
            </p>

            <div className="sh-auth-actions-cta">
              <SubmitButton
                loading={isLoading || isDone}
                loadingLabel={isDone ? "Account created" : "Creating account..."}
                style={{ marginTop: 0 }}
              >
                Create account
              </SubmitButton>
            </div>
          </div>
        </FormStack>
      </form>
    </AuthShell>
  );
};

const formatters = {
  name: formatFullName,
  courseYear: formatCourseYear,
  contactNumber: formatContactInput,
  schoolIdNumber: formatSchoolId,
};

const dialCodeStyle = {
  flex: "0 0 auto",
  paddingRight: "9px",
  marginLeft: "-2px",
  borderRight: `1px solid ${colors.border}`,
  color: colors.primaryDark,
  fontSize: "14px",
  fontWeight: 800,
};

const contactInputStyle = {
  flex: "1 1 auto",
  minWidth: 0,
  height: "100%",
  padding: 0,
  border: "none",
  background: "transparent",
  color: colors.text,
  fontSize: "14.5px",
};

const loginTextStyle = {
  ...mutedTextStyle,
  fontSize: "13.5px",
};

const loginLinkStyle = {
  color: colors.primaryDark,
  fontWeight: 800,
  textDecoration: "underline",
  textUnderlineOffset: "3px",
};

export default Register;
