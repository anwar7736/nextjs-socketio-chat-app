import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { mongoDB_connect } from "@/app/helpers/helper";
import { userSchema } from "@/app/models/userModel";
import { verifyEmailOtp } from "@/app/lib/emailOtp";
import { createSessionToken, setSessionCookie } from "@/app/lib/session";

export async function POST(request) {
  const { name, email: rawEmail, phone, password, code } = await request.json();
  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
  if (typeof name !== "string" || name.trim().length < 3 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ success: false, message: "Provide a name and a valid email address." }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < 10 || password.length > 128) {
    return NextResponse.json({ success: false, message: "Use a password between 10 and 128 characters." }, { status: 400 });
  }
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ success: false, message: "Enter the 6-digit email code." }, { status: 400 });
  }
  const normalizedPhone = typeof phone === "string" ? phone.trim().slice(0, 30) : "";

  await mongoDB_connect();
  if (await userSchema.findOne({ email }).select("_id")) {
    return NextResponse.json({ success: false, message: "An account with this email already exists." }, { status: 409 });
  }
  if (normalizedPhone && await userSchema.findOne({ phone: normalizedPhone }).select("_id")) {
    return NextResponse.json({ success: false, message: "An account with this phone number already exists." }, { status: 409 });
  }
  if (!(await verifyEmailOtp(email, "register", code))) {
    return NextResponse.json({ success: false, message: "The code is invalid or expired." }, { status: 400 });
  }

  const user = await userSchema.create({
    name: name.trim(),
    email,
    emailVerified: true,
    phone: normalizedPhone,
    address: "",
    password: await bcrypt.hash(password, 12),
  });
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
