import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api, { getUploadUrl } from "../api";
import { DEFAULT_SETTINGS, getSavedSettings, saveSettings } from "../settings";
import { colors } from "../sharedStyles";

const USER_CHANGED_EVENT = "scholarHubUserChanged";

const getCurrentUser = () => {
  try {
    return JSON.parse(localStorage.getItem("currentUser"));
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
  const [settings, setSettings] = useState(getSavedSettings);
  const [selectedAvatar, setSelectedAvatar] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [avatarMessage, setAvatarMessage] = useState("");
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
  const schoolIdValue = user?.schoolIdNumber || user?.school_id_number || "Not available";
  const accentColor = settings.accent === "amber" ? "#d97706" : colors.primary;

  const syncStoredUser = (updates) => {
    const currentUser = getCurrentUser() || user || {};
    const nextUser = { ...currentUser, ...updates };
    localStorage.setItem("currentUser", JSON.stringify(nextUser));
    setUser(nextUser);
    window.dispatchEvent(new CustomEvent(USER_CHANGED_EVENT, { detail: nextUser }));
    return nextUser;
  };

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

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

  const handleProfileFieldChange = (key) => (event) => {
    setProfileForm((current) => ({
      ...current,
      [key]: event.target.value,
    }));
    setProfileMessage("");
  };

  const handleAvatarFileChange = (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setAvatarMessage("Please choose an image file.");
      event.target.value = "";
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      setAvatarMessage("Choose an image under 3 MB.");
      event.target.value = "";
      return;
    }

    setSelectedAvatar(file);
    setAvatarPreview(URL.createObjectURL(file));
    setAvatarMessage("Photo selected. Save it to set your avatar.");
  };

  const handleAvatarUpload = async () => {
    if (!selectedAvatar || !user) {
      setAvatarMessage("Choose a photo before saving.");
      return;
    }

    const formData = new FormData();
    formData.append("avatar", selectedAvatar);

    if (user.id) {
      formData.append("id", user.id);
    }

    if (user.email) {
      formData.append("email", user.email);
    }

    setAvatarSaving(true);
    setAvatarMessage("Saving photo...");

    try {
      const response = await api.put("/users/avatar", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const nextAvatarPath = response.data?.avatarPath;

      syncStoredUser({
        avatarPath: nextAvatarPath,
        avatar_path: nextAvatarPath,
      });
      setSelectedAvatar(null);
      setAvatarPreview("");
      setAvatarMessage("Profile photo updated.");

      if (avatarInputRef.current) {
        avatarInputRef.current.value = "";
      }
    } catch (error) {
      console.log("Avatar upload error:", error);
      setAvatarMessage(error.response?.data?.message || "Unable to save this photo.");
    } finally {
      setAvatarSaving(false);
    }
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
        id: user?.id,
        email: user?.email,
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
    localStorage.removeItem("currentUser");
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
                  <div style={profileMenuStyle}>
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
              <Link to="/login" style={orangeNavLinkStyle}>
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
          <section style={accountModalStyle}>
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
                    <div style={profileHeroAvatarStyle}>
                      {avatarSrc ? (
                        <img src={avatarSrc} alt="" style={avatarImageStyle} />
                      ) : (
                        avatarLetter
                      )}
                    </div>
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarFileChange}
                      style={hiddenFileInputStyle}
                    />
                  </div>
                  <div style={profileHeroCopyStyle}>
                    <span style={profileStatusStyle(accentColor)}>Active account</span>
                    <strong style={profileHeroNameStyle}>{fullName}</strong>
                    <span style={profileHeroRoleStyle}>{roleValue} Workspace</span>
                    <div style={avatarActionsStyle}>
                      <button
                        type="button"
                        style={avatarChooseButtonStyle}
                        onClick={() => avatarInputRef.current?.click()}
                      >
                        Upload Photo
                      </button>
                      <button
                        type="button"
                        style={avatarSaveButtonStyle(!selectedAvatar || avatarSaving)}
                        onClick={handleAvatarUpload}
                        disabled={!selectedAvatar || avatarSaving}
                      >
                        {avatarSaving ? "Saving..." : "Set Photo"}
                      </button>
                    </div>
                    {avatarMessage && <span style={avatarMessageStyle}>{avatarMessage}</span>}
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
                <div style={settingsGridStyle}>
                  {[
                    ["emailNotifications", "Email notifications", "Get application and announcement updates."],
                    ["autoRefresh", "Auto refresh", "Keep dashboard counts and feeds live."],
                    ["announcementDigest", "Announcement digest", "Bundle campus updates into a summary."],
                    ["darkMode", "Dark mode", "Use the dark dashboard theme."],
                    ["compactMode", "Compact mode", "Tighten spacing across dashboard cards."],
                    ["showStatusBadges", "Show status badges", "Highlight application and notification states."],
                  ].map(([key, title, copy]) => (
                    <label key={key} style={settingRowStyle}>
                      <span style={settingCopyStyle}>
                        <strong style={settingTitleStyle}>{title}</strong>
                        <span style={modalCopyStyle}>{copy}</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={Boolean(settings[key])}
                        onChange={handleToggleChange(key)}
                        style={switchStyle}
                      />
                    </label>
                  ))}

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
                      value={settings.defaultDashboard}
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
                  <h3 style={detailTitleStyle}>Quick Settings Summary</h3>
                  <div style={settingsSummaryGridStyle}>
                    {[
                      ["Notifications", settings.emailNotifications ? "On" : "Off"],
                      ["Auto refresh", settings.autoRefresh ? "On" : "Off"],
                      ["Digest", settings.announcementDigest ? "On" : "Off"],
                      ["Theme", settings.darkMode ? "Dark" : "Light"],
                      ["Compact", settings.compactMode ? "On" : "Off"],
                    ].map(([label, value]) => (
                      <div key={label} style={summaryItemStyle}>
                        <span style={summaryLabelStyle}>{label}</span>
                        <strong style={summaryValueStyle}>{value}</strong>
                      </div>
                    ))}
                  </div>
                </section>

                <div style={settingsFooterStyle}>
                  <div style={accentPreviewStyle(accentColor)}>
                    <span style={accentDotStyle(accentColor)} />
                    <span>Accent preview</span>
                  </div>
                  <p style={settingsHintStyle}>
                    Changes are saved locally and used across your current session.
                  </p>
                  <button
                    type="button"
                    style={secondaryActionStyle}
                    onClick={() => setSettings({ ...DEFAULT_SETTINGS })}
                  >
                    Reset
                  </button>
                  <button type="submit" style={modalDoneButtonStyle}>
                    Save Changes
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
  minHeight: "72px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "clamp(12px, 4vw, 28px)",
  padding: "clamp(14px, 3vw, 18px) clamp(16px, 5vw, 32px)",
  background: "var(--sh-topbar-bg)",
  borderBottom: `1px solid ${colors.border}`,
  boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
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

const registerBtn = {
  background: colors.primary,
  color: "white",
  padding: "10px 18px",
  borderRadius: "8px",
  textDecoration: "none",
  whiteSpace: "nowrap",
  fontWeight: "700",
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
  background: colors.page,
  border: `1px solid ${colors.border}`,
  borderRadius: "999px",
  padding: "7px 12px 7px 7px",
};

const profileButtonStyle = (hover, open) => ({
  ...profileBaseStyle,
  cursor: "pointer",
  transition: "transform 180ms ease, box-shadow 180ms ease, background 180ms ease, border-color 180ms ease",
  background: hover || open ? colors.pageAlt : colors.page,
  boxShadow: hover || open ? "0 14px 30px rgba(249,115,22,0.18)" : "0 8px 20px rgba(0,0,0,0.05)",
  transform: hover || open ? "translateY(-1px)" : "translateY(0)",
});

const profileAvatarStyle = {
  width: "38px",
  height: "38px",
  borderRadius: "50%",
  background: colors.primary,
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
  minWidth: "220px",
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: "14px",
  boxShadow: "0 18px 40px rgba(0,0,0,0.12)",
  padding: "8px",
  display: "grid",
  gap: "6px",
  zIndex: 999,
};

const profileMenuItemStyle = (hover) => ({
  background: hover ? colors.pageAlt : "transparent",
  border: "none",
  borderRadius: "10px",
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
  background: "rgba(15, 23, 42, 0.34)",
  backdropFilter: "blur(4px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "clamp(12px, 4vw, 22px)",
  zIndex: 1200,
};

const accountModalStyle = {
  width: "min(760px, 100%)",
  maxHeight: "calc(100vh - 32px)",
  overflowY: "auto",
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: "18px",
  boxShadow: "0 28px 70px rgba(0,0,0,0.2)",
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
  border: `1px solid ${colors.border}`,
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
  width: "38px",
  height: "38px",
  borderRadius: "50%",
  border: "none",
  background: "transparent",
  color: colors.primary,
  fontSize: "24px",
  lineHeight: 1,
  cursor: "pointer",
};

const profileHeroCardStyle = {
  display: "flex",
  alignItems: "center",
  gap: "14px",
  padding: "16px",
  borderRadius: "16px",
  border: `1px solid ${colors.border}`,
  background: "linear-gradient(90deg, var(--sh-header-start) 40%, var(--sh-header-end))",
  boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
  marginBottom: "16px",
};

const profileAvatarStackStyle = {
  display: "grid",
  gap: "8px",
  justifyItems: "center",
};

const profileHeroAvatarStyle = {
  ...profileAvatarStyle,
  width: "64px",
  height: "64px",
  fontSize: "24px",
};

const profileHeroCopyStyle = {
  display: "grid",
  gap: "5px",
  minWidth: 0,
};

const profileStatusStyle = (accentColor) => ({
  display: "inline-flex",
  alignItems: "center",
  width: "fit-content",
  padding: "5px 9px",
  borderRadius: "999px",
  background: accentColor,
  color: "white",
  fontSize: "12px",
  fontWeight: "700",
});

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

const avatarChooseButtonStyle = {
  background: colors.surface,
  color: colors.primary,
  border: `1px solid ${colors.border}`,
  borderRadius: "10px",
  padding: "9px 12px",
  fontWeight: "700",
  cursor: "pointer",
};

const avatarSaveButtonStyle = (disabled) => ({
  background: disabled ? colors.border : colors.primary,
  color: disabled ? colors.muted : "white",
  border: "none",
  borderRadius: "10px",
  padding: "9px 12px",
  fontWeight: "700",
  cursor: disabled ? "not-allowed" : "pointer",
  boxShadow: disabled ? "none" : "0 10px 24px rgba(249,115,22,0.22)",
});

const avatarMessageStyle = {
  color: colors.muted,
  fontSize: "12px",
  fontWeight: "700",
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
  width: "100%",
  minHeight: "46px",
  border: `1px solid ${colors.border}`,
  borderRadius: "10px",
  background: colors.field,
  color: colors.text,
  padding: "10px 12px",
  fontWeight: "700",
  outlineColor: colors.primary,
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

const settingsGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))",
  gap: "12px",
};

const settingRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "14px",
  padding: "14px",
  border: `1px solid ${colors.border}`,
  borderRadius: "14px",
  background: colors.field,
};

