import { createHmac } from "crypto";
import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { mongoDB_connect } from "@/app/helpers/helper";
import { getSessionUserId } from "@/app/lib/session";
import { callLogSchema } from "@/app/models/callLogModel";
import { groupMemberSchema } from "@/app/models/groupMemberModel";
import { userSchema } from "@/app/models/userModel";

const objectIdPattern = /^[a-f\d]{24}$/i;
const callIdPattern = /^[a-f\d-]{36}$/i;

export async function GET(request) {
  const userId = await getSessionUserId(request);
  if (!userId) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  const searchParams = request.nextUrl.searchParams;
  const conversationId = searchParams.get("conversation_id");
  const isGroup = searchParams.get("is_group");
  if (conversationId && !objectIdPattern.test(conversationId)) {
    return NextResponse.json({ success: false, message: "Invalid conversation." }, { status: 400 });
  }
  if (isGroup !== null && !["0", "1"].includes(isGroup)) {
    return NextResponse.json({ success: false, message: "Invalid conversation type." }, { status: 400 });
  }
  await mongoDB_connect();
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const query = {
    participants: userObjectId,
    deletedFor: { $ne: userObjectId },
    deletedForEveryone: { $ne: true },
  };
  if (conversationId) query.conversationId = new mongoose.Types.ObjectId(conversationId);
  if (isGroup !== null) query.isGroup = isGroup === "1";
  const data = await callLogSchema.find(query).sort({ startedAt: -1 }).limit(conversationId ? 100 : 50).lean();
  return NextResponse.json({ success: true, data });
}

export async function DELETE(request) {
  const userId = await getSessionUserId(request);
  if (!userId) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid request body." }, { status: 400 });
  }
  const callId = String(body?.callId || "");
  const mode = body?.mode;
  if (!callIdPattern.test(callId) || !["for-me", "everyone"].includes(mode)) {
    return NextResponse.json({ success: false, message: "Invalid call log deletion." }, { status: 400 });
  }

  await mongoDB_connect();
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const log = await callLogSchema.findOne({
    callId,
    participants: userObjectId,
    deletedFor: { $ne: userObjectId },
    deletedForEveryone: { $ne: true },
  }).select("callerId conversationId isGroup participants");
  if (!log) return NextResponse.json({ success: false, message: "Call log not found." }, { status: 404 });

  if (mode === "everyone" && !log.callerId.equals(userObjectId)) {
    return NextResponse.json({ success: false, message: "Only the caller can delete this call log for everyone." }, { status: 403 });
  }
  const secret = process.env.AUTH_SECRET ||
    (process.env.NODE_ENV !== "production" && "local-development-only-secret-change-before-deploy");
  if (!secret) {
    return NextResponse.json({ success: false, message: "Realtime call log deletion is not configured." }, { status: 500 });
  }
  if (mode === "everyone") {
    await callLogSchema.updateOne(
      { _id: log._id, deletedForEveryone: { $ne: true } },
      { $set: { deletedForEveryone: true } }
    );
  } else {
    await callLogSchema.updateOne(
      { _id: log._id },
      { $addToSet: { deletedFor: userObjectId } }
    );
  }

  const event = {
    actor_id: userId,
    callId,
    conversation_id: String(log.conversationId),
    is_group: Boolean(log.isGroup),
    recipient_ids: mode === "everyone" ? log.participants.map(String) : [userId],
  };
  const issuedAt = Date.now();
  const signature = createHmac("sha256", secret)
    .update(JSON.stringify({ event, issuedAt }))
    .digest("base64url");
  return NextResponse.json({ success: true, socket_event: { ...event, issuedAt, signature } });
}

export async function POST(request) {
  const userId = await getSessionUserId(request);
  if (!userId) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid request body." }, { status: 400 });
  }
  const action = body?.action;
  const callId = String(body?.callId || "");
  if (!callIdPattern.test(callId) || !["start", "answered", "ended", "no-answer", "declined"].includes(action)) {
    return NextResponse.json({ success: false, message: "Invalid call log update." }, { status: 400 });
  }

  await mongoDB_connect();
  const userObjectId = new mongoose.Types.ObjectId(userId);
  if (action === "start") {
    const conversationId = String(body.conversationId || "");
    const isGroup = Boolean(body.isGroup);
    if (body.callerId !== userId || !objectIdPattern.test(conversationId) || !Array.isArray(body.participants)) {
      return NextResponse.json({ success: false, message: "Invalid call participants." }, { status: 400 });
    }
    const conversationObjectId = new mongoose.Types.ObjectId(conversationId);
    let allowedParticipants;
    if (isGroup) {
      if (!(await groupMemberSchema.exists({ group_id: conversationObjectId, user_id: userObjectId, status: 1 }))) {
        return NextResponse.json({ success: false, message: "You are not a member of this group." }, { status: 403 });
      }
      allowedParticipants = (await groupMemberSchema.find({ group_id: conversationObjectId, status: 1 }).distinct("user_id")).map(String);
    } else {
      if (conversationId === userId || !(await userSchema.exists({ _id: conversationObjectId, status: 1 }))) {
        return NextResponse.json({ success: false, message: "Conversation partner not found." }, { status: 404 });
      }
      allowedParticipants = [userId, conversationId];
    }
    const participants = [...new Set(body.participants.map(String))];
    if (!participants.includes(userId) || participants.length > 8 || participants.some((id) => !allowedParticipants.includes(id))) {
      return NextResponse.json({ success: false, message: "Invalid call participants." }, { status: 400 });
    }
    await callLogSchema.updateOne(
      { callId, callerId: userObjectId },
      {
        $setOnInsert: {
          callId,
          callerId: userObjectId,
          conversationId: conversationObjectId,
          isGroup,
          isVideo: Boolean(body.isVideo),
          participants: participants.map((id) => new mongoose.Types.ObjectId(id)),
          status: "ringing",
          startedAt: new Date(),
        },
      },
      { upsert: true }
    );
    return NextResponse.json({ success: true });
  }

  const log = await callLogSchema.findOne({ callId, participants: userObjectId });
  if (!log) return NextResponse.json({ success: false, message: "Call not found." }, { status: 404 });
  if (action === "answered") {
    if (log.endedAt) return NextResponse.json({ success: true });
    log.status = "answered";
    if (!log.answeredAt) log.answeredAt = new Date();
  } else {
    if (log.endedAt) return NextResponse.json({ success: true });
    log.status = action;
    log.endedAt = new Date();
    log.durationSeconds = log.answeredAt
      ? Math.max(0, Math.floor((log.endedAt.getTime() - log.answeredAt.getTime()) / 1000))
      : 0;
  }
  await log.save();
  return NextResponse.json({ success: true });
}
