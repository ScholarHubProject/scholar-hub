import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api, { clearSession, getStoredUser, getUploadUrl } from "../api";
import { DEFAULT_SETTINGS } from "../settings";
import { updateSavedAccount } from "../savedAccounts";
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  colors,
  glassStrongStyle,
  glassStyle,
  inputStyle,
} from "../sharedStyles";
import { AppearanceSettings, Switch, ThemeToggle } from "../components/appearance";
import { CameraIcon } from "../components/icons";
import { useSettings } from "../useSettings";

const USER_CHANGED_EVENT = "scholarHubUserChanged";

const getCurrentUser = () => {
  try {
    return getStoredUser();
  } catch {
    return null;
  }
};

const Home = () => {
  const [user, setUser] = useState(getCurrentUser);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileHover, setProfileHover] = useState(false);
  const [hoveredItem, setHoveredItem] = useState(null);
  const [settings, updateSettings] = useSettings();
  const [avatarPreview, setAvatarPreview] = useState("");
  const [avatarMessage, setAvatarMessage] = useState(null);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [profileForm, setProfileForm] = useState({
    fullName: "",
    schoolIdNumber: "",
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const profileRef = useRef(null);
  const avatarInputRef = useRef(null);
  const homeLinks =
    user?.role === "Admin"
      ? [
          { label: "Home", to: "/" },
          { label: "Scholarship Management", to: "/manage-scholarship" },
          { label: "Applicants", to: "/manage-applicants" },
          { label: "Reports", to: "/reports" },
        ]
      : [];
  const fullName = useMemo(
    () => user?.fullname || user?.name || user?.full_name || "Signed In User",
    [user]
  );
  const avatarLetter = (fullName || user?.role || "U").charAt(0).toUpperCase();
  const avatarSrc = getUploadUrl(avatarPreview || user?.avatarPath || user?.avatar_path);
  const roleValue = user?.role || "Student";
  const emailValue = user?.email || "Not available";

  const syncStoredUser = (updates) => {
    const currentUser = getCurrentUser() || user || {};
    const nextUser = { ...currentUser, ...updates };
    localStorage.setItem("currentUser", JSON.stringify(nextUser));
    // The login tile for this account shows the same photo and name.
    updateSavedAccount(nextUser);
    setUser(nextUser);
    window.dispatchEvent(new CustomEvent(USER_CHANGED_EVENT, { detail: nextUser }));
    return nextUser;
  };

  useEffect(
    () => () => {
      if (avatarPreview.startsWith("blob:")) {
        URL.revokeObjectURL(avatarPreview);
      }
    },
    [avatarPreview]
  );

  useEffect(() => {
    const syncUserFromStorage = () => setUser(getCurrentUser());
    const handleStorageChange = (event) => {
      if (event.key === "currentUser") {
        syncUserFromStorage();
      }
    };

    window.addEventListener(USER_CHANGED_EVENT, syncUserFromStorage);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener(USER_CHANGED_EVENT, syncUserFromStorage);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setProfileOpen(false);
        setProfileModalOpen(false);
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

  const closeAccountPanel = () => {
    setProfileOpen(false);
    setProfileModalOpen(false);
    setSettingsOpen(false);
  };

  const handleMyProfile = () => {
    setProfileOpen(false);
    setProfileModalOpen(true);
    setSettingsOpen(false);
    setProfileForm({
      fullName,
      schoolIdNumber: user?.schoolIdNumber || user?.school_id_number || "",
    });
    setProfileMessage("");
  };

  const handleSettings = () => {
    setProfileOpen(false);
    setProfileModalOpen(false);
    setSettingsOpen(true);
  };

  const handleToggleChange = (key) => (event) => {
    updateSettings({ [key]: event.target.checked });
  };

  const handleSelectChange = (key) => (event) => {
    updateSettings({ [key]: event.target.value });
  };

  const handleProfileFieldChange = (key) => (event) => {
    setProfileForm((current) => ({
      ...current,
      [key]: event.target.value,
    }));
    setProfileMessage("");
  };

  // Choosing a photo is uploading it. The old flow previewed the file and
  // waited for a second "Set Photo" press that most people never found,
  // so the photo they had just picked vanished when the sheet closed.
  const uploadAvatar = async (file) => {
    // The server updates whichever account the token identifies, so no id or
    // email is sent with the photo.
    const formData = new FormData();
    formData.append("avatar", file);

    setAvatarSaving(true);
    setAvatarMessage({ tone: "info", text: "Uploading photo..." });

    try {
      const response = await api.put("/users/avatar", formData);
      const nextAvatarPath = response.data?.avatarPath;

      syncStoredUser({
        avatarPath: nextAvatarPath,
        avatar_path: nextAvatarPath,
      });
      setAvatarPreview("");
      setAvatarMessage({ tone: "success", text: "Profile photo updated." });
    } catch (error) {
      console.log("Avatar upload error:", error);
      // The preview is dropped so the circle goes back to the photo that is
      // actually saved, rather than showing one that never made it.
      setAvatarPreview("");
      setAvatarMessage({
        tone: "error",
        text:
          error.response?.data?.message ||
          (error.response ? "Unable to save this photo." : "You appear to be offline. Try again."),
      });
    } finally {
      setAvatarSaving(false);
      if (avatarInputRef.current) {
        avatarInputRef.current.value = "";
      }
    }
  };

  const handleAvatarFileChange = (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setAvatarMessage({ tone: "error", text: "Please choose an image file." });
      event.target.value = "";
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      setAvatarMessage({ tone: "error", text: "Choose an image under 3 MB." });
      event.target.value = "";
      return;
    }

    setAvatarPreview(URL.createObjectURL(file));
    uploadAvatar(file);
  };

  const handleProfileSave = async () => {
    const cleanFullName = profileForm.fullName.trim();
    const cleanSchoolIdNumber = profileForm.schoolIdNumber.trim();

    if (!cleanFullName) {
      setProfileMessage("Full name is required.");
      return;
    }

    setProfileSaving(true);
    setProfileMessage("Saving profile...");

    try {
      const response = await api.put("/users/profile", {
        fullname: cleanFullName,
        schoolIdNumber: cleanSchoolIdNumber,
        courseYear: user?.courseYear || user?.course_year || "",
        contactNumber: user?.contactNumber || user?.contact_number || "",
      });
      const updatedUser = response.data?.user || {};

      syncStoredUser({
        ...updatedUser,
        id: user?.id || updatedUser.id,
        name: cleanFullName,
        fullname: cleanFullName,
        schoolIdNumber: cleanSchoolIdNumber,
        school_id_number: cleanSchoolIdNumber,
        email: user?.email,
        role: user?.role,
        courseYear: user?.courseYear || updatedUser.courseYear || "",
        contactNumber: user?.contactNumber || updatedUser.contactNumber || "",
      });
      setProfileMessage("Profile updated and synced.");
    } catch (error) {
      console.log("Profile update error:", error);
      setProfileMessage(error.response?.data?.message || "Unable to update profile.");
    } finally {
      setProfileSaving(false);
    }
  };

  const handleLogout = () => {
    clearSession();
    setProfileOpen(false);
    setProfileModalOpen(false);
    setSettingsOpen(false);
    setUser(null);
  };

  return (
    <div style={pageStyle}>
      <nav style={navStyle}>
        <Link to="/" style={logoContainerStyle}>
          <h2 style={logoStyle}>SCHOLAR HUB</h2>
          <small style={campusStyle}>PSU RIZAL CAMPUS</small>
        </Link>

        <div style={navLinks}>
          {homeLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              style={
                [
                  "Home",
                  "Scholarship Management",
                  "Applicants",
                  "Reports",
                ].includes(link.label)
                  ? navLinkStyle
                  : orangeNavLinkStyle
              }
            >
              {link.label}
            </Link>
          ))}

          {user ? (
            <div style={accountActionsStyle}>
              <ThemeToggle />
              <div ref={profileRef} style={profileWrapStyle}>
                <button
                  type="button"
                  style={profileButtonStyle(profileHover, profileOpen)}
                  className="scholar-profile-button"
                  onClick={() => setProfileOpen((current) => !current)}
                  onMouseEnter={() => setProfileHover(true)}
                  onMouseLeave={() => setProfileHover(false)}
                >
                  <div style={profileAvatarStyle}>
                    {avatarSrc ? (
                      <img src={avatarSrc} alt="" style={avatarImageStyle} />
                    ) : (
                      avatarLetter
                    )}
                  </div>
                  <div style={profileCopyStyle} className="scholar-profile-copy">
                    <strong style={profileNameStyle}>{fullName}</strong>
                    <span style={profileRoleStyle}>{user.role}</span>
                  </div>
                  <span style={profileChevronStyle(profileOpen)}>⌄</span>
                </button>

                {profileOpen && (
                  <div style={profileMenuStyle} className="sh-pop-in">
                    <button
                      type="button"
                      style={profileMenuItemStyle(hoveredItem === "profile")}
                      onMouseEnter={() => setHoveredItem("profile")}
                      onMouseLeave={() => setHoveredItem(null)}
                      onClick={handleMyProfile}
                    >
                      My Profile
                    </button>
                    <button
                      type="button"
                      style={profileMenuItemStyle(hoveredItem === "settings")}
                      onMouseEnter={() => setHoveredItem("settings")}
                      onMouseLeave={() => setHoveredItem(null)}
                      onClick={handleSettings}
                    >
                      Settings
                    </button>
                    <button
                      type="button"
                      style={profileLogoutItemStyle(hoveredItem === "logout")}
                      onMouseEnter={() => setHoveredItem("logout")}
                      onMouseLeave={() => setHoveredItem(null)}
                      onClick={handleLogout}
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              <ThemeToggle />
              <Link to="/login" style={loginLinkStyle}>
                Login
              </Link>
              <Link to="/register" style={registerBtn}>
                Register
              </Link>
            </>
          )}
        </div>
      </nav>

      {(profileModalOpen || settingsOpen) && (
        <div
          style={accountOverlayStyle}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeAccountPanel();
            }
          }}
        >
          <section style={accountModalStyle} className="sh-sheet-in sh-thin-scroll">
            <div style={accountModalHeaderStyle}>
              <div>
                <span style={modalEyebrowStyle}>
                  {profileModalOpen ? "My Profile" : "Settings"}
                </span>
                <h2 style={accountModalTitleStyle}>
                  {profileModalOpen ? "Scholar Hub Profile" : "Account Preferences"}
                </h2>
                <p style={modalCopyStyle}>
                  {profileModalOpen
                    ? "A quick look at your account information and role."
                    : "Choose how Scholar Hub should behave for your account."}
                </p>
              </div>
              <button type="button" aria-label="Close account panel" onClick={closeAccountPanel} style={modalCloseButtonStyle}>
                ×
              </button>
            </div>

            {profileModalOpen ? (
              <>
                <section style={profileHeroCardStyle}>
                  <div style={profileAvatarStackStyle}>
                    <button
                      type="button"
                      style={avatarPickerStyle}
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={avatarSaving}
                      aria-label={avatarSrc ? "Change profile photo" : "Upload profile photo"}
                    >
                      <div style={profileHeroAvatarStyle}>
                        {avatarSrc ? (
                          <img src={avatarSrc} alt="" style={avatarImageStyle} />
                        ) : (
                          avatarLetter
                        )}
                        {avatarSaving && (
                          <span style={avatarBusyOverlayStyle} aria-hidden="true">
                            <span className="sh-spinner" style={avatarSpinnerStyle} />
                          </span>
                        )}
                      </div>
                      <span style={avatarCameraBadgeStyle} aria-hidden="true">
                        <CameraIcon size={13} />
                      </span>
                    </button>
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarFileChange}
                      style={hiddenFileInputStyle}
                    />
                  </div>
                  <div style={profileHeroCopyStyle}>
                    <span style={profileStatusStyle}>Active account</span>
                    <strong style={profileHeroNameStyle}>{fullName}</strong>
                    <span style={profileHeroRoleStyle}>{roleValue} Workspace</span>
                    <div style={avatarActionsStyle}>
                      <button
                        type="button"
                        style={avatarChooseButtonStyle}
                        onClick={() => avatarInputRef.current?.click()}
                        disabled={avatarSaving}
                      >
                        {avatarSaving ? "Uploading..." : avatarSrc ? "Change Photo" : "Upload Photo"}
                      </button>
                      <span style={avatarHintStyle}>JPG or PNG, under 3 MB.</span>
                    </div>
                    {avatarMessage && (
                      <span style={avatarMessageStyle(avatarMessage.tone)} role="status">
                        {avatarMessage.text}
                      </span>
                    )}
                  </div>
                </section>

                <div style={profileFieldsGridStyle}>
                  <label style={profileFieldStyle}>
                    <span style={profileFieldLabelStyle}>Full name</span>
                    <input
                      value={profileForm.fullName}
                      onChange={handleProfileFieldChange("fullName")}
                      style={profileInputStyle}
                    />
                  </label>
                  <label style={profileFieldStyle}>
                    <span style={profileFieldLabelStyle}>School ID Number</span>
                    <input
                      value={profileForm.schoolIdNumber}
                      onChange={handleProfileFieldChange("schoolIdNumber")}
                      style={profileInputStyle}
                    />
                  </label>
                  <label style={profileFieldStyle}>
                    <span style={profileFieldLabelStyle}>Role</span>
                    <input readOnly value={roleValue} style={profileReadOnlyInputStyle} />
                  </label>
                  <label style={profileFieldStyle}>
                    <span style={profileFieldLabelStyle}>Email address</span>
                    <input readOnly value={emailValue} style={profileReadOnlyInputStyle} />
                  </label>
                </div>

                <div style={profileModalFooterStyle}>
                  <p style={profileHintStyle}>
                    Only your full name and school ID number can be edited here.
                  </p>
                  {profileMessage && (
                    <span style={profileMessageStyle}>{profileMessage}</span>
                  )}
                  <button
                    type="button"
                    style={modalDoneButtonStyle}
                    onClick={handleProfileSave}
                    disabled={profileSaving}
                  >
                    {profileSaving ? "Saving..." : "Save Profile"}
                  </button>
                </div>
              </>
            ) : (
              <form
                style={settingsFormStyle}
                onSubmit={(event) => {
                  event.preventDefault();
                  setSettingsOpen(false);
                }}
              >
                <AppearanceSettings
                  settings={settings}
                  onChange={updateSettings}
                  compact={settings.compactMode}
                />

                <section style={settingsGroupStyle}>
                  <h3 style={settingsGroupTitleStyle}>Notifications</h3>
                  <div className="sh-list">
                    {[
                      ["emailNotifications", "Email notifications", "Get application and announcement updates."],
                      ["announcementDigest", "Announcement digest", "Bundle campus updates into a summary."],
                      ["showStatusBadges", "Show status badges", "Highlight application and notification states."],
                    ].map(([key, title, copy]) => (
                      <label key={key} style={settingRowStyle}>
                        <span style={settingCopyStyle}>
                          <strong style={settingTitleStyle}>{title}</strong>
                          <span style={modalCopyStyle}>{copy}</span>
                        </span>
                        <Switch checked={Boolean(settings[key])} onChange={handleToggleChange(key)} />
                      </label>
                    ))}

                    <div style={selectRowStyle}>
                      <label htmlFor="sh-home-reminder" style={settingTitleStyle}>
                        Reminder frequency
                      </label>
                      <select
                        id="sh-home-reminder"
                        value={settings.reminderFrequency}
                        onChange={handleSelectChange("reminderFrequency")}
                        className="sh-select"
                        style={inlineSelectStyle}
                      >
                        <option value="Daily">Daily</option>
                        <option value="Weekly">Weekly</option>
                        <option value="Monthly">Monthly</option>
                      </select>
                    </div>
                  </div>
                </section>

                <section style={settingsGroupStyle}>
                  <h3 style={settingsGroupTitleStyle}>Dashboard</h3>
                  <div className="sh-list">
                    <label style={settingRowStyle}>
                      <span style={settingCopyStyle}>
                        <strong style={settingTitleStyle}>Auto refresh</strong>
                        <span style={modalCopyStyle}>Keep dashboard counts and feeds live.</span>
                      </span>
                      <Switch
                        checked={settings.autoRefresh}
                        onChange={handleToggleChange("autoRefresh")}
                      />
                    </label>

                    <div style={selectRowStyle}>
                      <label htmlFor="sh-home-dashboard" style={settingTitleStyle}>
                        Default dashboard
                      </label>
                      <select
                        id="sh-home-dashboard"
                        value={settings.defaultDashboard}
                        onChange={handleSelectChange("defaultDashboard")}
                        className="sh-select"
                        style={inlineSelectStyle}
                      >
                        <option value="Student Dashboard">Student Dashboard</option>
                        <option value="Admin Dashboard">Admin Dashboard</option>
                        <option value="Scholarships">Scholarships</option>
                      </select>
                    </div>
                  </div>
                </section>

                <div style={settingsFooterStyle}>
                  <p style={settingsHintStyle}>
                    Saved on this device and applied straight away.
                  </p>
                  <button
                    type="button"
                    style={secondaryActionStyle}
                    onClick={() => updateSettings({ ...DEFAULT_SETTINGS })}
                  >
                    Reset
                  </button>
                  <button type="submit" style={modalDoneButtonStyle}>
                    Done
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}

      <section style={heroStyle} className="scholar-home-hero">
        <div style={heroContent}>
          <span style={badgeStyle}>
            Empowering Students, Building Futures
          </span>

          <h1 style={heroTitle}>
            Scholar <span style={{ color: "var(--sh-primary)" }}>Hub</span>
          </h1>

          <p style={heroText}>
            An Online Scholarship Monitoring System for Students at Palawan
            State University Rizal Campus.
          </p>

          <div style={heroActionsStyle}>
            <Link to={user?.role === "Admin" ? "/manage-scholarship" : "/scholarships"}>
              <button style={primaryBtn}>
                {user?.role === "Admin" ? "Open Scholarship Management" : "Browse Scholarships"}
              </button>
            </Link>

            {user ? (
              <Link
                to={
                  user.role === "Student"
                    ? "/student-dashboard"
                    : "/admin-dashboard"
                }
              >
                <button style={secondaryBtn}>Open Dashboard</button>
              </Link>
            ) : (
              <Link to="/login">
                <button style={secondaryBtn}>Login Now</button>
              </Link>
            )}
          </div>
        </div>
      </section>

      <section style={cardsSection}>
        <div style={cardStyle} className="scholar-home-card">
          <h3>Find Scholarships</h3>
          <p>Browse available scholarship opportunities updated regularly.</p>
        </div>

        <div style={cardStyle} className="scholar-home-card">
          <h3>Easy Application</h3>
          <p>Apply online and upload requirements in just a few steps.</p>
        </div>

        <div style={cardStyle} className="scholar-home-card">
          <h3>Track in Real-time</h3>
          <p>Monitor your application status and receive updates instantly.</p>
        </div>
      </section>
    </div>
  );
};

const pageStyle = {
  minHeight: "100vh",
  background: colors.page,
  color: colors.text,
};

const navStyle = {
  position: "sticky",
  top: 0,
  zIndex: 50,
  minHeight: "72px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "clamp(12px, 4vw, 28px)",
  padding: "clamp(12px, 3vw, 16px) clamp(16px, 5vw, 32px)",
  background: "var(--sh-topbar-bg)",
  backdropFilter: "var(--sh-glass-filter-strong)",
  WebkitBackdropFilter: "var(--sh-glass-filter-strong)",
  borderBottom: `1px solid ${colors.glassBorder}`,
  boxShadow: "var(--sh-glass-highlight), 0 10px 30px rgba(15, 23, 42, 0.05)",
  flexWrap: "wrap",
};

const logoStyle = {
  color: colors.primary,
  margin: 0,
  fontSize: "22px",
  lineHeight: 1,
  letterSpacing: 0,
};

const logoContainerStyle = {
  display: "grid",
  gap: "4px",
  textAlign: "left",
  textDecoration: "none",
  flex: "0 0 auto",
};

const campusStyle = {
  color: colors.muted,
  fontSize: "11px",
  fontWeight: "700",
  letterSpacing: "0.08em",
};

const navLinks = {
  display: "flex",
  gap: "14px",
  alignItems: "center",
  justifyContent: "flex-end",
  minWidth: 0,
  flex: "1 1 auto",
  flexWrap: "wrap",
};

const navLinkStyle = {
  color: colors.text,
  textDecoration: "none",
  whiteSpace: "nowrap",
  fontSize: "14px",
  fontWeight: "600",
};

const orangeNavLinkStyle = {
  color: colors.primary,
  textDecoration: "none",
  whiteSpace: "nowrap",
  fontSize: "14px",
  fontWeight: "600",
};

const loginLinkStyle = {
  ...buttonSecondaryStyle,
  display: "inline-flex",
  alignItems: "center",
  padding: "10px 18px",
  textDecoration: "none",
  whiteSpace: "nowrap",
};

const registerBtn = {
  ...buttonPrimaryStyle,
  display: "inline-flex",
  alignItems: "center",
  padding: "10px 18px",
  textDecoration: "none",
  whiteSpace: "nowrap",
};

const accountActionsStyle = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  flex: "0 1 auto",
  justifyContent: "flex-end",
  flexWrap: "wrap",
};

