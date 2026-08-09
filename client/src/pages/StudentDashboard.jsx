import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api, { getStoredUser, getUploadUrl } from "../api";
import { getSavedSettings, subscribeToSettings } from "../settings";
import {
  buttonSecondaryStyle,
  cardGridStyle,
  cardStyle,
  colors,
  eyebrowStyle,
  mutedTextStyle,
  pageHeaderStyle,
  pageStyle,
  shellStyle,
  statusPillStyle,
  titleStyle,
} from "../sharedStyles";

const AUTO_SYNC_MS = 5000;
const USER_CHANGED_EVENT = "scholarHubUserChanged";
const WELCOME_CONFETTI_PARTICLES = [
  ["#f97316", "-660px", "-190px", "680deg", "0px", "14px"],
  ["#ffffff", "-610px", "-105px", "-520deg", "24px", "16px"],
  ["#ef4444", "-565px", "-250px", "740deg", "-18px", "15px"],
  ["#f97316", "-520px", "-55px", "-660deg", "30px", "13px"],
  ["#ffffff", "-480px", "-175px", "560deg", "-26px", "17px"],
  ["#ef4444", "-440px", "-285px", "-720deg", "18px", "14px"],
  ["#f97316", "-400px", "-92px", "800deg", "-34px", "16px"],
  ["#ffffff", "-360px", "-220px", "-610deg", "26px", "14px"],
  ["#ef4444", "-325px", "-130px", "690deg", "-22px", "15px"],
  ["#f97316", "-280px", "-310px", "-780deg", "32px", "17px"],
  ["#ffffff", "-238px", "-165px", "540deg", "-28px", "14px"],
  ["#ef4444", "-192px", "-265px", "-700deg", "16px", "16px"],
  ["#f97316", "-150px", "-85px", "620deg", "-24px", "15px"],
  ["#ffffff", "-112px", "-235px", "-560deg", "30px", "17px"],
  ["#ef4444", "-72px", "-145px", "760deg", "-20px", "14px"],
  ["#f97316", "-30px", "-300px", "-640deg", "26px", "16px"],
  ["#ffffff", "24px", "-235px", "620deg", "-24px", "15px"],
  ["#ef4444", "72px", "-115px", "-560deg", "30px", "17px"],
  ["#f97316", "112px", "-275px", "760deg", "-20px", "14px"],
  ["#ffffff", "152px", "-82px", "-640deg", "26px", "16px"],
  ["#ef4444", "198px", "-195px", "720deg", "-30px", "13px"],
  ["#f97316", "245px", "-132px", "-600deg", "22px", "17px"],
  ["#ffffff", "285px", "-270px", "690deg", "-16px", "14px"],
  ["#ef4444", "330px", "-98px", "-740deg", "32px", "16px"],
  ["#f97316", "370px", "-205px", "560deg", "-24px", "15px"],
  ["#ffffff", "415px", "-142px", "-680deg", "26px", "17px"],
  ["#ef4444", "455px", "-292px", "780deg", "-32px", "14px"],
  ["#f97316", "500px", "-170px", "-540deg", "18px", "16px"],
  ["#ffffff", "545px", "-55px", "720deg", "-24px", "15px"],
  ["#ef4444", "590px", "-225px", "-680deg", "34px", "17px"],
  ["#f97316", "635px", "-125px", "640deg", "-18px", "14px"],
  ["#ffffff", "680px", "-260px", "-760deg", "26px", "16px"],
  ["#ef4444", "-630px", "-330px", "820deg", "40px", "13px"],
  ["#f97316", "-545px", "-360px", "-720deg", "-36px", "15px"],
  ["#ffffff", "-455px", "-340px", "670deg", "28px", "14px"],
  ["#ef4444", "-365px", "-375px", "-810deg", "-30px", "16px"],
  ["#f97316", "-275px", "-350px", "730deg", "34px", "13px"],
  ["#ffffff", "-185px", "-390px", "-690deg", "-26px", "15px"],
  ["#ef4444", "-95px", "-345px", "780deg", "24px", "14px"],
  ["#f97316", "5px", "-382px", "-740deg", "-34px", "16px"],
  ["#ffffff", "95px", "-340px", "690deg", "30px", "13px"],
  ["#ef4444", "185px", "-385px", "-800deg", "-24px", "15px"],
  ["#f97316", "275px", "-350px", "720deg", "36px", "14px"],
  ["#ffffff", "365px", "-370px", "-680deg", "-28px", "16px"],
  ["#ef4444", "455px", "-335px", "760deg", "32px", "13px"],
  ["#f97316", "545px", "-365px", "-790deg", "-38px", "15px"],
  ["#ffffff", "635px", "-325px", "700deg", "26px", "14px"],
  ["#ef4444", "700px", "-355px", "-720deg", "-30px", "16px"],
];

