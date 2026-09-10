import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { ArrowRight, Eye, EyeOff, Lock, User } from "lucide-react";
import mawLogo from "../../MAW_logo.png";
import { postApi } from "../lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Checkbox } from "./ui/checkbox";

export const ADMIN_AUTH_KEY = "maw_admin_authenticated";
const ADMIN_USER_KEY = "maw_admin_user";
const ADMIN_AUTH_EXPIRES_KEY = "maw_admin_auth_expires_at";
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const REMEMBER_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const CSRF_KEY = "csrf_token";
const REMEMBER_PREFERENCE_KEY = "maw_admin_remember_preference";
const REMEMBERED_USERNAME_KEY = "maw_admin_remembered_username";

function shouldRememberAdmin() {
  try {
    return localStorage.getItem(REMEMBER_PREFERENCE_KEY) === "true";
  } catch {
    return false;
  }
}

function getRememberedUsername() {
  try {
    return shouldRememberAdmin() ? localStorage.getItem(REMEMBERED_USERNAME_KEY) || "" : "";
  } catch {
    return "";
  }
}

function clearAdminStorage(storage: Storage) {
  storage.removeItem(ADMIN_AUTH_KEY);
  storage.removeItem(ADMIN_USER_KEY);
  storage.removeItem(ADMIN_AUTH_EXPIRES_KEY);
  storage.removeItem(CSRF_KEY);
}

export function getAdminAuthStorage(): Storage | null {
  if (sessionStorage.getItem(ADMIN_AUTH_KEY) === "true") return sessionStorage;
  if (localStorage.getItem(ADMIN_AUTH_KEY) === "true") return localStorage;
  return null;
}

export function clearAdminAuth() {
  clearAdminStorage(sessionStorage);
  clearAdminStorage(localStorage);
}

export function isAdminAuthenticated() {
  const storage = getAdminAuthStorage();
  const expiresAt = Number(storage?.getItem(ADMIN_AUTH_EXPIRES_KEY));
  const isAuthenticated = storage?.getItem(ADMIN_AUTH_KEY) === "true";

  if (!isAuthenticated || !expiresAt || Date.now() > expiresAt) {
    clearAdminAuth();
    return false;
  }

  return true;
}

