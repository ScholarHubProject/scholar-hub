import { useId, useState } from "react";
import {
  authCardStyle,
  authLogoStyle,
  authWithLogoPageStyle,
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  colors,
  mutedTextStyle,
} from "../sharedStyles";
import { CheckIcon, EyeIcon, EyeOffIcon, WarningIcon } from "./icons";
import { getPasswordChecks, getPasswordStrength } from "../authRules";

// ---------------------------------------------------------------
// Shared auth chrome
// ---------------------------------------------------------------
// Login, registration, forgot-password and reset-password each carried
// their own copy of the card, the logo, the 48px field and the red
// message box. They had already drifted — two different eye icons, two
// different heading sizes, a password rule on registration that the
// server would have rejected — so the pieces live here once.

export const AuthShell = ({ title, subtitle, width = 430, logoLift = 26, children }) => (
  <div style={authWithLogoPageStyle}>
    <img
      src="/design.png"
      alt=""
      aria-hidden="true"
      style={{ ...authLogoStyle, transform: `translateY(${logoLift}px)` }}
    />

    <div style={{ ...authCardStyle, width: `${width}px`, maxWidth: "100%", padding: "clamp(22px, 6vw, 34px)" }}>
      <h1 style={authTitleStyle}>{title}</h1>
      {subtitle && <p style={authSubtitleStyle}>{subtitle}</p>}
      {children}
    </div>
  </div>
);

// A field is a label, a bordered shell holding an optional leading icon
// and the control, and a slot underneath for the error or hint. The
// shell owns the border so the focus ring surrounds the icon too; see
// the .sh-auth-field rules in index.css.
export const FieldShell = ({
  id,
  label,
  hint,
  error,
  icon: Icon,
  trailing,
  optional,
  className,
  children,
}) => {
  const noteId = `${id}-note`;

  return (
    <div className={className}>
      <label htmlFor={id} style={labelStyle}>
        {label}
        {optional && <span style={optionalTagStyle}>optional</span>}
      </label>

      <div className={`sh-auth-field${error ? " is-invalid" : ""}`} style={fieldShellStyle}>
        {Icon && (
          <span style={fieldIconStyle}>
            <Icon size={18} />
          </span>
        )}
        {children}
        {trailing}
      </div>

      {(error || hint) && (
        <p
          id={noteId}
          className={error ? "sh-field-note" : undefined}
          style={error ? fieldErrorStyle : fieldHintStyle}
        >
          {error && <WarningIcon size={14} />}
          <span>{error || hint}</span>
        </p>
      )}
    </div>
  );
};

export const AuthField = ({
  id,
  label,
  hint,
  error,
  icon,
  optional,
  className,
  inputRef,
  ...inputProps
}) => (
  <FieldShell
    id={id}
    label={label}
    hint={hint}
    error={error}
    icon={icon}
    optional={optional}
    className={className}
  >
    <input
      id={id}
      ref={inputRef}
      style={bareInputStyle}
      aria-invalid={error ? "true" : undefined}
      aria-describedby={error || hint ? `${id}-note` : undefined}
      {...inputProps}
    />
  </FieldShell>
);

export const PasswordField = ({
  id,
  label,
  hint,
  error,
  optional,
  inputRef,
  value,
  onChange,
  onBlur,
  ...inputProps
}) => {
  const [visible, setVisible] = useState(false);
  // Caps Lock is the single most common reason a password that the user
  // is certain about does not work, and the field is masked so they
  // cannot see why.
  const [capsLock, setCapsLock] = useState(false);

  const readCapsLock = (event) => {
    if (typeof event.getModifierState === "function") {
      setCapsLock(event.getModifierState("CapsLock"));
    }
  };

  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error}
      icon={undefined}
      optional={optional}
      trailing={
        <>
          {capsLock && !error && (
            <span style={capsLockStyle} title="Caps Lock is on">
              CAPS
            </span>
          )}
          <button
            type="button"
            style={toggleButtonStyle}
            onClick={() => setVisible((current) => !current)}
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
            title={visible ? "Hide password" : "Show password"}
            tabIndex={-1}
          >
            {visible ? <EyeOffIcon size={19} /> : <EyeIcon size={19} />}
          </button>
        </>
      }
    >
      <input
        id={id}
        ref={inputRef}
        type={visible ? "text" : "password"}
        value={value}
        onChange={onChange}
        onKeyUp={readCapsLock}
        onKeyDown={readCapsLock}
        onBlur={(event) => {
          setCapsLock(false);
          onBlur?.(event);
        }}
        style={bareInputStyle}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error || hint ? `${id}-note` : undefined}
        {...inputProps}
      />
    </FieldShell>
  );
};

