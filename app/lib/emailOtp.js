import { createHmac, randomInt, timingSafeEqual } from "crypto";
import { emailOtpSchema } from "../models/emailOtpModel";
import { getSessionSecret } from "./session";

const OTP_LIFETIME_MS = 10 * 60 * 1000;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const SEND_COOLDOWN_MS = 60 * 1000;
const MAX_SENDS_PER_HOUR = 5;
const MAX_VERIFY_ATTEMPTS = 5;

function hashCode(email, purpose, code) {
  return createHmac("sha256", getSessionSecret()).update(`${email}:${purpose}:${code}`).digest("hex");
}

export async function sendEmailOtp(email, purpose) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    throw new Error("RESEND_API_KEY and EMAIL_FROM must be configured to send verification emails.");
  }

  const now = new Date();
  const existing = await emailOtpSchema.findOne({ email, purpose });
  if (existing && now - existing.lastSentAt < SEND_COOLDOWN_MS) {
    return { success: false, status: 429, message: "Please wait a minute before requesting another code." };
  }

  const sameWindow = existing && now - existing.windowStartedAt < RATE_WINDOW_MS;
  if (sameWindow && existing.sendCount >= MAX_SENDS_PER_HOUR) {
    return { success: false, status: 429, message: "Too many codes requested. Try again in an hour." };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const windowStartedAt = sameWindow ? existing.windowStartedAt : now;
  await emailOtpSchema.findOneAndUpdate(
    { email, purpose },
    {
      $set: {
        codeHash: hashCode(email, purpose, code),
        expiresAt: new Date(now.getTime() + OTP_LIFETIME_MS),
        attempts: 0,
        lastSentAt: now,
        windowStartedAt,
        sendCount: sameWindow ? existing.sendCount + 1 : 1,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const subject = purpose === "register" ? "Verify your Convo email" : "Reset your Convo password";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject,
      text: `Your verification code is ${code}. It expires in 10 minutes. If you did not request this, you can ignore this email.`,
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    console.error("Resend email delivery failed:", response.status, detail);
    throw new Error("Email delivery failed. Please try again later.");
  }

  return { success: true };
}

export async function verifyEmailOtp(email, purpose, code) {
  const otp = await emailOtpSchema.findOne({ email, purpose });
  if (!otp || otp.expiresAt <= new Date() || otp.attempts >= MAX_VERIFY_ATTEMPTS) {
    if (otp && otp.attempts >= MAX_VERIFY_ATTEMPTS) await otp.deleteOne();
    return false;
  }

  const expected = Buffer.from(otp.codeHash, "hex");
  const provided = Buffer.from(hashCode(email, purpose, code), "hex");
  const valid = expected.length === provided.length && timingSafeEqual(expected, provided);
  if (!valid) {
    otp.attempts += 1;
    if (otp.attempts >= MAX_VERIFY_ATTEMPTS) await otp.deleteOne();
    else await otp.save();
    return false;
  }

  await otp.deleteOne();
  return true;
}

export const otpPolicy = {
  maxAttempts: MAX_VERIFY_ATTEMPTS,
  lifetimeMinutes: OTP_LIFETIME_MS / 60_000,
  resendCooldownSeconds: SEND_COOLDOWN_MS / 1000,
  maxSendsPerHour: MAX_SENDS_PER_HOUR,
};
