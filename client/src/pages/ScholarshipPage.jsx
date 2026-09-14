import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
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

    // The mount call sets nothing synchronously: `loading` already starts as
    // true, `refreshing` as false and `error` as empty, so touching them here
    // would only queue a redundant render while the effect is still running.
    if (!initial) {
      setRefreshing(true);

      if (!silent) {
        setError("");
      }
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
    // With initial: true this call sets no state synchronously; everything it
    // touches happens after the request resolves. The rule cannot see that,
    // because it only checks whether the function contains a setState at all.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
        <HeroBanner
          eyebrow="Scholarship opportunities"
          title="Available Scholarships"
          subtitle="Browse the scholarship programs published by the admin office and apply to the ones you qualify for."
          actions={
            <>
              <span style={statusBadgeStyle}>{refreshing ? "Syncing…" : "Live"}</span>
              <span style={updatedTextStyle}>
                {lastUpdated
                  ? `Last synced ${lastUpdated.toLocaleTimeString()}`
                  : "Waiting for first sync…"}
              </span>
              <button
                type="button"
                style={{ ...buttonSecondaryStyle, marginLeft: "auto" }}
                onClick={() => loadScholarships()}
                disabled={refreshing}
              >
                Refresh
              </button>
            </>
          }
        />

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
          <section style={scholarshipListStyle}>
            {scholarships.map((scholarship) => (
              <article key={scholarship.id} style={scholarshipCardStyle}>
                <div style={cardMainStyle}>
                  <div style={cardHeaderStyle}>
                    <span style={statusPillStyle}>{scholarship.status}</span>
                    <p style={scholarshipIdStyle}>
                      Scholarship ID: {scholarship.scholarship_code || `#${scholarship.id}`}
                    </p>
                  </div>
                  <h3 style={cardTitleStyle}>{scholarship.title}</h3>
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
                </div>
                <aside style={cardSideStyle}>
                  <p style={slotsStyle}>
                    <strong>Available Slots:</strong> {Number(scholarship.available_slots) || 0}
                  </p>
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
                </aside>
              </article>
            ))}
          </section>
        )}
      </main>
    </div>
  );
};

const scholarshipListStyle = {
  display: "grid",
  gap: "clamp(14px, 3vw, 20px)",
};

// One card per row: the details read left to right and the slots, deadline and
// apply button sit in a rail on the right. The rail wraps underneath on narrow
// screens because inline styles cannot carry a media query.
const scholarshipCardStyle = {
  ...cardStyle,
  display: "flex",
  flexWrap: "wrap",
  alignItems: "flex-start",
  gap: "clamp(16px, 3vw, 28px)",
};

const cardMainStyle = {
  flex: "1 1 320px",
  minWidth: 0,
  display: "grid",
  gap: "12px",
};

const cardSideStyle = {
  flex: "0 1 220px",
  minWidth: "200px",
  display: "grid",
  gap: "12px",
  alignContent: "start",
};

const cardHeaderStyle = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "10px",
};

const statusBadgeStyle = {
  ...eyebrowStyle,
  marginBottom: 0,
};

const updatedTextStyle = {
  ...mutedTextStyle,
  fontSize: "12.5px",
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
  gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))",
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
