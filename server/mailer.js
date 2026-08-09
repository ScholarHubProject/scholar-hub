// Outgoing email.
//
// Sent over Resend's HTTP API with fetch rather than SMTP via nodemailer: the
// Netlify function bundle stays dependency-free (same reasoning as storage.js),
// and outbound SMTP ports are commonly blocked on serverless hosts anyway.
//
// Email is optional. With no API key configured every send resolves to
// { sent: false } and logs a line, so password resets and status notifications
// still work in-app and nothing throws.

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const FROM_ADDRESS = process.env.MAIL_FROM || "ScholarHub <onboarding@resend.dev>";
const APP_URL = (process.env.APP_URL || "").replace(/\/+$/, "");

const isMailConfigured = () => Boolean(RESEND_API_KEY);

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const sendMail = async ({ to, subject, html, text }) => {
  if (!isMailConfigured()) {
    console.log(`Email skipped (RESEND_API_KEY not set): "${subject}" to ${to}`);
    return { sent: false, reason: "not-configured" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM_ADDRESS, to: [to], subject, html, text }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.log(`Email send failed (${response.status}):`, body.slice(0, 300));
      return { sent: false, reason: `http-${response.status}` };
    }

    return { sent: true };
  } catch (err) {
    console.log("Email send error:", err.message);
    return { sent: false, reason: err.message };
  }
};

const layout = (heading, bodyHtml) => `
  <div style="font-family:Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1f2937">
    <h2 style="color:#1d4ed8;margin:0 0 16px">${escapeHtml(heading)}</h2>
    ${bodyHtml}
    <p style="margin-top:28px;font-size:12px;color:#6b7280">
      ScholarHub &mdash; Online Scholarship Monitoring System
    </p>
  </div>
`;

const sendPasswordResetEmail = ({ to, name, rawToken }) => {
  const resetUrl = `${APP_URL || ""}/reset-password?token=${encodeURIComponent(rawToken)}`;

  return sendMail({
    to,
    subject: "Reset your ScholarHub password",
    text: `Hi ${name || "there"}, open this link to choose a new password: ${resetUrl} (valid for 60 minutes)`,
    html: layout(
      "Reset your password",
      `<p>Hi ${escapeHtml(name || "there")},</p>
       <p>Use the button below to choose a new password. The link is valid for 60 minutes and can be used once.</p>
       <p><a href="${escapeHtml(resetUrl)}" style="display:inline-block;background:#1d4ed8;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">Choose a new password</a></p>
       <p style="font-size:13px;color:#6b7280">If you did not ask for this, you can ignore this email &mdash; your password stays the same.</p>`
    ),
  });
};

const sendApplicationStatusEmail = ({ to, name, scholarshipTitle, status, remarks }) => {
  const isApproved = status === "Approved";

  return sendMail({
    to,
    subject: `Your ScholarHub application was ${status.toLowerCase()}`,
    text: `Hi ${name || "there"}, your application for ${scholarshipTitle} is now "${status}". ${remarks || ""}`,
    html: layout(
      `Application ${status.toLowerCase()}`,
      `<p>Hi ${escapeHtml(name || "there")},</p>
       <p>Your application for <strong>${escapeHtml(scholarshipTitle)}</strong> has been reviewed.</p>
       <p style="padding:12px 16px;border-radius:8px;background:${isApproved ? "#dcfce7" : "#fee2e2"};color:${isApproved ? "#166534" : "#b91c1c"};font-weight:600">
         Status: ${escapeHtml(status)}
       </p>
       ${remarks ? `<p><strong>Remarks:</strong> ${escapeHtml(remarks)}</p>` : ""}
       <p>Log in to ScholarHub to see the full details.</p>`
    ),
  });
};

module.exports = {
  isMailConfigured,
  sendMail,
  sendPasswordResetEmail,
  sendApplicationStatusEmail,
};
