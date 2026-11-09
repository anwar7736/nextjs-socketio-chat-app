import { mongoDB_connect } from "@/app/helpers/helper";
import { userSchema } from "@/app/models/userModel";
import { NextResponse } from "next/server";
import { getSessionUserId } from "@/app/lib/session";

export async function POST() {
    return NextResponse.json(
        { success: false, message: "Use the verified email authentication endpoints." },
        { status: 410 }
    );
}

export async function GET(request) {
    const userId = await getSessionUserId(request);
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    await mongoDB_connect();
    const data = await userSchema.findById(userId).select("-password -twoFactorSecret -pendingTwoFactorSecret");
    if (!data) return NextResponse.json({ success: false, message: "Account not found." }, { status: 404 });
    return NextResponse.json({ success: true, data });
}