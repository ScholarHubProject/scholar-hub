import { useCallback, useEffect, useRef, useState } from "react";
import api from "../api";
import { HeroBanner } from "../components/ui";
import { SYNC_CHANNELS, broadcastChange, useLiveSync } from "../liveSync";
import { useSettings } from "../useSettings";
import {
  buttonDangerStyle,
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  eyebrowStyle,
  glassStrongStyle,
  inputStyle,
  mutedTextStyle,
  narrowShellStyle,
  pageStyle,
  statusPillStyle,
} from "../sharedStyles";

const EMPTY_FORM = {
  title: "",
  content: "",
  audience: "All",
  publishAt: "",
  expiresAt: "",
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

// <input type="datetime-local"> speaks "YYYY-MM-DDTHH:mm" in local time and
// refuses anything else, so a stored UTC timestamp has to be shifted into the
// browser's offset before it will display at all.
const toLocalInputValue = (value) => {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const offsetMs = date.getTimezoneOffset() * 60000;

  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
};

// The reverse trip. "2026-09-15T10:00" from the input has no zone, and the
// API runs in UTC, so it has to be pinned to the admin's clock here or a
// 10:00 announcement in Manila would go out at 18:00.
const toApiTimestamp = (value) => {
  if (!value) return "";

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
};

const toApiPayload = (formData) => ({
  ...formData,
  publishAt: toApiTimestamp(formData.publishAt),
  expiresAt: toApiTimestamp(formData.expiresAt),
});

const WINDOW_TONES = {
  Live: { background: "var(--viz-good-wash)", color: "var(--viz-good-ink)", borderColor: "var(--viz-good-line)" },
  Scheduled: { background: "var(--viz-info-wash)", color: "var(--viz-info-ink)", borderColor: "var(--viz-info-line)" },
  Expired: { background: "#f1f5f9", color: "#475569", borderColor: "#e2e8f0" },
};

const Announcements = () => {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [notice, setNotice] = useState(null);
  const [editingAnnouncement, setEditingAnnouncement] = useState(null);
  const [viewingAnnouncement, setViewingAnnouncement] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState(null);
  const [settings] = useSettings();
  // Every request takes a number and only the newest one may write the list.
  // A write bumps it too, so a poll that left before the insert cannot come
  // back afterwards and overwrite the row that was just added.
  const requestRef = useRef(0);

  // State is only set from the promise callbacks. `loading` already starts as
  // true, so setting it again on mount would just queue a redundant render
  // while the effect is still running. A silent sync leaves the notice alone
  // so "Announcement posted successfully" is not wiped by the next tick; the
  // initial load is not silent about a failure, or an empty page would be the
  // only sign that the request never came back.
  const loadAnnouncements = useCallback(({ silent = false, initial = false } = {}) => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    if (!silent && !initial) setSyncing(true);

    return api
      .get("/announcements")
      .then((response) => {
        if (requestId !== requestRef.current) return;
        setAnnouncements(Array.isArray(response.data) ? response.data : []);
        setLastSynced(new Date());
        if (!silent) setNotice(null);
      })
      .catch((error) => {
        console.log("Announcements load error:", error);
        if (requestId === requestRef.current && !silent) {
          setNotice("Failed to load announcements");
        }
      })
      .finally(() => {
        if (requestId === requestRef.current) {
          setLoading(false);
          setSyncing(false);
        }
      });
  }, []);

  useEffect(() => {
    // With initial: true nothing is set synchronously here: `loading` already
    // starts as true and every other update waits for the response. The rule
    // only sees that the function contains a setState somewhere.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAnnouncements({ initial: true });
  }, [loadAnnouncements]);

  // Other admins' posts, and scheduled ones crossing their publish time, show
  // up on their own. Auto-refresh is the same switch the bell honours.
  useLiveSync(loadAnnouncements, {
    channels: [SYNC_CHANNELS.announcements],
    enabled: settings.autoRefresh,
  });

  // The list is patched locally first so the change is on screen before the
  // round trip, then reloaded so it carries what the server filled in
  // (created_by, the stored timestamps) and every other tab is told.
  const settleChange = () => {
    requestRef.current += 1;
    broadcastChange(SYNC_CHANNELS.announcements);
    broadcastChange(SYNC_CHANNELS.notifications);
    loadAnnouncements({ silent: true });
  };

  const updateField = (field, value) => {
    setFormData((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setNotice(null);

    if (!formData.content.trim()) {
      setNotice("Announcement content is required");
      return;
    }

    setPosting(true);

    try {
      const wasEditing = Boolean(editingAnnouncement);

      if (editingAnnouncement) {
        const response = await api.put(
          `/announcements/${editingAnnouncement.id}`,
          toApiPayload(formData)
        );
        const updatedAnnouncement = response.data?.announcement || {
          id: editingAnnouncement.id,
          title: formData.title.trim() || "Announcement",
          content: formData.content.trim(),
        };

        setAnnouncements((current) =>
          current.map((announcement) =>
            String(announcement.id) === String(editingAnnouncement.id)
              ? {
                  ...announcement,
                  ...updatedAnnouncement,
                  created_at: updatedAnnouncement.created_at || announcement.created_at,
                }
              : announcement
          )
        );
      } else {
        const response = await api.post("/announcements", toApiPayload(formData));
        const createdAnnouncement = response.data?.announcement || {
          id: Date.now(),
          title: formData.title.trim() || "Announcement",
          content: formData.content.trim(),
        };

        setAnnouncements((current) => [
          {
            ...createdAnnouncement,
            created_at: createdAnnouncement.created_at || new Date().toISOString(),
          },
          ...current,
        ]);
      }

      setFormData(EMPTY_FORM);
      setEditingAnnouncement(null);
      setNotice(
        wasEditing
          ? "Announcement updated successfully"
          : "Announcement posted successfully"
      );
      settleChange();
    } catch (error) {
      console.log("Announcement post error:", error);
      setNotice(
        error.response?.data?.message ||
          (editingAnnouncement
            ? "Failed to update announcement"
            : "Failed to post announcement")
      );
    } finally {
      setPosting(false);
    }
  };

  const startEditing = (announcement) => {
    setEditingAnnouncement(announcement);
    setViewingAnnouncement(null);
    setFormData({
      title: announcement.title || "",
      content: announcement.content || "",
      audience: announcement.audience || "All",
      publishAt: toLocalInputValue(announcement.publish_at),
      expiresAt: toLocalInputValue(announcement.expires_at),
    });
    setNotice(null);
  };

  const cancelEditing = () => {
    setEditingAnnouncement(null);
    setFormData(EMPTY_FORM);
    setNotice(null);
  };

  // Deleting genuinely removes it. An announcement carries no history anybody
  // needs later, and a wrong one sitting on every student's screen is a live
  // problem that editing it to say something else does not solve.
  const handleDelete = async (announcement) => {
    if (
      !window.confirm(
        `Delete "${announcement.title}"? Students will stop seeing it immediately. This cannot be undone.`
      )
    ) {
      return;
    }

    setDeletingId(announcement.id);
    setNotice(null);

    try {
      await api.delete(`/announcements/${announcement.id}`);

      setAnnouncements((current) =>
        current.filter((row) => String(row.id) !== String(announcement.id))
      );

      if (String(editingAnnouncement?.id) === String(announcement.id)) {
        cancelEditing();
      }

      setViewingAnnouncement(null);
      setNotice("Announcement deleted");
      settleChange();
    } catch (error) {
      console.log("Announcement delete error:", error);
      setNotice(error.response?.data?.message || "Failed to delete announcement");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div style={pageStyle}>
      <main style={narrowShellStyle}>
        <HeroBanner
          eyebrow="Campus updates"
          title="Announcements"
          subtitle="Post scholarship announcements and reminders, and see everything students are being told in one place."
          actions={
            <>
              <span style={liveBadgeStyle}>
                {syncing ? "Syncing…" : settings.autoRefresh ? "Live" : "Auto-refresh off"}
              </span>
              <span style={metaLineStyle}>
                {lastSynced
                  ? `Last synced ${lastSynced.toLocaleTimeString()}`
                  : "Waiting for first sync…"}
              </span>
            </>
          }
        />

        {notice && <div style={noticeStyle}>{notice}</div>}

        <section style={cardStyle}>
          <form onSubmit={handleSubmit} style={formStyle}>
            <input
              style={inputStyle}
              type="text"
              placeholder="Announcement title"
              value={formData.title}
              onChange={(event) => updateField("title", event.target.value)}
            />

            <textarea
              placeholder="Write announcement here..."
              style={textAreaStyle}
              value={formData.content}
              onChange={(event) => updateField("content", event.target.value)}
            />

            {/* Leaving both times empty is the ordinary case: post it now,
                leave it up. They exist for the two announcements a term that
                should not appear yet, or should stop appearing on their own. */}
            <div style={scheduleGridStyle}>
              <label style={labelStyle}>
                Audience
                <select
                  style={inputStyle}
                  value={formData.audience}
                  onChange={(event) => updateField("audience", event.target.value)}
                >
                  <option value="All">Everyone</option>
                  <option value="Students">Students only</option>
                  <option value="Admins">Admins only</option>
                </select>
              </label>

              <label style={labelStyle}>
                Publish at <span style={optionalStyle}>optional</span>
                <input
                  style={inputStyle}
                  type="datetime-local"
                  value={formData.publishAt}
                  onChange={(event) => updateField("publishAt", event.target.value)}
                />
              </label>

              <label style={labelStyle}>
                Take down at <span style={optionalStyle}>optional</span>
                <input
                  style={inputStyle}
                  type="datetime-local"
                  value={formData.expiresAt}
                  onChange={(event) => updateField("expiresAt", event.target.value)}
                />
              </label>
            </div>

            <div style={actionsStyle}>
              <button type="submit" style={buttonPrimaryStyle} disabled={posting}>
                {posting
                  ? editingAnnouncement
                    ? "Updating..."
                    : "Posting..."
                  : editingAnnouncement
                    ? "Update Announcement"
                    : "Post Announcement"}
              </button>
              {editingAnnouncement && (
                <button
                  type="button"
                  style={buttonSecondaryStyle}
                  onClick={cancelEditing}
                  disabled={posting}
                >
                  Cancel Edit
                </button>
              )}
              <button
                type="button"
                style={buttonSecondaryStyle}
                onClick={() => loadAnnouncements()}
                disabled={loading || syncing}
              >
                Refresh
              </button>
            </div>
          </form>
        </section>

        <section style={listStyle}>
          {loading ? (
            <article style={announcementCardStyle}>
              <p style={mutedTextStyle}>Loading announcements...</p>
            </article>
          ) : announcements.length === 0 ? (
            <article style={announcementCardStyle}>
              <p style={mutedTextStyle}>No announcements posted yet.</p>
            </article>
          ) : (
            announcements.map((announcement) => (
              <article key={announcement.id} style={announcementCardStyle}>
                <div style={cardTagRowStyle}>
                  <span style={windowPillStyle(announcement.window_state)}>
                    {announcement.window_state || "Live"}
                  </span>
                  <span style={audiencePillStyle}>
                    {announcement.audience === "All"
                      ? "Everyone"
                      : `${announcement.audience} only`}
                  </span>
                </div>

                <h3 style={cardTitleStyle}>{announcement.title}</h3>
                <p style={mutedTextStyle}>{announcement.content}</p>

                <p style={metaStyle}>
                  {announcement.publish_at
                    ? `Publishes ${formatDate(announcement.publish_at)}`
                    : `Posted ${formatDate(announcement.created_at)}`}
                  {announcement.expires_at &&
                    ` · comes down ${formatDate(announcement.expires_at)}`}
                </p>

                <div style={cardActionsStyle}>
                  <button
                    type="button"
                    style={buttonSecondaryStyle}
                    onClick={() => setViewingAnnouncement(announcement)}
                  >
                    View
                  </button>
                  <button
                    type="button"
                    style={buttonPrimaryStyle}
                    onClick={() => startEditing(announcement)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    style={buttonDangerStyle}
                    onClick={() => handleDelete(announcement)}
                    disabled={deletingId === announcement.id}
                  >
                    {deletingId === announcement.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </article>
            ))
          )}
        </section>

        {viewingAnnouncement && (
          <div
            style={modalOverlayStyle}
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setViewingAnnouncement(null);
              }
            }}
          >
            <article style={viewDialogStyle} role="dialog" aria-modal="true">
              <div style={modalHeaderStyle}>
                <div>
                  <span style={eyebrowStyle}>Announcement Preview</span>
                  <h2 style={dialogTitleStyle}>{viewingAnnouncement.title}</h2>
                </div>
                <button
                  type="button"
                  aria-label="Close announcement preview"
                  style={closeButtonStyle}
                  onClick={() => setViewingAnnouncement(null)}
                >
                  X
                </button>
              </div>
              <p style={announcementBodyStyle}>{viewingAnnouncement.content}</p>
              <p style={metaStyle}>{formatDate(viewingAnnouncement.created_at)}</p>
              <div style={cardActionsStyle}>
                <button
                  type="button"
                  style={buttonPrimaryStyle}
                  onClick={() => startEditing(viewingAnnouncement)}
                >
                  Edit Announcement
                </button>
                <button
                  type="button"
                  style={buttonDangerStyle}
                  onClick={() => handleDelete(viewingAnnouncement)}
                  disabled={deletingId === viewingAnnouncement.id}
                >
                  {deletingId === viewingAnnouncement.id ? "Deleting..." : "Delete"}
                </button>
                <button
                  type="button"
                  style={buttonSecondaryStyle}
                  onClick={() => setViewingAnnouncement(null)}
                >
                  Close
                </button>
              </div>
            </article>
          </div>
        )}
      </main>
    </div>
  );
};

const formStyle = {
  display: "grid",
  gap: "14px",
};

const textAreaStyle = {
  ...inputStyle,
  width: "100%",
  height: "120px",
  resize: "vertical",
};

const actionsStyle = {
  display: "flex",
  gap: "12px",
  flexWrap: "wrap",
};

const scheduleGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))",
  gap: "14px",
};

