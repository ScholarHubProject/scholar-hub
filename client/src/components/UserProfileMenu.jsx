import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSavedSettings, saveSettings } from "../settings";
import { eyebrowStyle, mutedTextStyle } from "../sharedStyles";

const getCurrentUser = () => {
  try {
    return JSON.parse(localStorage.getItem("currentUser"));
  } catch {
    return null;
  }
};

const UserProfileMenu = () => {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [triggerHover, setTriggerHover] = useState(false);
  const [hoveredItem, setHoveredItem] = useState(null);
  const [settings, setSettings] = useState(getSavedSettings);
  const menuRef = useRef(null);
  const modalRef = useRef(null);
  const user = getCurrentUser();

  const fullName = useMemo(
    () => user?.fullname || user?.name || user?.full_name || "Signed In User",
    [user]
  );
  const role = useMemo(() => user?.role || "Student", [user]);
  const avatarLetter = (fullName || role || "U").charAt(0).toUpperCase();
  const emailValue = user?.email || "Not available";
  const schoolIdValue = user?.schoolIdNumber || user?.school_id_number || "Not available";

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }

      if (modalRef.current && !modalRef.current.contains(event.target)) {
        setProfileOpen(false);
        setSettingsOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setProfileOpen(false);
        setSettingsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const openProfile = () => {
    setMenuOpen(false);
    setProfileOpen(true);
    setSettingsOpen(false);
  };

  const openSettings = () => {
    setMenuOpen(false);
    setSettingsOpen(true);
    setProfileOpen(false);
  };

  const handleLogout = () => {
    localStorage.removeItem("currentUser");
    setMenuOpen(false);
    setProfileOpen(false);
    setSettingsOpen(false);
    navigate("/login");
  };

  const handleToggleChange = (key) => (event) => {
    setSettings((current) => ({
      ...current,
      [key]: event.target.checked,
    }));
  };

  const handleSelectChange = (key) => (event) => {
    setSettings((current) => ({
      ...current,
      [key]: event.target.value,
    }));
  };

  const accentClass = settings.accent === "orange" ? "orange" : "amber";

  return (
    <>
      <div ref={menuRef} style={containerStyle}>
        <button
          type="button"
          onClick={() => setMenuOpen((current) => !current)}
          onMouseEnter={() => setTriggerHover(true)}
          onMouseLeave={() => setTriggerHover(false)}
          style={triggerStyle(triggerHover, menuOpen)}
        >
          <span style={avatarStyle}>{avatarLetter}</span>
          <span style={textWrapStyle}>
            <strong style={nameStyle}>{fullName}</strong>
            <span style={roleStyle}>{role}</span>
          </span>
          <span style={chevronStyle(menuOpen, triggerHover)}>⌄</span>
        </button>

        {menuOpen && (
          <div style={menuStyle}>
            <button
              type="button"
              style={menuItemStyle(hoveredItem === "profile")}
              onMouseEnter={() => setHoveredItem("profile")}
              onMouseLeave={() => setHoveredItem(null)}
              onClick={openProfile}
            >
              My Profile
            </button>
            <button
              type="button"
              style={menuItemStyle(hoveredItem === "settings")}
              onMouseEnter={() => setHoveredItem("settings")}
              onMouseLeave={() => setHoveredItem(null)}
              onClick={openSettings}
            >
              Settings
            </button>
            <button
              type="button"
              style={logoutItemStyle(hoveredItem === "logout")}
              onMouseEnter={() => setHoveredItem("logout")}
              onMouseLeave={() => setHoveredItem(null)}
              onClick={handleLogout}
            >
              Logout
            </button>
          </div>
        )}
      </div>

      {(profileOpen || settingsOpen) && (
        <div style={overlayStyle} role="presentation">
          <div ref={modalRef} style={modalStyle}>
            <div style={modalHeaderStyle}>
              <div style={modalHeaderCopyStyle}>
                <span style={eyebrowStyle}>{profileOpen ? "My Profile" : "Settings"}</span>
                <h2 style={modalTitleStyle}>
                  {profileOpen ? "Scholar Hub Profile" : "Account Preferences"}
                </h2>
                <p style={mutedTextStyle}>
                  {profileOpen
                    ? "A quick look at your account information and role."
                    : "Choose how Scholar Hub should behave for your account."}
                </p>
              </div>
              <button type="button" onClick={() => { setProfileOpen(false); setSettingsOpen(false); }} style={closeButtonStyle}>
                ×
              </button>
            </div>

            {profileOpen ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  setProfileOpen(false);
                }}
                style={profileFormStyle}
              >
                <section style={profileHeroStyle}>
                  <div style={profileHeroTopStyle}>
                    <div style={profileAvatarStyle}>{avatarLetter}</div>
                    <div style={profileHeroCopyStyle}>
                      <span style={profileBadgeStyle}>Live profile</span>
                      <strong style={profileNameLargeStyle}>{fullName}</strong>
                      <span style={profileRoleLargeStyle}>{role} Account</span>
                      <p style={profileHeroTextStyle}>
                        Your account information is displayed in the same warm dashboard card style.
                      </p>
                    </div>
                  </div>
                </section>

                <div style={profileFieldGridStyle}>
                  {[
                    ["Full name", fullName],
                    ["School ID Number", schoolIdValue],
                    ["Role", role],
                    ["Email address", emailValue],
                  ].map(([label, value]) => (
                    <label key={label} style={profileFieldStyle}>
                      <span style={profileFieldLabelStyle}>{label}</span>
                      <input readOnly value={value} style={profileInputStyle} />
                    </label>
                  ))}
                </div>

                <div style={profileFooterStyle}>
                  <p style={settingsHintStyle}>
                    Profile values come from your current Scholar Hub login session.
                  </p>
                  <button type="submit" style={primaryActionStyle}>
                    Done
                  </button>
                </div>
              </form>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  setSettingsOpen(false);
                }}
                style={settingsFormStyle}
              >
                <div style={settingsGridStyle}>
                  <label style={settingRowStyle}>
                    <span style={settingCopyStyle}>
                      <strong style={settingTitleStyle}>Email notifications</strong>
                      <span style={mutedTextStyle}>Get application and announcement updates.</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={settings.emailNotifications}
                      onChange={handleToggleChange("emailNotifications")}
                      style={switchStyle}
                    />
                  </label>

                  <label style={settingRowStyle}>
                    <span style={settingCopyStyle}>
                      <strong style={settingTitleStyle}>Auto refresh</strong>
                      <span style={mutedTextStyle}>Keep dashboard counts and feeds live.</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={settings.autoRefresh}
                      onChange={handleToggleChange("autoRefresh")}
                      style={switchStyle}
                    />
                  </label>

                  <label style={settingRowStyle}>
                    <span style={settingCopyStyle}>
                      <strong style={settingTitleStyle}>Announcement digest</strong>
                      <span style={mutedTextStyle}>Bundle campus updates into a summary.</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={settings.announcementDigest}
                      onChange={handleToggleChange("announcementDigest")}
                      style={switchStyle}
                    />
                  </label>

                  <label style={settingRowStyle}>
                    <span style={settingCopyStyle}>
                      <strong style={settingTitleStyle}>Compact mode</strong>
                      <span style={mutedTextStyle}>Tighten spacing across dashboard cards.</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={settings.compactMode}
                      onChange={handleToggleChange("compactMode")}
                      style={switchStyle}
                    />
                  </label>

                  <label style={settingRowStyle}>
                    <span style={settingCopyStyle}>
                      <strong style={settingTitleStyle}>Show status badges</strong>
                      <span style={mutedTextStyle}>Highlight application and notification states.</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={settings.showStatusBadges ?? true}
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          showStatusBadges: event.target.checked,
                        }))
                      }
                      style={switchStyle}
                    />
                  </label>

                  <div style={selectFieldStyle}>
                    <label style={selectLabelStyle}>Accent color</label>
                    <select
                      value={settings.accent}
                      onChange={handleSelectChange("accent")}
                      style={selectStyle}
                    >
                      <option value="orange">Orange</option>
                      <option value="amber">Amber</option>
                    </select>
                  </div>

                  <div style={selectFieldStyle}>
                    <label style={selectLabelStyle}>Reminder frequency</label>
                    <select
                      value={settings.reminderFrequency}
                      onChange={handleSelectChange("reminderFrequency")}
                      style={selectStyle}
                    >
                      <option value="Daily">Daily</option>
                      <option value="Weekly">Weekly</option>
                      <option value="Monthly">Monthly</option>
                    </select>
                  </div>

                  <div style={selectFieldStyle}>
                    <label style={selectLabelStyle}>Default dashboard</label>
                    <select
                      value={settings.defaultDashboard || "Student Dashboard"}
                      onChange={handleSelectChange("defaultDashboard")}
                      style={selectStyle}
                    >
                      <option value="Student Dashboard">Student Dashboard</option>
                      <option value="Admin Dashboard">Admin Dashboard</option>
                      <option value="Scholarships">Scholarships</option>
                    </select>
                  </div>
                </div>

                <section style={settingsSummaryStyle}>
                  <div style={detailCardStyle}>
                    <h3 style={detailTitleStyle}>Quick Settings Summary</h3>
                    <div style={settingsSummaryGridStyle}>
                      <div style={summaryItemStyle}>
                        <span style={summaryLabelStyle}>Notifications</span>
                        <strong style={summaryValueStyle}>
                          {settings.emailNotifications ? "On" : "Off"}
                        </strong>
                      </div>
                      <div style={summaryItemStyle}>
                        <span style={summaryLabelStyle}>Auto refresh</span>
                        <strong style={summaryValueStyle}>{settings.autoRefresh ? "On" : "Off"}</strong>
                      </div>
                      <div style={summaryItemStyle}>
                        <span style={summaryLabelStyle}>Digest</span>
                        <strong style={summaryValueStyle}>
                          {settings.announcementDigest ? "On" : "Off"}
                        </strong>
                      </div>
                      <div style={summaryItemStyle}>
                        <span style={summaryLabelStyle}>Compact</span>
                        <strong style={summaryValueStyle}>{settings.compactMode ? "On" : "Off"}</strong>
                      </div>
                    </div>
                  </div>
                </section>

                <div style={settingsFooterStyle}>
                  <div style={accentPreviewStyle(accentClass)}>
                    <span style={accentDotStyle} />
                    <span>Accent preview</span>
                  </div>
                  <p style={settingsHintStyle}>
                    Changes are saved locally and used across your current session.
                  </p>
                  <div style={settingsActionsStyle}>
                    <button
                      type="button"
                      style={secondaryActionStyle}
                      onClick={() => setSettings(getSavedSettings())}
                    >
                      Reset
                    </button>
                    <button type="submit" style={primaryActionStyle}>
                      Save Changes
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
};

