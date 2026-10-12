import axios from "axios";
import { tokenStorage } from "./tokenStorage";

export const AUTH_LOGOUT_EVENT = "auth:logout";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

api.interceptors.request.use((config) => {
  const token = tokenStorage.get();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url ?? "";
    const isAuthAttempt = url.includes("/auth/login") || url.includes("/auth/register");

    if (error.response?.status === 401 && !isAuthAttempt) {
      tokenStorage.clear();
      window.dispatchEvent(new Event(AUTH_LOGOUT_EVENT));
    }
    return Promise.reject(error);
  }
);

export default api;