const getCurrentUser = () => {
  try {
    return getStoredUser();
  } catch {
    return null;
  }
};

const formatDate = (date) => {
  if (!date) return "Just now";
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const StudentDashboard = () => {
  const [user, setUser] = useState(getCurrentUser);
  const [scholarships, setScholarships] = useState([]);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [settings, setSettings] = useState(getSavedSettings);
  const [showWelcomeConfetti, setShowWelcomeConfetti] = useState(true);
  const syncingRef = useRef(false);
  const userEmail = user?.email;

  const loadDashboard = useCallback(
    async ({ initial = false, silent = false } = {}) => {
      if (syncingRef.current) {
        return;
      }

      syncingRef.current = true;

      if (initial) {
        setLoading(true);
      }
      setRefreshing(true);

      try {
        const requests = [api.get("/scholarships")];

        if (userEmail) {
          requests.push(
            api.get("/applications/student")
          );
        }

        const [scholarshipsResult, applicationsResult] = await Promise.allSettled(requests);

        const scholarshipsSynced = scholarshipsResult.status === "fulfilled";
        const applicationsSynced = !userEmail || applicationsResult?.status === "fulfilled";

        if (scholarshipsSynced) {
          setScholarships(
            Array.isArray(scholarshipsResult.value.data) ? scholarshipsResult.value.data : []
          );
        }

        if (userEmail && applicationsSynced) {
          setApplications(
            Array.isArray(applicationsResult.value.data) ? applicationsResult.value.data : []
          );
        }

        if (!scholarshipsSynced && !applicationsSynced) {
          throw scholarshipsResult.reason || applicationsResult?.reason;
        }

        if (scholarshipsSynced && applicationsSynced) {
          setNotice(null);
        } else if (!silent) {
          setNotice("Some live student data could not sync, but available dashboard data is shown.");
        }
        setLastUpdated(new Date());
      } catch (error) {
        console.log("Student dashboard sync error:", error);
        if (!silent) {
          setNotice("Unable to sync live student data right now.");
        }
      } finally {
        syncingRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [userEmail]
  );

  useEffect(() => subscribeToSettings(setSettings), []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setShowWelcomeConfetti(false);
    }, 10000);

    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    let isActive = true;

    const sync = async () => {
      if (!isActive) return;
      await loadDashboard({ initial: true });
    };

    sync();

    const intervalId = settings.autoRefresh
      ? window.setInterval(() => {
          loadDashboard({ silent: true });
        }, AUTO_SYNC_MS)
      : null;

    const handleFocus = () => {
      if (settings.autoRefresh && document.visibilityState === "visible") {
        loadDashboard({ silent: true });
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);

    return () => {
      isActive = false;
      if (intervalId) {
        window.clearInterval(intervalId);
      }
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [loadDashboard, settings.autoRefresh]);

  const openScholarships = useMemo(
    () => scholarships.filter((scholarship) => scholarship.status !== "Closed"),
    [scholarships]
  );

  const pendingApplications = useMemo(
    () => applications.filter((application) => application.status === "Pending Review"),
    [applications]
  );

  const latestScholarships = scholarships.slice(0, 3);
  const avatarSrc = getUploadUrl(user?.avatarPath || user?.avatar_path);

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

  const statCards = [
    {
      label: "Available Scholarships",
      value: openScholarships.length,
      copy: "Live scholarship posts from the admin office.",
      to: "/scholarships",
      action: "View all",
    },
    {
      label: "Pending Applications",
      value: pendingApplications.length,
      copy: "Applications still waiting for admin review.",
      to: "/track-status",
      action: "Track status",
    },
  ];

  return (
    <div style={pageStyle}>
      <main style={mainStyle}>
        <header style={pageHeaderStyle}>
          <div style={headerTopStyle}>
            <div>
              <span style={eyebrowStyle}>Student Workspace</span>
              <h1 style={titleStyle}>Student Dashboard</h1>
              <p style={mutedTextStyle}>
                Live scholarship posts, announcements, and application updates from the admin.
              </p>
            </div>
            <div style={headerActionsStyle}>
              <span style={liveBadgeStyle}>
                {refreshing ? "Syncing..." : settings.autoRefresh ? "Live" : "Manual"}
              </span>
              <button type="button" style={buttonSecondaryStyle} onClick={() => loadDashboard()} disabled={refreshing}>
                Refresh Now
              </button>
            </div>
          </div>
          <p style={updatedTextStyle}>
            {lastUpdated ? `Last synced ${lastUpdated.toLocaleTimeString()}` : "Waiting for first sync..."}
          </p>
        </header>

        {notice && <div style={noticeStyle}>{notice}</div>}

        <section style={welcomeCardStyle(settings.compactMode)}>
          {showWelcomeConfetti && (
            <div style={welcomeConfettiLayerStyle} aria-hidden="true">
              {WELCOME_CONFETTI_PARTICLES.map(([color, x, y, rotate, drift, size], index) => (
                <span
                  key={`${color}-${index}`}
                  className="scholar-welcome-confetti"
                  style={confettiPieceStyle(color, x, y, rotate, drift, size)}
                />
              ))}
            </div>
          )}

          <div style={welcomeContentStyle}>
            <p style={welcomeLabel}>Welcome back</p>
            <h2 style={welcomeName}>{user?.name || "Student"}</h2>
            <p style={welcomeText}>
              Keep your applications moving and watch the live updates from the admin side.
            </p>
          </div>
          <div style={avatarLargeStyle}>
            {avatarSrc ? (
              <img src={avatarSrc} alt="" style={avatarImageStyle} />
            ) : (
              (user?.name || user?.role || "S").charAt(0)
            )}
          </div>
        </section>

        <section style={cardGridStyle}>
          {statCards.map((card) => (
            <article key={card.label} style={statCardStyle(settings.compactMode)}>
              <div style={cardHeaderStyle}>
                <span style={cardLabelStyle}>{card.label}</span>
                <Link to={card.to} style={cardLinkStyle}>
                  {card.action}
                </Link>
              </div>
              <h2 style={statValueStyle}>{loading ? "..." : card.value}</h2>
              <p style={mutedTextStyle}>{card.copy}</p>
            </article>
          ))}
        </section>

        <section style={feedGridStyle}>
          <article style={feedCardStyle(settings.compactMode)}>
            <div style={panelHeaderStyle}>
              <h3 style={panelTitleStyle}>Latest Scholarships</h3>
              <Link to="/scholarships" style={panelLinkStyle}>
                View all
              </Link>
            </div>

            {loading ? (
              <p style={mutedTextStyle}>Loading scholarships...</p>
            ) : latestScholarships.length === 0 ? (
              <p style={mutedTextStyle}>No scholarships posted yet.</p>
            ) : (
              latestScholarships.map((scholarship) => (
                <div key={scholarship.id} style={feedItemStyle}>
                  <strong>{scholarship.title}</strong>
                  <p style={mutedTextStyle}>{scholarship.description}</p>
                  <div style={feedFooterStyle}>
                    {settings.showStatusBadges && (
                      <span style={statusPillStyle}>{scholarship.status}</span>
                    )}
                    <span style={metaStyle}>{formatDate(scholarship.created_at)}</span>
                  </div>
                </div>
              ))
            )}
          </article>

          <article style={applicationsCardStyle(settings.compactMode)}>
            <div style={panelHeaderStyle}>
              <h3 style={panelTitleStyle}>My Applications</h3>
              <Link to="/track-status" style={panelLinkStyle}>
                View all
              </Link>
            </div>

            {loading ? (
              <p style={mutedTextStyle}>Loading applications...</p>
            ) : applications.length === 0 ? (
              <p style={mutedTextStyle}>You have not submitted an application yet.</p>
            ) : (
              applications.slice(0, 3).map((application) => (
                <div key={application.id} style={applicationItemStyle}>
                  <strong>{application.scholarship_title}</strong>
                  <p style={applicationStatusStyle}>{application.status}</p>
                  <p style={applicationRemarkStyle}>
                    {application.remarks || "Waiting for admin review."}
                  </p>
                </div>
              ))
            )}
          </article>
        </section>
      </main>
    </div>
  );
};

const mainStyle = {
  ...shellStyle,
};

const headerTopStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "20px",
  flexWrap: "wrap",
};

const headerActionsStyle = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap",
};

const liveBadgeStyle = {
  ...eyebrowStyle,
  marginBottom: 0,
};

const updatedTextStyle = {
  ...mutedTextStyle,
  marginTop: "12px",
  fontSize: "13px",
};

const noticeStyle = {
  ...cardStyle,
  marginBottom: "18px",
  color: "#991b1b",
  borderColor: "#fecaca",
  background: "#fee2e2",
};

const welcomeCardStyle = (compact) => ({
  ...pageHeaderStyle,
  position: "relative",
  overflow: "hidden",
  padding: compact ? "20px" : pageHeaderStyle.padding,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "24px",
});

const welcomeContentStyle = {
  position: "relative",
  zIndex: 2,
};

const welcomeConfettiLayerStyle = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  overflow: "hidden",
  zIndex: 1,
};

