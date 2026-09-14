import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../api";
import { HeroBanner } from "../components/ui";
import {
  buttonSecondaryStyle,
  cardStyle,
  colors,
  inputStyle,
  mutedTextStyle,
  pageStyle,
  shellStyle,
  statusPillStyle,
  tableStyle,
  tableWrapStyle,
  tdStyle,
  thStyle,
} from "../sharedStyles";

// The action strings are stored as "entity.verb" so they sort and filter
// cleanly; only the label needs to read like English.
const ACTION_LABELS = {
  "application.status": "Application decided",
  "application.delete": "Application deleted",
  "application.withdraw": "Application withdrawn",
  "application.documents-add": "Documents added",
  "application.documents-remove": "Document removed",
  "application.academics": "Academic record edited",
  "scholarship.create": "Scholarship created",
  "scholarship.update": "Scholarship edited",
  "scholarship.delete": "Scholarship deleted",
  "announcement.create": "Announcement posted",
  "announcement.update": "Announcement edited",
  "announcement.delete": "Announcement deleted",
  "user.create": "Account created",
  "user.update": "Account changed",
  "user.password-link": "Password link sent",
};

const ENTITY_TONES = {
  application: { background: "#dbeafe", color: "#1e40af", borderColor: "#bfdbfe" },
  scholarship: { background: "#dcfce7", color: "#166534", borderColor: "#bbf7d0" },
  announcement: { background: "#fef3c7", color: "#92400e", borderColor: "#fde68a" },
  user: { background: "#ede9fe", color: "#5b21b6", borderColor: "#ddd6fe" },
};

