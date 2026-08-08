import axios from "axios";

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

export default api;
