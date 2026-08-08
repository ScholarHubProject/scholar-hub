import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import api, { getUploadUrl } from "../api";
import { DEFAULT_SETTINGS, getSavedSettings, saveSettings } from "../settings";
import { buttonPrimaryStyle, colors, mutedTextStyle, statusPillStyle } from "../sharedStyles";

const USER_CHANGED_EVENT = "scholarHubUserChanged";

const getCurrentUser = () => {
  try {
    return JSON.parse(localStorage.getItem("currentUser"));
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

const getNotificationTime = (application) =>
  application.status_updated_at || application.created_at;

const studentLinks = [
  { label: "Home", to: "/" },
  { label: "Scholarships", to: "/scholarships" },
  { label: "Application Form", to: "/application-form" },
  { label: "Track Status", to: "/track-status" },
];

const adminLinks = [
  { label: "Home", to: "/" },
  { label: "Scholarship Management", to: "/manage-scholarship" },
  { label: "Manage Applicants", to: "/manage-applicants" },
  { label: "Reports", to: "/reports" },
  { label: "Announcements", to: "/announcements" },
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
    if (item.type === "Scholarship") return "/manage-scholarship";
    if (item.type === "Announcement") return "/announcements";
    return "/admin-dashboard";
  }

  if (item.type === "Application Update") return "/track-status";
  if (item.type === "Announcement" || item.type === "Announcement Digest") {
    return "/notifications";
  }

  return "/scholarships";
};

const Navbar = () => {
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsNotice, setNotificationsNotice] = useState("");
  const [profileHover, setProfileHover] = useState(false);
  const [notificationHover, setNotificationHover] = useState(false);
  const [hoveredItem, setHoveredItem] = useState(null);
  const [settings, setSettings] = useState(getSavedSettings);
  const [user, setUser] = useState(getCurrentUser);
  const [selectedAvatar, setSelectedAvatar] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [avatarMessage, setAvatarMessage] = useState("");
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
  const userEmail = user?.email;
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
  const accentClass = settings.accent === "orange" ? "orange" : "amber";
  const accentColor = accentClass === "orange" ? colors.primary : "#d97706";
  const avatarSrc = getUploadUrl(avatarPreview || user?.avatarPath || user?.avatar_path);
  const activeInfoPanel = sidebarInfoPanels.find(
    (panel) => panel.id === activeInfoPanelId
  );

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

  const loadNotifications = useCallback(
    async ({ showLoading = true } = {}) => {
      const requestId = notificationsRequestRef.current + 1;
      notificationsRequestRef.current = requestId;

      if (!userRole || !settings.emailNotifications) {
        setNotifications([]);
        setNotificationsLoading(false);
        setNotificationsNotice("");
        return;
      }

      if (showLoading) {
        setNotificationsLoading(true);
      }

      try {
        if (userRole === "Admin") {
          const response = await api.get("/admin/recent-activity");

          if (requestId !== notificationsRequestRef.current) return;

          setNotifications(
            Array.isArray(response.data)
              ? response.data.map((activity) => ({
                  id: activity.id,
                  type: activity.type || "Activity",
                  title: "Recent Activity",
                  message: activity.message,
                  created_at: activity.created_at,
                }))
              : []
          );
          setNotificationsNotice("");
          return;
        }

        const requests = [api.get("/announcements")];

        if (userEmail) {
          requests.push(api.get("/applications/student", { params: { email: userEmail } }));
        }

        const [announcementsResponse, applicationsResponse] = await Promise.all(requests);

        if (requestId !== notificationsRequestRef.current) return;

        const rawAnnouncements = Array.isArray(announcementsResponse.data)
          ? announcementsResponse.data
          : [];
        const announcementItems =
          settings.announcementDigest && rawAnnouncements.length > 0
            ? [
                {
                  id: "announcement-digest",
                  type: "Announcement Digest",
                  title: `${rawAnnouncements.length} campus update${
                    rawAnnouncements.length === 1 ? "" : "s"
                  }`,
                  message: rawAnnouncements
                    .slice(0, 3)
                    .map((announcement) => announcement.title || announcement.content)
                    .join(" • "),
                  created_at: rawAnnouncements[0]?.created_at,
                },
              ]
            : rawAnnouncements.map((announcement) => ({
                id: `announcement-${announcement.id}`,
                type: "Announcement",
                title: announcement.title || "Announcement",
                message: announcement.content,
                created_at: announcement.created_at,
              }));

        const applicationItems =
          userEmail && applicationsResponse && Array.isArray(applicationsResponse.data)
            ? applicationsResponse.data.map((application) => ({
                id: `application-${application.id}`,
                type: "Application Update",
                title: application.scholarship_title || "Application",
                message: `${application.status}${
                  application.remarks ? ` - ${application.remarks}` : ""
                }`,
                created_at: getNotificationTime(application),
              }))
            : [];

        setNotifications(
          [...announcementItems, ...applicationItems].sort(
            (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
          )
        );
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
    [
      settings.announcementDigest,
      settings.emailNotifications,
      userEmail,
      userRole,
    ]
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
    localStorage.removeItem("currentUser");
    setOpen(false);
    setProfileOpen(false);
    setProfileModalOpen(false);
    setSettingsOpen(false);
    setNotificationsOpen(false);
    setActiveInfoPanelId(null);
    navigate("/login");
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

  const closeAccountModal = () => {
    setProfileModalOpen(false);
    setSettingsOpen(false);
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

  const openNotification = (item) => {
    setNotificationsOpen(false);
    navigate(getNotificationPath(item, userRole));
  };

  const openInfoPanel = (panelId) => {
    setActiveInfoPanelId(panelId);
  };

  return (
    <>
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
                  {notifications.length > 0 && (
                    <span style={notificationCountStyle}>
                      {notifications.length > 9 ? "9+" : notifications.length}
                    </span>
                  )}
                </button>

                {notificationsOpen && (
                  <div style={notificationPanelStyle}>
                    <div style={notificationHeaderStyle}>
                      <div>
                        <span style={notificationEyebrowStyle}>
                          {user.role === "Admin" ? "Admin Activity" : "Student Updates"}
                        </span>
                        <h3 style={notificationTitleStyle}>Notifications</h3>
                      </div>
                      {user.role === "Student" && (
                        <Link
                          to="/notifications"
                          style={notificationLinkStyle}
                          onClick={() => setNotificationsOpen(false)}
                        >
                          View page
                        </Link>
                      )}
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
                            key={item.id}
                            type="button"
                            style={notificationItemStyle}
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
                            <p style={notificationMessageStyle}>{item.message}</p>
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
        )}
      </header>

      {open && (
        <div style={sidebarStyle}>
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
          <aside style={infoPanelStyle} aria-label={activeInfoPanel.title}>
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
                    <span style={profileStatusPillStyle(accentColor)}>
                      Active account
                    </span>
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
                  <button type="submit" style={profileDoneButtonStyle} disabled={profileSaving}>
                    {profileSaving ? "Saving..." : "Save Profile"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={settingsGridStyle}>
                  <label style={settingRowStyle(settings.compactMode)}>
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

                  <label style={settingRowStyle(settings.compactMode)}>
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

                  <label style={settingRowStyle(settings.compactMode)}>
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

                  <label style={settingRowStyle(settings.compactMode)}>
                    <span style={settingCopyStyle}>
                      <strong style={settingTitleStyle}>Dark mode</strong>
                      <span style={mutedTextStyle}>Use the dark dashboard theme.</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={settings.darkMode}
                      onChange={handleToggleChange("darkMode")}
                      style={switchStyle}
                    />
                  </label>

                  <label style={settingRowStyle(settings.compactMode)}>
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

                  <label style={settingRowStyle(settings.compactMode)}>
                    <span style={settingCopyStyle}>
                      <strong style={settingTitleStyle}>Show status badges</strong>
                      <span style={mutedTextStyle}>Highlight application and notification states.</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={settings.showStatusBadges}
                      onChange={handleToggleChange("showStatusBadges")}
                      style={switchStyle}
                    />
                  </label>

                  <div style={selectFieldStyle(settings.compactMode)}>
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

                  <div style={selectFieldStyle(settings.compactMode)}>
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

                  <div style={selectFieldStyle(settings.compactMode)}>
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
                        <strong style={summaryValueStyle}>
                          {settings.autoRefresh ? "On" : "Off"}
                        </strong>
                      </div>
                      <div style={summaryItemStyle}>
                        <span style={summaryLabelStyle}>Digest</span>
                        <strong style={summaryValueStyle}>
                          {settings.announcementDigest ? "On" : "Off"}
                        </strong>
                      </div>
                      <div style={summaryItemStyle}>
                        <span style={summaryLabelStyle}>Theme</span>
                        <strong style={summaryValueStyle}>
                          {settings.darkMode ? "Dark" : "Light"}
                        </strong>
                      </div>
                      <div style={summaryItemStyle}>
                        <span style={summaryLabelStyle}>Compact</span>
                        <strong style={summaryValueStyle}>
                          {settings.compactMode ? "On" : "Off"}
                        </strong>
                      </div>
                    </div>
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
                  <div style={settingsActionsStyle}>
                    <button
                      type="button"
                      style={secondaryActionStyle}
                      onClick={() => setSettings({ ...DEFAULT_SETTINGS })}
                    >
                      Reset
                    </button>
                    <button type="submit" style={profileDoneButtonStyle}>
                      Save Changes
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

const topbarStyle = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  height: "78px",
  zIndex: 997,
  background: "var(--sh-topbar-bg)",
  borderBottom: `1px solid ${colors.border}`,
  boxShadow: "0 8px 24px rgba(0,0,0,0.07)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 clamp(12px, 4vw, 24px)",
  gap: "clamp(8px, 3vw, 16px)",
};

const hamburgerStyle = {
  background: colors.primary,
  color: "white",
  border: "none",
  borderRadius: "10px",
  padding: "8px 11px",
  fontSize: "18px",
  boxShadow: "0 10px 25px rgba(249,115,22,0.28)",
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
};

const brandTextWrapStyle = {
  display: "grid",
  gap: "1px",
  lineHeight: 1,
  minWidth: 0,
};

const brandNameStyle = {
  display: "block",
};

const brandCampusStyle = {
  display: "block",
  color: colors.muted,
  fontSize: "clamp(11px, 2.4vw, 14px)",
  fontWeight: "800",
  letterSpacing: "0",
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
  width: "clamp(40px, 10vw, 46px)",
  height: "clamp(40px, 10vw, 46px)",
  borderRadius: "50%",
  border: `1px solid ${colors.border}`,
  background: hover || open ? colors.pageAlt : colors.page,
  color: colors.primary,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  position: "relative",
  boxShadow: hover || open ? "0 14px 30px rgba(249,115,22,0.18)" : "0 8px 20px rgba(0,0,0,0.05)",
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
  border: `2px solid ${colors.surface}`,
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
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: "18px",
  boxShadow: "0 24px 60px rgba(0,0,0,0.18)",
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
  border: "1px solid #fecaca",
  background: "#fee2e2",
  color: "#991b1b",
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
  background: colors.page,
  border: `1px solid ${colors.border}`,
  borderRadius: "999px",
  padding: "7px 12px 7px 7px",
};

const profileWrapStyle = {
  position: "relative",
};

const profileButtonStyle = (hover, open) => ({
  ...profileStyle,
  cursor: "pointer",
  transition: "transform 180ms ease, box-shadow 180ms ease, background 180ms ease, border-color 180ms ease",
  background: hover || open ? colors.pageAlt : colors.page,
  boxShadow: hover || open ? "0 14px 30px rgba(249,115,22,0.18)" : "0 8px 20px rgba(0,0,0,0.05)",
  transform: hover || open ? "translateY(-1px)" : "translateY(0)",
});

const avatarStyle = {
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
  color: hover ? colors.primaryDark : colors.primaryDark,
});

const sidebarStyle = {
  position: "fixed",
  top: "70px",
  left: 0,
  width: "min(290px, calc(100vw - 28px))",
  height: "calc(100vh - 70px)",
  background: colors.surface,
  padding: "clamp(16px, 5vw, 22px)",
  borderRight: `1px solid ${colors.border}`,
  boxShadow: "4px 0 20px rgba(0,0,0,0.10)",
  zIndex: 998,
  display: "flex",
  flexDirection: "column",
  gap: "18px",
  animation: "scholarHubSidebarIn 220ms cubic-bezier(0.2, 0.9, 0.2, 1) both",
};

const sidebarProfileStyle = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  background: "linear-gradient(90deg, var(--sh-header-start) 40%, var(--sh-header-end))",
  border: `1px solid ${colors.border}`,
  borderRadius: "18px",
  padding: "16px",
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
  padding: "12px 14px",
  borderRadius: "12px",
  background: colors.page,
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
  background: colors.primarySoft,
  border: `1px solid ${colors.border}`,
  boxShadow: "0 10px 24px rgba(249,115,22,0.13)",
};

const infoOverlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.38)",
  backdropFilter: "blur(5px)",
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
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: "clamp(18px, 5vw, 24px)",
  boxShadow: "-22px 0 70px rgba(0,0,0,0.24)",
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
  borderRadius: "18px",
  background: "linear-gradient(90deg, var(--sh-header-start) 40%, var(--sh-header-end))",
  border: `1px solid ${colors.border}`,
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
  background: colors.field,
  border: `1px solid ${colors.border}`,
  borderRadius: "16px",
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
  boxShadow: "0 0 0 4px rgba(249,115,22,0.13)",
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
  background: "rgba(15, 23, 42, 0.34)",
  backdropFilter: "blur(4px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "clamp(10px, 4vw, 20px)",
  zIndex: 1200,
};

const profileModalStyle = {
  width: "min(560px, 100%)",
  maxHeight: "calc(100vh - 32px)",
  overflowY: "auto",
  background: colors.surface,
  borderRadius: "clamp(16px, 5vw, 18px)",
  border: `1px solid ${colors.border}`,
  boxShadow: "0 28px 70px rgba(0,0,0,0.2)",
  padding: "clamp(14px, 4vw, 18px)",
  display: "grid",
  gap: "12px",
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

const profileCloseButtonStyle = {
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

const profileHeroCardStyle = (compact) => ({
  display: "flex",
  alignItems: "center",
  gap: "14px",
  padding: compact ? "12px" : "16px",
  borderRadius: "16px",
  background: "linear-gradient(90deg, var(--sh-header-start) 40%, var(--sh-header-end))",
  border: `1px solid ${colors.border}`,
  boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
});

const profileAvatarStackStyle = {
  display: "grid",
  gap: "8px",
  justifyItems: "center",
};

const profileHeroAvatarStyle = {
  width: "64px",
  height: "64px",
  borderRadius: "50%",
  background: colors.primary,
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

const profileStatusPillStyle = (accentColor) => ({
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
  fontWeight: "700",
  fontSize: "13px",
};

const profileInputStyle = {
  width: "100%",
  padding: "9px 11px",
  borderRadius: "10px",
  border: `1px solid ${colors.border}`,
  background: colors.field,
  color: colors.text,
  outlineColor: colors.primary,
  fontWeight: "700",
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
  boxShadow: "0 10px 24px rgba(249,115,22,0.25)",
};

const settingsGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))",
  gap: "12px",
};

const settingRowStyle = (compact) => ({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "14px",
  padding: compact ? "12px" : "16px",
  borderRadius: "16px",
  border: `1px solid ${colors.border}`,
  background: colors.field,
});

const settingCopyStyle = {
  display: "grid",
  gap: "6px",
};

const settingTitleStyle = {
  color: colors.text,
};

const switchStyle = {
  width: "18px",
  height: "18px",
  accentColor: colors.primary,
};

const selectFieldStyle = (compact) => ({
  display: "grid",
  gap: "8px",
  padding: compact ? "12px" : "16px",
  borderRadius: "16px",
  border: `1px solid ${colors.border}`,
  background: colors.field,
});

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
};

const detailCardStyle = {
  padding: "16px",
  borderRadius: "16px",
  border: `1px solid ${colors.border}`,
  background: colors.surface,
  display: "grid",
  gap: "12px",
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

export default Navbar;
