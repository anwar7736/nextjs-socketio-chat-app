import { NextResponse } from "next/server";
import { mongoDB_connect } from "@/app/helpers/helper";
import { userSchema } from "@/app/models/userModel";
import { sendEmailOtp } from "@/app/lib/emailOtp";

export async function POST(request) {
  const { email: rawEmail, purpose } = await request.json();
  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !["register", "password-reset"].includes(purpose)) {
    return NextResponse.json({ success: false, message: "Enter a valid email address." }, { status: 400 });
  }

  await mongoDB_connect();
  const existingUser = await userSchema.findOne({ email }).select("_id");
  if (purpose === "register" && existingUser) {
    return NextResponse.json({ success: false, message: "An account with this email already exists." }, { status: 409 });
  }
  try {
    if (purpose === "password-reset" && !existingUser) {
      return NextResponse.json({ success: true, message: "If an account exists, a verification code has been sent." });
    }
    const result = await sendEmailOtp(email, purpose);
    return NextResponse.json({
      success: result.success,
      message: result.message || "Verification code sent. Check your email.",
    }, { status: result.status || 200 });
  } catch (error) {
    console.error("Unable to send email OTP:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 503 });
  }
}
