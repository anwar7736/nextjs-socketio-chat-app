import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { mongoDB_connect } from "@/app/helpers/helper";
import { getSessionUserId } from "@/app/lib/session";
import { sendPushNotification } from "@/app/lib/pushNotifications";
import { groupMemberSchema } from "@/app/models/groupMemberModel";
import { groupSchema } from "@/app/models/groupModel";
import { messageLogSchema } from "@/app/models/messageLogModel";
import { userSchema } from "@/app/models/userModel";

const objectIdPattern = /^[a-f\d]{24}$/i;

// A call nobody picked up (offline, or no answer): the people called get a "Missed call" notification,
// like WhatsApp; tapping it opens the chat. Only people in that chat/group can be notified.
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
  const isVideo = Boolean(body?.is_video);
  const requested = Array.isArray(body?.recipient_ids) ? body.recipient_ids.map(String).filter((id) => objectIdPattern.test(id)) : [];
  if (!objectIdPattern.test(conversationId) || !requested.length || requested.length > 7) {
    return NextResponse.json({ success: false, message: "A valid call is required." }, { status: 400 });
  }

  await mongoDB_connect();
  let recipients;
  let groupName = null;
  if (isGroup) {
    const groupId = new mongoose.Types.ObjectId(conversationId);
    const callerIsMember = await groupMemberSchema.exists({ group_id: groupId, user_id: new mongoose.Types.ObjectId(userId), status: 1 });
    if (!callerIsMember) return NextResponse.json({ success: false, message: "You are not a member of this group." }, { status: 403 });
    const members = await groupMemberSchema.find({
      group_id: groupId,
      status: 1,
      user_id: { $in: requested.map((id) => new mongoose.Types.ObjectId(id)) },
    }).distinct("user_id");
    recipients = members.map(String).filter((id) => id !== userId);
    groupName = (await groupSchema.findById(groupId).select("name").lean())?.name || "Group";
  } else {
    // a direct call can only be missed by the person on the other side of that chat
    recipients = requested.length === 1 && requested[0] === conversationId && conversationId !== userId ? [conversationId] : [];
    if (recipients.length) {
      const [caller, recipient] = await Promise.all([
        userSchema.findById(userId).select("blockedUsers").lean(),
        userSchema.findById(conversationId).select("blockedUsers").lean(),
      ]);
      const blocked = (caller?.blockedUsers || []).some((id) => String(id) === conversationId) ||
        (recipient?.blockedUsers || []).some((id) => String(id) === userId);
      if (blocked) recipients = [];
    }
  }
  if (!recipients.length) return NextResponse.json({ success: false, message: "Nobody to notify." }, { status: 400 });

  const caller = await userSchema.findById(userId).select("name").lean();
  const ticketId = isGroup ? conversationId : userId;
  const pendingCounts = await messageLogSchema.aggregate([
    { $match: { receiver_id: { $in: recipients.map((id) => new mongoose.Types.ObjectId(id)) }, status: 0 } },
    { $group: { _id: "$receiver_id", count: { $sum: 1 } } },
  ]);
  const unreadByUser = new Map(pendingCounts.map((item) => [String(item._id), item.count]));
  await sendPushNotification(recipients, (recipientId) => ({
    title: `Missed ${isVideo ? "video" : "voice"} call`,
    body: groupName ? `${caller?.name || "Someone"} @ ${groupName}` : caller?.name || "Someone called you",
    url: `/?ticket=${ticketId}&is_group=${isGroup ? "1" : "0"}`,
    tag: `call-${ticketId}`,
    badge: unreadByUser.get(recipientId) || 0,
  })).catch((error) => console.error("Unable to send a missed-call notification:", error));

  return NextResponse.json({ success: true });
}
