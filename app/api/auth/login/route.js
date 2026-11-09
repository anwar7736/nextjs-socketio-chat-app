import bcrypt from "bcryptjs";
import * as OTPAuth from "otpauth";
import { NextResponse } from "next/server";
import { mongoDB_connect } from "@/app/helpers/helper";
import { userSchema } from "@/app/models/userModel";
import { createSessionToken, setSessionCookie } from "@/app/lib/session";

export async function POST(request) {
  const { identifier, password, code } = await request.json();
  if (typeof identifier !== "string" || typeof password !== "string") {
    return NextResponse.json({ success: false, message: "Enter your email and password." }, { status: 400 });
  }

  await mongoDB_connect();
  const normalized = identifier.trim().toLowerCase();
  const user = await userSchema.findOne({
    $or: [{ email: normalized }, { phone: identifier.trim() }],
  }).select("+twoFactorSecret");
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return NextResponse.json({ success: false, message: "Invalid email or password." }, { status: 401 });
  }
  if (user.email && !user.emailVerified) {
    return NextResponse.json({ success: false, message: "Verify your email address before signing in." }, { status: 403 });
  }
  if (user.twoFactorEnabled) {
    if (!code) {
      return NextResponse.json({ success: false, requiresTwoFactor: true, message: "Enter your authenticator code." }, { status: 200 });
    }
    const totp = new OTPAuth.TOTP({
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(user.twoFactorSecret),
    });
    if (typeof code !== "string" || totp.validate({ token: code, window: 1 }) === null) {
      return NextResponse.json({ success: false, requiresTwoFactor: true, message: "Invalid authenticator code." }, { status: 401 });
    }
  }

  const data = {
    _id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    photo: user.photo,
  };
  const response = NextResponse.json({ success: true, data });
  try {
    setSessionCookie(response, await createSessionToken(String(user._id)));
  } catch (error) {
    console.error("Unable to create user session:", error);
    return NextResponse.json({ success: false, message: "Unable to start a session. Check server configuration." }, { status: 500 });
  }
  return response;
}