// Two mutually exclusive choices, which is what the login role really
// is. The old <select> defaulted to an empty option, so the commonest
// path through the form — a student signing in — needed an extra
// interaction that existed only to be got wrong.
export const SegmentedChoice = ({ label, options, value, onChange, name }) => {
  const groupId = useId();

  return (
    <div>
      <span id={groupId} style={labelStyle}>
        {label}
      </span>

      <div role="radiogroup" aria-labelledby={groupId} style={segmentWrapStyle}>
        {options.map((option) => {
          const selected = option.value === value;

          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              name={name}
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              style={selected ? segmentSelectedStyle : segmentStyle}
            >
              {option.icon && <option.icon size={17} />}
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// tone: "error" | "success" | "info". Errors are assertive because the
// user has just pressed a button and is waiting on the answer; the
// quieter notices only need to reach a screen reader on the next pause.
export const AuthMessage = ({ tone = "error", children }) => {
  if (!children) return null;

  const palette = messagePalette[tone] || messagePalette.error;

  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      style={{ ...messageBaseStyle, ...palette }}
    >
      {children}
    </p>
  );
};

export const SubmitButton = ({ loading, loadingLabel, children, style, ...rest }) => (
  <button
    type="submit"
    disabled={loading}
    aria-busy={loading ? "true" : undefined}
    style={{ ...submitStyle, ...(loading ? submitLoadingStyle : null), ...style }}
    {...rest}
  >
    {loading ? (
      <>
        <Spinner />
        {loadingLabel || "Working..."}
      </>
    ) : (
      children
    )}
  </button>
);

export const SecondaryButton = ({ children, style, ...rest }) => (
  <button type="button" style={{ ...secondaryStyle, ...style }} {...rest}>
    {children}
  </button>
);

const Spinner = () => (
  <svg
    className="sh-spinner"
    width="17"
    height="17"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    focusable="false"
  >
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
    <path
      d="M21 12a9 9 0 0 0-9-9"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
    />
  </svg>
);

export const PasswordMeter = ({ password }) => {
  const checks = getPasswordChecks(password);
  const strength = getPasswordStrength(password);

  if (!password) return null;

  return (
    <div style={meterWrapStyle}>
      <div style={meterHeadStyle}>
        <div style={meterTrackStyle} aria-hidden="true">
          {[1, 2, 3, 4].map((step) => (
            <span
              key={step}
              style={{
                ...meterSegmentStyle,
                background: step <= strength.score ? strength.tone : "var(--viz-track)",
              }}
            />
          ))}
        </div>
        <span style={{ ...meterLabelStyle, color: strength.tone }}>{strength.label}</span>
      </div>

      <ul style={checklistStyle}>
        {checks.map((check) => (
          <li key={check.key} style={{ ...checkItemStyle, color: check.met ? colors.success : colors.muted }}>
            <span style={checkIconStyle}>
              {check.met ? <CheckIcon size={13} /> : <span style={checkDotStyle} />}
            </span>
            {check.label}
          </li>
        ))}
      </ul>
    </div>
  );
};

export const FormStack = ({ children, gap = 15, ...rest }) => (
  <div style={{ display: "grid", gap: `${gap}px` }} {...rest}>
    {children}
  </div>
);

// Fields two to a row rather than one; see .sh-auth-grid in index.css
// for the collapse to a single column. A field that needs the whole
// width asks for it with className="sh-span-all".
export const FormGrid = ({ children, ...rest }) => (
  <div className="sh-auth-grid" {...rest}>
    {children}
  </div>
);

// A wide form needs somewhere for the eye to stop. Grouping the fields
// under a heading gives the reader two short forms - who you are, how
// you sign in - instead of one field of seven boxes, and the fieldset
// tells a screen reader the same thing.
export const FormSection = ({ title, caption, divided, children }) => (
  <fieldset style={divided ? dividedFieldsetStyle : fieldsetStyle}>
    <legend style={legendStyle}>{title}</legend>
    {caption && <p style={sectionCaptionStyle}>{caption}</p>}
    <div style={sectionBodyStyle}>{children}</div>
  </fieldset>
);

// ---------------------------------------------------------------
// Styles
// ---------------------------------------------------------------

const authTitleStyle = {
  color: colors.primary,
  textAlign: "center",
  fontSize: "clamp(23px, 5vw, 27px)",
  margin: "0 0 8px",
};

const authSubtitleStyle = {
  ...mutedTextStyle,
  textAlign: "center",
  fontSize: "14px",
  marginBottom: "22px",
};

const fieldsetStyle = {
  minWidth: 0,
  margin: 0,
  padding: 0,
  border: "none",
};

// A rule above the group the reader has just arrived at, so the wide
// card breaks into two obvious halves rather than one run of headings.
const dividedFieldsetStyle = {
  ...fieldsetStyle,
  paddingTop: "20px",
  borderTop: `1px solid ${colors.border}`,
};

const legendStyle = {
  // A legend is laid into the fieldset's own border, which would leave
  // the rule above "Account security" running through the heading.
  // Floating it full width takes it out of that slot and lets the rule
  // draw across.
  float: "left",
  width: "100%",
  padding: 0,
  color: colors.primaryDark,
  fontSize: "11.5px",
  fontWeight: 800,
  letterSpacing: "0.07em",
  textTransform: "uppercase",
};

const sectionCaptionStyle = {
  ...mutedTextStyle,
  margin: "3px 0 0",
  fontSize: "13px",
};

const sectionBodyStyle = {
  display: "grid",
  gap: "14px",
  marginTop: "13px",
};

const labelStyle = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  marginBottom: "6px",
  color: colors.text,
  fontSize: "13px",
  fontWeight: 700,
};

const optionalTagStyle = {
  color: colors.muted,
  fontSize: "11.5px",
  fontWeight: 600,
  letterSpacing: "0.02em",
  textTransform: "uppercase",
};

const fieldShellStyle = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  height: "48px",
  padding: "0 10px 0 12px",
  borderRadius: "var(--sh-radius-sm)",
  border: `1px solid ${colors.border}`,
  background: "var(--sh-auth-field-bg)",
};

const fieldIconStyle = {
  display: "grid",
  placeItems: "center",
  flex: "0 0 auto",
  color: colors.muted,
};

const bareInputStyle = {
  flex: "1 1 auto",
  minWidth: 0,
  height: "100%",
  padding: 0,
  border: "none",
  background: "transparent",
  color: colors.text,
  fontSize: "14.5px",
};

const fieldNoteBaseStyle = {
  display: "flex",
  alignItems: "flex-start",
  gap: "6px",
  margin: "6px 2px 0",
  fontSize: "12.5px",
  lineHeight: 1.45,
};

const fieldHintStyle = {
  ...fieldNoteBaseStyle,
  color: colors.muted,
};

const fieldErrorStyle = {
  ...fieldNoteBaseStyle,
  color: "var(--viz-critical)",
  fontWeight: 600,
};

const toggleButtonStyle = {
  display: "grid",
  placeItems: "center",
  flex: "0 0 auto",
  width: "32px",
  height: "32px",
  padding: 0,
  border: "none",
  borderRadius: "8px",
  background: "transparent",
  color: colors.muted,
};

const capsLockStyle = {
  flex: "0 0 auto",
  padding: "3px 7px",
  borderRadius: "999px",
  background: "var(--viz-warning-wash)",
  color: "var(--viz-warning-ink)",
  fontSize: "10.5px",
  fontWeight: 800,
  letterSpacing: "0.06em",
};

const segmentWrapStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "6px",
  padding: "5px",
  borderRadius: "var(--sh-radius-md)",
  border: `1px solid ${colors.border}`,
  background: "var(--sh-auth-field-bg)",
};

const segmentStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "7px",
  height: "38px",
  border: "1px solid transparent",
  borderRadius: "9px",
  background: "transparent",
  color: colors.muted,
  fontSize: "14px",
  fontWeight: 700,
};

