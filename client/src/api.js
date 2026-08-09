import axios from "axios";

const TOKEN_KEY = "authToken";
const USER_KEY = "currentUser";

const trimTrailingSlashes = (value) => value.replace(/\/+$/, "");

export const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_BASE_URL) {
    return trimTrailingSlashes(import.meta.env.VITE_API_BASE_URL);
  }

  if (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  ) {
    return "http://127.0.0.1:5001/api";
  }

  // In production the API is a Netlify function served from this same origin,
  // so a relative path avoids hardcoding a deployment URL.
  return "/api";
};

export const getApiUrl = (path) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getApiBaseUrl()}${normalizedPath}`;
};

// ---------------------------------------------------------------
// Session
// ---------------------------------------------------------------
// The token is the session. The cached user object is only there so the UI can
// render a name and avatar without waiting for a request — the server never
// trusts it, and neither should any access decision here.
export const getToken = () => localStorage.getItem(TOKEN_KEY) || "";

export const getStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY));
  } catch {
    return null;
  }
};

export const saveSession = (token, user) => {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const saveUser = (user) => {
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const clearSession = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

export const isLoggedIn = () => Boolean(getToken());

export const getUploadUrl = (uploadPath) => {
  if (!uploadPath) return "";

  if (
    uploadPath.startsWith("blob:") ||
    uploadPath.startsWith("data:") ||
    uploadPath.startsWith("http://") ||
    uploadPath.startsWith("https://")
  ) {
    return uploadPath;
  }

  const normalizedPath = uploadPath.replace(/^\/+/, "");
  const publicUploadPath = normalizedPath.startsWith("uploads/")
    ? `/${normalizedPath}`
    : `/uploads/${normalizedPath}`;
  const apiBaseUrl = getApiBaseUrl();

  if (!apiBaseUrl.startsWith("http://") && !apiBaseUrl.startsWith("https://")) {
    return publicUploadPath;
  }

  return `${new URL(apiBaseUrl).origin}${publicUploadPath}`;
};

const api = axios.create({
  baseURL: getApiBaseUrl(),
});

api.interceptors.request.use((config) => {
  const token = getToken();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

// An expired or tampered token must not leave the app sitting on a page it can
// no longer load. Clear the session and send the user back to /login once.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;

    if (status === 401) {
      clearSession();

      if (!window.location.pathname.startsWith("/login")) {
        window.location.replace("/login?expired=1");
      }
    }

    return Promise.reject(error);
  }
);

// Download links cannot carry an Authorization header, so the server issues a
// five-minute token scoped to one application and it travels in the query.
export const getApplicationFileUrl = async (applicationId, { fileIndex, download } = {}) => {
  const { data } = await api.get(`/applications/${applicationId}/file-token`);
  const params = new URLSearchParams({ token: data.token });

  if (typeof fileIndex === "number") params.set("file", String(fileIndex));
  if (download) params.set("download", "1");

  return getApiUrl(`/applications/${applicationId}/file?${params.toString()}`);
};

export const getApplicationArchiveUrl = async (applicationId) => {
  const { data } = await api.get(`/applications/${applicationId}/file-token`);

  return getApiUrl(
    `/applications/${applicationId}/files/download?token=${encodeURIComponent(data.token)}`
  );
};

export default api;
