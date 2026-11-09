"use client";

import { AuthContext } from "@/app/contexts/AuthContext";
import { setAuthProfile } from "@/app/helpers/helper";
import { useRouter } from "next/navigation";
import { useContext, useState } from "react";
import { toast } from "react-toastify";
import ValidationError from "../ValidationError";

export default function SignUp() {
  const router = useRouter();
  const { setUser } = useContext(AuthContext);
  const [step, setStep] = useState("details");
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    code: "",
  });

  const update = (event) => setForm({ ...form, [event.target.name]: event.target.value });
  const clearError = (field) =>
    setFieldErrors((current) => ({ ...current, [field]: "" }));

  const requestCode = async (event) => {
    event.preventDefault();
    const errors = {};
    if (form.name.trim().length < 3) errors.name = "Enter your name (at least 3 characters).";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errors.email = "Enter a valid email address.";
    }
    if (form.password.length < 10 || form.password.length > 128) {
      errors.password = "Use a password between 10 and 128 characters.";
    }
    if (form.password !== form.confirmPassword) errors.confirmPassword = "Passwords do not match.";
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setLoading(true);
    try {
      const response = await fetch("/api/auth/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email, purpose: "register" }),
      });
      const result = await response.json();
      if (!response.ok) {
        setFieldErrors((current) => ({ ...current, email: result.message || "Unable to send a verification code." }));
        return;
      }
      toast.success(result.message);
      setStep("verify");
    } catch (error) {
      setFieldErrors((current) => ({ ...current, email: "Unable to reach the server. Please try again." }));
    } finally {
      setLoading(false);
    }
  };

  const completeRegistration = async (event) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(form.code)) {
      setFieldErrors({ code: "Enter the 6-digit email verification code." });
      return;
    }
    setFieldErrors({});
    setLoading(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json();
      if (!response.ok) {
        const message = result.message || "Unable to create your account.";
        const field = message.toLowerCase().includes("phone")
          ? "phone"
          : message.toLowerCase().includes("name")
            ? "name"
            : message.toLowerCase().includes("password")
              ? "password"
              : message.toLowerCase().includes("email")
                ? "email"
                : "code";
        setFieldErrors((current) => ({ ...current, [field]: message }));
        if (field !== "code") setStep("details");
        return;
      }
      setAuthProfile(result.data);
      setUser(result.data);
      router.push("/");
    } catch (error) {
      setFieldErrors({ code: "Unable to reach the server. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="auth-card">
      <div className="mb-8">
        <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-indigo-500 text-xl font-bold text-white">C</div>
        <p className="mb-2 text-sm font-medium uppercase tracking-[0.18em] text-indigo-300">Create your account</p>
        <h1 className="text-2xl font-semibold text-white">{step === "details" ? "Join the conversation" : "Verify your email"}</h1>
        <p className="mt-2 text-sm leading-6 text-[#91a0b7]">
          {step === "details" ? "A quick setup, then you’re ready to chat." : `We sent a 6-digit code to ${form.email}.`}
        </p>
      </div>

      {step === "details" ? (
        <form className="space-y-4" onSubmit={requestCode} noValidate>
          <label className="block text-sm text-[#c7d2e3]">Full name
            <input className="form-control mt-2" name="name" autoComplete="name" required minLength={3} value={form.name} onChange={(event) => { update(event); clearError("name"); }} />
            <ValidationError message={fieldErrors.name} />
          </label>
          <label className="block text-sm text-[#c7d2e3]">Email address
            <input className="form-control mt-2" type="email" name="email" autoComplete="email" required value={form.email} onChange={(event) => { update(event); clearError("email"); }} />
            <ValidationError message={fieldErrors.email} />
          </label>
          <label className="block text-sm text-[#c7d2e3]">Phone number <span className="text-[#728099]">(optional)</span>
            <input className="form-control mt-2" type="tel" name="phone" autoComplete="tel" value={form.phone} onChange={(event) => { update(event); clearError("phone"); }} />
            <ValidationError message={fieldErrors.phone} />
          </label>
          <label className="block text-sm text-[#c7d2e3]">Password
            <input className="form-control mt-2" type="password" name="password" autoComplete="new-password" required minLength={10} maxLength={128} value={form.password} onChange={(event) => { update(event); clearError("password"); }} />
            <ValidationError message={fieldErrors.password} />
          </label>
          <label className="block text-sm text-[#c7d2e3]">Confirm password
            <input className="form-control mt-2" type="password" name="confirmPassword" autoComplete="new-password" required value={form.confirmPassword} onChange={(event) => { update(event); clearError("confirmPassword"); }} />
            <ValidationError message={fieldErrors.confirmPassword} />
          </label>
          <button className="w-full rounded-xl bg-indigo-500 px-4 py-3 font-semibold text-white hover:bg-indigo-400 disabled:opacity-50" disabled={loading}>
            {loading ? "Sending code..." : "Continue with email"}
          </button>
        </form>
      ) : (
        <form className="space-y-4" onSubmit={completeRegistration} noValidate>
          <label className="block text-sm text-[#c7d2e3]">Email verification code
            <input className="form-control mt-2 text-center text-lg tracking-[0.4em]" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={form.code} onChange={(event) => { update(event); clearError("code"); }} />
            <ValidationError message={fieldErrors.code} />
          </label>
          <button className="w-full rounded-xl bg-indigo-500 px-4 py-3 font-semibold text-white hover:bg-indigo-400 disabled:opacity-50" disabled={loading}>
            {loading ? "Creating account..." : "Verify and create account"}
          </button>
          <button type="button" className="w-full text-sm text-[#91a0b7] hover:text-white" onClick={() => setStep("details")}>Back to account details</button>
        </form>
      )}
    </section>
  );
}