const segmentSelectedStyle = {
  ...segmentStyle,
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  color: colors.primaryDark,
  boxShadow: "var(--sh-shadow-sm)",
};

const messageBaseStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  margin: 0,
  padding: "11px 14px",
  borderRadius: "10px",
  fontWeight: 700,
  fontSize: "13.5px",
  textAlign: "center",
};

const messagePalette = {
  error: {
    background: "var(--viz-critical-wash)",
    color: "var(--viz-critical-ink)",
    border: "1px solid var(--viz-critical)",
  },
  success: {
    background: "var(--viz-good-wash)",
    color: "var(--viz-good-ink)",
    border: "1px solid var(--viz-good)",
  },
  info: {
    background: "var(--viz-warning-wash)",
    color: "var(--viz-warning-ink)",
    border: "1px solid var(--viz-warning)",
  },
};

const submitStyle = {
  ...buttonPrimaryStyle,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "9px",
  width: "100%",
  height: "48px",
  marginTop: "4px",
};

const submitLoadingStyle = {
  filter: "saturate(0.9)",
  cursor: "progress",
};

const secondaryStyle = {
  ...buttonSecondaryStyle,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  width: "100%",
  height: "48px",
};

const meterWrapStyle = {
  display: "grid",
  gap: "9px",
  marginTop: "-4px",
  padding: "11px 13px",
  borderRadius: "var(--sh-radius-sm)",
  border: `1px solid ${colors.border}`,
  background: colors.primarySoft,
};

const meterHeadStyle = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
};

const meterTrackStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(4, 1fr)",
  gap: "4px",
  flex: "1 1 auto",
};

const meterSegmentStyle = {
  height: "5px",
  borderRadius: "999px",
  transition: "background 200ms ease",
};

const meterLabelStyle = {
  flex: "0 0 auto",
  minWidth: "44px",
  textAlign: "right",
  fontSize: "12px",
  fontWeight: 800,
};

const checklistStyle = {
  display: "grid",
  gap: "3px",
  margin: 0,
  padding: 0,
  listStyle: "none",
};

const checkItemStyle = {
  display: "flex",
  alignItems: "center",
  gap: "7px",
  fontSize: "12.5px",
  fontWeight: 600,
};

const checkIconStyle = {
  display: "grid",
  placeItems: "center",
  width: "14px",
  height: "14px",
};

const checkDotStyle = {
  width: "5px",
  height: "5px",
  borderRadius: "999px",
  background: "currentColor",
  opacity: 0.5,
};