const settingCopyStyle = {
  display: "grid",
  gap: "2px",
};

const settingTitleStyle = {
  color: colors.text,
};

const switchStyle = {
  width: "18px",
  height: "18px",
  accentColor: colors.primary,
  flex: "0 0 auto",
};

const selectFieldStyle = {
  display: "grid",
  gap: "8px",
  padding: "14px",
  borderRadius: "14px",
  border: `1px solid ${colors.border}`,
  background: colors.field,
};

const selectLabelStyle = {
  color: colors.text,
  fontWeight: "700",
};

const selectStyle = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: "10px",
  border: `1px solid ${colors.border}`,
  background: colors.surface,
  color: colors.text,
  outlineColor: colors.primary,
};

const settingsSummaryStyle = {
  display: "grid",
  gap: "12px",
  padding: "16px",
  borderRadius: "16px",
  border: `1px solid ${colors.border}`,
  background: colors.surface,
};

const detailTitleStyle = {
  margin: 0,
  color: colors.text,
};

const settingsSummaryGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(110px, 100%), 1fr))",
  gap: "10px",
};

const summaryItemStyle = {
  display: "grid",
  gap: "4px",
  padding: "12px 14px",
  borderRadius: "14px",
  border: `1px solid ${colors.border}`,
  background: colors.field,
};

