import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/app/lib/session";

export async function POST() {
  return clearSessionCookie(NextResponse.json({ success: true }));
}