const profileWrapStyle = {
  position: "relative",
};

const profileBaseStyle = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  background: "var(--sh-glass-bg)",
  backdropFilter: "var(--sh-glass-filter)",
  WebkitBackdropFilter: "var(--sh-glass-filter)",
  border: `1px solid ${colors.glassBorder}`,
  borderRadius: "999px",
  padding: "5px 12px 5px 5px",
};

const profileButtonStyle = (hover, open) => ({
  ...profileBaseStyle,
  cursor: "pointer",
  transition: "transform 180ms ease, box-shadow 180ms ease, background 180ms ease, border-color 180ms ease",
  background: hover || open ? "var(--sh-glass-bg-strong)" : "var(--sh-glass-bg)",
  boxShadow: hover || open ? "var(--sh-shadow-md)" : "var(--sh-shadow-sm)",
  transform: hover || open ? "translateY(-1px)" : "translateY(0)",
});

const profileAvatarStyle = {
  width: "36px",
  height: "36px",
  borderRadius: "50%",
  background: "linear-gradient(135deg, var(--sh-primary), var(--sh-primary-deep))",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35), 0 4px 10px rgba(var(--sh-primary-rgb), 0.3)",
  color: "white",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: "800",
  overflow: "hidden",
  flex: "0 0 auto",
};

