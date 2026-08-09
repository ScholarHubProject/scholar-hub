import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api, { getStoredUser } from "../api";
import {
  buttonSecondaryStyle,
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
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getNotificationTime = (application) =>
  application.status_updated_at || application.created_at;

const Notifications = () => {
  const user = getCurrentUser();
  const [announcements, setAnnouncements] = useState([]);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const syncingRef = useRef(false);

  const loadNotifications = useCallback(
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
        const requests = [api.get("/announcements")];

        if (user?.email) {
          requests.push(api.get("/applications/student"));
        }

        const [announcementsResponse, applicationsResponse] = await Promise.all(requests);

        setAnnouncements(Array.isArray(announcementsResponse.data) ? announcementsResponse.data : []);
        setApplications(
          user?.email && applicationsResponse
            ? Array.isArray(applicationsResponse.data)
              ? applicationsResponse.data
              : []
            : []
        );
        setNotice(null);
        setLastUpdated(new Date());
      } catch (error) {
        console.log("Notifications load error:", error);
        if (!silent) {
          setNotice("Failed to load notifications");
        }
      } finally {
        syncingRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user?.email]
  );

  useEffect(() => {
    loadNotifications({ initial: true });

    const intervalId = window.setInterval(() => {
      loadNotifications({ silent: true });
    }, AUTO_SYNC_MS);

    const handleFocus = () => {
      if (document.visibilityState === "visible") {
        loadNotifications({ silent: true });
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [loadNotifications]);

  const feed = useMemo(() => {
    const announcementFeed = announcements.map((announcement) => ({
      id: `announcement-${announcement.id}`,
      type: "Announcement",
      title: announcement.title || "Announcement",
      body: announcement.content,
      created_at: announcement.created_at,
    }));

    const applicationFeed = applications.map((application) => ({
      id: `application-${application.id}`,
      type: "Application Update",
      title: application.scholarship_title || "Application",
      body: `${application.status}${application.remarks ? ` - ${application.remarks}` : ""}`,
      created_at: getNotificationTime(application),
    }));

    return [...announcementFeed, ...applicationFeed].sort(
      (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
    );
  }, [announcements, applications]);

  return (
    <div style={pageStyle}>
      <main style={shellStyle}>
        <header style={pageHeaderStyle}>
          <span style={eyebrowStyle}>Student Updates</span>
          <h1 style={titleStyle}>Notifications</h1>
          <p style={mutedTextStyle}>
            Live announcements and application updates synced from the admin side.
          </p>

          <div style={headerActionsStyle}>
            <span style={liveBadgeStyle}>{refreshing ? "Syncing..." : "Live"}</span>
            <button type="button" style={buttonSecondaryStyle} onClick={() => loadNotifications()} disabled={refreshing}>
              Refresh
            </button>
          </div>

          <p style={metaLineStyle}>
            {lastUpdated ? `Last synced ${lastUpdated.toLocaleTimeString()}` : "Waiting for first sync..."}
          </p>
        </header>

        {notice && <div style={noticeStyle}>{notice}</div>}

        {loading ? (
          <div style={emptyStateStyle}>Loading notifications...</div>
        ) : feed.length === 0 ? (
          <div style={emptyStateStyle}>No notifications yet.</div>
        ) : (
          <section style={listStyle}>
            {feed.map((item) => (
              <article key={item.id} style={noticeCardStyle}>
                <div style={itemHeaderStyle}>
                  <span style={statusPillStyle}>{item.type}</span>
                  <span style={timeStyle}>{formatDate(item.created_at)}</span>
                </div>
                <h3 style={cardTitleStyle}>{item.title}</h3>
                <p style={mutedTextStyle}>{item.body}</p>
              </article>
            ))}
          </section>
        )}
      </main>
    </div>
  );
};

const headerActionsStyle = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap",
  marginTop: "10px",
};

const liveBadgeStyle = {
  ...eyebrowStyle,
  marginBottom: 0,
};

const metaLineStyle = {
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

const emptyStateStyle = {
  ...cardStyle,
  color: colors.muted,
};

const listStyle = {
  display: "grid",
  gap: "16px",
};

const noticeCardStyle = {
  ...cardStyle,
  display: "grid",
  gap: "12px",
};

const itemHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap",
};

const timeStyle = {
  ...mutedTextStyle,
  fontSize: "13px",
};

const cardTitleStyle = {
  margin: 0,
  color: colors.text,
};

export default Notifications;
