import axios from "axios";

export const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }

  if (window.location.port === "5173") {
    return "http://127.0.0.1:5001/api";
  }

  return "/api";
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
  timeout: 10000,
});

export default api;
