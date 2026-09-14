import { useCallback, useEffect, useState } from "react";
import api, { getStoredUser } from "../api";
import { HeroBanner } from "../components/ui";
import {
  buttonDangerStyle,
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  eyebrowStyle,
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

const EMPTY_FORM = {
  fullname: "",
  email: "",
  role: "Student",
  schoolIdNumber: "",
  courseYear: "",
  contactNumber: "",
};

const formatDate = (value) => {
  if (!value) return "Not available";
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

// The office asks two questions about an account it is thinking of retiring:
// can this person sign in, and can the scholarship office reach them. Both are
// answered on the row rather than behind a click.
const describeAccountState = (account) => {
  if (!account.isActive) return { label: "Deactivated", tone: "danger" };
  if (!account.emailVerified) return { label: "Unconfirmed email", tone: "warning" };
  return { label: "Active", tone: "success" };
};

const ManageUsers = () => {
  const currentUser = getStoredUser();

  const [accounts, setAccounts] = useState([]);
  const [totals, setTotals] = useState({ total: 0, totalPages: 1, activeAdmins: 0 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);

  const showNotice = (tone, text) => setNotice({ tone, text });

  const loadAccounts = useCallback(async () => {
    setLoading(true);

    try {
      const response = await api.get("/users", {
        params: {
          search: search.trim() || undefined,
          role: roleFilter || undefined,
          state: stateFilter || undefined,
          page,
        },
      });

      setAccounts(Array.isArray(response.data?.users) ? response.data.users : []);
      setTotals({
        total: response.data?.total || 0,
        totalPages: response.data?.totalPages || 1,
        activeAdmins: response.data?.activeAdmins || 0,
      });
    } catch (error) {
      console.log("Account list error:", error);
      showNotice("error", error.response?.data?.message || "Failed to load accounts.");
    } finally {
      setLoading(false);
    }
  }, [page, roleFilter, search, stateFilter]);

  // Typing in the search box should not fire a request per keystroke.
  useEffect(() => {
    const timer = window.setTimeout(loadAccounts, 300);
    return () => window.clearTimeout(timer);
  }, [loadAccounts]);

  // Every filter goes back to page one, because page four of the old result
  // set is rarely page four of the new one. Done in the handler rather than in
  // an effect watching the filters: an effect would render once with the stale
  // page, fetch, then render again.
  const changeFilter = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  // The row is replaced from the server's answer rather than patched from what
  // was sent, so a refusal the client did not anticipate leaves the table
  // showing what is actually stored.
  const applyChange = async (account, changes, describe) => {
    setBusyId(account.id);
    setNotice(null);

    try {
      const response = await api.put(`/users/${account.id}`, changes);

      setAccounts((current) =>
        current.map((row) => (row.id === account.id ? response.data.user : row))
      );
      showNotice("success", describe(response.data.user));

      // Promoting or retiring an admin moves the count that decides whether the
      // last-admin guard fires, so it has to be re-read rather than guessed.
      if (changes.role !== undefined || changes.isActive !== undefined) {
        loadAccounts();
      }
    } catch (error) {
      showNotice(
        "error",
        error.response?.data?.message || "That change could not be saved."
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    setCreating(true);
    setNotice(null);

    try {
      const response = await api.post("/users", formData);
      showNotice(response.data.inviteSent ? "success" : "warning", response.data.message);
      setFormData(EMPTY_FORM);
      setFormOpen(false);
      loadAccounts();
    } catch (error) {
      showNotice(
        "error",
        error.response?.data?.message || "That account could not be created."
      );
    } finally {
      setCreating(false);
    }
  };

  const handlePasswordLink = async (account) => {
    setBusyId(account.id);
    setNotice(null);

    try {
      const response = await api.post(`/users/${account.id}/password-link`);
      showNotice(response.data.sent ? "success" : "warning", response.data.message);
    } catch (error) {
      showNotice(
        "error",
        error.response?.data?.message || "That link could not be sent."
      );
    } finally {
      setBusyId(null);
    }
  };

  const updateField = (field, value) =>
    setFormData((current) => ({ ...current, [field]: value }));

  return (
    <div style={pageStyle}>
      <main style={shellStyle}>
        <HeroBanner
          eyebrow="Accounts"
          title="Manage accounts"
          subtitle="Add a coordinator, retire a graduate, or send someone a link to set their password. Nothing here deletes an account — deactivating stops sign-in and keeps the application history intact."
          actions={
            <button
              type="button"
              style={buttonPrimaryStyle}
              onClick={() => setFormOpen((open) => !open)}
            >
              {formOpen ? "Close" : "Add an account"}
            </button>
          }
        />

        {notice && <div style={noticeStyle(notice.tone)}>{notice.text}</div>}

        {formOpen && (
          <section style={cardStyle}>
            <span style={eyebrowStyle}>New account</span>
            <p style={mutedTextStyle}>
              You do not choose the password. The account is created with an
              unguessable placeholder and its owner is emailed a link to set a
              real one, so a password never has to travel through a chat message.
            </p>

            <form onSubmit={handleCreate} style={formStyle}>
              <div style={formGridStyle}>
                <label style={labelStyle}>
                  Full name
                  <input
                    style={inputStyle}
                    value={formData.fullname}
                    onChange={(event) => updateField("fullname", event.target.value)}
                    required
                  />
                </label>

                <label style={labelStyle}>
                  Email address
                  <input
                    style={inputStyle}
                    type="email"
                    value={formData.email}
                    onChange={(event) => updateField("email", event.target.value)}
                    required
                  />
                </label>

                <label style={labelStyle}>
                  Role
                  <select
                    style={inputStyle}
                    value={formData.role}
                    onChange={(event) => updateField("role", event.target.value)}
                  >
                    <option value="Student">Student</option>
                    <option value="Admin">Admin</option>
                  </select>
                </label>

                <label style={labelStyle}>
                  School ID number
                  <input
                    style={inputStyle}
                    value={formData.schoolIdNumber}
                    onChange={(event) => updateField("schoolIdNumber", event.target.value)}
                  />
                </label>

                <label style={labelStyle}>
                  Course and year
                  <input
                    style={inputStyle}
                    value={formData.courseYear}
                    onChange={(event) => updateField("courseYear", event.target.value)}
                  />
                </label>

                <label style={labelStyle}>
                  Contact number
                  <input
                    style={inputStyle}
                    value={formData.contactNumber}
                    onChange={(event) => updateField("contactNumber", event.target.value)}
                  />
                </label>
              </div>

              <div style={actionsRowStyle}>
                <button type="submit" style={buttonPrimaryStyle} disabled={creating}>
                  {creating ? "Creating..." : "Create account and send invite"}
                </button>
                <button
                  type="button"
                  style={buttonSecondaryStyle}
                  onClick={() => {
                    setFormOpen(false);
                    setFormData(EMPTY_FORM);
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        )}

        <section style={filterCardStyle}>
          <input
            style={{ ...inputStyle, flex: "2 1 240px" }}
            placeholder="Search by name, email or school ID"
            value={search}
            onChange={(event) => changeFilter(setSearch)(event.target.value)}
          />

          <select
            style={{ ...inputStyle, flex: "1 1 140px" }}
            value={roleFilter}
            onChange={(event) => changeFilter(setRoleFilter)(event.target.value)}
            aria-label="Filter by role"
          >
            <option value="">All roles</option>
            <option value="Student">Students</option>
            <option value="Admin">Admins</option>
          </select>

          <select
            style={{ ...inputStyle, flex: "1 1 160px" }}
            value={stateFilter}
            onChange={(event) => changeFilter(setStateFilter)(event.target.value)}
            aria-label="Filter by account state"
          >
            <option value="">Any state</option>
            <option value="active">Active only</option>
            <option value="inactive">Deactivated only</option>
            <option value="unverified">Unconfirmed email</option>
          </select>

          <button type="button" style={buttonSecondaryStyle} onClick={loadAccounts}>
            Refresh
          </button>
        </section>

        {loading ? (
          <div style={cardStyle}>
            <p style={mutedTextStyle}>Loading accounts...</p>
          </div>
        ) : accounts.length === 0 ? (
          <div style={cardStyle}>
            <p style={mutedTextStyle}>No accounts match those filters.</p>
          </div>
        ) : (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Email</th>
                  <th style={thStyle}>Role</th>
                  <th style={thStyle}>State</th>
                  <th style={thStyle}>Applications</th>
                  <th style={thStyle}>Joined</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => {
                  const state = describeAccountState(account);
                  const isSelf = Number(account.id) === Number(currentUser?.id);
                  const busy = busyId === account.id;

                  return (
                    <tr key={account.id}>
                      <td style={tdStyle}>
                        {account.fullname}
                        {isSelf && <span style={selfTagStyle}>you</span>}
                        {account.schoolIdNumber && (
                          <span style={subtleStyle}>{account.schoolIdNumber}</span>
                        )}
                      </td>
                      <td style={tdStyle}>{account.email}</td>
                      <td style={tdStyle}>
                        <span style={statusPillStyle}>{account.role}</span>
                      </td>
                      <td style={tdStyle}>
                        <span style={statePillStyle(state.tone)}>{state.label}</span>
                        {!account.isActive && account.deactivatedAt && (
                          <span style={subtleStyle}>
                            since {formatDate(account.deactivatedAt)}
                          </span>
                        )}
                      </td>
                      <td style={tdStyle}>{account.applicationCount ?? 0}</td>
                      <td style={tdStyle}>{formatDate(account.createdAt)}</td>
                      <td style={tdStyle}>
                        <div style={rowActionsStyle}>
                          {/* Both of these are refused by the server for your
                              own account and for the last active admin. They
                              are hidden here too so the refusal is not the
                              first time anyone hears about the rule. */}
                          {!isSelf && (
                            <button
                              type="button"
                              style={buttonSecondaryStyle}
                              disabled={busy}
                              onClick={() =>
                                applyChange(
                                  account,
                                  { role: account.role === "Admin" ? "Student" : "Admin" },
                                  (updated) =>
                                    `${updated.fullname} is now ${
                                      updated.role === "Admin" ? "an admin" : "a student"
                                    }.`
                                )
                              }
                            >
                              {account.role === "Admin" ? "Make student" : "Make admin"}
                            </button>
                          )}

                          {account.isActive && (
                            <button
                              type="button"
                              style={buttonSecondaryStyle}
                              disabled={busy}
                              onClick={() => handlePasswordLink(account)}
                            >
                              Send password link
                            </button>
                          )}

                          {!isSelf &&
                            (account.isActive ? (
                              <button
                                type="button"
                                style={buttonDangerStyle}
                                disabled={busy}
                                onClick={() => {
                                  if (
                                    !window.confirm(
                                      `Deactivate ${account.fullname}? They will not be able to sign in. Their applications and award history stay exactly as they are.`
                                    )
                                  ) {
                                    return;
                                  }

                                  applyChange(
                                    account,
                                    { isActive: false },
                                    (updated) => `${updated.fullname} can no longer sign in.`
                                  );
                                }}
                              >
                                Deactivate
                              </button>
                            ) : (
                              <button
                                type="button"
                                style={buttonPrimaryStyle}
                                disabled={busy}
                                onClick={() =>
                                  applyChange(
                                    account,
                                    { isActive: true },
                                    (updated) => `${updated.fullname} can sign in again.`
                                  )
                                }
                              >
                                Reactivate
                              </button>
                            ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && totals.totalPages > 1 && (
          <nav style={paginationStyle} aria-label="Account pages">
            <button
              type="button"
              style={buttonSecondaryStyle}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
            >
              Previous
            </button>

            <span style={mutedTextStyle}>
              Page {page} of {totals.totalPages} &middot; {totals.total} accounts
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

        {/* Printed rather than left implicit: it is the number that decides
            whether the guard against locking the office out will fire. */}
        {!loading && (
          <p style={{ ...mutedTextStyle, marginTop: "16px", textAlign: "center" }}>
            {totals.activeAdmins} active admin
            {totals.activeAdmins === 1 ? "" : "s"}.
            {totals.activeAdmins === 1 &&
              " The last one cannot be demoted or deactivated — add a second admin first."}
          </p>
        )}
      </main>
    </div>
  );
};

const formStyle = {
  display: "grid",
  gap: "16px",
  marginTop: "16px",
};

const formGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))",
  gap: "14px",
};

const labelStyle = {
  display: "grid",
  gap: "6px",
  fontSize: "13px",
  fontWeight: 700,
  color: colors.primaryDark,
};

const actionsRowStyle = {
  display: "flex",
  gap: "12px",
  flexWrap: "wrap",
};

const filterCardStyle = {
  ...cardStyle,
  display: "flex",
  gap: "12px",
  flexWrap: "wrap",
  alignItems: "center",
  margin: "18px 0",
};

const rowActionsStyle = {
  display: "flex",
  gap: "8px",
  flexWrap: "wrap",
};

const subtleStyle = {
  display: "block",
  color: colors.muted,
  fontSize: "12px",
  marginTop: "3px",
};

const selfTagStyle = {
  marginLeft: "8px",
  padding: "2px 8px",
  borderRadius: "999px",
  background: colors.primarySoft,
  color: colors.primaryDark,
  fontSize: "11px",
  fontWeight: 800,
  textTransform: "uppercase",
};

const stateToneStyles = {
  success: { background: "var(--viz-good-wash)", color: "var(--viz-good-ink)", borderColor: "var(--viz-good-line)" },
  warning: { background: "var(--viz-warning-wash)", color: "var(--viz-warning-ink)", borderColor: "var(--viz-warning-line)" },
  danger: { background: "var(--viz-critical-wash)", color: "var(--viz-critical-ink)", borderColor: "var(--viz-critical-line)" },
};

const statePillStyle = (tone) => ({
  ...statusPillStyle,
  ...stateToneStyles[tone],
  border: `1px solid ${stateToneStyles[tone].borderColor}`,
});

const paginationStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "14px",
  flexWrap: "wrap",
  marginTop: "18px",
};

const noticeToneStyles = {
  success: { background: "var(--viz-good-wash)", color: "var(--viz-good-ink)", borderColor: "var(--viz-good-line)" },
  warning: { background: "var(--viz-warning-wash)", color: "var(--viz-warning-ink)", borderColor: "var(--viz-warning-line)" },
  error: { background: "var(--viz-critical-wash)", color: "var(--viz-critical-ink)", borderColor: "var(--viz-critical-line)" },
};

const noticeStyle = (tone) => ({
  ...cardStyle,
  ...noticeToneStyles[tone || "success"],
  marginBottom: "18px",
});

export default ManageUsers;