const labelStyle = {
  display: "grid",
  gap: "6px",
  fontSize: "13px",
  fontWeight: 700,
  color: colors.primaryDark,
};

const optionalStyle = {
  color: colors.muted,
  fontWeight: 600,
  textTransform: "lowercase",
};

const cardTagRowStyle = {
  display: "flex",
  gap: "8px",
  flexWrap: "wrap",
};

const windowPillStyle = (state) => {
  const tone = WINDOW_TONES[state] || WINDOW_TONES.Live;

  return {
    ...statusPillStyle,
    background: tone.background,
    color: tone.color,
    border: `1px solid ${tone.borderColor}`,
  };
};

const audiencePillStyle = {
  ...statusPillStyle,
};

const listStyle = {
  display: "grid",
  gap: "16px",
  marginTop: "20px",
};

const announcementCardStyle = {
  ...cardStyle,
  display: "grid",
  gap: "10px",
};

const cardTitleStyle = {
  margin: 0,
  color: colors.text,
};

const metaStyle = {
  ...mutedTextStyle,
  marginTop: "12px",
  fontSize: "13px",
};

const cardActionsStyle = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const modalOverlayStyle = {
  position: "fixed",
  inset: 0,
  display: "grid",
  placeItems: "center",
  padding: "clamp(12px, 4vw, 24px)",
  background: "rgba(10, 12, 20, 0.4)",
  backdropFilter: "blur(12px) saturate(1.2)",
  WebkitBackdropFilter: "blur(12px) saturate(1.2)",
  animation: "scholarHubFadeIn 180ms ease both",
  zIndex: 1200,
};

const viewDialogStyle = {
  ...cardStyle,
  ...glassStrongStyle,
  animation: "scholarHubSheetIn 320ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
  width: "min(560px, 100%)",
  maxHeight: "86vh",
  overflowY: "auto",
  display: "grid",
  gap: "14px",
};

const modalHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: "14px",
  alignItems: "flex-start",
};

const dialogTitleStyle = {
  margin: 0,
  color: colors.text,
  fontSize: "clamp(22px, 6vw, 28px)",
  lineHeight: 1.1,
};

const announcementBodyStyle = {
  ...mutedTextStyle,
  whiteSpace: "pre-wrap",
  padding: "16px",
  borderRadius: "14px",
  border: `1px solid ${colors.border}`,
  background: colors.field,
};

const closeButtonStyle = {
  width: "36px",
  height: "36px",
  border: "none",
  background: "transparent",
  color: colors.primary,
  borderRadius: "999px",
  fontSize: "18px",
  fontWeight: "800",
  lineHeight: 1,
  cursor: "pointer",
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
  color: "var(--viz-good-ink)",
  borderColor: "var(--viz-good-line)",
  background: "var(--viz-good-wash)",
};

export default Announcements;
