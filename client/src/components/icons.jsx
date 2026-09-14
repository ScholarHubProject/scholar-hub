// ---------------------------------------------------------------
// Line icons
// ---------------------------------------------------------------
// Drawn rather than typed. The dashboards previously used emoji, which
// render as a different glyph on every platform and pick up their own
// colour, so a card badge tinted orange came out blue on Windows. These
// are one stroke weight, one 24-unit grid, and they inherit currentColor
// like any other piece of text.

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true",
  focusable: "false",
};

const Icon = ({ size = 18, children, ...rest }) => (
  <svg {...base} width={size} height={size} {...rest}>
    {children}
  </svg>
);

export const TrendIcon = (props) => (
  <Icon {...props}>
    <path d="M3 17l5-5 3.5 3.5L21 6" />
    <path d="M21 11V6h-5" />
  </Icon>
);

export const DocumentIcon = (props) => (
  <Icon {...props}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
    <path d="M9 13h6M9 17h4" />
  </Icon>
);

export const ChartIcon = (props) => (
  <Icon {...props}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </Icon>
);

export const ShieldIcon = (props) => (
  <Icon {...props}>
    <path d="M12 3l7 3v5.5c0 4.3-2.9 7.9-7 9.5-4.1-1.6-7-5.2-7-9.5V6z" />
    <path d="M9.2 12.2l2 2 3.6-3.9" />
  </Icon>
);

export const WalletIcon = (props) => (
  <Icon {...props}>
    <path d="M3 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2" />
    <path d="M3 8v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3" />
    <path d="M21 11h-4a2 2 0 0 0 0 4h4z" />
  </Icon>
);

export const CalendarIcon = (props) => (
  <Icon {...props}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Icon>
);

export const WarningIcon = (props) => (
  <Icon {...props}>
    <path d="M12 4l9 15.5H3z" />
    <path d="M12 10v4M12 17.2v.1" />
  </Icon>
);

export const UsersIcon = (props) => (
  <Icon {...props}>
    <path d="M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20" />
    <circle cx="9" cy="7" r="3.2" />
    <path d="M22 20v-1.5a4 4 0 0 0-3-3.9" />
    <path d="M16.5 4.1a3.2 3.2 0 0 1 0 6" />
  </Icon>
);

export const CheckIcon = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8.5 12.2l2.4 2.4 4.6-5" />
  </Icon>
);

export const CrossIcon = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6" />
  </Icon>
);

export const PlusIcon = (props) => (
  <Icon {...props}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const ClockIcon = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 1.8" />
  </Icon>
);

export const RenewIcon = (props) => (
  <Icon {...props}>
    <path d="M20 12a8 8 0 1 1-2.6-5.9" />
    <path d="M20 4v4h-4" />
  </Icon>
);

export const StarIcon = (props) => (
  <Icon {...props}>
    <path d="M12 4l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.7l5.4-.8z" />
  </Icon>
);

export const SearchIcon = (props) => (
  <Icon {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.6-3.6" />
  </Icon>
);

export const ArrowRightIcon = (props) => (
  <Icon {...props}>
    <path d="M5 12h13M13 6l6 6-6 6" />
  </Icon>
);

// Auth form icons. Login and registration each drew their own eye and
// eye-off pair with a different stroke weight and a different viewBox,
// so the two pages did not quite match; they share these now.
export const EyeIcon = (props) => (
  <Icon {...props}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

export const EyeOffIcon = (props) => (
  <Icon {...props}>
    <path d="M10.6 5.2A9.8 9.8 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.4 4.3M6.2 6.3A17.5 17.5 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4.2-.9" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    <path d="m3 3 18 18" />
  </Icon>
);

export const MailIcon = (props) => (
  <Icon {...props}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3.5 7 8.5 6 8.5-6" />
  </Icon>
);

export const LockIcon = (props) => (
  <Icon {...props}>
    <rect x="4" y="10" width="16" height="10" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </Icon>
);

export const UserIcon = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="8" r="3.6" />
    <path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" />
  </Icon>
);

export const IdCardIcon = (props) => (
  <Icon {...props}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <circle cx="8.5" cy="11" r="2" />
    <path d="M5.5 16a3.4 3.4 0 0 1 6 0M14 10h4M14 14h3" />
  </Icon>
);

export const PhoneIcon = (props) => (
  <Icon {...props}>
    <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
    <path d="M10.5 18.5h3" />
  </Icon>
);

export const CapIcon = (props) => (
  <Icon {...props}>
    <path d="M12 4 2.5 8.5 12 13l9.5-4.5L12 4Z" />
    <path d="M6.5 10.8V15c0 1.5 2.5 2.8 5.5 2.8s5.5-1.3 5.5-2.8v-4.2" />
    <path d="M21.5 8.5v5" />
  </Icon>
);

// The hero illustration: a mortarboard over a stack of books beside a
// small plant and a bar chart. Inline SVG rather than an image file so it
// picks up the theme tokens and stays crisp at any size.
export const SunIcon = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Icon>
);