const confettiPieceStyle = (color, x, y, rotate, drift, size) => ({
  "--confetti-color": color,
  "--confetti-x": x,
  "--confetti-y": y,
  "--confetti-rotate": rotate,
  "--confetti-drift": drift,
  "--confetti-size": size,
});

const welcomeLabel = {
  color: colors.primary,
  fontWeight: "700",
  marginBottom: "8px",
};

const welcomeName = {
  fontSize: "28px",
  margin: "0 0 8px",
  color: colors.text,
};

const welcomeText = {
  ...mutedTextStyle,
};

const avatarLargeStyle = {
  position: "relative",
  zIndex: 2,
  width: "82px",
  height: "82px",
  borderRadius: "50%",
  background: colors.primary,
  color: "white",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: "800",
  fontSize: "26px",
  flex: "0 0 auto",
  overflow: "hidden",
};

const avatarImageStyle = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const panelHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
};

const panelTitleStyle = {
  margin: 0,
};

const panelLinkStyle = {
  color: colors.primary,
  fontWeight: "700",
  textDecoration: "none",
};

const metaStyle = {
  margin: 0,
  fontSize: "13px",
  color: colors.muted,
};

const statCardStyle = (compact) => ({
  ...cardStyle,
  padding: compact ? "16px" : cardStyle.padding,
  display: "grid",
  gap: "8px",
});

const cardHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
};

const cardLabelStyle = {
  color: colors.muted,
  fontWeight: "700",
};

const cardLinkStyle = {
  color: colors.primary,
  fontWeight: "700",
  textDecoration: "none",
  fontSize: "13px",
};

const statValueStyle = {
  margin: 0,
  fontSize: "clamp(28px, 8vw, 34px)",
  color: colors.text,
};

const feedGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))",
  gap: "22px",
  marginTop: "22px",
};

const feedCardStyle = (compact) => ({
  ...cardStyle,
  padding: compact ? "16px" : cardStyle.padding,
  display: "grid",
  gap: "14px",
});

const applicationsCardStyle = (compact) => ({
  ...feedCardStyle(compact),
  alignContent: "start",
});

const feedItemStyle = {
  borderTop: `1px solid ${colors.border}`,
  paddingTop: "14px",
  display: "grid",
  gap: "8px",
};

const applicationItemStyle = {
  ...feedItemStyle,
  textAlign: "left",
};

const applicationStatusStyle = {
  ...mutedTextStyle,
  margin: 0,
};

const applicationRemarkStyle = {
  ...metaStyle,
  marginTop: "2px",
  lineHeight: 1.5,
};

const feedFooterStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap",
};

export default StudentDashboard;