const avatarImageStyle = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const profileCopyStyle = {
  display: "grid",
  lineHeight: "1.2",
  fontSize: "13px",
  color: colors.text,
};

const profileNameStyle = {
  maxWidth: "clamp(86px, 18vw, 180px)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const profileRoleStyle = {
  color: colors.muted,
};

const profileChevronStyle = (open) => ({
  color: colors.primary,
  marginLeft: "2px",
  transition: "transform 180ms ease",
  transform: open ? "rotate(180deg)" : "rotate(0deg)",
});

const profileMenuStyle = {
  position: "absolute",
  right: 0,
  top: "calc(100% + 10px)",
  minWidth: "228px",
  ...glassStrongStyle,
  borderRadius: "var(--sh-radius-lg)",
  padding: "8px",
  display: "grid",
  gap: "6px",
  zIndex: 999,
};

const profileMenuItemStyle = (hover) => ({
  background: hover ? "rgba(var(--sh-primary-rgb), 0.12)" : "transparent",
  border: "none",
  borderRadius: "12px",
  textAlign: "left",
  padding: "10px 12px",
  color: hover ? colors.primaryDark : colors.text,
  cursor: "pointer",
  transform: hover ? "translateX(2px)" : "translateX(0)",
  transition: "background 180ms ease, color 180ms ease, transform 180ms ease",
});

