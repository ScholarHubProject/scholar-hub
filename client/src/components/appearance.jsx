import { ACCENT_OPTIONS, THEME_OPTIONS, resolveTheme } from "../settings";
import { colors, mutedTextStyle } from "../sharedStyles";
import { useSettings } from "../useSettings";
import { AutoThemeIcon, MoonIcon, SparkleIcon, SunIcon } from "./icons";

// ---------------------------------------------------------------
// Appearance controls
// ---------------------------------------------------------------
// The theme picker is wanted in three places - the settings sheet in
// the app bar, the same sheet on the home page, and as a bare toggle on
// the sign-in screens where there is no bar at all - so the pieces live
// here once. Everything reads and writes through settings.js, and the
// page repaints through the data-* attributes it sets on <html>.

// An iOS switch. Still a checkbox underneath, so it is keyboard
// operable, posts through a form, and reads as a switch to a screen
// reader through the role.
export const Switch = ({ checked, onChange, disabled, label, ...rest }) => (
  <input
    type="checkbox"
    role="switch"
    className="sh-switch"
    checked={Boolean(checked)}
    onChange={onChange}
    disabled={disabled}
    aria-label={label}
    aria-checked={Boolean(checked)}
    {...rest}
  />
);

// The sun/moon button. It flips between light and dark from whichever
// the page is currently painted in, which is what a person means when
// they tap it on an "Auto" theme at night: make it light now.
export const ThemeToggle = ({ style, className = "" }) => {
  const [settings, update] = useSettings();
  const painted = resolveTheme(settings);
  const next = painted === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      className={`sh-theme-toggle ${className}`.trim()}
      style={style}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      onClick={() => update({ theme: next })}
    >
      <SunIcon className="is-sun" size={20} />
      <MoonIcon className="is-moon" size={20} />
    </button>
  );
};

const THEME_ICONS = {
  light: SunIcon,
  dark: MoonIcon,
  system: AutoThemeIcon,
};

// The three miniature screens with their labels. A radio group, so the
// arrow keys move between them the way they do in a native picker.
export const ThemeTiles = ({ value, onChange }) => (
  <div className="sh-theme-tiles" role="radiogroup" aria-label="Theme">
    {THEME_OPTIONS.map((option) => {
      const Icon = THEME_ICONS[option.value];
      const checked = value === option.value;

      return (
        <div key={option.value}>
          <button
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={option.label}
            className={`sh-theme-tile is-${option.value}`}
            onClick={() => onChange(option.value)}
          >
            <span className="sh-theme-tile-bar" />
            <span className="sh-theme-tile-card">
              <i />
              <i />
              <i />
            </span>
          </button>
          <span className="sh-theme-tile-label">
            <Icon size={13} />
            {option.label}
          </span>
        </div>
      );
    })}
  </div>
);

export const AccentSwatches = ({ value, onChange }) => (
  <div className="sh-swatches" role="radiogroup" aria-label="Accent colour">
    {ACCENT_OPTIONS.map((option) => (
      <button
        key={option.value}
        type="button"
        role="radio"
        aria-checked={value === option.value}
        aria-label={option.label}
        title={option.label}
        className="sh-swatch"
        style={{ "--sh-swatch": option.swatch }}
        onClick={() => onChange(option.value)}
      />
    ))}
  </div>
);

