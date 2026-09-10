function resolveApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    const pathname = window.location.pathname;
    if (pathname.startsWith("/staging")) {
      return "/staging/api_staging/api.php";
    }
  }
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl) {
    return envUrl.startsWith("/") ? envUrl : `/${envUrl}`;
  }
  return "/api/api.php";
}

const API_BASE_URL = resolveApiBaseUrl();

export function apiAssetUrl(mode: string, params: Record<string, string | number>) {
  const query = new URLSearchParams({ mode, portal: "admin" });
  Object.entries(params).forEach(([key, value]) => query.set(key, String(value)));
  return `${API_BASE_URL}${API_BASE_URL.includes("?") ? "&" : "?"}${query.toString()}`;
}

function authValue(key: string) {
  return sessionStorage.getItem(key) || localStorage.getItem(key);
}

function storeCsrfToken(token: string) {
  if (!token) return;
  if (sessionStorage.getItem("maw_admin_authenticated") === "true") {
    sessionStorage.setItem("csrf_token", token);
    localStorage.removeItem("csrf_token");
    return;
  }
  if (localStorage.getItem("maw_admin_authenticated") === "true") {
    localStorage.setItem("csrf_token", token);
    sessionStorage.removeItem("csrf_token");
    return;
  }
  const storage = sessionStorage.getItem("csrf_token") ? sessionStorage : localStorage;
  storage.setItem("csrf_token", token);
}

function clearStoredAdminAuth() {
  for (const storage of [sessionStorage, localStorage]) {
    storage.removeItem("maw_admin_authenticated");
    storage.removeItem("maw_admin_user");
    storage.removeItem("maw_admin_auth_expires_at");
    storage.removeItem("csrf_token");
  }
}

type ApiResponse<T> = {
  success: boolean;
  message: string;
  data: T;
};

export async function apiRequest<T>(mode: string, options: RequestInit = {}): Promise<T> {
  const separator = API_BASE_URL.includes("?") ? "&" : "?";
  let csrfToken = authValue("csrf_token");
  let csrfRetryUsed = false;

  while (true) {
    const headers: Record<string, string> = {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers as Record<string, string> || {}),
    };
    if (csrfToken) headers["X-CSRF-Token"] = csrfToken;

    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}${separator}mode=${mode}`, {
        ...options,
        headers,
        credentials: "include",
        cache: "no-store",
      });
    } catch (netErr) {
      const detail = netErr instanceof Error ? netErr.message : "Network error";
      throw new Error(`Unable to connect to server API (${API_BASE_URL}): ${detail}. Please verify network connection or server status.`);
    }

    const responseText = await response.text();
    let payload: ApiResponse<T>;

    try {
      payload = JSON.parse(responseText) as ApiResponse<T>;
    } catch {
      const message = responseText.trim()
        ? `API returned non-JSON response (${response.status}): ${responseText.slice(0, 160)}`
        : `API returned empty response (${response.status}). Check api.php path, PHP error log, and database credentials.`;
      throw new Error(message);
    }

    const responseCsrfToken = response.headers.get("X-CSRF-Token") || "";
    if (responseCsrfToken) storeCsrfToken(responseCsrfToken);

    const isCsrfMismatch = response.status === 403 && /csrf/i.test(payload.message || "");
    if (isCsrfMismatch && responseCsrfToken && responseCsrfToken !== csrfToken && !csrfRetryUsed) {
      csrfToken = responseCsrfToken;
      csrfRetryUsed = true;
      continue;
    }

    if (!response.ok || !payload.success) {
      if (response.status === 401 && mode !== "admin-login") {
        clearStoredAdminAuth();
        const loginPath = window.location.pathname.startsWith("/staging/")
          ? "/staging/login"
          : "/login";
        window.location.replace(loginPath);
      }
      throw new Error(payload.message || "API request failed");
    }

    return payload.data;
  }
}

export function postApi<T>(mode: string, body: unknown): Promise<T> {
  return apiRequest<T>(mode, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
