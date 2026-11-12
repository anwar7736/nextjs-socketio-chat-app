"use client";

import { AuthContext } from "@/app/contexts/AuthContext";
import { MessageContext } from "@/app/contexts/MessageContext";
import { UserContext } from "@/app/contexts/UserContext";
import { setAuthProfile } from "@/app/helpers/helper";
import { useRouter } from "next/navigation";
import { useContext, useState } from "react";
import { toast } from "sonner";
import ValidationError from "../ValidationError";

export default function Login() {
  const router = useRouter();
  const { setUser } = useContext(AuthContext);
  const { setUser: setSelectedUser } = useContext(UserContext);
  const { setMessages } = useContext(MessageContext);
  const [loading, setLoading] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [code, setCode] = useState("");
  const [forgotPassword, setForgotPassword] = useState(false);
  const [resetCodeSent, setResetCodeSent] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const clearError = (field) =>
    setFieldErrors((current) => ({ ...current, [field]: "" }));
  const showError = (field, message) =>
    setFieldErrors((current) => ({ ...current, [field]: message }));

  const login = async (event) => {
    event.preventDefault();
    const errors = {};
    if (!identifier.trim()) errors.identifier = "Enter your email or phone number.";
    if (!password) errors.password = "Enter your password.";
    if (twoFactorRequired && !/^\d{6}$/.test(code)) {
      errors.code = "Enter the 6-digit authenticator code.";
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password, code }),
      });
      const result = await response.json();
      if (result.requiresTwoFactor) {
        setTwoFactorRequired(true);
        if (code) showError("code", result.message || "Enter the 6-digit authenticator code.");
        return;
      }
      if (!response.ok) {
        showError(
          result.message?.toLowerCase().includes("email")
            ? "identifier"
            : "password",
          result.message || "Unable to sign in."
        );
        return;
      }
      setAuthProfile(result.data);
      setUser(result.data);
      setSelectedUser("");
      setMessages([]);
      const redirectTo = new URLSearchParams(window.location.search).get("redirectTo");
      router.push(redirectTo?.startsWith("/") && !redirectTo.startsWith("//") ? redirectTo : "/");
    } catch (error) {
      showError("password", "Unable to reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const requestResetCode = async (event) => {
    event.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resetEmail.trim())) {
      showError("resetEmail", "Enter a valid email address.");
      return;
    }
    clearError("resetEmail");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail, purpose: "password-reset" }),
      });
      const result = await response.json();
      if (!response.ok) {
        showError("resetEmail", result.message || "Unable to request a reset code.");
        return;
      }
      toast.success(result.message);
      setResetCodeSent(true);
    } catch (error) {
      showError("resetEmail", "Unable to reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (event) => {
    event.preventDefault();
    const errors = {};
    if (!/^\d{6}$/.test(resetCode)) errors.resetCode = "Enter the 6-digit email code.";
    if (newPassword.length < 10 || newPassword.length > 128) {
      errors.newPassword = "Use a password between 10 and 128 characters.";
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setLoading(true);
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail, code: resetCode, password: newPassword }),
      });
      const result = await response.json();
      if (!response.ok) {
        const field = result.message?.toLowerCase().includes("password")
          ? "newPassword"
          : "resetCode";
        showError(field, result.message || "Unable to update your password.");
        return;
      }
      toast.success(result.message);
      setForgotPassword(false);
      setResetCodeSent(false);
      setResetCode("");
      setNewPassword("");
    } catch (error) {
      showError("resetCode", "Unable to reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="auth-card">
      <div className="mb-8">
        <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-indigo-500 text-xl font-bold text-white">C</div>
        <p className="mb-2 text-sm font-medium uppercase tracking-[0.18em] text-indigo-300">
          {forgotPassword ? "Account recovery" : "Welcome back"}
        </p>
        <h1 className="text-2xl font-semibold text-white">
          {forgotPassword ? "Reset your password" : "Sign in to Convo"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-[#91a0b7]">
          {forgotPassword ? "We’ll email you a one-time verification code." : "Your people and conversations are waiting."}
        </p>
      </div>

      {forgotPassword ? (
        resetCodeSent ? (
          <form className="space-y-4" onSubmit={resetPassword} noValidate>
            <label className="block text-sm text-[#c7d2e3]">6-digit email code
              <input className="form-control mt-2 text-center text-lg tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={resetCode} onChange={(event) => { setResetCode(event.target.value); clearError("resetCode"); }} />
              <ValidationError message={fieldErrors.resetCode} />
            </label>
            <label className="block text-sm text-[#c7d2e3]">New password
              <input className="form-control mt-2" type="password" autoComplete="new-password" minLength={10} maxLength={128} required value={newPassword} onChange={(event) => { setNewPassword(event.target.value); clearError("newPassword"); }} />
              <ValidationError message={fieldErrors.newPassword} />
            </label>
            <button className="w-full rounded-xl bg-indigo-500 px-4 py-3 font-semibold text-white hover:bg-indigo-400 disabled:opacity-50" disabled={loading}>
              {loading ? "Updating..." : "Update password"}
            </button>
            <button type="button" className="w-full text-sm text-[#91a0b7] hover:text-white" onClick={() => setResetCodeSent(false)}>Use a different email</button>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={requestResetCode} noValidate>
            <label className="block text-sm text-[#c7d2e3]">Email address
              <input className="form-control mt-2" type="email" autoComplete="email" required value={resetEmail} onChange={(event) => { setResetEmail(event.target.value); clearError("resetEmail"); }} />
              <ValidationError message={fieldErrors.resetEmail} />
            </label>
            <button className="w-full rounded-xl bg-indigo-500 px-4 py-3 font-semibold text-white hover:bg-indigo-400 disabled:opacity-50" disabled={loading}>
              {loading ? "Sending code..." : "Send verification code"}
            </button>
            <button type="button" className="w-full text-sm text-[#91a0b7] hover:text-white" onClick={() => setForgotPassword(false)}>Back to sign in</button>
          </form>
        )
      ) : (
        <form className="space-y-4" onSubmit={login} noValidate>
          <label className="block text-sm text-[#c7d2e3]">Email or phone
            <input className="form-control mt-2" autoComplete="username" required value={identifier} onChange={(event) => { setIdentifier(event.target.value); clearError("identifier"); }} />
            <ValidationError message={fieldErrors.identifier} />
          </label>
          <label className="block text-sm text-[#c7d2e3]">Password
            <input className="form-control mt-2" type="password" autoComplete="current-password" required value={password} onChange={(event) => { setPassword(event.target.value); clearError("password"); }} />
            <ValidationError message={fieldErrors.password} />
          </label>
          {twoFactorRequired && (
            <label className="block text-sm text-[#c7d2e3]">Authenticator code
              <input className="form-control mt-2 text-center text-lg tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => { setCode(event.target.value); clearError("code"); }} />
              <ValidationError message={fieldErrors.code} />
            </label>
          )}
          <button className="w-full rounded-xl bg-indigo-500 px-4 py-3 font-semibold text-white hover:bg-indigo-400 disabled:opacity-50" disabled={loading}>
            {loading ? "Signing in..." : twoFactorRequired ? "Verify and sign in" : "Sign in"}
          </button>
          <button type="button" className="w-full text-sm text-[#91a0b7] hover:text-white" onClick={() => setForgotPassword(true)}>Forgot password?</button>
        </form>
      )}
    </section>
  );
}