const profileLogoutItemStyle = (hover) => ({
  ...profileMenuItemStyle(hover),
  color: colors.primaryDark,
});

const accountOverlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(10, 12, 20, 0.34)",
  backdropFilter: "blur(10px) saturate(1.2)",
  WebkitBackdropFilter: "blur(10px) saturate(1.2)",
  animation: "scholarHubFadeIn 180ms ease both",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "clamp(12px, 4vw, 22px)",
  zIndex: 1200,
};

const accountModalStyle = {
  width: "min(640px, 100%)",
  maxHeight: "calc(100vh - 32px)",
  overflowY: "auto",
  ...glassStrongStyle,
  borderRadius: "var(--sh-radius-xl)",
  padding: "clamp(16px, 4vw, 22px)",
};

const accountModalHeaderStyle = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "16px",
  marginBottom: "16px",
};

const modalEyebrowStyle = {
  display: "inline-flex",
  width: "fit-content",
  background: colors.primarySoft,
  color: colors.primaryDark,
  border: `1px solid rgba(var(--sh-primary-rgb), 0.28)`,
  borderRadius: "999px",
  padding: "6px 10px",
  fontSize: "12px",
  fontWeight: "800",
  marginBottom: "10px",
};

const accountModalTitleStyle = {
  margin: 0,
  color: colors.text,
  fontSize: "clamp(22px, 6vw, 28px)",
  lineHeight: 1.1,
};