export const MoonIcon = (props) => (
  <Icon {...props}>
    <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />
  </Icon>
);

export const AutoThemeIcon = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 3.5v17A8.5 8.5 0 0 0 12 3.5Z" fill="currentColor" stroke="none" />
  </Icon>
);

export const PaletteIcon = (props) => (
  <Icon {...props}>
    <path d="M12 3a9 9 0 1 0 0 18c1.2 0 2-.9 2-2 0-.5-.2-.9-.5-1.3-.3-.4-.5-.8-.5-1.2 0-1.1.9-2 2-2h1.8A4.2 4.2 0 0 0 21 10.4C21 6.3 16.9 3 12 3Z" />
    <circle cx="7.5" cy="11.5" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="10.5" cy="7.5" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="7.5" r="1.1" fill="currentColor" stroke="none" />
  </Icon>
);

export const SparkleIcon = (props) => (
  <Icon {...props}>
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z" />
    <path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" />
  </Icon>
);

export const UploadIcon = (props) => (
  <Icon {...props}>
    <path d="M12 16V5" />
    <path d="m7.5 9.5 4.5-4.5 4.5 4.5" />
    <path d="M4 15.5v1.8A2.7 2.7 0 0 0 6.7 20h10.6a2.7 2.7 0 0 0 2.7-2.7v-1.8" />
  </Icon>
);

export const FileIcon = (props) => (
  <Icon {...props}>
    <path d="M14 3H7.5A1.5 1.5 0 0 0 6 4.5v15A1.5 1.5 0 0 0 7.5 21h9a1.5 1.5 0 0 0 1.5-1.5V7l-4-4Z" />
    <path d="M14 3v4h4" />
  </Icon>
);

export const ScholarshipArt = ({ width = 260 }) => (
  <svg
    width={width}
    viewBox="0 0 260 150"
    fill="none"
    aria-hidden="true"
    focusable="false"
    style={{ display: "block", maxWidth: "100%", height: "auto" }}
  >
    {/* bar chart */}
    <rect x="196" y="86" width="14" height="42" rx="4" fill="var(--sh-primary-soft)" />
    <rect x="216" y="66" width="14" height="62" rx="4" fill="var(--sh-primary)" opacity="0.45" />
    <rect x="236" y="46" width="14" height="82" rx="4" fill="var(--sh-primary)" opacity="0.75" />

    {/* plant */}
    <path
      d="M40 128v-18"
      stroke="var(--viz-good)"
      strokeWidth="3"
      strokeLinecap="round"
      opacity="0.75"
    />
    <path
      d="M40 114c-9 0-14-5-14-13 8 0 14 5 14 13zM40 108c8 0 13-5 13-12-8 0-13 4-13 12z"
      fill="var(--viz-good)"
      opacity="0.55"
    />
    <path d="M31 128h18l-2.5 14h-13z" fill="var(--sh-primary)" opacity="0.55" />

    {/* books */}
    <rect x="74" y="114" width="96" height="14" rx="4" fill="var(--sh-primary)" opacity="0.85" />
    <rect x="80" y="100" width="84" height="14" rx="4" fill="var(--sh-primary)" opacity="0.5" />
    <rect x="86" y="86" width="72" height="14" rx="4" fill="var(--sh-primary)" opacity="0.3" />

    {/* mortarboard */}
    <path d="M122 34L74 54l48 20 48-20z" fill="var(--sh-primary-dark)" />
    <path d="M92 63v18c0 6 13 11 30 11s30-5 30-11V63l-30 12z" fill="var(--sh-primary)" />
    <path
      d="M170 54v22"
      stroke="var(--sh-primary-dark)"
      strokeWidth="3"
      strokeLinecap="round"
    />
    <circle cx="170" cy="79" r="4" fill="var(--sh-primary-dark)" />
  </svg>
);
