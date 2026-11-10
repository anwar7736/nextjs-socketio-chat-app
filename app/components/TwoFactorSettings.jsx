"use client";

import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import ValidationError from "./ValidationError";

export default function TwoFactorSettings() {
  const [enabled, setEnabled] = useState(false);
  const [qrCode, setQrCode] = useState("");
  const [manualKey, setManualKey] = useState("");
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [codeError, setCodeError] = useState("");

  const load = async () => {
    const response = await fetch("/api/auth/two-factor");
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Unable to load security settings.");
    setEnabled(result.enabled);
    setQrCode(result.qrCode || "");
    setManualKey(result.manualKey || "");
  };

  const copyManualKey = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(manualKey);
      } else {
        // older browsers / non-https: copy through a hidden field
        const field = document.createElement("textarea");
        field.value = manualKey;
        field.setAttribute("readonly", "");
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.appendChild(field);
        field.select();
        document.execCommand("copy");
        field.remove();
      }
      setCopied(true);
      toast.success("Setup key copied.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy. Select the key and copy it by hand.");
    }
  };

  useEffect(() => {
    load().catch((error) => toast.error(error.message));
  }, []);

  const update = async (action) => {
    if (!/^\d{6}$/.test(code)) {
      setCodeError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setCodeError("");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/two-factor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, code }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Unable to update two-factor authentication.");
      setEnabled(result.enabled);
      setCode("");
      setCodeError("");
      await load();
      toast.success(result.message);
    } catch (error) {
      setCodeError(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-6 rounded-2xl border border-[#263248] bg-[#0c1321] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-white">Authenticator app</h2>
          <p className="mt-1 text-sm text-[#91a0b7]">
            {enabled ? "Two-factor authentication is enabled." : "Add a time-based code to protect your account."}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs ${enabled ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-500/15 text-slate-300"}`}>
          {enabled ? "On" : "Off"}
        </span>
      </div>

      {!enabled && qrCode && (
        <div className="mt-4 flex flex-col items-center rounded-xl bg-white p-3">
          <img src={qrCode} alt="Scan this QR code with your authenticator app" className="h-40 w-40" />
          <p className="mt-2 text-center text-xs text-slate-600">Scan with an authenticator app, then enter its current code below.</p>
        </div>
      )}

      {!enabled && manualKey && (
        <div className="mt-3">
          <p className="text-xs text-[#91a0b7]">Can&apos;t scan? Enter this setup key in your authenticator app:</p>
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-[#263248] bg-[#111827] p-2 pl-3">
            <code className="min-w-0 flex-1 select-all break-all font-mono text-sm tracking-wider text-white">
              {manualKey.match(/.{1,4}/g)?.join(" ")}
            </code>
            <button
              type="button"
              onClick={copyManualKey}
              className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold text-white ${copied ? "bg-emerald-600" : "bg-indigo-500 hover:bg-indigo-400"}`}
              aria-label="Copy setup key"
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
        </div>
      )}

      <label className="mt-4 block text-sm text-[#c7d2e3]">
        {enabled ? "Authenticator code to disable" : "Authenticator code to enable"}
        <input
          className="form-control mt-2 text-center tracking-[0.35em]"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          onChange={(event) => {
            setCode(event.target.value);
            setCodeError("");
          }}
        />
        <ValidationError message={codeError} />
      </label>
      <button
        type="button"
        className={`mt-4 w-full rounded-xl px-4 py-2.5 font-medium text-white disabled:opacity-50 ${enabled ? "bg-rose-600 hover:bg-rose-500" : "bg-indigo-500 hover:bg-indigo-400"}`}
        disabled={busy}
        onClick={() => update(enabled ? "disable" : "enable")}
      >
        {busy ? "Updating..." : enabled ? "Disable 2FA" : "Enable 2FA"}
      </button>
    </section>
  );
}
