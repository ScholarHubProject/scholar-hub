import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import QRCode from "qrcode";

// Always the live site, wherever this page is opened: a code generated from a
// laptop running `npm run dev` must not encode localhost, which no phone can
// open. VITE_PUBLIC_SITE_URL overrides it if the site ever moves.
const SITE_URL =
  import.meta.env.VITE_PUBLIC_SITE_URL || "https://psuscholarhub.netlify.app";

// Drop the official seal in client/public/psu-logo.png and it takes the centre
// of the code. Until then the ScholarHub mark stands in.
const LOGO_SOURCES = ["/psu-logo.png", "/Scholarhub.png"];

// Deep enough against white for phone cameras; pale orange dots scan poorly.
const ORANGE_DARK = "#9a3412";
const ORANGE = "#ea580c";
const ORANGE_LIGHT = "#f97316";
const SIZE = 1024;

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

const loadFirstImage = async (sources) => {
  for (const src of sources) {
    try {
      return await loadImage(src);
    } catch {
      // try the next one
    }
  }
  return null;
};

const roundRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

const drawQr = async (canvas, text) => {
  // "H" keeps 30% redundancy, which is what lets the logo cover the middle
  // and the code still scan.
  const qr = QRCode.create(text, { errorCorrectionLevel: "H" });
  const count = qr.modules.size;
  const quiet = 4;
  const cell = SIZE / (count + quiet * 2);
  const offset = quiet * cell;

  const ctx = canvas.getContext("2d");
  canvas.width = SIZE;
  canvas.height = SIZE;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, SIZE, SIZE);

  const gradient = ctx.createLinearGradient(0, 0, SIZE, SIZE);
  gradient.addColorStop(0, ORANGE_LIGHT);
  gradient.addColorStop(0.5, ORANGE);
  gradient.addColorStop(1, ORANGE_DARK);

  const isFinder = (r, c) =>
    (r < 7 && c < 7) || (r < 7 && c >= count - 7) || (r >= count - 7 && c < 7);

  // Clear zone behind the logo, in modules.
  const logoModules = Math.floor(count * 0.22) | 1;
  const logoStart = Math.floor((count - logoModules) / 2);
  const inLogo = (r, c) =>
    r >= logoStart - 1 &&
    r < logoStart + logoModules + 1 &&
    c >= logoStart - 1 &&
    c < logoStart + logoModules + 1;

  ctx.fillStyle = gradient;
  for (let r = 0; r < count; r += 1) {
    for (let c = 0; c < count; c += 1) {
      if (!qr.modules.get(r, c) || isFinder(r, c) || inLogo(r, c)) continue;
      const cx = offset + c * cell + cell / 2;
      const cy = offset + r * cell + cell / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Rounded finder "eyes": outer ring, white gap, solid pupil.
  const drawEye = (row, col) => {
    const x = offset + col * cell;
    const y = offset + row * cell;
    ctx.fillStyle = gradient;
    roundRect(ctx, x, y, cell * 7, cell * 7, cell * 2.2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, x + cell, y + cell, cell * 5, cell * 5, cell * 1.6);
    ctx.fill();
    ctx.fillStyle = ORANGE_DARK;
    roundRect(ctx, x + cell * 2, y + cell * 2, cell * 3, cell * 3, cell * 1);
    ctx.fill();
  };
  drawEye(0, 0);
  drawEye(0, count - 7);
  drawEye(count - 7, 0);

  const logo = await loadFirstImage(LOGO_SOURCES);
  if (logo) {
    const box = logoModules * cell;
    const bx = offset + logoStart * cell;
    const by = offset + logoStart * cell;
    ctx.save();
    ctx.shadowColor = "rgba(194, 65, 12, 0.25)";
    ctx.shadowBlur = cell * 1.5;
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, bx, by, box, box, box * 0.28);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = ORANGE;
    ctx.lineWidth = cell * 0.35;
    roundRect(ctx, bx, by, box, box, box * 0.28);
    ctx.stroke();

    const pad = box * 0.1;
    const inner = box - pad * 2;
    const scale = Math.min(inner / logo.width, inner / logo.height);
    const w = logo.width * scale;
    const h = logo.height * scale;
    ctx.drawImage(logo, bx + (box - w) / 2, by + (box - h) / 2, w, h);
  }
};