const containerStyle = {
  position: "relative",
};

const triggerStyle = (hover, open) => ({
  display: "flex",
  alignItems: "center",
  gap: "10px",
  padding: "8px 12px 8px 8px",
  borderRadius: "999px",
  border: "1px solid #fed7aa",
  background: open || hover ? "#fff7ed" : "#fff",
  color: "#1f2937",
  cursor: "pointer",
  boxShadow: open || hover ? "0 14px 30px rgba(249,115,22,0.16)" : "0 10px 25px rgba(0,0,0,0.05)",
  transform: open || hover ? "translateY(-1px)" : "translateY(0)",
  transition:
    "transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease, background 180ms ease",
});

const avatarStyle = {
  width: "40px",
  height: "40px",
  borderRadius: "50%",
  background: "#f97316",
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 800,
  flex: "0 0 auto",
};

const textWrapStyle = {
  display: "grid",
  lineHeight: 1.1,
  textAlign: "left",
  minWidth: 0,
};

const nameStyle = {
  fontSize: "14px",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: "180px",
};

const roleStyle = {
  fontSize: "12px",
  color: "#64748b",
};

const menuStyle = {
  position: "absolute",
  right: 0,
  top: "calc(100% + 10px)",
  minWidth: "220px",
  background: "#fff",
  border: "1px solid #fed7aa",
  borderRadius: "14px",
  boxShadow: "0 18px 40px rgba(0,0,0,0.14)",
  padding: "8px",
  display: "grid",
  gap: "6px",
  zIndex: 50,
};

