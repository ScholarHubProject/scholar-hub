// ---------------------------------------------------------------
// Saved accounts
// ---------------------------------------------------------------
// A list of the accounts that have signed in on this browser, kept so the
// login page can offer them as one-click tiles instead of asking the user
// to retype an address they have already used.
//
// What is stored is only what the tile has to draw — name, email, role and
// the avatar path. Never a password and never a token: picking a tile
// fills in who you are, it does not sign you in, so a shared machine gives
// away a name that was already typed into the form and nothing more.

export const SAVED_ACCOUNTS_KEY = "scholarHubSavedAccounts";
export const SAVED_ACCOUNTS_CHANGED_EVENT = "scholarHubSavedAccountsChanged";

// Six fills two rows of the tile grid. Past that the oldest is dropped,
// which on a shared library machine also keeps the list from growing into
// a roster of everyone who has ever used it.
export const MAX_SAVED_ACCOUNTS = 6;

const normalizeEmail = (email) => (typeof email === "string" ? email.trim().toLowerCase() : "");

// The stored shape is deliberately narrow: anything else on the user
// object from the server is dropped rather than parked in localStorage.
const toSavedAccount = (user) => {
  const email = normalizeEmail(user?.email);

  if (!email) return null;

  return {
    id: user.id ?? null,
    name: (user.fullname || user.name || user.full_name || "").trim(),
    email,
    role: user.role === "Admin" ? "Admin" : "Student",
    avatarPath: user.avatarPath || user.avatar_path || "",
    lastUsedAt: Number.isFinite(user.lastUsedAt) ? user.lastUsedAt : Date.now(),
  };
};

const readStored = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVED_ACCOUNTS_KEY));
    if (!Array.isArray(raw)) return [];

    // Anything hand-edited, half-written or left by an older version of
    // this file is put back through the same shaping as a fresh account.
    return raw.map(toSavedAccount).filter(Boolean);
  } catch {
    return [];
  }
};

const writeStored = (accounts) => {
  const trimmed = accounts
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
    .slice(0, MAX_SAVED_ACCOUNTS);

  try {
    localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(trimmed));
  } catch {
    // A full or blocked store costs the convenience, not the sign-in.
  }

  window.dispatchEvent(
    new CustomEvent(SAVED_ACCOUNTS_CHANGED_EVENT, { detail: trimmed })
  );

  return trimmed;
};

// Most recently used first, so the account the user is most likely to
// want is the first tile under their thumb.
export const getSavedAccounts = () =>
  readStored().sort((a, b) => b.lastUsedAt - a.lastUsedAt);

// Called after a successful sign-in or registration. Email is the key:
// the same address signing in again moves its tile to the front and
// refreshes the name and avatar rather than adding a second tile.
export const rememberAccount = (user) => {
  const account = toSavedAccount({ ...user, lastUsedAt: Date.now() });

  if (!account) return getSavedAccounts();

  const others = readStored().filter((saved) => saved.email !== account.email);

  return writeStored([account, ...others]);
};

// Used when the profile changes while signed in — a new avatar or a
// corrected name — so the tile does not keep showing last month's photo.
// Unlike rememberAccount this never adds an account and never reorders.
export const updateSavedAccount = (user) => {
  const email = normalizeEmail(user?.email);
  const stored = readStored();
  const existing = stored.find((saved) => saved.email === email);

  if (!existing) return stored;

  const updated = toSavedAccount({ ...existing, ...user, lastUsedAt: existing.lastUsedAt });

  return writeStored(stored.map((saved) => (saved.email === email ? updated : saved)));
};

export const forgetAccount = (email) => {
  const key = normalizeEmail(email);

  return writeStored(readStored().filter((saved) => saved.email !== key));
};

// Initials for the circle when there is no photo. A Philippine student
// record is usually "DELA CRUZ, JUAN M." — the surname comes first, so
// the first letter either side of the comma reads as the person's
// initials, and an address alone still gets its first letter.
export const getAccountInitials = (account) => {
  const name = account?.name?.trim();

  if (name) {
    // "DELA CRUZ, JUAN M." has to give DJ, not DC: on either side of the
    // comma it is the first word that counts. A name written without a
    // comma is read the ordinary way, first name then last.
    const [surname, given] = name.split(",");
    const firstWord = (part) => part?.trim().split(/\s+/).filter(Boolean)[0] || "";
    const words = given
      ? [firstWord(surname), firstWord(given)]
      : name.trim().split(/\s+/).filter(Boolean);
    const initials = `${words[0]?.[0] || ""}${words[1]?.[0] || ""}`;

    if (initials.trim()) return initials.toUpperCase();
  }

  return (account?.email || "?").charAt(0).toUpperCase();
};

// The tile shows a name when the account has one; otherwise the part of
// the address before the @, which is what the person recognises.
export const getAccountLabel = (account) =>
  account?.name?.trim() || account?.email?.split("@")[0] || "Account";

export const subscribeToSavedAccounts = (callback) => {
  const handleChange = (event) => callback(event.detail || getSavedAccounts());

  // Signing in on a second tab should not leave this tab's picker stale.
  const handleStorage = (event) => {
    if (event.key === SAVED_ACCOUNTS_KEY) callback(getSavedAccounts());
  };

  window.addEventListener(SAVED_ACCOUNTS_CHANGED_EVENT, handleChange);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(SAVED_ACCOUNTS_CHANGED_EVENT, handleChange);
    window.removeEventListener("storage", handleStorage);
  };
};
