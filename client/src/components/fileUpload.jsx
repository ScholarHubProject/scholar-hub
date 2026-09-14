import { useId, useState } from "react";
import { colors, mutedTextStyle } from "../sharedStyles";
import { UploadIcon } from "./icons";

// ---------------------------------------------------------------
// File drop zone
// ---------------------------------------------------------------
// The native file control is the one element on the form the browser
// insists on drawing itself - a grey "Choose File / No file chosen"
// that matches nothing else on the page. The control stays (it is what
// opens the picker and what a screen reader announces) but it is
// visually hidden inside a label, and the label is the thing the user
// sees: a dashed glass panel that takes a click, a keyboard focus, or
// a dragged file.

const ACCEPT_NAMES = {
  ".pdf": "PDF",
  ".doc": "Word",
  ".docx": "Word",
  ".png": "PNG",
  ".jpg": "JPG",
  ".jpeg": "JPG",
  ".webp": "WebP",
  ".heic": "HEIC",
  ".heif": "HEIC",
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/webp": "WebP",
  "image/heic": "HEIC",
  "image/heif": "HEIC",
  "image/*": "images",
};

// "PDF, Word, PNG, JPG" from the accept list, so the hint under the
// zone never disagrees with what the picker actually allows.
const describeAccept = (accept = "") => {
  const names = [];
  accept
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .forEach((part) => {
      const name = ACCEPT_NAMES[part] || part.replace(/^\./, "").toUpperCase();
      if (!names.includes(name)) names.push(name);
    });
  return names.join(", ");
};

export const FileDropZone = ({
  accept,
  multiple = false,
  disabled = false,
  busy = false,
  title,
  hint,
  inputRef,
  onFiles,
  compact = false,
}) => {
  const id = useId();
  const [over, setOver] = useState(false);
  const inactive = disabled || busy;
  const formats = describeAccept(accept);

  const deliver = (files) => {
    if (inactive || !files || files.length === 0) return;
    onFiles(multiple ? files : [files[0]]);
  };

  return (
    <label
      htmlFor={id}
      className={`sh-dropzone${over ? " is-over" : ""}${inactive ? " is-disabled" : ""}`}
      style={compact ? dropzoneCompactStyle : dropzoneStyle}
      onDragEnter={(event) => {
        event.preventDefault();
        if (!inactive) setOver(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (!inactive) setOver(true);
      }}
      onDragLeave={(event) => {
        // Leaving a child still fires dragleave on the label; only the
        // real exit, where the pointer is outside the label, clears it.
        if (!event.currentTarget.contains(event.relatedTarget)) setOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        deliver(event.dataTransfer?.files);
      }}
    >
      <input
        id={id}
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={inactive}
        className="sh-dropzone-input"
        onChange={(event) => {
          deliver(event.target.files);
          // Cleared so choosing the same file again still fires a change.
          event.target.value = "";
        }}
      />

      <span style={compact ? iconCompactStyle : iconStyle} aria-hidden="true">
        {busy ? <span className="sh-spinner" style={spinnerStyle} /> : <UploadIcon size={compact ? 18 : 22} />}
      </span>

      <span style={copyStyle}>
        <strong style={titleStyle}>
          {busy
            ? "Uploading..."
            : title || (multiple ? "Choose files or drag them here" : "Choose a file or drag it here")}
        </strong>
        <span style={hintStyle}>
          {hint || (formats ? `${formats}${multiple ? " · more than one file is fine" : ""}` : "Any file type")}
        </span>
      </span>

      <span style={compact ? browseCompactStyle : browseStyle} className="sh-dropzone-browse">
        Browse
      </span>
    </label>
  );
};

const dropzoneStyle = {
  display: "flex",
  alignItems: "center",
  gap: "14px",
  padding: "16px 18px",
  borderRadius: "var(--sh-radius-md)",
  border: `1.5px dashed rgba(var(--sh-primary-rgb), 0.45)`,
  background: "var(--sh-glass-bg-soft)",
  boxShadow: "var(--sh-glass-highlight)",
  cursor: "pointer",
  position: "relative",
  transition: "border-color 180ms ease, background 180ms ease, box-shadow 180ms ease, transform 180ms ease",
};

const dropzoneCompactStyle = {
  ...dropzoneStyle,
  gap: "12px",
  padding: "12px 14px",
};

const iconStyle = {
  width: "44px",
  height: "44px",
  flex: "0 0 auto",
  borderRadius: "14px",
  display: "grid",
  placeItems: "center",
  background: "linear-gradient(135deg, var(--sh-primary), var(--sh-primary-deep))",
  color: "#ffffff",
  boxShadow: "var(--sh-shadow-accent)",
};

const iconCompactStyle = {
  ...iconStyle,
  width: "36px",
  height: "36px",
  borderRadius: "11px",
};

const spinnerStyle = {
  display: "block",
  width: "18px",
  height: "18px",
  borderRadius: "50%",
  border: "2.5px solid rgba(255, 255, 255, 0.35)",
  borderTopColor: "#ffffff",
};

const copyStyle = {
  display: "grid",
  gap: "3px",
  minWidth: 0,
  flex: "1 1 auto",
};

const titleStyle = {
  color: colors.text,
  fontSize: "14px",
  lineHeight: 1.3,
};

const hintStyle = {
  ...mutedTextStyle,
  fontSize: "12.5px",
  lineHeight: 1.45,
};

const browseStyle = {
  flex: "0 0 auto",
  padding: "9px 16px",
  borderRadius: "999px",
  background: "var(--sh-glass-bg-strong)",
  border: `1px solid ${colors.glassBorder}`,
  boxShadow: "var(--sh-shadow-sm)",
  color: colors.primaryDark,
  fontSize: "13px",
  fontWeight: 700,
  whiteSpace: "nowrap",
  transition: "transform 180ms ease, box-shadow 180ms ease",
};

const browseCompactStyle = {
  ...browseStyle,
  padding: "7px 13px",
  fontSize: "12.5px",
};
