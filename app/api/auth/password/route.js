import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { mongoDB_connect } from "@/app/helpers/helper";
import { userSchema } from "@/app/models/userModel";
import { verifyEmailOtp } from "@/app/lib/emailOtp";

export async function POST(request) {
  const { email: rawEmail, code, password } = await request.json();
  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof code !== "string" || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ success: false, message: "Enter your email and 6-digit verification code." }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < 10 || password.length > 128) {
    return NextResponse.json({ success: false, message: "Use a password between 10 and 128 characters." }, { status: 400 });
  }

  await mongoDB_connect();
  const user = await userSchema.findOne({ email }).select("_id");
  if (!user || !(await verifyEmailOtp(email, "password-reset", code))) {
    return NextResponse.json({ success: false, message: "The code is invalid or expired." }, { status: 400 });
  }
  user.password = await bcrypt.hash(password, 12);
  await user.save();
  return NextResponse.json({ success: true, message: "Password updated. You can now sign in." });
}
