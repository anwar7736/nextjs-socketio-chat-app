import { createHmac } from "crypto";
import { NextResponse } from "next/server";
import { getSessionUserId } from "@/app/lib/session";

export async function GET(request) {
  const userId = await getSessionUserId(request);
  if (!userId) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });

  const urls = (process.env.TURN_URLS || "").split(",").map((url) => url.trim()).filter(Boolean);
  // several public STUN servers: more phones find a direct path (mobile networks often block one or another)
  const iceServers = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"] },
    { urls: "stun:stun.cloudflare.com:3478" },
  ];
  const sharedSecret = process.env.TURN_SHARED_SECRET;
  if (urls.length && sharedSecret) {
    const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60;
    const username = `${expiresAt}:${userId}`;
    const credential = createHmac("sha1", sharedSecret).update(username).digest("base64");
    iceServers.push({ urls, username, credential });
  } else if (process.env.NODE_ENV === "production" && urls.length) {
    console.error("TURN_URLS is configured without TURN_SHARED_SECRET.");
    return NextResponse.json({ success: false, message: "The call relay server is not configured correctly." }, { status: 503 });
  }

  return NextResponse.json({ success: true, iceServers });
}
