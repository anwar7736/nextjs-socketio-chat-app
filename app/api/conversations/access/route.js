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
  const peerId = String(body?.peer_id || conversationId);
  if (
    !objectIdPattern.test(conversationId) ||
    (!isGroup && (!objectIdPattern.test(peerId) || peerId === userId))
  ) {
    return NextResponse.json({ success: false, message: "Invalid conversation." }, { status: 400 });
  }

  await mongoDB_connect();
  const actorId = new mongoose.Types.ObjectId(userId);
  const targetId = new mongoose.Types.ObjectId(isGroup ? conversationId : peerId);
  if (isGroup) {
    const membership = await groupMemberSchema.exists({ group_id: targetId, user_id: actorId, status: 1 });
    if (!membership) return NextResponse.json({ success: false, message: "You are not a member of this group." }, { status: 403 });
    return NextResponse.json({ success: true, allowed: true });
  }

  const [actor, partner] = await Promise.all([
    userSchema.findById(actorId).select("blockedUsers").lean(),
    userSchema.findById(targetId).select("blockedUsers status").lean(),
  ]);
  if (!partner || partner.status !== 1) {
    return NextResponse.json({ success: false, message: "Conversation partner not found." }, { status: 404 });
  }
  const blocked = (actor?.blockedUsers || []).some((id) => String(id) === peerId);
  const blockedByPartner = (partner.blockedUsers || []).some((id) => String(id) === userId);
  if (blocked || blockedByPartner) {
    return NextResponse.json({
      success: true,
      allowed: false,
      message: blocked ? "Unblock this contact before calling." : "This contact has blocked you.",
    });
  }
  return NextResponse.json({ success: true, allowed: true });
}