const summaryLabelStyle = {
  color: colors.muted,
  fontSize: "12px",
  fontWeight: "700",
};

const summaryValueStyle = {
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
  background: colors.surface,
  color: colors.primary,
  padding: "12px 18px",
  border: `1px solid ${colors.border}`,
  borderRadius: "10px",
  fontWeight: "700",
  cursor: "pointer",
};

const accentPreviewStyle = (accentColor) => ({
  display: "flex",
  alignItems: "center",
  gap: "10px",
  color: accentColor,
  fontWeight: "700",
});

const accentDotStyle = (accentColor) => ({
  width: "12px",
  height: "12px",
  borderRadius: "50%",
  background: accentColor,
  boxShadow:
    accentColor === colors.primary
      ? "0 0 0 4px rgba(249,115,22,0.14)"
      : "0 0 0 4px rgba(217,119,6,0.14)",
});

const modalDoneButtonStyle = {
  background: colors.primary,
  color: "white",
  border: "none",
  borderRadius: "10px",
  minHeight: "44px",
  padding: "0 18px",
  fontWeight: "800",
  cursor: "pointer",
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
  background: "rgba(255, 237, 213, 0.82)",
  color: colors.primary,
  padding: "10px 18px",
  borderRadius: "20px",
  fontWeight: "600",
  border: `1px solid ${colors.border}`,
  boxShadow: "0 10px 24px rgba(124, 45, 18, 0.08)",
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
  background: colors.primary,
  color: "white",
  padding: "14px 22px",
  border: "none",
  borderRadius: "10px",
  cursor: "pointer",
  minHeight: "48px",
  width: "min(100%, 280px)",
};

const secondaryBtn = {
  background: colors.surface,
  color: colors.primary,
  padding: "14px 22px",
  border: `1px solid ${colors.border}`,
  borderRadius: "10px",
  cursor: "pointer",
  minHeight: "48px",
  width: "min(100%, 220px)",
};

const cardsSection = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(230px, 100%), 1fr))",
  gap: "clamp(16px, 4vw, 30px)",
  padding: "clamp(24px, 6vw, 40px) clamp(18px, 7vw, 60px)",
};

const cardStyle = {
  background: colors.surface,
  color: colors.text,
  padding: "28px",
  border: `1px solid ${colors.border}`,
  borderRadius: "20px",
  width: "100%",
  boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
};

export default Home;
