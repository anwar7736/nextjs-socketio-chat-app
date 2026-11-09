import mongoose from "mongoose";

const emailOtpModel = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    purpose: { type: String, required: true, enum: ["register", "password-reset"] },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    windowStartedAt: { type: Date, required: true },
    sendCount: { type: Number, default: 0 },
    lastSentAt: { type: Date, required: true },
  },
  { timestamps: true }
);

emailOtpModel.index({ email: 1, purpose: 1 }, { unique: true });
emailOtpModel.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 });

export const emailOtpSchema =
  mongoose.models.email_otps || mongoose.model("email_otps", emailOtpModel);
