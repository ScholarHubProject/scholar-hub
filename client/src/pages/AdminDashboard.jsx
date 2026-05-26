import { useCallback, useEffect, useRef, useState } from "react";
import api from "../api";
import { getSavedSettings, subscribeToSettings } from "../settings";
import {
  cardGridStyle,
  cardStyle,
  eyebrowStyle,
  buttonSecondaryStyle,
  mutedTextStyle,
  pageHeaderStyle,
  pageStyle,
  shellStyle,
  titleStyle,
} from "../sharedStyles";

const AUTO_SYNC_MS = 3000;
const EMPTY_STATS = {
  total_applicants: 0,
  approved_students: 0,
  pending_applications: 0,
  scholarships_posted: 0,
};

const normalizeStats = (data = {}) => ({
  total_applicants: Number(data.total_applicants) || 0,
  approved_students: Number(data.approved_students) || 0,
  pending_applications: Number(data.pending_applications) || 0,
  scholarships_posted: Number(data.scholarships_posted) || 0,
});

const AdminDashboard = () => {
  const [stats, setStats] = useState(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [settings, setSettings] = useState(getSavedSettings);
  const syncingRef = useRef(false);

  const loadStats = useCallback(async ({ silent = false, initial = false } = {}) => {
    if (syncingRef.current) {
      return;
    }

    syncingRef.current = true;

    if (initial) {
      setLoading(true);
    }
    setRefreshing(true);

    try {
      const response = await api.get("/admin/dashboard-stats", {
        headers: { Accept: "application/json" },
      });
      setStats(normalizeStats(response.data));
      setNotice(null);
      setLastUpdated(new Date());
    } catch (error) {
      console.log("Admin dashboard stats error:", error);
      if (!silent) {
        setNotice("Unable to reach live dashboard numbers. Retrying automatically...");
      }
    } finally {
      syncingRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => subscribeToSettings(setSettings), []);

  useEffect(() => {
    Promise.resolve().then(() => loadStats({ initial: true }));

    const intervalId = settings.autoRefresh
      ? window.setInterval(() => {
          loadStats({ silent: true });
        }, AUTO_SYNC_MS)
      : null;

    const handleFocus = () => {
      if (settings.autoRefresh && document.visibilityState === "visible") {
        loadStats({ silent: true });
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);

    return () => {
      if (intervalId) {
        window.clearInterval(intervalId);
      }
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [loadStats, settings.autoRefresh]);

  const cards = [
    ["Total Applicants", stats.total_applicants],
    ["Approved Students", stats.approved_students],
    ["Pending Applications", stats.pending_applications],
    ["Scholarships Posted", stats.scholarships_posted],
  ];

  return (
    <div style={pageStyle}>
      <main style={shellStyle}>
        <header style={pageHeaderStyle}>
          <span style={eyebrowStyle}>Coordinator Panel</span>
          <h1 style={titleStyle}>Admin Dashboard</h1>
          <div style={headerMetaStyle}>
            <p style={mutedTextStyle}>Scholarship Coordinator Management Panel</p>
            <div style={headerActionsStyle}>
              <span style={refreshStateStyle}>
                {refreshing ? "Syncing..." : settings.autoRefresh ? "Live" : "Manual"}
              </span>
              <button
                type="button"
                style={buttonSecondaryStyle}
                onClick={() => loadStats()}
                disabled={refreshing}
              >
                {refreshing ? "Refreshing..." : "Refresh Counts"}
              </button>
            </div>
          </div>
          <p style={updatedTextStyle}>
            {lastUpdated ? `Last updated ${lastUpdated.toLocaleTimeString()}` : "Waiting for first sync..."}
          </p>
        </header>

        {notice && (
          <div style={noticeStyle}>{notice}</div>
        )}

        <section style={cardGridStyle}>
          {cards.map(([label, value]) => (
            <article key={label} style={statCardStyle(settings.compactMode)}>
              <h3 style={statTitleStyle}>{label}</h3>
              <h2 style={statValueStyle}>{loading ? "..." : value}</h2>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
};

const statCardStyle = (compact) => ({
  ...cardStyle,
  padding: compact ? "16px" : cardStyle.padding,
});

const statTitleStyle = {
  margin: "0 0 12px",
};

const statValueStyle = {
  margin: 0,
  fontSize: "clamp(28px, 8vw, 34px)",
};

const headerMetaStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "16px",
  flexWrap: "wrap",
};

const headerActionsStyle = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap",
};

const refreshStateStyle = {
  ...eyebrowStyle,
  marginBottom: 0,
};

const noticeStyle = {
  ...cardStyle,
  marginBottom: "18px",
  color: "#991b1b",
  borderColor: "#fecaca",
  background: "#fee2e2",
};

const updatedTextStyle = {
  ...mutedTextStyle,
  marginTop: "12px",
  fontSize: "13px",
};

export default AdminDashboard;
