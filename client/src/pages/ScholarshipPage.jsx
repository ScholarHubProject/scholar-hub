import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import {
  buttonPrimaryStyle,
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

const formatDeadline = (deadline) => {
  if (!deadline) return "No deadline set";
  return new Date(deadline).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const ScholarshipPage = () => {
  const navigate = useNavigate();
  const [scholarships, setScholarships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const syncingRef = useRef(false);

  const loadScholarships = useCallback(async ({ initial = false, silent = false } = {}) => {
    if (syncingRef.current) {
      return;
    }

    syncingRef.current = true;

    if (initial) {
      setLoading(true);
    }
    setRefreshing(true);
    if (!silent) {
      setError("");
    }

    try {
      const response = await api.get("/scholarships");
      setScholarships(Array.isArray(response.data) ? response.data : []);
      setError("");
      setLastUpdated(new Date());
    } catch (requestError) {
      console.log("Scholarship page load error:", requestError);
      if (!silent) {
        setError("Unable to load scholarships. Please try again later.");
      }
    } finally {
      syncingRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadScholarships({ initial: true });

    const intervalId = window.setInterval(() => {
      loadScholarships({ silent: true });
    }, AUTO_SYNC_MS);

    const handleFocus = () => {
      if (document.visibilityState === "visible") {
        loadScholarships({ silent: true });
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [loadScholarships]);

  const handleApply = (scholarship) => {
    navigate(
      `/application-form?scholarshipId=${scholarship.id}&title=${encodeURIComponent(
        scholarship.title
      )}`
    );
  };

  return (
    <div style={pageStyle}>
      <main style={shellStyle}>
        <header style={pageHeaderStyle}>
          <span style={eyebrowStyle}>Scholarship Opportunities</span>
          <h1 style={titleStyle}>Available Scholarships</h1>
          <p style={mutedTextStyle}>
            Browse scholarship posts published by the admin office.
          </p>

          <div style={headerActionsStyle}>
            <span style={statusBadgeStyle}>{refreshing ? "Syncing..." : "Live"}</span>
            <button type="button" style={buttonSecondaryStyle} onClick={() => loadScholarships()} disabled={refreshing}>
              Refresh
            </button>
          </div>

          <p style={updatedTextStyle}>
            {lastUpdated ? `Last synced ${lastUpdated.toLocaleTimeString()}` : "Waiting for first sync..."}
          </p>
        </header>

        {loading ? (
          <div style={stateCardStyle}>Loading scholarships...</div>
        ) : error ? (
          <div style={errorCardStyle}>
            <p style={errorTextStyle}>{error}</p>
            <button style={buttonPrimaryStyle} onClick={loadScholarships}>
              Try Again
            </button>
          </div>
        ) : scholarships.length === 0 ? (
          <div style={stateCardStyle}>No scholarships are available right now.</div>
        ) : (
          <section style={cardGridStyle}>
            {scholarships.map((scholarship) => (
              <article key={scholarship.id} style={scholarshipCardStyle}>
                <span style={statusPillStyle}>{scholarship.status}</span>
                <p style={scholarshipIdStyle}>
                  Scholarship ID: {scholarship.scholarship_code || `#${scholarship.id}`}
                </p>
                <h3 style={cardTitleStyle}>{scholarship.title}</h3>
                <p style={slotsStyle}>
                  <strong>Available Slots:</strong> {Number(scholarship.available_slots) || 0}
                </p>
                <p style={mutedTextStyle}>{scholarship.description}</p>
                <div style={detailsGridStyle}>
                  <div>
                    <h4 style={detailTitleStyle}>Benefits</h4>
                    <p style={detailTextStyle}>
                      {scholarship.benefits || "No benefits listed yet."}
                    </p>
                  </div>
                  <div>
                    <h4 style={detailTitleStyle}>Qualification</h4>
                    <p style={detailTextStyle}>
                      {scholarship.qualification || "No qualification listed yet."}
                    </p>
                  </div>
                  <div>
                    <h4 style={detailTitleStyle}>Requirements</h4>
                    <p style={detailTextStyle}>
                      {scholarship.requirements || "No requirements listed yet."}
                    </p>
                  </div>
                </div>
                <p style={deadlineStyle}>
                  <strong>Deadline:</strong> {formatDeadline(scholarship.deadline)}
                </p>
                <button
                  style={{
                    ...buttonPrimaryStyle,
                    ...(scholarship.status === "Closed" ? disabledButtonStyle : {}),
                  }}
                  disabled={scholarship.status === "Closed"}
                  onClick={() => handleApply(scholarship)}
                >
                  {scholarship.status === "Closed" ? "Closed" : "Apply Now"}
                </button>
              </article>
            ))}
          </section>
        )}
      </main>
    </div>
  );
};

const scholarshipCardStyle = {
  ...cardStyle,
  display: "grid",
  gap: "14px",
};

const headerActionsStyle = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap",
  marginTop: "10px",
};

const statusBadgeStyle = {
  ...eyebrowStyle,
  marginBottom: 0,
};

const updatedTextStyle = {
  ...mutedTextStyle,
  marginTop: "12px",
  fontSize: "13px",
};

const cardTitleStyle = {
  margin: 0,
  color: colors.text,
};

const scholarshipIdStyle = {
  margin: 0,
  color: colors.primaryDark,
  fontWeight: "700",
  fontSize: "13px",
};

const deadlineStyle = {
  margin: 0,
};

const slotsStyle = {
  margin: 0,
  color: colors.text,
};

const detailsGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))",
  gap: "14px",
};

const detailTitleStyle = {
  margin: "0 0 6px",
  color: colors.primaryDark,
  fontSize: "14px",
};

const detailTextStyle = {
  ...mutedTextStyle,
  whiteSpace: "pre-wrap",
};

const stateCardStyle = {
  ...cardStyle,
  color: colors.muted,
  textAlign: "center",
};

const errorCardStyle = {
  ...cardStyle,
  display: "grid",
  gap: "14px",
  justifyItems: "start",
};

const errorTextStyle = {
  margin: 0,
  color: colors.danger,
  fontWeight: "700",
};

const disabledButtonStyle = {
  opacity: 0.65,
  cursor: "not-allowed",
};

export default ScholarshipPage;