const modalCopyStyle = {
  margin: "6px 0 0",
  color: colors.muted,
  lineHeight: 1.5,
  fontSize: "14px",
};

const modalCloseButtonStyle = {
  width: "32px",
  height: "32px",
  flex: "0 0 auto",
  borderRadius: "50%",
  border: "none",
  background: "rgba(120, 120, 128, 0.16)",
  color: colors.muted,
  fontSize: "20px",
  lineHeight: 1,
  cursor: "pointer",
  display: "grid",
  placeItems: "center",
};

const profileHeroCardStyle = {
  display: "flex",
  alignItems: "center",
  gap: "14px",
  padding: "16px",
  borderRadius: "var(--sh-radius-lg)",
  border: `1px solid ${colors.glassBorder}`,
  background: "linear-gradient(90deg, var(--sh-header-start) 40%, var(--sh-header-end))",
  boxShadow: "var(--sh-glass-highlight)",
  marginBottom: "16px",
};

const profileAvatarStackStyle = {
  display: "grid",
  gap: "8px",
  justifyItems: "center",
};

const profileHeroAvatarStyle = {
  ...profileAvatarStyle,
  position: "relative",
  width: "64px",
  height: "64px",
  fontSize: "24px",
};

const profileHeroCopyStyle = {
  display: "grid",
  gap: "5px",
  minWidth: 0,
};

