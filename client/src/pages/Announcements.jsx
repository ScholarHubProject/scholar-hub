import { useEffect, useState } from "react";
import api from "../api";
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  eyebrowStyle,
  inputStyle,
  mutedTextStyle,
  narrowShellStyle,
  pageHeaderStyle,
  pageStyle,
  titleStyle,
} from "../sharedStyles";

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

const Announcements = () => {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [notice, setNotice] = useState(null);
  const [editingAnnouncement, setEditingAnnouncement] = useState(null);
  const [viewingAnnouncement, setViewingAnnouncement] = useState(null);
  const [formData, setFormData] = useState({
    title: "",
    content: "",
  });

  const loadAnnouncements = async () => {
    setLoading(true);

    try {
      const response = await api.get("/announcements");
      setAnnouncements(Array.isArray(response.data) ? response.data : []);
      setNotice(null);
    } catch (error) {
      console.log("Announcements load error:", error);
      setNotice("Failed to load announcements");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnnouncements();
  }, []);

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
        const response = await api.put(`/announcements/${editingAnnouncement.id}`, formData);
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
        const response = await api.post("/announcements", formData);
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

      setFormData({ title: "", content: "" });
      setEditingAnnouncement(null);
      setNotice(
        wasEditing
          ? "Announcement updated successfully"
          : "Announcement posted successfully"
      );
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
    });
    setNotice(null);
  };

  const cancelEditing = () => {
    setEditingAnnouncement(null);
    setFormData({ title: "", content: "" });
    setNotice(null);
  };

  return (
    <div style={pageStyle}>
      <main style={narrowShellStyle}>
        <header style={pageHeaderStyle}>
          <span style={eyebrowStyle}>Campus Updates</span>
          <h1 style={titleStyle}>Announcements</h1>
          <p style={mutedTextStyle}>
            Admin can post scholarship announcements and reminders for students.
          </p>
        </header>

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
              <button type="button" style={buttonSecondaryStyle} onClick={loadAnnouncements} disabled={loading}>
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
                <h3 style={cardTitleStyle}>{announcement.title}</h3>
                <p style={mutedTextStyle}>{announcement.content}</p>
                <p style={metaStyle}>{formatDate(announcement.created_at)}</p>
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
  background: "rgba(15, 23, 42, 0.58)",
  backdropFilter: "blur(4px)",
  zIndex: 1200,
};

const viewDialogStyle = {
  ...cardStyle,
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

const noticeStyle = {
  ...cardStyle,
  marginBottom: "18px",
  color: "#166534",
  borderColor: "#bbf7d0",
  background: "#dcfce7",
};

export default Announcements;