const formatTimestamp = (value) => {
  if (!value) return "Not available";
  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const AuditLog = () => {
  // Opened from a record ("show me everything that happened to application 88")
  // as well as from the menu, so the filter can arrive in the URL.
  const [searchParams, setSearchParams] = useSearchParams();

  const [entries, setEntries] = useState([]);
  const [totals, setTotals] = useState({ total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [entityType, setEntityType] = useState(searchParams.get("entityType") || "");
  const [entityId, setEntityId] = useState(searchParams.get("entityId") || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  const loadEntries = useCallback(async () => {
    setLoading(true);

    try {
      const response = await api.get("/admin/audit-log", {
        params: {
          search: search.trim() || undefined,
          entityType: entityType || undefined,
          entityId: entityId || undefined,
          page,
        },
      });

      setEntries(Array.isArray(response.data?.entries) ? response.data.entries : []);
      setTotals({
        total: response.data?.total || 0,
        totalPages: response.data?.totalPages || 1,
      });
      setError("");
    } catch (requestError) {
      console.log("Audit log error:", requestError);
      setError(
        requestError.response?.data?.message || "Failed to load the audit trail."
      );
    } finally {
      setLoading(false);
    }
  }, [entityId, entityType, page, search]);

  // Debounced so typing does not fire a request per keystroke. Each filter
  // also resets to page one, done in the handler rather than in an effect
  // watching the filters, which would render once with the stale page first.
  useEffect(() => {
    const timer = window.setTimeout(loadEntries, 300);
    return () => window.clearTimeout(timer);
  }, [loadEntries]);

  const changeFilter = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  const clearRecordFilter = () => {
    setEntityId("");
    setEntityType("");
    setPage(1);
    setSearchParams({});
  };

  return (
    <div style={pageStyle}>
      <main style={shellStyle}>
        <HeroBanner
          eyebrow="Accountability"
          title="Audit trail"
          subtitle="Who decided what, and when. Every approval, rejection, deletion and account change is recorded here — including the ones that removed the record they describe."
        />

        {error && <div style={errorStyle}>{error}</div>}

        {entityId && (
          <div style={filterNoticeStyle}>
            Showing only {entityType || "records"} #{entityId}.
            <button type="button" style={linkButtonStyle} onClick={clearRecordFilter}>
              Show everything
            </button>
          </div>
        )}

        <section style={filterCardStyle}>
          <input
            style={{ ...inputStyle, flex: "2 1 240px" }}
            placeholder="Search the summary or the person who acted"
            value={search}
            onChange={(event) => changeFilter(setSearch)(event.target.value)}
          />

          <select
            style={{ ...inputStyle, flex: "1 1 160px" }}
            value={entityType}
            onChange={(event) => changeFilter(setEntityType)(event.target.value)}
            aria-label="Filter by record type"
          >
            <option value="">Everything</option>
            <option value="application">Applications</option>
            <option value="scholarship">Scholarships</option>
            <option value="announcement">Announcements</option>
            <option value="user">Accounts</option>
          </select>

          <button type="button" style={buttonSecondaryStyle} onClick={loadEntries}>
            Refresh
          </button>
        </section>

        {loading ? (
          <div style={cardStyle}>
            <p style={mutedTextStyle}>Loading the audit trail...</p>
          </div>
        ) : entries.length === 0 ? (
          <div style={cardStyle}>
            <p style={mutedTextStyle}>
              Nothing recorded yet. Entries appear here as soon as anyone approves an
              application, edits a scholarship or changes an account.
            </p>
          </div>
        ) : (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>When</th>
                  <th style={thStyle}>Who</th>
                  <th style={thStyle}>Action</th>
                  <th style={thStyle}>What happened</th>
                  <th style={thStyle}>Record</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                      {formatTimestamp(entry.createdAt)}
                    </td>
                    <td style={tdStyle}>
                      {entry.actorEmail || "System"}
                      {entry.actorRole && (
                        <span style={subtleStyle}>{entry.actorRole}</span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <span style={entityPillStyle(entry.entityType)}>
                        {ACTION_LABELS[entry.action] || entry.action}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      {entry.summary}

                      {/* The before/after values are kept behind a click: they
                          answer "what exactly changed" for the few entries
                          where that matters, and would drown the table if they
                          were shown on every row. */}
                      {entry.metadata && (
                        <>
                          <button
                            type="button"
                            style={linkButtonStyle}
                            onClick={() =>
                              setExpandedId((current) =>
                                current === entry.id ? null : entry.id
                              )
                            }
                          >
                            {expandedId === entry.id ? "Hide details" : "Details"}
                          </button>

                          {expandedId === entry.id && (
                            <pre style={metadataStyle}>
                              {JSON.stringify(entry.metadata, null, 2)}
                            </pre>
                          )}
                        </>
                      )}
                    </td>
                    <td style={tdStyle}>
                      {entry.entityId ? (
                        <button
                          type="button"
                          style={linkButtonStyle}
                          onClick={() => {
                            setEntityType(entry.entityType);
                            setEntityId(entry.entityId);
                            setPage(1);
                            setSearchParams({
                              entityType: entry.entityType,
                              entityId: entry.entityId,
                            });
                          }}
                        >
                          {entry.entityType} #{entry.entityId}
                        </button>
                      ) : (
                        <span style={mutedTextStyle}>&mdash;</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && totals.totalPages > 1 && (
          <nav style={paginationStyle} aria-label="Audit trail pages">
            <button
              type="button"
              style={buttonSecondaryStyle}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
            >
              Previous
            </button>

            <span style={mutedTextStyle}>
              Page {page} of {totals.totalPages} &middot; {totals.total} entries
            </span>

            <button
              type="button"
              style={buttonSecondaryStyle}
              onClick={() =>
                setPage((current) => Math.min(totals.totalPages, current + 1))
              }
              disabled={page >= totals.totalPages}
            >
              Next
            </button>
          </nav>
        )}
      </main>
    </div>
  );
};

const filterCardStyle = {
  ...cardStyle,
  display: "flex",
  gap: "12px",
  flexWrap: "wrap",
  alignItems: "center",
  margin: "18px 0",
};

const entityPillStyle = (entityType) => {
  const tone = ENTITY_TONES[entityType] || ENTITY_TONES.application;

  return {
    ...statusPillStyle,
    background: tone.background,
    color: tone.color,
    border: `1px solid ${tone.borderColor}`,
    whiteSpace: "nowrap",
  };
};

const subtleStyle = {
  display: "block",
  color: colors.muted,
  fontSize: "12px",
  marginTop: "3px",
};

const linkButtonStyle = {
  display: "inline-block",
  marginLeft: "8px",
  padding: 0,
  border: "none",
  background: "none",
  color: colors.primary,
  fontSize: "13px",
  fontWeight: 700,
  cursor: "pointer",
  textDecoration: "underline",
};

const metadataStyle = {
  marginTop: "10px",
  padding: "12px",
  borderRadius: "10px",
  border: `1px solid ${colors.border}`,
  background: colors.field,
  color: colors.text,
  fontSize: "12px",
  lineHeight: 1.5,
  overflowX: "auto",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const paginationStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "14px",
  flexWrap: "wrap",
  marginTop: "18px",
};

const filterNoticeStyle = {
  ...cardStyle,
  marginBottom: "18px",
  background: colors.primarySoft,
  color: colors.primaryDark,
};

const errorStyle = {
  ...cardStyle,
  marginBottom: "18px",
  background: "#fee2e2",
  color: "#b91c1c",
  borderColor: "#fecaca",
};

export default AuditLog;
