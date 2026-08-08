// Supabase Storage access over the REST API.
//
// Vercel's serverless filesystem is read-only apart from an ephemeral /tmp, so
// uploads cannot live on disk the way they did on Render. Every uploaded file
// now goes to a Storage bucket instead, and the database keeps the object key
// in the same column that used to hold the relative disk path.
//
// The REST endpoints are used directly rather than @supabase/supabase-js
// because node_modules is committed to this repository and the SDK would add
// hundreds of tracked files for three calls.

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "uploads";

const isStorageConfigured = () => Boolean(SUPABASE_URL && SERVICE_KEY);

const storageNotConfiguredMessage =
  "File storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.";

const objectUrl = (objectPath) =>
  `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURI(objectPath)}`;

const authHeaders = () => ({
  Authorization: `Bearer ${SERVICE_KEY}`,
  apikey: SERVICE_KEY,
});

// Storage returns a JSON body on failure; surface its message so the caller
// logs something more useful than the status code alone.
const describeFailure = async (response) => {
  try {
    const body = await response.json();
    return body?.message || body?.error || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
};

const putObject = async (objectPath, buffer, contentType) => {
  if (!isStorageConfigured()) {
    throw new Error(storageNotConfiguredMessage);
  }

  const response = await fetch(objectUrl(objectPath), {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": contentType || "application/octet-stream",
      "x-upsert": "true",
    },
    body: buffer,
  });

  if (!response.ok) {
    throw new Error(`Storage upload failed: ${await describeFailure(response)}`);
  }

  return objectPath;
};

// Resolves to null when the object is missing so callers can return their own
// 404 instead of treating an absent file as a server error.
const getObject = async (objectPath) => {
  if (!isStorageConfigured()) {
    throw new Error(storageNotConfiguredMessage);
  }

  const response = await fetch(objectUrl(objectPath), { headers: authHeaders() });

  if (response.status === 404 || response.status === 400) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Storage download failed: ${await describeFailure(response)}`);
  }

  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") || "application/octet-stream",
  };
};

// Deletion is best effort: a failed cleanup should never fail the request that
// already removed the database row.
const removeObject = async (objectPath) => {
  if (!isStorageConfigured() || !objectPath) {
    return false;
  }

  try {
    const response = await fetch(objectUrl(objectPath), {
      method: "DELETE",
      headers: authHeaders(),
    });

    return response.ok;
  } catch (err) {
    console.log("Storage delete error:", err.message);
    return false;
  }
};

module.exports = {
  BUCKET,
  isStorageConfigured,
  storageNotConfiguredMessage,
  putObject,
  getObject,
  removeObject,
};
