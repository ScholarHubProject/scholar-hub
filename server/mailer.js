// Outgoing email.
//
// Sent over the provider's HTTP API with fetch rather than SMTP via nodemailer:
// the Netlify function bundle stays dependency-free (same reasoning as
// storage.js), and outbound SMTP ports are commonly blocked on serverless hosts.
//
// Two providers are supported, because they solve different problems:
//
//   BREVO_API_KEY  — Brevo verifies a single ordinary address (a Gmail account
//                    is fine) and will then deliver to anybody. This is what a
//                    password reset needs: students receive mail at whatever
//                    address they registered with.
//
//   RESEND_API_KEY — Resend needs a whole verified domain before it will send
//                    to arbitrary recipients. Its shared onboarding@resend.dev
//                    sender only ever reaches the Resend account owner, so it
//                    is fine for testing and useless for real students.
//
// Brevo wins when both are set. With neither, every send resolves to
// { sent: false } and logs a line, so nothing throws and the app still works.

const BREVO_API_KEY = process.env.BREVO_API_KEY || "";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const APP_URL = (process.env.APP_URL || "").replace(/\/+$/, "");

// Accepts either "Name <a@b.com>" or a bare "a@b.com".
const parseFromAddress = (value) => {
  const match = String(value).match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);

  if (match) return { name: match[1] || "ScholarHub", email: match[2] };

  return { name: "ScholarHub", email: String(value).trim() };
};

const DEFAULT_FROM = BREVO_API_KEY ? "" : "ScholarHub <onboarding@resend.dev>";
const FROM_ADDRESS = process.env.MAIL_FROM || DEFAULT_FROM;

const activeProvider = () => {
  if (BREVO_API_KEY) return "brevo";
  if (RESEND_API_KEY) return "resend";
  return null;
};

const isMailConfigured = () => Boolean(activeProvider());

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const sendViaBrevo = ({ to, subject, html, text }) => {
  const from = parseFromAddress(FROM_ADDRESS);

  return fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": BREVO_API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: from.name, email: from.email },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
  });
};

const sendViaResend = ({ to, subject, html, text }) =>
  fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_ADDRESS, to: [to], subject, html, text }),
  });

const sendMail = async ({ to, subject, html, text }) => {
  const provider = activeProvider();

  if (!provider) {
    console.log(
      `Email skipped (set BREVO_API_KEY or RESEND_API_KEY): "${subject}" to ${to}`
    );
    return { sent: false, reason: "not-configured" };
  }

  if (!FROM_ADDRESS) {
    console.log("Email skipped: MAIL_FROM is not set, so there is no sender address.");
    return { sent: false, reason: "no-sender" };
  }

  try {
    const response =
      provider === "brevo"
        ? await sendViaBrevo({ to, subject, html, text })
        : await sendViaResend({ to, subject, html, text });

    if (!response.ok) {
      const body = await response.text();
      console.log(
        `Email send failed via ${provider} (${response.status}):`,
        body.slice(0, 300)
      );
      return { sent: false, reason: `http-${response.status}` };
    }

    console.log(`Email sent via ${provider} to ${to}: "${subject}"`);
    return { sent: true };
  } catch (err) {
    console.log(`Email send error via ${provider}:`, err.message);
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

const sendEmailVerificationEmail = ({ to, name, rawToken }) => {
  const verifyUrl = `${APP_URL || ""}/verify-email?token=${encodeURIComponent(rawToken)}`;

  return sendMail({
    to,
    subject: "Confirm your ScholarHub email address",
    text: `Hi ${name || "there"}, confirm this address to finish setting up your ScholarHub account: ${verifyUrl} (valid for 24 hours)`,
    html: layout(
      "Confirm your email address",
      `<p>Hi ${escapeHtml(name || "there")},</p>
       <p>Confirm this address so the scholarship office can reach you about your applications. The link is valid for 24 hours.</p>
       <p><a href="${escapeHtml(verifyUrl)}" style="display:inline-block;background:#1d4ed8;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">Confirm my email address</a></p>
       <p style="font-size:13px;color:#6b7280">If you did not create a ScholarHub account, you can ignore this email.</p>`
    ),
  });
};

// Sent to the address on the account, not to the person who pressed the button:
// a coordinator resetting a student's password must not be able to redirect the
// link to themselves.
const sendAccountInviteEmail = ({ to, name, rawToken, role, invitedBy }) => {
  const resetUrl = `${APP_URL || ""}/reset-password?token=${encodeURIComponent(rawToken)}`;

  return sendMail({
    to,
    subject: `You have been added to ScholarHub as ${role === "Admin" ? "an admin" : "a student"}`,
    text: `Hi ${name || "there"}, ${invitedBy || "the scholarship office"} created a ScholarHub account for you. Choose a password here: ${resetUrl} (valid for 60 minutes)`,
    html: layout(
      "Your ScholarHub account is ready",
      `<p>Hi ${escapeHtml(name || "there")},</p>
       <p>${escapeHtml(invitedBy || "The scholarship office")} created a ScholarHub account for this address with the role <strong>${escapeHtml(role)}</strong>.</p>
       <p>Choose your password to finish setting it up. The link is valid for 60 minutes.</p>
       <p><a href="${escapeHtml(resetUrl)}" style="display:inline-block;background:#1d4ed8;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">Choose a password</a></p>`
    ),
  });
};

const sendApplicationWithdrawnEmail = ({ to, name, scholarshipTitle }) =>
  sendMail({
    to,
    subject: "Your ScholarHub application was withdrawn",
    text: `Hi ${name || "there"}, your application for ${scholarshipTitle} has been withdrawn. You can apply again while the scholarship is still open.`,
    html: layout(
      "Application withdrawn",
      `<p>Hi ${escapeHtml(name || "there")},</p>
       <p>Your application for <strong>${escapeHtml(scholarshipTitle)}</strong> has been withdrawn at your request and is no longer in the review queue.</p>
       <p>You can submit a new application while the scholarship is still open.</p>`
    ),
  });

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
  sendAccountInviteEmail,
  sendApplicationStatusEmail,
  sendApplicationWithdrawnEmail,
  sendEmailVerificationEmail,
  sendPasswordResetEmail,
};
