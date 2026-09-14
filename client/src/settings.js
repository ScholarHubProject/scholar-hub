export const SETTINGS_KEY = "scholarHubSettings";
export const SETTINGS_CHANGED_EVENT = "scholarHubSettingsChanged";

// Appearance is three independent choices, the way it is on iOS: which
// theme, which tint, and whether surfaces are see-through. "system"
// follows the OS and re-applies itself when the OS flips at sunset.
export const THEME_OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "Auto" },
];

// Each accent is a pair per theme: the tint itself and the deeper ink
// used for text on a soft wash. Every other tint on the page - borders,
// page wash, field fill, focus ring - is mixed from these in index.css,
// so adding an accent is adding one row here and one block there.
export const ACCENT_OPTIONS = [
  { value: "orange", label: "Orange", swatch: "#f97316" },
  { value: "amber", label: "Amber", swatch: "#f59e0b" },
  { value: "rose", label: "Rose", swatch: "#f43f5e" },
  { value: "violet", label: "Violet", swatch: "#8b5cf6" },
  { value: "blue", label: "Blue", swatch: "#3b82f6" },
  { value: "teal", label: "Teal", swatch: "#14b8a6" },
  { value: "graphite", label: "Graphite", swatch: "#64748b" },
];

export const DEFAULT_SETTINGS = {
  emailNotifications: true,
  autoRefresh: true,
  announcementDigest: true,
  theme: "system",
  compactMode: false,
  showStatusBadges: true,
  accent: "orange",
  // The glass look is a blur over whatever sits behind a panel. That is
  // the one effect on the page that costs real GPU time, so it can be
  // turned off - the same switch iOS calls "Reduce Transparency".
  reduceTransparency: false,
  reminderFrequency: "Daily",
  defaultDashboard: "Student Dashboard",
};

const VALID_THEMES = new Set(THEME_OPTIONS.map((option) => option.value));
const VALID_ACCENTS = new Set(ACCENT_OPTIONS.map((option) => option.value));

// Settings saved before the theme picker existed carried a boolean
// darkMode. It is read once here and never written back, so an old
// browser profile lands on the theme it had rather than on "system".
const normalizeSettings = (raw = {}) => {
  const merged = { ...DEFAULT_SETTINGS, ...raw };

  if (!VALID_THEMES.has(merged.theme)) {
    merged.theme = raw.darkMode === true ? "dark" : raw.darkMode === false ? "light" : "system";
  }

  if (!VALID_ACCENTS.has(merged.accent)) {
    merged.accent = DEFAULT_SETTINGS.accent;
  }

  delete merged.darkMode;
  return merged;
};

export const getSavedSettings = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return normalizeSettings(raw ? JSON.parse(raw) : {});
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
};

export const saveSettings = (settings) => {
  const nextSettings = normalizeSettings(settings);
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(nextSettings));
  applySettingsTheme(nextSettings);
  window.dispatchEvent(
    new CustomEvent(SETTINGS_CHANGED_EVENT, {
      detail: nextSettings,
    })
  );
  return nextSettings;
};

const systemPrefersDark = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-color-scheme: dark)").matches;

// The theme the page is actually painted in - "system" resolved against
// the OS - which is what a sun/moon toggle needs to know to flip it.
export const resolveTheme = (settings = getSavedSettings()) =>
  settings.theme === "system" ? (systemPrefersDark() ? "dark" : "light") : settings.theme;

export const applySettingsTheme = (settings = getSavedSettings()) => {
  if (typeof document === "undefined") return;

  const theme = resolveTheme(settings);
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.accent = settings.accent;
  root.dataset.glass = settings.reduceTransparency ? "off" : "on";
  root.style.colorScheme = theme;

  // The browser's own chrome (the address bar on a phone) follows the
  // page, so it does not stay orange over a blue dark theme.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const swatch = ACCENT_OPTIONS.find((option) => option.value === settings.accent)?.swatch;
    meta.setAttribute("content", theme === "dark" ? "#0b1220" : swatch || "#f97316");
  }
};

// Keeps an "Auto" theme honest: when the OS switches, the page follows
// without a reload. Called once from main.jsx.
export const watchSystemTheme = () => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }

  const query = window.matchMedia("(prefers-color-scheme: dark)");
  const handleChange = () => {
    const settings = getSavedSettings();
    if (settings.theme === "system") applySettingsTheme(settings);
  };

  query.addEventListener("change", handleChange);
  return () => query.removeEventListener("change", handleChange);
};

export const subscribeToSettings = (callback) => {
  const handleSettingsChange = (event) => {
    const nextSettings = event.detail || getSavedSettings();
    applySettingsTheme(nextSettings);
    callback(nextSettings);
  };

  const handleStorageChange = (event) => {
    if (event.key === SETTINGS_KEY) {
      const nextSettings = getSavedSettings();
      applySettingsTheme(nextSettings);
      callback(nextSettings);
    }
  };

  window.addEventListener(SETTINGS_CHANGED_EVENT, handleSettingsChange);
  window.addEventListener("storage", handleStorageChange);

  return () => {
    window.removeEventListener(SETTINGS_CHANGED_EVENT, handleSettingsChange);
    window.removeEventListener("storage", handleStorageChange);
  };
};