const profileStatusStyle = {
  display: "inline-flex",
  alignItems: "center",
  width: "fit-content",
  padding: "5px 10px",
  borderRadius: "999px",
  background: "linear-gradient(135deg, var(--sh-primary), var(--sh-primary-deep))",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.3)",
  color: "white",
  fontSize: "12px",
  fontWeight: "700",
};

const profileHeroNameStyle = {
  color: colors.text,
  fontSize: "clamp(20px, 6vw, 28px)",
  lineHeight: 1.1,
};

const profileHeroRoleStyle = {
  color: colors.muted,
  fontWeight: "700",
};

const hiddenFileInputStyle = {
  display: "none",
};

const avatarActionsStyle = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  flexWrap: "wrap",
};

const avatarHintStyle = {
  color: colors.muted,
  fontSize: "12px",
};

const avatarChooseButtonStyle = {
  ...buttonSecondaryStyle,
  padding: "9px 14px",
  fontSize: "13px",
};

const avatarMessageStyle = (tone) => ({
  color:
    tone === "error"
      ? "var(--viz-critical-ink)"
      : tone === "success"
        ? "var(--viz-good-ink)"
        : colors.muted,
  fontSize: "12px",
  fontWeight: "700",
});

// The photo is the button: a camera badge on its lower edge says so, and
// the whole circle is the click target rather than only the small pill.
const avatarPickerStyle = {
  position: "relative",
  padding: 0,
  border: "none",
  background: "transparent",
  borderRadius: "50%",
  cursor: "pointer",
  display: "block",
};

