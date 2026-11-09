import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import { NextResponse } from "next/server";
import { mongoDB_connect } from "@/app/helpers/helper";
import { userSchema } from "@/app/models/userModel";
import { getSessionUserId } from "@/app/lib/session";

function isValidCode(secret, code) {
  if (!secret || typeof code !== "string" || !/^\d{6}$/.test(code)) return false;
  const totp = new OTPAuth.TOTP({
    issuer: "Convo",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  return totp.validate({ token: code, window: 1 }) !== null;
}

export async function GET(request) {
  const userId = await getSessionUserId(request);
  if (!userId) return NextResponse.json({ success: false, message: "Sign in to manage two-factor authentication." }, { status: 401 });

  await mongoDB_connect();
  const user = await userSchema.findById(userId).select("+pendingTwoFactorSecret");
  if (!user) return NextResponse.json({ success: false, message: "Account not found." }, { status: 404 });
  if (user.twoFactorEnabled) {
    return NextResponse.json({ success: true, enabled: true });
  }

  if (!user.pendingTwoFactorSecret) {
    user.pendingTwoFactorSecret = new OTPAuth.Secret().base32;
    await user.save();
  }
  const totp = new OTPAuth.TOTP({
    issuer: "Convo",
    label: user.email || user.phone || user.name,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(user.pendingTwoFactorSecret),
  });
  return NextResponse.json({
    success: true,
    enabled: false,
    qrCode: await QRCode.toDataURL(totp.toString()),
  });
}

export async function POST(request) {
  const userId = await getSessionUserId(request);
  if (!userId) return NextResponse.json({ success: false, message: "Sign in to manage two-factor authentication." }, { status: 401 });
  const { action, code } = await request.json();
  if (!["enable", "disable"].includes(action)) {
    return NextResponse.json({ success: false, message: "Choose enable or disable." }, { status: 400 });
  }

  await mongoDB_connect();
  const user = await userSchema.findById(userId).select("+twoFactorSecret +pendingTwoFactorSecret");
  if (!user) return NextResponse.json({ success: false, message: "Account not found." }, { status: 404 });

  if (action === "enable") {
    if (!user.pendingTwoFactorSecret || !isValidCode(user.pendingTwoFactorSecret, code)) {
      return NextResponse.json({ success: false, message: "The authenticator code is invalid." }, { status: 400 });
    }
    user.twoFactorSecret = user.pendingTwoFactorSecret;
    user.pendingTwoFactorSecret = undefined;
    user.twoFactorEnabled = true;
  } else {
    if (!user.twoFactorEnabled || !isValidCode(user.twoFactorSecret, code)) {
      return NextResponse.json({ success: false, message: "The authenticator code is invalid." }, { status: 400 });
    }
    user.twoFactorSecret = undefined;
    user.pendingTwoFactorSecret = undefined;
    user.twoFactorEnabled = false;
  }

  await user.save();
  return NextResponse.json({
    success: true,
    enabled: user.twoFactorEnabled,
    message: user.twoFactorEnabled ? "Two-factor authentication enabled." : "Two-factor authentication disabled.",
  });
}