// A segmented control: a track with one raised tab that slides to the
// chosen cell. Used for the compact three-way choices in the sheet.
export const SegmentedControl = ({ options, value, onChange, label }) => {
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value)
  );

  return (
    <div
      className="sh-segment"
      role="radiogroup"
      aria-label={label}
      style={{ "--sh-segment-count": options.length, "--sh-segment-index": index }}
    >
      <span className="sh-segment-thumb" aria-hidden="true" />
      {options.map((option) => {
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            className="sh-segment-option"
            onClick={() => onChange(option.value)}
          >
            {Icon && <Icon size={14} />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
};

// The whole Appearance group as it appears in the settings sheet:
// theme, accent, then the two switches that change how the glass and
// the spacing behave. `settings` and `onChange(patch)` come from the
// sheet, which owns saving.
export const AppearanceSettings = ({ settings, onChange, compact = false }) => {
  const accent = ACCENT_OPTIONS.find((option) => option.value === settings.accent);

  return (
    <section style={groupStyle} aria-labelledby="sh-appearance-heading">
      <div style={groupHeadStyle}>
        <span style={groupIconStyle}>
          <SparkleIcon size={16} />
        </span>
        <div>
          <h3 id="sh-appearance-heading" style={groupTitleStyle}>
            Appearance
          </h3>
          <p style={mutedTextStyle}>
            Pick a theme and a tint. Auto follows your device.
          </p>
        </div>
      </div>

      <div style={blockStyle(compact)}>
        <div style={blockHeadStyle}>
          <strong style={blockTitleStyle}>Theme</strong>
          <span style={blockValueStyle}>
            {THEME_OPTIONS.find((option) => option.value === settings.theme)?.label}
            {settings.theme === "system" && ` · ${resolveTheme(settings) === "dark" ? "Dark" : "Light"} now`}
          </span>
        </div>
        <ThemeTiles value={settings.theme} onChange={(theme) => onChange({ theme })} />
      </div>

      <div style={blockStyle(compact)}>
        <div style={blockHeadStyle}>
          <strong style={blockTitleStyle}>Accent colour</strong>
          <span style={{ ...blockValueStyle, color: colors.primary }}>
            <span style={accentDotStyle} />
            {accent?.label}
          </span>
        </div>
        <AccentSwatches value={settings.accent} onChange={(value) => onChange({ accent: value })} />
      </div>

      <div className="sh-list">
        <label style={rowStyle(compact)}>
          <span style={rowCopyStyle}>
            <strong style={rowTitleStyle}>Reduce transparency</strong>
            <span style={mutedTextStyle}>Solid panels instead of frosted glass. Easier on older devices.</span>
          </span>
          <Switch
            checked={settings.reduceTransparency}
            onChange={(event) => onChange({ reduceTransparency: event.target.checked })}
          />
        </label>
        <label style={rowStyle(compact)}>
          <span style={rowCopyStyle}>
            <strong style={rowTitleStyle}>Compact mode</strong>
            <span style={mutedTextStyle}>Tighten spacing across dashboard cards.</span>
          </span>
          <Switch
            checked={settings.compactMode}
            onChange={(event) => onChange({ compactMode: event.target.checked })}
          />
        </label>
      </div>
    </section>
  );
};

const groupStyle = {
  display: "grid",
  gap: "12px",
};

const groupHeadStyle = {
  display: "flex",
  alignItems: "flex-start",
  gap: "12px",
};

const groupIconStyle = {
  width: "32px",
  height: "32px",
  borderRadius: "10px",
  display: "grid",
  placeItems: "center",
  flex: "0 0 auto",
  background: "linear-gradient(135deg, var(--sh-primary), var(--sh-primary-deep))",
  color: "#ffffff",
  boxShadow: "var(--sh-shadow-accent)",
};

const groupTitleStyle = {
  margin: "0 0 2px",
  fontSize: "16px",
  color: colors.text,
};

const blockStyle = (compact) => ({
  display: "grid",
  gap: "12px",
  padding: compact ? "12px" : "16px",
  borderRadius: "var(--sh-radius-md)",
  border: "1px solid var(--sh-glass-border)",
  background: "var(--sh-glass-bg-soft)",
  boxShadow: "var(--sh-glass-highlight)",
});

const blockHeadStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
  flexWrap: "wrap",
};

const blockTitleStyle = {
  color: colors.text,
  fontSize: "14px",
};

const blockValueStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "7px",
  color: colors.muted,
  fontSize: "12.5px",
  fontWeight: 700,
};

const accentDotStyle = {
  width: "10px",
  height: "10px",
  borderRadius: "50%",
  background: colors.primary,
  boxShadow: "0 0 0 3px rgba(var(--sh-primary-rgb), 0.18)",
};

const rowStyle = (compact) => ({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "14px",
  padding: compact ? "11px 14px" : "14px 16px",
  cursor: "pointer",
});

const rowCopyStyle = {
  display: "grid",
  gap: "4px",
  minWidth: 0,
};

const rowTitleStyle = {
  color: colors.text,
  fontSize: "14px",
};