const avatarCameraBadgeStyle = {
  position: "absolute",
  right: "-2px",
  bottom: "-2px",
  width: "24px",
  height: "24px",
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  background: "var(--sh-surface-solid)",
  color: colors.primaryDark,
  border: "1px solid var(--sh-glass-border)",
  boxShadow: "var(--sh-shadow-sm)",
};

const avatarBusyOverlayStyle = {
  position: "absolute",
  inset: 0,
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  background: "rgba(0, 0, 0, 0.38)",
};

const avatarSpinnerStyle = {
  width: "22px",
  height: "22px",
  borderRadius: "50%",
  border: "2.5px solid rgba(255, 255, 255, 0.35)",
  borderTopColor: "#ffffff",
};

const profileFieldsGridStyle = {
  display: "grid",
  gap: "8px",
};

const profileFieldStyle = {
  display: "grid",
  gap: "5px",
};

const profileFieldLabelStyle = {
  color: colors.muted,
  fontSize: "13px",
  fontWeight: "700",
};

const profileInputStyle = {
  ...inputStyle,
  minHeight: "46px",
  padding: "10px 12px",
  fontWeight: "600",
};

const profileReadOnlyInputStyle = {
  ...profileInputStyle,
  opacity: 0.78,
  cursor: "not-allowed",
};

const profileModalFooterStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap",
  marginTop: "16px",
};

const profileHintStyle = {
  color: colors.muted,
  fontSize: "12px",
  lineHeight: 1.5,
  margin: 0,
  marginRight: "auto",
};

const profileMessageStyle = {
  color: colors.primaryDark,
  fontSize: "12px",
  fontWeight: "800",
  marginRight: "auto",
};

const settingsFormStyle = {
  display: "grid",
  gap: "12px",
};

const settingsGroupStyle = {
  display: "grid",
  gap: "10px",
};

const settingsGroupTitleStyle = {
  margin: "0 0 0 4px",
  fontSize: "12px",
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: colors.muted,
};

const settingRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "14px",
  padding: "14px 16px",
  cursor: "pointer",
};

const selectRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "14px",
  flexWrap: "wrap",
  padding: "14px 16px",
};

const inlineSelectStyle = {
  width: "auto",
  minWidth: "180px",
  flex: "0 1 auto",
  padding: "8px 34px 8px 12px",
  fontSize: "13.5px",
};

const settingCopyStyle = {
  display: "grid",
  gap: "4px",
  minWidth: 0,
};

const settingTitleStyle = {
  color: colors.text,
  fontSize: "14px",
};

const settingsFooterStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "14px",
  flexWrap: "wrap",
  marginTop: "4px",
};

const settingsHintStyle = {
  color: colors.muted,
  fontSize: "12px",
  lineHeight: 1.5,
  margin: 0,
  marginRight: "auto",
};

const secondaryActionStyle = {
  ...buttonSecondaryStyle,
};

const modalDoneButtonStyle = {
  ...buttonPrimaryStyle,
};

const heroStyle = {
  minHeight: "clamp(360px, 62vw, 430px)",
  display: "flex",
  alignItems: "center",
  padding: "clamp(36px, 8vw, 60px) clamp(18px, 7vw, 60px)",
  backgroundColor: colors.pageAlt,
  backgroundImage: "var(--sh-home-hero-overlay), url('/bg.png')",
  backgroundSize: "cover, cover",
  backgroundPosition: "center, right 62%",
  backgroundRepeat: "no-repeat",
  borderBottom: `1px solid ${colors.border}`,
  boxShadow: "var(--sh-home-hero-shadow)",
};

const heroContent = {
  maxWidth: "650px",
};

const badgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  background: "var(--sh-glass-bg-strong)",
  backdropFilter: "var(--sh-glass-filter)",
  WebkitBackdropFilter: "var(--sh-glass-filter)",
  color: colors.primaryDark,
  padding: "9px 16px",
  borderRadius: "999px",
  fontWeight: "700",
  fontSize: "13.5px",
  border: `1px solid ${colors.glassBorder}`,
  boxShadow: "var(--sh-shadow-sm)",
};

const heroTitle = {
  fontSize: "clamp(42px, 13vw, 70px)",
  margin: "25px 0 10px",
  color: colors.text,
  lineHeight: 1,
};

const heroText = {
  fontSize: "clamp(16px, 4vw, 20px)",
  lineHeight: "1.6",
  color: colors.text,
  maxWidth: "620px",
};

const heroActionsStyle = {
  display: "flex",
  gap: "12px",
  flexWrap: "wrap",
  alignItems: "center",
};

const primaryBtn = {
  ...buttonPrimaryStyle,
  padding: "14px 24px",
  fontSize: "15px",
  minHeight: "50px",
  width: "min(100%, 280px)",
};

const secondaryBtn = {
  ...buttonSecondaryStyle,
  padding: "14px 24px",
  fontSize: "15px",
  minHeight: "50px",
  width: "min(100%, 220px)",
};

const cardsSection = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(230px, 100%), 1fr))",
  gap: "clamp(16px, 4vw, 30px)",
  padding: "clamp(24px, 6vw, 40px) clamp(18px, 7vw, 60px)",
};

const cardStyle = {
  ...glassStyle,
  color: colors.text,
  padding: "28px",
  borderRadius: "var(--sh-radius-xl)",
  width: "100%",
};

export default Home;
