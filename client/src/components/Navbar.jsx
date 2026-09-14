import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import api, { clearSession, getStoredUser, getUploadUrl } from "../api";
import { DEFAULT_SETTINGS } from "../settings";
import { updateSavedAccount } from "../savedAccounts";
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  colors,
  glassStrongStyle,
  inputStyle,
  mutedTextStyle,
  statusPillStyle,
} from "../sharedStyles";
import { AppearanceSettings, Switch, ThemeToggle } from "./appearance";
import { CameraIcon } from "./icons";
import { useSettings } from "../useSettings";

const USER_CHANGED_EVENT = "scholarHubUserChanged";

const getCurrentUser = () => {
  try {
    return getStoredUser();
  } catch {
    return null;
  }
};

const formatDate = (value) => {
  if (!value) return "Just now";

  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// The institutional strip shows which term the campus is currently in.
// Mirrors termForDate() in server/analytics.js: the academic year opens
// in August, the second semester in January, June-July is summer.
const currentTermLabel = (now = new Date()) => {
  const month = now.getMonth();
  const year = now.getFullYear();

  if (month >= 7) return `1st Semester ${year}-${year + 1}`;
  if (month <= 4) return `2nd Semester ${year - 1}-${year}`;
  return `Summer ${year - 1}-${year}`;
};

const studentLinks = [
  { label: "Home", to: "/" },
  { label: "Scholarships", to: "/scholarships" },
  { label: "Application Form", to: "/application-form" },
  { label: "Track Status", to: "/track-status" },
  { label: "Analytics", to: "/analytics" },
  { label: "Outlook", to: "/outlook" },
  { label: "Notifications", to: "/notifications" },
];

const adminLinks = [
  { label: "Home", to: "/" },
  { label: "Scholarship Management", to: "/manage-scholarship" },
  { label: "Manage Applicants", to: "/manage-applicants" },
  { label: "Reports", to: "/reports" },
  { label: "Announcements", to: "/announcements" },
  { label: "Manage Accounts", to: "/manage-users" },
  { label: "Audit Trail", to: "/audit-log" },
  { label: "Notifications", to: "/notifications" },
];

const sidebarInfoPanels = [
  {
    id: "about",
    label: "About Us",
    eyebrow: "Scholar Hub",
    title: "What can Scholar Hub offer us the most?",
    summary:
      "Scholar Hub is an online Scholarship Monitoring System centered on Palawan State University Rizal Campus.",
    points: [
      "To allow students easily find, apply, and submit online required documents for scholarship.",
      "Reducing the burden on scholarship coordinators and reducing transaction times.",
    ],
  },
  {
    id: "terms",
    label: "Terms & Services",
    eyebrow: "Student Guidelines",
    title: "Terms & Services",
    summary:
      "By accessing the Scholar Hub at https://www.Scholarhub.com, you are agreeing to be bound by these terms of services, all applicable laws and regulations, and agree that you are responsible for compliance with any applicable local laws.",
    points: [
      "If you do not agree with any of these terms, you are prohibited from using or accessing this site.",
      "The materials contained in this online Scholarship system are protected by applicable copyright and trademark law.",
    ],
  },
  {
    id: "contact",
    label: "Contact Us",
    eyebrow: "Campus Support",
    title: "Contact Us",
    summary:
      "If you have any questions or concern about our services, please contact us via email.",
    points: [
      "Scholarship Office: PSU Rizal Campus",
      "Email Support: supportScholarhub@gmail.com",
      "Office hours: Monday to Friday, 8:00 AM - 5:00 PM",
    ],
  },
];

const getNotificationPath = (item, role) => {
  if (role === "Admin") {
    if (item.type === "Application") return "/manage-applicants";
    if (item.type === "Announcement") return "/announcements";
    return "/notifications";
  }

  if (item.type === "Application") return "/track-status";

  return "/notifications";
};

const Navbar = () => {
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState(null);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsNotice, setNotificationsNotice] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [profileHover, setProfileHover] = useState(false);
  const [notificationHover, setNotificationHover] = useState(false);
  const [hoveredItem, setHoveredItem] = useState(null);
  // Shared with the sun/moon toggle and every other page: the hook saves
  // through settings.js and repaints the page, so a change here lands
  // everywhere without the sheet having to be closed first.
  const [settings, updateSettings] = useSettings();
  const [user, setUser] = useState(getCurrentUser);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [avatarMessage, setAvatarMessage] = useState(null);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [activeInfoPanelId, setActiveInfoPanelId] = useState(null);
  const [profileForm, setProfileForm] = useState({
    fullName: "",
    schoolIdNumber: "",
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const profileRef = useRef(null);
  const notificationsRef = useRef(null);
  const avatarInputRef = useRef(null);
  const notificationsRequestRef = useRef(0);
  const userRole = user?.role;
  // Undefined on a session that predates the flag, which is treated as
  // verified: the alternative is nagging every existing account about an
  // address the office has been mailing successfully for months.
  const emailUnverified = user?.emailVerified === false;
  const menuLinks = user?.role === "Admin" ? adminLinks : studentLinks;
  const homeLink = menuLinks.find((link) => link.to === "/");
  const roleLinks = menuLinks.filter((link) => link.to !== "/");
  const fullName = useMemo(
    () => user?.fullname || user?.name || user?.full_name || "Signed In User",
    [user]
  );
  const avatarLetter = (fullName || user?.role || "U").charAt(0).toUpperCase();
  const roleValue = user?.role || "Student";
  const emailValue = user?.email || "Not available";
  const avatarSrc = getUploadUrl(avatarPreview || user?.avatarPath || user?.avatar_path);
  const activeInfoPanel = sidebarInfoPanels.find(
    (panel) => panel.id === activeInfoPanelId
  );

  const syncStoredUser = (updates) => {
    const currentUser = getCurrentUser() || user || {};
    const nextUser = { ...currentUser, ...updates };
    localStorage.setItem("currentUser", JSON.stringify(nextUser));
    // A new photo or a corrected name has to reach the login tile too,
    // otherwise the account switcher keeps showing the old one.
    updateSavedAccount(nextUser);
    setUser(nextUser);
    window.dispatchEvent(new CustomEvent(USER_CHANGED_EVENT, { detail: nextUser }));
    return nextUser;
  };

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

  useEffect(
    () => () => {
      if (avatarPreview.startsWith("blob:")) {
        URL.revokeObjectURL(avatarPreview);
      }
    },
    [avatarPreview]
  );

  useEffect(() => {
    const handleOutside = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileOpen(false);
      }

      if (
        notificationsRef.current &&
        !notificationsRef.current.contains(event.target)
      ) {
        setNotificationsOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setProfileOpen(false);
        setProfileModalOpen(false);
        setSettingsOpen(false);
        setNotificationsOpen(false);
        setActiveInfoPanelId(null);
      }
    };

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  // One endpoint, already merged, sorted and carrying its read state. The
  // navbar used to assemble its own feed from /announcements and
  // /applications/student while the notifications page assembled a second one,
  // which meant the bell and the page could disagree about what existed - and
  // neither could ever mark anything read, because nothing recorded that.
  const loadNotifications = useCallback(
    async ({ showLoading = true } = {}) => {
      const requestId = notificationsRequestRef.current + 1;
      notificationsRequestRef.current = requestId;

      if (!userRole || !settings.emailNotifications) {
        setNotifications([]);
        setUnreadCount(0);
        setNotificationsLoading(false);
        setNotificationsNotice("");
        return;
      }

      if (showLoading) {
        setNotificationsLoading(true);
      }

      try {
        const response = await api.get("/notifications");

        if (requestId !== notificationsRequestRef.current) return;

        const items = Array.isArray(response.data?.notifications)
          ? response.data.notifications
          : [];

        // The digest setting collapses the announcements into one line. It is
        // a display choice, so it happens here rather than on the server - the
        // page and the badge still count the same underlying items.
        const announcements = items.filter((item) => item.type === "Announcement");
        const rest = items.filter((item) => item.type !== "Announcement");

        setNotifications(
          settings.announcementDigest && announcements.length > 1
            ? [
                {
                  key: "announcement-digest",
                  type: "Announcement",
                  title: `${announcements.length} campus updates`,
                  body: announcements
                    .slice(0, 3)
                    .map((announcement) => announcement.title)
                    .join(" • "),
                  created_at: announcements[0]?.created_at,
                  read: announcements.every((announcement) => announcement.read),
                },
                ...rest,
              ].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
            : items
        );
        setUnreadCount(response.data?.unreadCount || 0);
        setNotificationsNotice("");
      } catch (error) {
        console.log("Navbar notifications error:", error);
        if (requestId === notificationsRequestRef.current) {
          setNotificationsNotice("Unable to load notifications right now.");
        }
      } finally {
        if (requestId === notificationsRequestRef.current) {
          setNotificationsLoading(false);
        }
      }
    },
    [settings.announcementDigest, settings.emailNotifications, userRole]
  );

  useEffect(() => {
    Promise.resolve().then(() => loadNotifications());

    const intervalId = settings.autoRefresh
      ? window.setInterval(() => loadNotifications({ showLoading: false }), 5000)
      : null;

    const refreshVisibleNotifications = () => {
      if (document.visibilityState === "visible") {
        loadNotifications({ showLoading: false });
      }
    };

    window.addEventListener("focus", refreshVisibleNotifications);
    document.addEventListener("visibilitychange", refreshVisibleNotifications);

    return () => {
      notificationsRequestRef.current += 1;
      if (intervalId) {
        window.clearInterval(intervalId);
      }
      window.removeEventListener("focus", refreshVisibleNotifications);
      document.removeEventListener("visibilitychange", refreshVisibleNotifications);
    };
  }, [loadNotifications, settings.autoRefresh]);

  const handleLogout = () => {
    clearSession();
    setOpen(false);
    setProfileOpen(false);
    setProfileModalOpen(false);
    setSettingsOpen(false);
    setNotificationsOpen(false);
    setActiveInfoPanelId(null);
    navigate("/login");
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

  const dashboardPath =
    user?.role === "Student" && settings.defaultDashboard === "Scholarships"
      ? "/scholarships"
      : user?.role === "Admin"
        ? "/admin-dashboard"
        : "/student-dashboard";
  const handleMyProfile = () => {
    setProfileOpen(false);
    setProfileModalOpen(true);
    setSettingsOpen(false);
    setProfileForm({
      fullName,
      schoolIdNumber:
        user?.schoolIdNumber || user?.school_id_number || "",
    });
    setProfileMessage("");
  };

  const handleSettings = () => {
    setProfileOpen(false);
    setProfileModalOpen(false);
    setSettingsOpen(true);
  };

  const handleChangePassword = () => {
    setProfileOpen(false);
    setProfileModalOpen(false);
    setSettingsOpen(false);
    setPasswordOpen(true);
    setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    setPasswordNotice(null);
  };

  const submitPasswordChange = async (event) => {
    event.preventDefault();

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordNotice({ type: "error", message: "The two new passwords do not match." });
      return;
    }

    setPasswordSaving(true);

    try {
      const response = await api.post("/password/change", {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });

      setPasswordNotice({ type: "success", message: response.data.message });
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (error) {
      setPasswordNotice({
        type: "error",
        message: error.response?.data?.message || "Failed to change password.",
      });
    } finally {
      setPasswordSaving(false);
    }
  };

  const closeAccountModal = () => {
    setProfileModalOpen(false);
    setSettingsOpen(false);
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

  // The address is read from the session on the server, never from anything on
  // this page: a form that emailed whatever was typed into it would be a way to
  // send mail to strangers from the campus domain.
  const handleResendVerification = async () => {
    setResendingVerification(true);

    try {
      const response = await api.post("/email/resend");

      if (response.data?.emailVerified) {
        syncStoredUser({ emailVerified: true });
      }

      window.alert(response.data?.message || "A new confirmation link is on its way.");
    } catch (error) {
      window.alert(
        error.response?.data?.message ||
          "Could not send a confirmation email right now. Please try again."
      );
    } finally {
      setResendingVerification(false);
      setProfileOpen(false);
    }
  };

  const openNotification = (item) => {
    setNotificationsOpen(false);

    // Opening one is reading it. Marked optimistically and without awaiting:
    // the navigation must not wait on a write whose only effect is a badge.
    if (!item.read && item.key !== "announcement-digest") {
      setNotifications((current) =>
        current.map((row) => (row.key === item.key ? { ...row, read: true } : row))
      );
      setUnreadCount((current) => Math.max(0, current - 1));

      api
        .post("/notifications/read", { keys: [item.key] })
        .catch((error) => console.log("Navbar notification read error:", error));
    }

    navigate(getNotificationPath(item, userRole));
  };

  const openInfoPanel = (panelId) => {
    setActiveInfoPanelId(panelId);
  };

  return (
    <>
      {/* Institutional strip. It carries the university and the term the
          campus is in - real information rather than decoration, which is
          also why there is no search box here: a control that does not
          search would be worse than no control. The two lines are stacked
          against the right edge so they read as one institutional block
          instead of two stray labels at opposite ends of the bar. */}
      <div style={utilityStripStyle} className="scholar-utility-strip">
        <div style={utilityBlockStyle} className="scholar-utility-block">
          <span style={utilityInstitutionStyle}>Palawan State University</span>
          <span style={utilityTermStyle} className="scholar-utility-term">
            {currentTermLabel()}
          </span>
        </div>
      </div>

      <header style={topbarStyle} className="scholar-topbar">
        <button onClick={() => setOpen(!open)} style={hamburgerStyle} className="scholar-icon-button">
          ☰
        </button>

        <Link to={dashboardPath} style={brandStyle} className="scholar-brand">
          <img src="/Scholarhub.png" alt="" style={brandLogoStyle} />
          <span style={brandTextWrapStyle}>
            <span style={brandNameStyle}>Scholar Hub</span>
            <span style={brandCampusStyle}>PSU RIZAL CAMPUS</span>
          </span>
        </Link>

        {user && (
          <div style={topbarActionsStyle} className="scholar-topbar-actions">
            <ThemeToggle />

            {["Admin", "Student"].includes(user.role) && (
              <div ref={notificationsRef} style={notificationWrapStyle}>
                <button
                  type="button"
                  aria-label="Open notifications"
                  style={notificationButtonStyle(notificationHover, notificationsOpen)}
                  onClick={() =>
                    setNotificationsOpen((current) => {
                      const nextOpen = !current;
                      if (nextOpen) {
                        loadNotifications({ showLoading: false });
                      }
                      return nextOpen;
                    })
                  }
                  onMouseEnter={() => setNotificationHover(true)}
                  onMouseLeave={() => setNotificationHover(false)}
                >
                  <svg
                    style={notificationIconStyle}
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d="M12 22a2.8 2.8 0 0 0 2.7-2h-5.4A2.8 2.8 0 0 0 12 22Zm7-6.4-1.6-1.8V10a5.4 5.4 0 0 0-4.2-5.3V4a1.2 1.2 0 0 0-2.4 0v.7A5.4 5.4 0 0 0 6.6 10v3.8L5 15.6V17h14v-1.4Z" />
                  </svg>
                  {/* Unread, not total. The old badge printed the size of the
                      feed, so it never went away and stopped meaning anything. */}
                  {unreadCount > 0 && (
                    <span style={notificationCountStyle}>
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </button>

                {notificationsOpen && (
                  <div style={notificationPanelStyle} className="sh-pop-in sh-thin-scroll">
                    <div style={notificationHeaderStyle}>
                      <div>
                        <span style={notificationEyebrowStyle}>
                          {user.role === "Admin" ? "Office Updates" : "Student Updates"}
                        </span>
                        <h3 style={notificationTitleStyle}>Notifications</h3>
                      </div>
                      <Link
                        to="/notifications"
                        style={notificationLinkStyle}
                        onClick={() => setNotificationsOpen(false)}
                      >
                        View page
                      </Link>
                    </div>

                    {notificationsNotice && (
                      <p style={notificationNoticeStyle}>{notificationsNotice}</p>
                    )}

                    {notificationsLoading ? (
                      <p style={notificationEmptyStyle}>Loading notifications...</p>
                    ) : notifications.length === 0 ? (
                      <p style={notificationEmptyStyle}>No notifications yet.</p>
                    ) : (
                      <div style={notificationListStyle}>
                        {notifications.map((item) => (
                          <button
                            key={item.key}
                            type="button"
                            style={
                              item.read
                                ? notificationItemStyle
                                : unreadNotificationItemStyle
                            }
                            onClick={() => openNotification(item)}
                          >
                            <div style={notificationItemHeaderStyle}>
                              {settings.showStatusBadges && (
                                <span style={notificationPillStyle}>{item.type}</span>
                              )}
                              <span style={notificationTimeStyle}>
                                {formatDate(item.created_at)}
                              </span>
                            </div>
                            <strong style={notificationItemTitleStyle}>{item.title}</strong>
                            {item.body && (
                              <p style={notificationMessageStyle}>{item.body}</p>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div ref={profileRef} style={profileWrapStyle}>
              <button
                type="button"
                style={profileButtonStyle(profileHover, profileOpen)}
                className="scholar-profile-button"
                onClick={() => setProfileOpen((current) => !current)}
                onMouseEnter={() => setProfileHover(true)}
                onMouseLeave={() => setProfileHover(false)}
              >
                <div style={avatarStyle}>
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
                    style={profileMenuItemStyle(hoveredItem === "password")}
                    onMouseEnter={() => setHoveredItem("password")}
                    onMouseLeave={() => setHoveredItem(null)}
                    onClick={handleChangePassword}
                  >
                    Change Password
                  </button>

                  {/* Only shown while it is still needed. A permanent
                      "resend confirmation" entry would be one more thing to
                      read past for the people who have nothing to confirm. */}
                  {emailUnverified && (
                    <button
                      type="button"
                      style={profileMenuItemStyle(hoveredItem === "verify")}
                      onMouseEnter={() => setHoveredItem("verify")}
                      onMouseLeave={() => setHoveredItem(null)}
                      onClick={handleResendVerification}
                      disabled={resendingVerification}
                    >
                      {resendingVerification ? "Sending..." : "Resend email confirmation"}
                    </button>
                  )}
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
        )}
      </header>

      {open && (
        <div style={sidebarStyle} className="sh-thin-scroll">
          {user && (
            <div style={sidebarProfileStyle}>
              <div style={largeAvatarStyle}>
                {avatarSrc ? (
                  <img src={avatarSrc} alt="" style={avatarImageStyle} />
                ) : (
                  (user.name || user.role || "U").charAt(0)
                )}
              </div>
              <div>
                <strong>{user.name || "Signed In User"}</strong>
                <p style={roleStyle}>{user.role} Account</p>
              </div>
            </div>
          )}

          <nav style={navListStyle}>
            {homeLink && (
              <Link
                style={{
                  ...linkStyle,
                  ...(location.pathname === homeLink.to ? activeLinkStyle : {}),
                }}
                className={`sidebar-nav-link${
                  location.pathname === homeLink.to ? " is-active" : ""
                }`}
                to={homeLink.to}
                onClick={() => setOpen(false)}
              >
                {homeLink.label}
              </Link>
            )}

            <Link
              style={{
                ...linkStyle,
                ...(location.pathname === dashboardPath ? activeLinkStyle : {}),
              }}
              className={`sidebar-nav-link${
                location.pathname === dashboardPath ? " is-active" : ""
              }`}
              to={dashboardPath}
              onClick={() => setOpen(false)}
            >
              {user?.role === "Admin" ? "Admin Dashboard" : "Student Dashboard"}
            </Link>

            {roleLinks.map((link) => (
              <Link
                key={link.to}
                style={{
                  ...linkStyle,
                  ...(location.pathname === link.to ? activeLinkStyle : {}),
                }}
                className={`sidebar-nav-link${
                  location.pathname === link.to ? " is-active" : ""
                }`}
                to={link.to}
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
            ))}

            {user && (
              <div style={sidebarInfoGroupStyle}>
                <span style={sidebarSectionLabelStyle}>Information</span>
                {sidebarInfoPanels.map((panel) => (
                  <button
                    key={panel.id}
                    type="button"
                    style={{
                      ...sidebarInfoButtonStyle,
                      ...(activeInfoPanelId === panel.id ? activeLinkStyle : {}),
                    }}
                    className={`sidebar-info-button${
                      activeInfoPanelId === panel.id ? " is-active" : ""
                    }`}
                    onClick={() => openInfoPanel(panel.id)}
                  >
                    {panel.label}
                    <span style={sidebarInfoArrowStyle}>›</span>
                  </button>
                ))}
              </div>
            )}
          </nav>

        </div>
      )}

      {activeInfoPanel && (
        <div
          style={infoOverlayStyle}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setActiveInfoPanelId(null);
            }
          }}
        >
          <aside style={infoPanelStyle} className="sh-thin-scroll" aria-label={activeInfoPanel.title}>
            <div style={infoPanelHeaderStyle}>
              <div>
                <span style={modalEyebrowStyle}>{activeInfoPanel.eyebrow}</span>
                <h2 style={infoPanelTitleStyle}>{activeInfoPanel.title}</h2>
              </div>
              <button
                type="button"
                aria-label={`Close ${activeInfoPanel.title}`}
                onClick={() => setActiveInfoPanelId(null)}
                style={profileCloseButtonStyle}
              >
                ×
              </button>
            </div>

            <p style={infoPanelSummaryStyle}>{activeInfoPanel.summary}</p>

            <div style={infoPanelListStyle}>
              {activeInfoPanel.points.map((point) => (
                <div key={point} style={infoPanelItemStyle}>
                  <span style={infoPanelDotStyle} />
                  <span>{point}</span>
                </div>
              ))}
            </div>

            <div style={infoPanelFooterStyle}>
              <span style={infoPanelFooterTextStyle}>
                {user?.name || fullName}, your student workspace stays synced with campus updates.
              </span>
              <button
                type="button"
                style={profileDoneButtonStyle}
                onClick={() => setActiveInfoPanelId(null)}
              >
                Done
              </button>
            </div>
          </aside>
        </div>
      )}

      {passwordOpen && (
        <div
          style={profileOverlayStyle}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setPasswordOpen(false);
            }
          }}
        >
          <form style={passwordModalStyle} className="sh-sheet-in sh-thin-scroll" onSubmit={submitPasswordChange}>
            <div style={profileModalHeaderStyle}>
              <div>
                <span style={modalEyebrowStyle}>Security</span>
                <h2 style={profileModalTitleStyle}>Change Password</h2>
                <p style={mutedTextStyle}>
                  Use at least 8 characters, including a letter and a number.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close change password panel"
                onClick={() => setPasswordOpen(false)}
                style={profileCloseButtonStyle}
              >
                ×
              </button>
            </div>

            <div style={passwordFieldsStyle}>
              {[
                ["Current password", "currentPassword"],
                ["New password", "newPassword"],
                ["Confirm new password", "confirmPassword"],
              ].map(([label, field]) => (
                <label key={field} style={passwordFieldStyle}>
                  <span style={passwordFieldLabelStyle}>{label}</span>
                  <input
                    type="password"
                    required
                    autoComplete={
                      field === "currentPassword" ? "current-password" : "new-password"
                    }
                    value={passwordForm[field]}
                    onChange={(event) => {
                      const { value } = event.target;
                      setPasswordForm((current) => ({ ...current, [field]: value }));
                      setPasswordNotice(null);
                    }}
                    style={passwordInputStyle}
                  />
                </label>
              ))}
            </div>

            {passwordNotice && (
              <p
                style={
                  passwordNotice.type === "success"
                    ? passwordSuccessStyle
                    : passwordErrorStyle
                }
              >
                {passwordNotice.message}
              </p>
            )}

            <div style={passwordFooterStyle}>
              <button
                type="button"
                style={profileCancelButtonStyle}
                onClick={() => setPasswordOpen(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                style={profileDoneButtonStyle}
                disabled={passwordSaving}
              >
                {passwordSaving ? "Saving..." : "Change password"}
              </button>
            </div>
          </form>
        </div>
      )}

      {(profileModalOpen || settingsOpen) && (
        <div
          style={profileOverlayStyle}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeAccountModal();
            }
          }}
        >
          <form
            style={profileModalStyle}
            className="sh-sheet-in sh-thin-scroll"
            onSubmit={async (event) => {
              event.preventDefault();
              if (profileModalOpen) {
                await handleProfileSave();
                return;
              }

              closeAccountModal();
            }}
          >
            <div style={profileModalHeaderStyle}>
              <div>
                <span style={modalEyebrowStyle}>
                  {profileModalOpen ? "My Profile" : "Settings"}
                </span>
                <h2 style={profileModalTitleStyle}>
                  {profileModalOpen ? "Scholar Hub Profile" : "Account Preferences"}
                </h2>
                <p style={mutedTextStyle}>
                  {profileModalOpen
                    ? "Your account details are shown in a dashboard-style profile form."
                    : "Choose how Scholar Hub should behave for your account."}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close account panel"
                onClick={closeAccountModal}
                style={profileCloseButtonStyle}
              >
                ×
              </button>
            </div>

            {profileModalOpen ? (
              <>
                <section style={profileHeroCardStyle(settings.compactMode)}>
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
                    <span style={profileStatusPillStyle}>
                      Active account
                    </span>
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
                  <button type="submit" style={profileDoneButtonStyle} disabled={profileSaving}>
                    {profileSaving ? "Saving..." : "Save Profile"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <AppearanceSettings
                  settings={settings}
                  onChange={updateSettings}
                  compact={settings.compactMode}
                />

                <section style={settingsGroupStyle}>
                  <h3 style={settingsGroupTitleStyle}>Notifications</h3>
                  <div className="sh-list">
                    <label style={settingRowStyle(settings.compactMode)}>
                      <span style={settingCopyStyle}>
                        <strong style={settingTitleStyle}>Email notifications</strong>
                        <span style={mutedTextStyle}>Get application and announcement updates.</span>
                      </span>
                      <Switch
                        checked={settings.emailNotifications}
                        onChange={handleToggleChange("emailNotifications")}
                      />
                    </label>

                    <label style={settingRowStyle(settings.compactMode)}>
                      <span style={settingCopyStyle}>
                        <strong style={settingTitleStyle}>Announcement digest</strong>
                        <span style={mutedTextStyle}>Bundle campus updates into a summary.</span>
                      </span>
                      <Switch
                        checked={settings.announcementDigest}
                        onChange={handleToggleChange("announcementDigest")}
                      />
                    </label>

                    <label style={settingRowStyle(settings.compactMode)}>
                      <span style={settingCopyStyle}>
                        <strong style={settingTitleStyle}>Show status badges</strong>
                        <span style={mutedTextStyle}>Highlight application and notification states.</span>
                      </span>
                      <Switch
                        checked={settings.showStatusBadges}
                        onChange={handleToggleChange("showStatusBadges")}
                      />
                    </label>

                    <div style={selectRowStyle(settings.compactMode)}>
                      <label htmlFor="sh-reminder-frequency" style={settingTitleStyle}>
                        Reminder frequency
                      </label>
                      <select
                        id="sh-reminder-frequency"
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
                    <label style={settingRowStyle(settings.compactMode)}>
                      <span style={settingCopyStyle}>
                        <strong style={settingTitleStyle}>Auto refresh</strong>
                        <span style={mutedTextStyle}>Keep dashboard counts and feeds live.</span>
                      </span>
                      <Switch
                        checked={settings.autoRefresh}
                        onChange={handleToggleChange("autoRefresh")}
                      />
                    </label>

                    <div style={selectRowStyle(settings.compactMode)}>
                      <label htmlFor="sh-default-dashboard" style={settingTitleStyle}>
                        Default dashboard
                      </label>
                      <select
                        id="sh-default-dashboard"
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
                  <div style={settingsActionsStyle}>
                    <button
                      type="button"
                      style={secondaryActionStyle}
                      onClick={() => updateSettings({ ...DEFAULT_SETTINGS })}
                    >
                      Reset
                    </button>
                    <button type="submit" style={profileDoneButtonStyle}>
                      Done
                    </button>
                  </div>
                </div>
              </>
            )}
          </form>
        </div>
      )}
    </>
  );
};

const utilityStripStyle = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  height: "var(--sh-utility-strip)",
  zIndex: 998,
  // The gradient runs deep-to-base left to right so the block on the
  // right sits on the lighter end of the bar and keeps its contrast.
  background:
    "linear-gradient(90deg, var(--sh-utility-bg-deep) 0%, var(--sh-utility-bg) 68%, var(--sh-utility-bg) 100%)",
  color: "var(--sh-utility-ink)",
  boxShadow: "inset 0 -1px 0 rgba(255, 255, 255, 0.09)",
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  padding: "0 clamp(12px, 4vw, 24px)",
};

// The name and the term share a right edge and a hairline rule on their
// left, which is what turns two labels into one heading block.
const utilityBlockStyle = {
  display: "grid",
  justifyItems: "end",
  gap: "2px",
  lineHeight: 1.1,
  minWidth: 0,
  textAlign: "right",
  paddingLeft: "12px",
  borderLeft: "1px solid rgba(255, 255, 255, 0.22)",
};

const utilityInstitutionStyle = {
  fontSize: "13px",
  fontWeight: 700,
  letterSpacing: "0.04em",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: "100%",
};

// A pill rather than plain small caps: the term is a changing value, and
// giving it a container says so without shouting louder than the name.
const utilityTermStyle = {
  fontSize: "10px",
  fontWeight: 600,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
  padding: "2px 9px",
  borderRadius: "999px",
  background: "rgba(255, 255, 255, 0.14)",
  border: "1px solid rgba(255, 255, 255, 0.16)",
};

// The app bar is the first sheet of glass on the page: content scrolls
// underneath it and shows through, blurred, the way an iOS navigation
// bar does. Fixed rather than sticky so the sidebar can hang off it.
const topbarStyle = {
  position: "fixed",
  top: "var(--sh-utility-strip)",
  left: 0,
  right: 0,
  height: "78px",
  zIndex: 997,
  background: "var(--sh-topbar-bg)",
  backdropFilter: "var(--sh-glass-filter-strong)",
  WebkitBackdropFilter: "var(--sh-glass-filter-strong)",
  borderBottom: `1px solid ${colors.glassBorder}`,
  boxShadow: "var(--sh-glass-highlight), 0 10px 30px rgba(15, 23, 42, 0.06)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 clamp(12px, 4vw, 24px)",
  gap: "clamp(8px, 3vw, 16px)",
};

const hamburgerStyle = {
  ...buttonPrimaryStyle,
  borderRadius: "14px",
  padding: "8px 12px",
  fontSize: "18px",
  lineHeight: 1,
};

const brandStyle = {
  color: colors.primary,
  fontWeight: "700",
  fontSize: "clamp(23px, 5vw, 31px)",
  textDecoration: "none",
  whiteSpace: "nowrap",
  display: "inline-flex",
  alignItems: "center",
  gap: "10px",
  minWidth: 0,
  position: "absolute",
  left: "50%",
  top: "50%",
  transform: "translate(-50%, -50%)",
};

const brandLogoStyle = {
  width: "clamp(42px, 8vw, 52px)",
  height: "clamp(42px, 8vw, 52px)",
  flex: "0 0 auto",
  objectFit: "contain",
  display: "block",
  filter: "drop-shadow(0 6px 12px rgba(var(--sh-primary-rgb), 0.3))",
};

const brandTextWrapStyle = {
  display: "grid",
  gap: "3px",
  lineHeight: 1,
  minWidth: 0,
};

const brandNameStyle = {
  display: "block",
  backgroundImage: `linear-gradient(95deg, ${colors.primary}, ${colors.primaryDark})`,
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  // Keeps the painted color as the fallback if background-clip: text is
  // not honoured, so the name never renders invisible.
  WebkitTextFillColor: "transparent",
  color: colors.primary,
  letterSpacing: "-0.01em",
};

const brandCampusStyle = {
  display: "block",
  color: colors.muted,
  fontSize: "clamp(10px, 2.2vw, 12px)",
  fontWeight: "700",
  letterSpacing: "0.16em",
};

const topbarActionsStyle = {
  display: "flex",
  alignItems: "center",
  gap: "clamp(6px, 2vw, 12px)",
  minWidth: 0,
};

const notificationWrapStyle = {
  position: "relative",
};

const notificationButtonStyle = (hover, open) => ({
  width: "clamp(40px, 10vw, 44px)",
  height: "clamp(40px, 10vw, 44px)",
  borderRadius: "50%",
  border: `1px solid ${colors.glassBorder}`,
  background: hover || open ? "var(--sh-glass-bg-strong)" : "var(--sh-glass-bg)",
  backdropFilter: "var(--sh-glass-filter)",
  WebkitBackdropFilter: "var(--sh-glass-filter)",
  color: colors.primary,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  position: "relative",
  boxShadow: hover || open ? "var(--sh-shadow-md)" : "var(--sh-shadow-sm)",
  transform: hover || open ? "translateY(-1px)" : "translateY(0)",
  transition: "transform 180ms ease, box-shadow 180ms ease, background 180ms ease",
});

const notificationIconStyle = {
  width: "21px",
  height: "21px",
  fill: "currentColor",
};

const notificationCountStyle = {
  position: "absolute",
  top: "-4px",
  right: "-4px",
  minWidth: "20px",
  height: "20px",
  borderRadius: "999px",
  background: colors.primary,
  color: "white",
  border: `2px solid ${colors.surfaceSolid}`,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "11px",
  fontWeight: "800",
};

const notificationPanelStyle = {
  position: "absolute",
  right: 0,
  top: "calc(100% + 12px)",
  width: "min(420px, calc(100vw - 32px))",
  maxHeight: "min(620px, calc(100vh - 96px))",
  overflowY: "auto",
  ...glassStrongStyle,
  borderRadius: "var(--sh-radius-lg)",
  padding: "18px",
  display: "grid",
  gap: "12px",
  zIndex: 1000,
};

const notificationHeaderStyle = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "12px",
};

const notificationEyebrowStyle = {
  display: "inline-block",
  background: colors.primarySoft,
  color: colors.primary,
  padding: "6px 10px",
  borderRadius: "999px",
  fontWeight: "700",
  fontSize: "12px",
  marginBottom: "7px",
};

const notificationTitleStyle = {
  margin: 0,
  color: colors.text,
};

const notificationLinkStyle = {
  color: colors.primary,
  fontWeight: "700",
  textDecoration: "none",
  fontSize: "13px",
  whiteSpace: "nowrap",
};

const notificationNoticeStyle = {
  margin: 0,
  padding: "10px 12px",
  borderRadius: "12px",
  border: "1px solid var(--viz-critical)",
  background: "var(--viz-critical-wash)",
  color: "var(--viz-critical-ink)",
  fontWeight: "700",
  fontSize: "13px",
};

const notificationEmptyStyle = {
  ...mutedTextStyle,
  padding: "12px",
  border: `1px solid ${colors.border}`,
  borderRadius: "14px",
  background: colors.field,
};

const notificationListStyle = {
  display: "grid",
  gap: "10px",
};

const notificationItemStyle = {
  display: "grid",
  gap: "8px",
  width: "100%",
  padding: "12px",
  borderRadius: "14px",
  border: `1px solid ${colors.border}`,
  background: colors.field,
  cursor: "pointer",
  textAlign: "left",
};

// Unread carries a left rule as well as a tint, so the two states stay apart
// in both themes and for anyone who cannot see the colour.
const unreadNotificationItemStyle = {
  ...notificationItemStyle,
  borderLeft: `3px solid ${colors.primary}`,
  background: colors.primarySoft,
};

const notificationItemHeaderStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "10px",
  flexWrap: "wrap",
};

const notificationPillStyle = {
  ...statusPillStyle,
  padding: "5px 9px",
  fontSize: "12px",
};

const notificationTimeStyle = {
  color: colors.muted,
  fontSize: "12px",
  fontWeight: "700",
};

const notificationItemTitleStyle = {
  color: colors.text,
};

const notificationMessageStyle = {
  ...mutedTextStyle,
  fontSize: "13px",
};

const profileStyle = {
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

const profileWrapStyle = {
  position: "relative",
};

const profileButtonStyle = (hover, open) => ({
  ...profileStyle,
  cursor: "pointer",
  transition: "transform 180ms ease, box-shadow 180ms ease, background 180ms ease, border-color 180ms ease",
  background: hover || open ? "var(--sh-glass-bg-strong)" : "var(--sh-glass-bg)",
  boxShadow: hover || open ? "var(--sh-shadow-md)" : "var(--sh-shadow-sm)",
  transform: hover || open ? "translateY(-1px)" : "translateY(0)",
});

const avatarStyle = {
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
  color: hover ? colors.primaryDark : colors.primaryDark,
});

// A floating sheet hung from the app bar rather than a full-height rail:
// inset from the edges so the ambient wash shows around it, with the
// same corner radius as a card.
const sidebarStyle = {
  position: "fixed",
  top: "calc(78px + 12px + var(--sh-utility-strip))",
  left: "12px",
  width: "min(300px, calc(100vw - 24px))",
  maxHeight: "calc(100vh - 78px - 24px - var(--sh-utility-strip))",
  overflowY: "auto",
  ...glassStrongStyle,
  borderRadius: "var(--sh-radius-xl)",
  padding: "clamp(14px, 5vw, 18px)",
  zIndex: 998,
  display: "flex",
  flexDirection: "column",
  gap: "16px",
  animation: "scholarHubSidebarIn 260ms cubic-bezier(0.2, 0.9, 0.2, 1) both",
};

const sidebarProfileStyle = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  background: "linear-gradient(90deg, var(--sh-header-start) 40%, var(--sh-header-end))",
  border: `1px solid ${colors.glassBorder}`,
  boxShadow: "var(--sh-glass-highlight)",
  borderRadius: "var(--sh-radius-lg)",
  padding: "14px",
};

const largeAvatarStyle = {
  ...avatarStyle,
  width: "48px",
  height: "48px",
  fontSize: "20px",
};

const roleStyle = {
  margin: "4px 0 0",
  color: colors.muted,
  fontSize: "13px",
};

const navListStyle = {
  display: "grid",
  gap: "10px",
};

const sidebarInfoGroupStyle = {
  display: "grid",
  gap: "9px",
  marginTop: "8px",
  paddingTop: "14px",
  borderTop: `1px solid ${colors.border}`,
};

const sidebarSectionLabelStyle = {
  color: colors.muted,
  fontSize: "12px",
  fontWeight: "800",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  padding: "0 4px",
};

const linkStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "10px",
  color: colors.text,
  textDecoration: "none",
  fontWeight: "600",
  padding: "11px 14px",
  borderRadius: "14px",
  background: "var(--sh-glass-bg-soft)",
  border: "1px solid transparent",
  transition:
    "background 180ms ease, border-color 180ms ease, box-shadow 180ms ease, color 180ms ease, transform 180ms ease",
};

const sidebarInfoButtonStyle = {
  ...linkStyle,
  width: "100%",
  justifyContent: "space-between",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: "15px",
  textAlign: "left",
};

const sidebarInfoArrowStyle = {
  color: colors.primary,
  fontSize: "20px",
  lineHeight: 1,
};

const activeLinkStyle = {
  color: colors.primaryDark,
  background: "rgba(var(--sh-primary-rgb), 0.16)",
  border: `1px solid rgba(var(--sh-primary-rgb), 0.3)`,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.3), 0 10px 24px rgba(var(--sh-primary-rgb), 0.14)",
};

const infoOverlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(10, 12, 20, 0.34)",
  backdropFilter: "blur(10px) saturate(1.2)",
  WebkitBackdropFilter: "blur(10px) saturate(1.2)",
  display: "flex",
  justifyContent: "flex-end",
  padding: "clamp(10px, 4vw, 18px)",
  zIndex: 1210,
  animation: "scholarHubFadeIn 180ms ease both",
};

const infoPanelStyle = {
  width: "min(430px, 100%)",
  height: "100%",
  overflowY: "auto",
  ...glassStrongStyle,
  borderRadius: "var(--sh-radius-xl)",
  padding: "clamp(16px, 5vw, 22px)",
  display: "grid",
  alignContent: "start",
  gap: "18px",
  animation: "scholarHubSlideInRight 260ms cubic-bezier(0.2, 0.9, 0.2, 1) both",
};

const infoPanelHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "18px",
};

const infoPanelTitleStyle = {
  margin: "0 0 4px",
  color: colors.text,
  fontSize: "clamp(24px, 7vw, 30px)",
  lineHeight: 1.1,
};

const infoPanelSummaryStyle = {
  ...mutedTextStyle,
  padding: "18px",
  borderRadius: "var(--sh-radius-lg)",
  background: "linear-gradient(90deg, var(--sh-header-start) 40%, var(--sh-header-end))",
  border: `1px solid ${colors.glassBorder}`,
  boxShadow: "var(--sh-glass-highlight)",
};

const infoPanelListStyle = {
  display: "grid",
  gap: "12px",
};

const infoPanelItemStyle = {
  display: "grid",
  gridTemplateColumns: "12px 1fr",
  alignItems: "start",
  gap: "12px",
  color: colors.text,
  background: "var(--sh-glass-bg-soft)",
  border: `1px solid ${colors.glassBorder}`,
  boxShadow: "var(--sh-glass-highlight)",
  borderRadius: "var(--sh-radius-md)",
  padding: "14px",
  lineHeight: 1.5,
  fontWeight: "650",
};

const infoPanelDotStyle = {
  width: "10px",
  height: "10px",
  borderRadius: "50%",
  marginTop: "7px",
  background: colors.primary,
  boxShadow: "0 0 0 4px rgba(var(--sh-primary-rgb), 0.16)",
};

const infoPanelFooterStyle = {
  display: "grid",
  gap: "14px",
  marginTop: "auto",
  paddingTop: "8px",
};

const infoPanelFooterTextStyle = {
  color: colors.muted,
  fontSize: "13px",
  lineHeight: 1.5,
};

const profileOverlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(10, 12, 20, 0.34)",
  backdropFilter: "blur(10px) saturate(1.2)",
  WebkitBackdropFilter: "blur(10px) saturate(1.2)",
  animation: "scholarHubFadeIn 180ms ease both",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "clamp(10px, 4vw, 20px)",
  zIndex: 1200,
};

const profileModalStyle = {
  width: "min(600px, 100%)",
  maxHeight: "calc(100vh - 32px)",
  overflowY: "auto",
  ...glassStrongStyle,
  borderRadius: "var(--sh-radius-xl)",
  padding: "clamp(16px, 4vw, 22px)",
  display: "grid",
  gap: "16px",
};

const profileModalHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "18px",
};

const modalEyebrowStyle = {
  display: "inline-block",
  background: colors.primarySoft,
  color: colors.primary,
  padding: "6px 12px",
  borderRadius: "999px",
  fontWeight: "700",
  fontSize: "12px",
  marginBottom: "8px",
};

const profileModalTitleStyle = {
  margin: "0 0 4px",
  color: colors.text,
  fontSize: "21px",
};

// The iOS close affordance: a small grey disc, not a bare glyph.
const profileCloseButtonStyle = {
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

const profileHeroCardStyle = (compact) => ({
  display: "flex",
  alignItems: "center",
  gap: "14px",
  padding: compact ? "12px" : "16px",
  borderRadius: "var(--sh-radius-lg)",
  background: "linear-gradient(90deg, var(--sh-header-start) 40%, var(--sh-header-end))",
  border: `1px solid ${colors.glassBorder}`,
  boxShadow: "var(--sh-glass-highlight)",
});

const profileAvatarStackStyle = {
  display: "grid",
  gap: "8px",
  justifyItems: "center",
};

const profileHeroAvatarStyle = {
  position: "relative",
  width: "64px",
  height: "64px",
  borderRadius: "50%",
  background: "linear-gradient(135deg, var(--sh-primary), var(--sh-primary-deep))",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35), 0 8px 18px rgba(var(--sh-primary-rgb), 0.3)",
  color: "white",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: "800",
  fontSize: "24px",
  flex: "0 0 auto",
  overflow: "hidden",
};

const profileHeroCopyStyle = {
  display: "grid",
  gap: "7px",
  minWidth: 0,
};

const profileStatusPillStyle = {
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
  fontSize: "22px",
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
  ...mutedTextStyle,
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
  fontWeight: "700",
  fontSize: "13px",
};

const profileInputStyle = {
  ...inputStyle,
  padding: "10px 12px",
  fontWeight: "600",
};

const profileReadOnlyInputStyle = {
  ...profileInputStyle,
  opacity: 0.78,
  cursor: "not-allowed",
};

const profileMessageStyle = {
  color: colors.primaryDark,
  fontSize: "12px",
  fontWeight: "800",
  marginRight: "auto",
};

const profileModalFooterStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap",
};

