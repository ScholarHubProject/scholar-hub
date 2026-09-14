import { getUploadUrl } from "../api";
import { getAccountInitials, getAccountLabel } from "../savedAccounts";
import { colors, mutedTextStyle } from "../sharedStyles";
import { CrossIcon, PlusIcon } from "./icons";

// ---------------------------------------------------------------
// Account switcher
// ---------------------------------------------------------------
// The tiles the login page shows for accounts that have signed in on this
// browser. A tile is a shortcut past the email field, nothing more — the
// password is still asked for on the next screen, which is what keeps
// this safe to leave on a shared computer.

export const AccountAvatar = ({ account, size = 60, style }) => {
  const src = getUploadUrl(account?.avatarPath);
  const initials = getAccountInitials(account);

  return (
    <span
      style={{
        ...avatarStyle,
        width: `${size}px`,
        height: `${size}px`,
        fontSize: `${Math.round(size * 0.38)}px`,
        ...style,
      }}
      aria-hidden="true"
    >
      {src ? <img src={src} alt="" style={avatarImageStyle} /> : initials}
    </span>
  );
};

const AccountTile = ({ account, onSelect, onForget }) => {
  const label = getAccountLabel(account);

  return (
    <div style={tileWrapStyle}>
      <button
        type="button"
        style={tileStyle}
        onClick={() => onSelect(account)}
        title={account.email}
      >
        <AccountAvatar account={account} />
        <span style={tileNameStyle}>{label}</span>
        <span style={tileRoleStyle}>{account.role}</span>
      </button>

      {/* Its own button rather than one nested inside the tile, which is
          not valid markup and would swallow the tile's own click. */}
      <button
        type="button"
        style={removeButtonStyle}
        onClick={() => onForget(account)}
        aria-label={`Remove ${label} from this device`}
        title="Remove from this device"
      >
        <CrossIcon size={15} />
      </button>
    </div>
  );
};

export const AddAccountTile = ({ onClick, label = "Add account" }) => (
  <div style={tileWrapStyle}>
    <button type="button" style={tileStyle} onClick={onClick}>
      <span style={addCircleStyle} aria-hidden="true">
        <PlusIcon size={26} />
      </span>
      <span style={tileNameStyle}>{label}</span>
      <span style={tileRoleStyle}>Sign in or register</span>
    </button>
  </div>
);

export const AccountPicker = ({ accounts, onSelect, onForget, onAddAccount }) => (
  <div style={pickerStyle}>
    <div style={gridStyle}>
      {accounts.map((account) => (
        <AccountTile
          key={account.email}
          account={account}
          onSelect={onSelect}
          onForget={onForget}
        />
      ))}

      <AddAccountTile onClick={onAddAccount} />
    </div>
  </div>
);

// The header above the password field once an account is picked: who you
// are about to sign in as, and a way out if it is the wrong person.
export const AccountHeader = ({ account, onSwitch }) => (
  <div style={headerStyle}>
    <AccountAvatar account={account} size={68} />

    <div style={headerTextStyle}>
      <p style={headerNameStyle}>{getAccountLabel(account)}</p>
      <p style={headerEmailStyle}>{account.email}</p>
    </div>

    {onSwitch && (
      <button type="button" style={switchButtonStyle} onClick={onSwitch}>
        Not you? Switch account
      </button>
    )}
  </div>
);

// ---------------------------------------------------------------
// Styles
// ---------------------------------------------------------------

const pickerStyle = {
  display: "grid",
  gap: "14px",
};

const gridStyle = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "center",
  gap: "10px",
};

const tileWrapStyle = {
  position: "relative",
  width: "112px",
};

const tileStyle = {
  display: "grid",
  justifyItems: "center",
  gap: "7px",
  width: "100%",
  padding: "14px 8px 12px",
  borderRadius: "var(--sh-radius-md)",
  border: `1px solid ${colors.border}`,
  background: "var(--sh-auth-field-bg)",
  color: colors.text,
  cursor: "pointer",
};

const avatarStyle = {
  display: "grid",
  placeItems: "center",
  borderRadius: "50%",
  overflow: "hidden",
  flex: "0 0 auto",
  background: "linear-gradient(135deg, var(--sh-primary), var(--sh-primary-dark))",
  color: "#ffffff",
  fontWeight: 800,
  letterSpacing: "0.02em",
  boxShadow: "var(--sh-shadow-sm)",
};

const avatarImageStyle = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const addCircleStyle = {
  display: "grid",
  placeItems: "center",
  width: "60px",
  height: "60px",
  borderRadius: "50%",
  border: `2px dashed ${colors.border}`,
  background: colors.primarySoft,
  color: colors.primaryDark,
  flex: "0 0 auto",
};

const tileNameStyle = {
  maxWidth: "100%",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: "13px",
  fontWeight: 700,
  lineHeight: 1.2,
};

const tileRoleStyle = {
  color: colors.muted,
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const removeButtonStyle = {
  position: "absolute",
  top: "-6px",
  right: "-6px",
  display: "grid",
  placeItems: "center",
  width: "26px",
  height: "26px",
  padding: 0,
  borderRadius: "50%",
  border: `1px solid ${colors.border}`,
  background: colors.surface,
  color: colors.muted,
  cursor: "pointer",
};

const headerStyle = {
  display: "grid",
  justifyItems: "center",
  gap: "6px",
  marginBottom: "4px",
};

const headerTextStyle = {
  display: "grid",
  justifyItems: "center",
  gap: "2px",
  maxWidth: "100%",
};

const headerNameStyle = {
  margin: "6px 0 0",
  color: colors.text,
  fontSize: "17px",
  fontWeight: 800,
  textAlign: "center",
};

const headerEmailStyle = {
  ...mutedTextStyle,
  maxWidth: "100%",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: "13px",
};

const switchButtonStyle = {
  marginTop: "4px",
  padding: "5px 12px",
  border: `1px solid ${colors.border}`,
  borderRadius: "999px",
  background: colors.surface,
  color: colors.primaryDark,
  fontSize: "12.5px",
  fontWeight: 700,
  cursor: "pointer",
};
