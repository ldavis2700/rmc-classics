import axios from "axios";

const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/+$/, "");
export const API_BASE = `${BACKEND_URL}/api`;

const api = axios.create({
  baseURL: API_BASE,
  // Bound stalled auth and other JSON requests; callers may override this.
  timeout: 15000,
});

// Bind credentials before yielding: a later account switch must not reattribute
// an already initiated score, deletion, or profile request to the new account.
// Keep every request interceptor synchronous to preserve this boundary.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("rmc_token");
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => { throw error; }, { synchronous: true });

export function formatApiErrorDetail(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export default api;