const QrCode = () => {
  const canvasRef = useRef(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    drawQr(canvasRef.current, SITE_URL).catch(() =>
      setError("Could not generate the QR code."),
    );
  }, []);

  const handleDownload = () => {
    const link = document.createElement("a");
    link.download = "scholarhub-qr.png";
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(SITE_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard blocked; the link is still visible to copy by hand
    }
  };

  return (
    <div style={pageStyle} className="sh-qr-page">
      <style>{printCss}</style>
      <div style={glowOneStyle} aria-hidden="true" />
      <div style={glowTwoStyle} aria-hidden="true" />

      <div style={cardStyle} className="sh-qr-card">
        <p style={eyebrowStyle}>PSU RIZAL CAMPUS</p>
        <h1 style={titleStyle}>
          Scan to open <span style={accentStyle}>ScholarHub</span>
        </h1>
        <p style={subtitleStyle}>
          Point your phone camera at the code to apply, track, and stay updated
          on scholarships.
        </p>

        <div style={qrFrameStyle}>
          <canvas
            ref={canvasRef}
            style={canvasStyle}
            role="img"
            aria-label={`QR code linking to ${SITE_URL}`}
          />
        </div>

        {error && <p style={errorStyle}>{error}</p>}

        <button type="button" onClick={handleCopy} style={urlPillStyle}>
          {copied ? "Link copied!" : SITE_URL.replace(/^https?:\/\//, "")}
        </button>

        <div style={actionsStyle} className="sh-qr-actions">
          <button type="button" onClick={handleDownload} style={primaryBtnStyle}>
            Download PNG
          </button>
          <button type="button" onClick={() => window.print()} style={ghostBtnStyle}>
            Print poster
          </button>
        </div>

        <Link
          to="/"
          style={backLinkStyle}
          className="sh-qr-actions"
          onClick={(event) => {
            // Opened from the navbar there is a page to return to; opened from
            // a scan or a pasted link there is not, so fall through to home.
            if (window.history.state?.idx > 0) {
              event.preventDefault();
              navigate(-1);
            }
          }}
        >
          ← Back
        </Link>
      </div>
    </div>
  );
};

const printCss = `
@media print {
  .sh-qr-actions { display: none !important; }
  .sh-qr-page { background: #fff !important; min-height: auto !important; }
  .sh-qr-card { box-shadow: none !important; border: 2px solid #f97316 !important; }
}
`;

const pageStyle = {
  position: "relative",
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "32px 16px",
  overflow: "hidden",
  background:
    "radial-gradient(circle at 20% 10%, #fff7ed 0%, #ffedd5 35%, #fed7aa 70%, #fdba74 100%)",
  fontFamily: "inherit",
};

const glowBase = {
  position: "absolute",
  borderRadius: "50%",
  filter: "blur(60px)",
  pointerEvents: "none",
};

const glowOneStyle = {
  ...glowBase,
  width: "360px",
  height: "360px",
  top: "-80px",
  right: "-60px",
  background: "rgba(249, 115, 22, 0.45)",
};

const glowTwoStyle = {
  ...glowBase,
  width: "300px",
  height: "300px",
  bottom: "-90px",
  left: "-70px",
  background: "rgba(234, 88, 12, 0.35)",
};

const cardStyle = {
  position: "relative",
  width: "100%",
  maxWidth: "440px",
  textAlign: "center",
  padding: "32px 24px 24px",
  borderRadius: "28px",
  background: "rgba(255, 255, 255, 0.72)",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
  border: "1px solid rgba(255, 255, 255, 0.8)",
  boxShadow:
    "0 30px 60px -20px rgba(194, 65, 12, 0.35), inset 0 1px 0 rgba(255,255,255,0.9)",
  boxSizing: "border-box",
};

const eyebrowStyle = {
  margin: 0,
  fontSize: "12px",
  fontWeight: 700,
  letterSpacing: "0.18em",
  color: ORANGE_DARK,
};

const titleStyle = {
  margin: "8px 0 6px",
  fontSize: "clamp(22px, 5vw, 28px)",
  fontWeight: 800,
  color: "#1c1917",
  lineHeight: 1.2,
};

const accentStyle = {
  background: `linear-gradient(90deg, ${ORANGE}, ${ORANGE_DARK})`,
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
};

const subtitleStyle = {
  margin: "0 auto 20px",
  maxWidth: "320px",
  fontSize: "14px",
  color: "#57534e",
  lineHeight: 1.5,
};

const qrFrameStyle = {
  padding: "14px",
  borderRadius: "24px",
  background: `linear-gradient(135deg, ${ORANGE_LIGHT}, ${ORANGE_DARK})`,
  boxShadow: "0 18px 40px -16px rgba(194, 65, 12, 0.6)",
};

const canvasStyle = {
  display: "block",
  width: "100%",
  height: "auto",
  borderRadius: "14px",
  background: "#fff",
};

const errorStyle = {
  color: "#b91c1c",
  fontSize: "14px",
};

const urlPillStyle = {
  marginTop: "18px",
  padding: "8px 16px",
  border: "1px solid rgba(249, 115, 22, 0.35)",
  borderRadius: "999px",
  background: "rgba(255, 237, 213, 0.7)",
  color: ORANGE_DARK,
  fontWeight: 600,
  fontSize: "13px",
  cursor: "pointer",
  maxWidth: "100%",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const actionsStyle = {
  display: "flex",
  gap: "10px",
  justifyContent: "center",
  flexWrap: "wrap",
  marginTop: "18px",
};

const btnBase = {
  padding: "11px 20px",
  borderRadius: "14px",
  fontWeight: 700,
  fontSize: "14px",
  cursor: "pointer",
};

const primaryBtnStyle = {
  ...btnBase,
  border: "none",
  color: "#fff",
  background: `linear-gradient(135deg, ${ORANGE}, ${ORANGE_DARK})`,
  boxShadow: "0 10px 20px -8px rgba(194, 65, 12, 0.6)",
};

const ghostBtnStyle = {
  ...btnBase,
  border: `1.5px solid ${ORANGE}`,
  color: ORANGE_DARK,
  background: "rgba(255,255,255,0.6)",
};

const backLinkStyle = {
  display: "inline-block",
  marginTop: "16px",
  fontSize: "13px",
  color: "#78716c",
  textDecoration: "none",
};

export default QrCode;
