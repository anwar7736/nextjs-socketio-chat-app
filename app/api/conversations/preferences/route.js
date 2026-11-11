import { getSessionUserId } from "@/app/lib/session";
import { mongoDB_connect } from "@/app/helpers/helper";
import { groupMemberSchema } from "@/app/models/groupMemberModel";
import { userSchema } from "@/app/models/userModel";
import mongoose from "mongoose";
import { NextResponse } from "next/server";

const objectIdPattern = /^[a-f\d]{24}$/i;

export async function POST(request) {
  const userId = await getSessionUserId(request);
  if (!userId) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid request body." }, { status: 400 });
  }

  const conversationId = String(body?.conversation_id || "");
  const isGroup = body?.is_group === 1 || body?.is_group === true;
  const action = body?.action;
  if (!objectIdPattern.test(conversationId) || !["archive", "unarchive", "block", "unblock", "check"].includes(action)) {
    return NextResponse.json({ success: false, message: "Invalid conversation preference." }, { status: 400 });
  }
  if (isGroup && (action === "block" || action === "unblock")) {
    return NextResponse.json({ success: false, message: "Groups cannot be blocked." }, { status: 400 });
  }
  if (!isGroup && conversationId === userId) {
    return NextResponse.json({ success: false, message: "A conversation partner is required." }, { status: 400 });
  }

  await mongoDB_connect();
  const currentUserId = new mongoose.Types.ObjectId(userId);
  const conversationObjectId = new mongoose.Types.ObjectId(conversationId);
  if (isGroup) {
    const membership = await groupMemberSchema.exists({
      group_id: conversationObjectId,
      user_id: currentUserId,
      status: 1,
    });
    if (!membership) return NextResponse.json({ success: false, message: "Group not found." }, { status: 404 });
  } else if (!(await userSchema.exists({ _id: conversationObjectId, status: 1 }))) {
    return NextResponse.json({ success: false, message: "Conversation partner not found." }, { status: 404 });
  }

  if (action === "archive" || action === "unarchive") {
    const update = action === "archive"
      ? { $addToSet: { archivedConversations: conversationObjectId } }
      : { $pull: { archivedConversations: conversationObjectId } };
    await userSchema.updateOne({ _id: currentUserId }, update);
  } else if (action === "block" || action === "unblock") {
    const update = action === "block"
      ? { $addToSet: { blockedUsers: conversationObjectId } }
      : { $pull: { blockedUsers: conversationObjectId } };
    await userSchema.updateOne({ _id: currentUserId }, update);
  }

  const currentUser = await userSchema.findById(currentUserId)
    .select("archivedConversations blockedUsers")
    .lean();
  const partner = isGroup ? null : await userSchema.findById(conversationObjectId).select("blockedUsers").lean();
  const blockedByPartner = (partner?.blockedUsers || []).some((id) => String(id) === userId);
  return NextResponse.json({
    success: true,
    archived: (currentUser?.archivedConversations || []).some((id) => String(id) === conversationId),
    blocked: (currentUser?.blockedUsers || []).some((id) => String(id) === conversationId),
    blockedByPartner,
  });
}