const profileHintStyle = {
  ...mutedTextStyle,
  fontSize: "12px",
  marginRight: "auto",
};

const profileDoneButtonStyle = {
  ...buttonPrimaryStyle,
};

const profileCancelButtonStyle = {
  ...buttonSecondaryStyle,
};

const passwordModalStyle = {
  ...profileModalStyle,
  width: "min(440px, 100%)",
};

const passwordFieldsStyle = {
  display: "grid",
  gap: "12px",
};

const passwordFieldStyle = {
  display: "grid",
  gap: "6px",
};

const passwordFieldLabelStyle = {
  fontSize: "13px",
  fontWeight: "700",
  color: colors.muted,
};

const passwordInputStyle = {
  ...inputStyle,
  height: "44px",
};

const passwordFooterStyle = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "10px",
  flexWrap: "wrap",
  marginTop: "4px",
};

const passwordMessageBaseStyle = {
  margin: 0,
  padding: "10px 12px",
  borderRadius: "10px",
  fontSize: "14px",
  fontWeight: "600",
};

const passwordErrorStyle = {
  ...passwordMessageBaseStyle,
  background: "var(--viz-critical-wash)",
  color: "var(--viz-critical-ink)",
  border: "1px solid var(--viz-critical)",
};

const passwordSuccessStyle = {
  ...passwordMessageBaseStyle,
  background: "var(--viz-good-wash)",
  color: "var(--viz-good-ink)",
  border: "1px solid var(--viz-good)",
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

const settingRowStyle = (compact) => ({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "14px",
  padding: compact ? "11px 14px" : "14px 16px",
  cursor: "pointer",
});

const selectRowStyle = (compact) => ({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "14px",
  flexWrap: "wrap",
  padding: compact ? "11px 14px" : "14px 16px",
});

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
  paddingTop: "4px",
};

const settingsHintStyle = {
  ...mutedTextStyle,
  fontSize: "12px",
  marginRight: "auto",
};

const settingsActionsStyle = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
};

const secondaryActionStyle = {
  ...buttonSecondaryStyle,
};

export default Navbar;