const menuItemStyle = (hover) => ({
  background: hover ? "#fff7ed" : "transparent",
  border: "none",
  borderRadius: "10px",
  textAlign: "left",
  padding: "10px 12px",
  color: hover ? "#c2410c" : "#1f2937",
  cursor: "pointer",
  transform: hover ? "translateX(2px)" : "translateX(0)",
  transition: "background 180ms ease, color 180ms ease, transform 180ms ease",
});

const logoutItemStyle = (hover) => ({
  ...menuItemStyle(hover),
  color: "#c2410c",
});

const chevronStyle = (open, hover) => ({
  flex: "0 0 auto",
  color: "#f97316",
  transition: "transform 180ms ease",
  transform: open ? "rotate(180deg)" : "rotate(0deg)",
  opacity: hover || open ? 1 : 0.8,
});

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.34)",
  backdropFilter: "blur(4px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "clamp(10px, 4vw, 20px)",
  zIndex: 1200,
};

const modalStyle = {
  width: "min(560px, 100%)",
  maxHeight: "calc(100vh - 32px)",
  overflowY: "visible",
  background: "#fff",
  borderRadius: "clamp(16px, 5vw, 18px)",
  border: "1px solid #fed7aa",
  boxShadow: "0 28px 70px rgba(0,0,0,0.2)",
  padding: "clamp(14px, 4vw, 18px)",
};

const modalHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: "14px",
  alignItems: "flex-start",
  marginBottom: "12px",
};

const modalHeaderCopyStyle = {
  display: "grid",
  gap: "8px",
};

const modalTitleStyle = {
  margin: 0,
  color: "#1f2937",
  fontSize: "21px",
};

const closeButtonStyle = {
  width: "38px",
  height: "38px",
  borderRadius: "50%",
  border: "none",
  background: "transparent",
  color: "#f97316",
  fontSize: "24px",
  lineHeight: 1,
  cursor: "pointer",
};

const profileFormStyle = {
  display: "grid",
  gap: "12px",
};

const profileHeroStyle = {
  display: "grid",
  gap: "12px",
  justifyItems: "start",
  padding: "16px",
  borderRadius: "16px",
  background: "linear-gradient(90deg, #fff7ed 40%, #fed7aa)",
  border: "1px solid #fed7aa",
  boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
};

const profileHeroTopStyle = {
  display: "flex",
  alignItems: "center",
  gap: "14px",
};

const profileAvatarStyle = {
  width: "64px",
  height: "64px",
  borderRadius: "50%",
  background: "#f97316",
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 800,
  fontSize: "24px",
};

const profileHeroCopyStyle = {
  display: "grid",
  gap: "6px",
};

const profileHeroTextStyle = {
  ...mutedTextStyle,
  marginTop: "2px",
  maxWidth: "36ch",
  fontSize: "13px",
};

const profileBadgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  width: "fit-content",
  padding: "5px 9px",
  borderRadius: "999px",
  background: "#f97316",
  color: "#fff",
  fontSize: "12px",
  fontWeight: 700,
};

const profileNameLargeStyle = {
  fontSize: "22px",
  color: "#1f2937",
};

