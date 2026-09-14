import { useCallback, useEffect, useRef, useState } from "react";
import api, { getStoredUser } from "../api";
import { HeroBanner } from "../components/ui";
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  eyebrowStyle,
  mutedTextStyle,
  pageStyle,
  shellStyle,
  statusPillStyle,
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

// The feed used to be assembled here from two endpoints, which meant the page
// and the navbar bell each built their own version of the same list and could
// disagree about it. It now comes from /notifications already merged, sorted
// and carrying its read state, so both read the same answer.
const Notifications = () => {
  const user = getCurrentUser();
  const isAdmin = user?.role === "Admin";

  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [marking, setMarking] = useState(false);
  const syncingRef = useRef(false);

  const loadNotifications = useCallback(async ({ initial = false, silent = false } = {}) => {
    if (syncingRef.current) return;
    syncingRef.current = true;

    // The mount call sets nothing synchronously: `loading` already starts as
    // true and `refreshing` as false, so touching them here would only queue
    // a redundant render while the effect is still running.
    if (!initial) {
      setRefreshing(true);
    }

    try {
      const response = await api.get("/notifications");

      setItems(
        Array.isArray(response.data?.notifications) ? response.data.notifications : []
      );
      setUnreadCount(response.data?.unreadCount || 0);
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
  }, []);

  useEffect(() => {
    // With initial: true this call sets no state synchronously; everything it
    // touches happens after the request resolves. The rule cannot see that,
    // because it only checks whether the function contains a setState at all.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  // Marked optimistically. The request is cheap and idempotent, and a card that
  // stays highlighted for half a second after being read is more jarring than a
  // rare flicker back if the write fails.
  const markRead = async (keys) => {
    if (keys.length === 0) return;

    setItems((current) =>
      current.map((item) => (keys.includes(item.key) ? { ...item, read: true } : item))
    );
    setUnreadCount((current) => Math.max(0, current - keys.length));

    try {
      await api.post("/notifications/read", { keys });
    } catch (error) {
      console.log("Notification read error:", error);
      loadNotifications({ silent: true });
    }
  };

  const markAllRead = async () => {
    setMarking(true);

    try {
      const response = await api.post("/notifications/read-all");
      setItems((current) => current.map((item) => ({ ...item, read: true })));
      setUnreadCount(response.data?.unreadCount || 0);
    } catch (error) {
      console.log("Notification read-all error:", error);
      setNotice("Could not mark those as read. Please try again.");
    } finally {
      setMarking(false);
    }
  };

  return (
    <div style={pageStyle}>
      <main style={shellStyle}>
        <HeroBanner
          eyebrow={isAdmin ? "Office updates" : "Student updates"}
          title="Notifications"
          subtitle={
            isAdmin
              ? "Applications waiting for review, withdrawals, and the announcements going out to the campus."
              : "Announcements and decisions on your applications, synced live from the scholarship office."
          }
          actions={
            <>
              <span style={liveBadgeStyle}>{refreshing ? "Syncing…" : "Live"}</span>
              <span style={metaLineStyle}>
                {lastUpdated
                  ? `Last synced ${lastUpdated.toLocaleTimeString()}`
                  : "Waiting for first sync…"}
              </span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  style={buttonPrimaryStyle}
                  onClick={markAllRead}
                  disabled={marking}
                >
                  {marking ? "Marking..." : `Mark all ${unreadCount} as read`}
                </button>
              )}
              <button
                type="button"
                style={{ ...buttonSecondaryStyle, marginLeft: "auto" }}
                onClick={() => loadNotifications()}
                disabled={refreshing}
              >
                Refresh
              </button>
            </>
          }
        />

        {notice && <div style={noticeStyle}>{notice}</div>}

        {loading ? (
          <div style={emptyStateStyle}>Loading notifications...</div>
        ) : items.length === 0 ? (
          <div style={emptyStateStyle}>No notifications yet.</div>
        ) : (
          <section style={listStyle}>
            {items.map((item) => (
              <article
                key={item.key}
                style={item.read ? noticeCardStyle : unreadCardStyle}
              >
                <div style={itemHeaderStyle}>
                  <div style={pillRowStyle}>
                    <span style={statusPillStyle}>{item.type}</span>
                    {!item.read && <span style={unreadDotStyle}>New</span>}
                  </div>
                  <span style={timeStyle}>{formatDate(item.created_at)}</span>
                </div>

                <h3 style={cardTitleStyle}>{item.title}</h3>
                {item.body && <p style={mutedTextStyle}>{item.body}</p>}

                {!item.read && (
                  <div style={cardActionsStyle}>
                    <button
                      type="button"
                      style={buttonSecondaryStyle}
                      onClick={() => markRead([item.key])}
                    >
                      Mark as read
                    </button>
                  </div>
                )}
              </article>
            ))}
          </section>
        )}
      </main>
    </div>
  );
};

const liveBadgeStyle = {
  ...eyebrowStyle,
  marginBottom: 0,
};

const metaLineStyle = {
  ...mutedTextStyle,
  fontSize: "12.5px",
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

// Unread is carried by a left rule and a "New" tag, not by colour alone: the
// two cards have to stay distinguishable in both themes and to anyone who
// cannot see the tint.
const unreadCardStyle = {
  ...noticeCardStyle,
  borderLeft: `4px solid ${colors.primary}`,
  background: colors.primarySoft,
};

const itemHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap",
};

const pillRowStyle = {
  display: "flex",
  gap: "8px",
  alignItems: "center",
  flexWrap: "wrap",
};

const unreadDotStyle = {
  ...statusPillStyle,
  background: colors.primary,
  color: "#ffffff",
  border: "none",
  fontSize: "11px",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const timeStyle = {
  ...mutedTextStyle,
  fontSize: "13px",
};

const cardTitleStyle = {
  margin: 0,
  color: colors.text,
};

const cardActionsStyle = {
  display: "flex",
  justifyContent: "flex-end",
};

export default Notifications;
