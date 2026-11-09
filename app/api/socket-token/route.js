import { NextResponse } from "next/server";
import { createSocketToken, getSessionUserId } from "@/app/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const userId = await getSessionUserId(request);
  if (!userId) {
    return NextResponse.json(
      { success: false, message: "Unauthorized." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const token = await createSocketToken(userId);
    return NextResponse.json(
      { success: true, token },
      { headers: { "Cache-Control": "no-store, private" } }
    );
  } catch (error) {
    console.error("Unable to create Socket.IO authentication token:", error);
    return NextResponse.json(
      { success: false, message: "Unable to authenticate the real-time connection." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