const profileRoleLargeStyle = {
  fontSize: "14px",
  color: "#64748b",
  fontWeight: 700,
};

const detailCardStyle = {
  padding: "16px",
  borderRadius: "16px",
  border: "1px solid #fed7aa",
  background: "#fff",
  display: "grid",
  gap: "12px",
};

const profileFieldGridStyle = {
  display: "grid",
  gap: "8px",
};

const profileFieldStyle = {
  display: "grid",
  gap: "5px",
};

const profileFieldLabelStyle = {
  color: "#64748b",
  fontWeight: "700",
  fontSize: "13px",
};

const profileInputStyle = {
  width: "100%",
  padding: "9px 11px",
  borderRadius: "10px",
  border: "1px solid #fdba74",
  background: "#fffaf5",
  color: "#1f2937",
  outlineColor: "#f97316",
  fontWeight: "700",
};

const detailTitleStyle = {
  margin: 0,
  color: "#1f2937",
};

const profileFooterStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
  flexWrap: "wrap",
};

const settingsFormStyle = {
  display: "grid",
  gap: "18px",
};

const settingsGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))",
  gap: "12px",
};

const settingsSummaryStyle = {
  display: "grid",
  gap: "12px",
};

const settingsSummaryGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(120px, 100%), 1fr))",
  gap: "10px",
};

const summaryItemStyle = {
  padding: "12px 14px",
  borderRadius: "14px",
  background: "#fffaf5",
  border: "1px solid #fed7aa",
  display: "grid",
  gap: "4px",
};

const summaryLabelStyle = {
  fontSize: "12px",
  color: "#64748b",
  fontWeight: 700,
};

const summaryValueStyle = {
  color: "#1f2937",
  fontSize: "14px",
};

const settingRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: "14px",
  alignItems: "center",
  padding: "16px",
  borderRadius: "16px",
  border: "1px solid #fed7aa",
  background: "#fffaf5",
};

const settingCopyStyle = {
  display: "grid",
  gap: "6px",
};

const settingTitleStyle = {
  color: "#1f2937",
};

const switchStyle = {
  width: "18px",
  height: "18px",
  accentColor: "#f97316",
};

const selectFieldStyle = {
  display: "grid",
  gap: "8px",
  padding: "16px",
  borderRadius: "16px",
  border: "1px solid #fed7aa",
  background: "#fffaf5",
};

const selectLabelStyle = {
  color: "#1f2937",
  fontWeight: 700,
};

const selectStyle = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: "10px",
  border: "1px solid #fdba74",
  background: "#fff",
  color: "#1f2937",
  outlineColor: "#f97316",
};

const settingsFooterStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "14px",
  flexWrap: "wrap",
};

const settingsHintStyle = {
  ...mutedTextStyle,
  fontSize: "13px",
  marginRight: "auto",
};

const settingsActionsStyle = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
};

const primaryActionStyle = {
  background: "#f97316",
  color: "#fff",
  padding: "12px 18px",
  border: "none",
  borderRadius: "10px",
  fontWeight: 700,
  cursor: "pointer",
  boxShadow: "0 10px 24px rgba(249,115,22,0.25)",
};

const secondaryActionStyle = {
  background: "#fff",
  color: "#f97316",
  padding: "12px 18px",
  border: "1px solid #fed7aa",
  borderRadius: "10px",
  fontWeight: 700,
  cursor: "pointer",
};

const accentPreviewStyle = (accentClass) => ({
  display: "flex",
  alignItems: "center",
  gap: "10px",
  color: accentClass === "orange" ? "#f97316" : "#d97706",
  fontWeight: 700,
});

const accentDotStyle = {
  width: "12px",
  height: "12px",
  borderRadius: "50%",
  background: "#f97316",
  boxShadow: "0 0 0 4px rgba(249,115,22,0.14)",
};

export default UserProfileMenu;
