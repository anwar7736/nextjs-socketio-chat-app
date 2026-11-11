import { mongoDB_connect } from "@/app/helpers/helper";
import { getSessionUserId } from "@/app/lib/session";
import { userSchema } from "@/app/models/userModel";
import mongoose from "mongoose";
import { NextResponse } from "next/server";

export async function POST(request) {
  const userId = await getSessionUserId(request);
  if (!userId) {
    return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  }

  await mongoDB_connect();
  const lastSeenAt = new Date();
  const result = await userSchema.updateOne(
    { _id: new mongoose.Types.ObjectId(userId) },
    { $set: { lastSeenAt } }
  );
  if (!result.matchedCount) {
    return NextResponse.json({ success: false, message: "User not found." }, { status: 404 });
  }

  return NextResponse.json({ success: true, lastSeenAt });
}
