export const SETTINGS_KEY = "scholarHubSettings";
export const SETTINGS_CHANGED_EVENT = "scholarHubSettingsChanged";

export const DEFAULT_SETTINGS = {
  emailNotifications: true,
  autoRefresh: true,
  announcementDigest: true,
  darkMode: false,
  compactMode: false,
  showStatusBadges: true,
  accent: "orange",
  reminderFrequency: "Daily",
  defaultDashboard: "Student Dashboard",
};

export const getSavedSettings = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
};

export const saveSettings = (settings) => {
  const nextSettings = { ...DEFAULT_SETTINGS, ...settings };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(nextSettings));
  applySettingsTheme(nextSettings);
  window.dispatchEvent(
    new CustomEvent(SETTINGS_CHANGED_EVENT, {
      detail: nextSettings,
    })
  );
  return nextSettings;
};

export const applySettingsTheme = (settings = getSavedSettings()) => {
  if (typeof document === "undefined") return;

  const theme = settings.darkMode ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
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