export function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState(getRememberedUsername);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(shouldRememberAdmin);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [validationErrors, setValidationErrors] = useState<{ username?: string; password?: string }>({});

  if (isAdminAuthenticated()) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const nextValidationErrors: { username?: string; password?: string } = {};
    if (!username.trim()) nextValidationErrors.username = "Please enter your email or username.";
    if (!password) nextValidationErrors.password = "Please enter your password.";
    setValidationErrors(nextValidationErrors);
    if (Object.keys(nextValidationErrors).length > 0) return;

    setIsSubmitting(true);

    try {
      const admin = await postApi<{ username: string; displayName: string; role: string; csrfToken: string }>(
        "admin-login",
        {
          username: username.trim(),
          password,
          rememberMe,
        },
      );
      clearAdminAuth();
      const storage = rememberMe ? localStorage : sessionStorage;
      const duration = rememberMe ? REMEMBER_DURATION_MS : SESSION_DURATION_MS;
      storage.setItem(ADMIN_AUTH_KEY, "true");
      storage.setItem(ADMIN_USER_KEY, JSON.stringify(admin));
      storage.setItem(ADMIN_AUTH_EXPIRES_KEY, String(Date.now() + duration));
      if (rememberMe) {
        localStorage.setItem(REMEMBER_PREFERENCE_KEY, "true");
        localStorage.setItem(REMEMBERED_USERNAME_KEY, username.trim());
      } else {
        localStorage.removeItem(REMEMBER_PREFERENCE_KEY);
        localStorage.removeItem(REMEMBERED_USERNAME_KEY);
      }
      // Store CSRF token returned by backend for use in all subsequent mutating requests
      if (admin.csrfToken) {
        storage.setItem(CSRF_KEY, admin.csrfToken);
      }
      navigate("/", { replace: true });
      return;

    } catch (error) {
      setError(error instanceof Error ? error.message : "Invalid username or password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#102f4f] px-4 py-8 text-white lg:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(14,165,233,0.20),transparent_28%),radial-gradient(circle_at_85%_80%,rgba(37,99,235,0.22),transparent_32%),linear-gradient(135deg,#0b2743_0%,#123755_55%,#0c2947_100%)]" />
      <div className="maw-login-orb pointer-events-none absolute left-[5%] top-[10%] h-32 w-32 rounded-full bg-sky-400/10 ring-1 ring-sky-300/10" />
      <div className="maw-login-orb pointer-events-none absolute right-[7%] top-[18%] h-48 w-48 rounded-full bg-blue-400/10 ring-1 ring-blue-300/10 [animation-delay:-2s]" />
      <div className="maw-login-orb pointer-events-none absolute bottom-[8%] left-[18%] h-20 w-20 rounded-full bg-cyan-300/10 ring-1 ring-cyan-200/10 [animation-delay:-4s]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.18)_1px,transparent_1px)] [background-size:48px_48px]" />

      <div className="relative mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20">
        <section className="maw-login-enter-left flex flex-col items-center text-center lg:items-start lg:text-left">
          <div className="maw-login-logo flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border border-white/70 bg-white shadow-[0_22px_55px_rgba(2,6,23,0.32)] lg:h-40 lg:w-40">
            <img src={mawLogo} className="h-auto w-[86%] max-w-none object-contain" alt="Mewah AutoWorks" />
          </div>
          <div className="mt-5 flex flex-col items-center text-center lg:items-start lg:text-left">
            <h1 className="text-3xl font-black tracking-tight text-white !text-white sm:text-4xl lg:text-5xl" style={{ color: '#ffffff' }}>
              Mewah AutoWorks
            </h1>
            <p className="mt-2 text-xs font-bold uppercase tracking-[0.2em] text-sky-200 sm:text-sm">
              Admin Panel
            </p>
          </div>
        </section>

        <section className="maw-login-enter-right mx-auto w-full max-w-md">
          <form onSubmit={handleSubmit} className="rounded-[2rem] border border-white/70 bg-white/95 p-7 text-slate-900 shadow-[0_28px_90px_rgba(2,6,23,0.32)] backdrop-blur-xl sm:p-9">
            <div className="mb-7">
              <h2 className="text-2xl font-black tracking-tight text-slate-900">Welcome back</h2>
            </div>

            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-sm font-medium text-gray-700">Email or Username</Label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="username"
                    value={username}
                    onChange={(event) => {
                      setUsername(event.target.value);
                      if (validationErrors.username) {
                        setValidationErrors((current) => ({ ...current, username: undefined }));
                      }
                    }}
                    aria-invalid={Boolean(validationErrors.username)}
                    aria-describedby={validationErrors.username ? "username-error" : undefined}
                    className={`h-12 rounded-xl bg-[#f5f7fb] pl-11 shadow-none transition-all ${
                      validationErrors.username
                        ? "border-red-300 focus-visible:border-red-400 focus-visible:ring-red-100"
                        : "border-transparent focus-visible:border-blue-300 focus-visible:ring-blue-100"
                    }`}
                    autoComplete="username"
                    placeholder="Enter email or username"
                  />
                </div>
                {validationErrors.username ? (
                  <p id="username-error" className="text-xs text-red-600" role="alert">
                    {validationErrors.username}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium text-gray-700">Password</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      if (validationErrors.password) {
                        setValidationErrors((current) => ({ ...current, password: undefined }));
                      }
                    }}
                    aria-invalid={Boolean(validationErrors.password)}
                    aria-describedby={validationErrors.password ? "password-error" : undefined}
                    className={`h-12 rounded-xl bg-[#f5f7fb] pl-11 pr-11 shadow-none transition-all ${
                      validationErrors.password
                        ? "border-red-300 focus-visible:border-red-400 focus-visible:ring-red-100"
                        : "border-transparent focus-visible:border-blue-300 focus-visible:ring-blue-100"
                    }`}
                    autoComplete="current-password"
                    placeholder="••••••••"
                  />
                  <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white hover:text-slate-600" aria-label={showPassword ? "Hide password" : "Show password"}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {validationErrors.password ? (
                  <p id="password-error" className="text-xs text-red-600" role="alert">
                    {validationErrors.password}
                  </p>
                ) : null}
              </div>

              <div className="flex items-center gap-2 pt-0.5">
                <Checkbox
                  id="remember-admin"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked === true)}
                />
                <Label htmlFor="remember-admin" className="cursor-pointer text-sm font-normal text-gray-700">
                  Remember me
                </Label>
              </div>
            </div>

            {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</div>}

            <Button
              type="submit"
              disabled={isSubmitting}
              className="mt-7 h-12 w-full rounded-xl bg-gradient-to-r from-[#168ec6] to-[#2563eb] font-bold text-white shadow-[0_12px_28px_rgba(37,99,235,0.28)] transition-all hover:-translate-y-0.5 hover:from-[#107caf] hover:to-[#1d4ed8]"
            >
              {isSubmitting ? "Logging in..." : "Login"}
              {!isSubmitting ? <ArrowRight className="h-4 w-4" /> : null}
            </Button>
          </form>
        </section>
      </div>
    </main>
  );
}
