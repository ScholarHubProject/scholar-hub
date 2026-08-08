// Netlify Functions entrypoint. The Express app is exported from server.js and
// wrapped so it can run as a Lambda-style handler; netlify.toml redirects
// /api/* and /uploads/* here.
const serverless = require("serverless-http");

const app = require("../../server/server.js");

const handler = serverless(app, {
  // Netlify rewrites the request to /.netlify/functions/api/... before the
  // function runs, which would stop Express matching routes such as
  // /api/db-status. event.rawUrl still holds the URL the browser asked for, so
  // it is restored here.
  request(request, event) {
    if (!event || !event.rawUrl) {
      return;
    }

    try {
      const originalUrl = new URL(event.rawUrl);
      request.url = `${originalUrl.pathname}${originalUrl.search}`;
    } catch {
      // Leave the URL serverless-http derived if rawUrl is ever malformed.
    }
  },

  // Uploaded documents, profile photos and the requirements ZIP are binary, so
  // responses must be base64 encoded rather than treated as UTF-8 text.
  binary: [
    "application/octet-stream",
    "application/pdf",
    "application/zip",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/*",
  ],
});

exports.handler = handler;
