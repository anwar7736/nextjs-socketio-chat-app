import { mongoDB_connect } from "@/app/helpers/helper";
import { getSessionUserId } from "@/app/lib/session";
import { messageSchema } from "@/app/models/messageModel";
import { messageLogSchema } from "@/app/models/messageLogModel";
import { groupMemberSchema } from "@/app/models/groupMemberModel";
import { groupSchema } from "@/app/models/groupModel";
import { userSchema } from "@/app/models/userModel";
import { sendPushNotification } from "@/app/lib/pushNotifications";
import { createHmac } from "crypto";
import mongoose from "mongoose";
import { NextResponse } from "next/server";

const objectIdPattern = /^[a-f\d]{24}$/i;

export async function GET(request) {
  const sessionUserId = await getSessionUserId(request);
  const query = request.nextUrl.searchParams;
  const requestedAuthId = query.get("auth_id");
  const refId = query.get("ref_id");
  const isGroup = query.get("is_group") === "1";
  if (!sessionUserId || (requestedAuthId && requestedAuthId !== sessionUserId)) {
    return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  }
  if (!refId || !objectIdPattern.test(refId)) {
    return NextResponse.json({ success: false, data: [], message: "A valid conversation is required." }, { status: 400 });
  }

  await mongoDB_connect();
  const currentUserId = new mongoose.Types.ObjectId(sessionUserId);
  const referenceId = new mongoose.Types.ObjectId(refId);
  let match;
  let unreadLogs;
  if (isGroup) {
    const membership = await groupMemberSchema.exists({ group_id: referenceId, user_id: currentUserId, status: 1 });
    if (!membership) return NextResponse.json({ success: false, message: "You are not a member of this group." }, { status: 403 });
    unreadLogs = await messageLogSchema.find({
      group_id: referenceId,
      receiver_id: currentUserId,
      status: 0,
    }).select("message_id sender_id").limit(200).lean();
    await messageLogSchema.updateMany(
      { group_id: referenceId, receiver_id: currentUserId, status: 0 },
      { $set: { status: 1 } }
    );
    match = { group_id: referenceId, receiver_id: currentUserId };
  } else {
    if (referenceId.equals(currentUserId)) {
      return NextResponse.json({ success: false, message: "A conversation partner is required." }, { status: 400 });
    }
    unreadLogs = await messageLogSchema.find({
      sender_id: referenceId,
      receiver_id: currentUserId,
      group_id: { $exists: false },
      status: 0,
    }).select("message_id sender_id").sort({ createdAt: -1 }).limit(200).lean();
    await messageLogSchema.updateMany(
      { sender_id: referenceId, receiver_id: currentUserId, group_id: { $exists: false }, status: 0 },
      { $set: { status: 1 } }
    );
    match = {
      $and: [
        { $or: [{ group_id: null }, { group_id: { $exists: false } }] },
        { $or: [
          { sender_id: currentUserId, receiver_id: referenceId },
          { sender_id: referenceId, receiver_id: currentUserId },
        ] },
      ],
    };
  }

  const data = await messageLogSchema.aggregate([
    { $match: match },
    { $sort: { createdAt: -1 } },
    { $limit: 200 },
    { $lookup: { from: "groups", localField: "group_id", foreignField: "_id", as: "group" } },
    { $unwind: { path: "$group", preserveNullAndEmptyArrays: true } },
    { $lookup: { from: "messages", localField: "message_id", foreignField: "_id", as: "message" } },
    { $unwind: "$message" },
    { $lookup: { from: "users", localField: "sender_id", foreignField: "_id", as: "sender" } },
    { $unwind: "$sender" },
    { $lookup: { from: "users", localField: "receiver_id", foreignField: "_id", as: "receiver" } },
    { $unwind: "$receiver" },
    { $lookup: { from: "message_logs", localField: "message_id", foreignField: "message_id", as: "message_receipts" } },
    {
      $addFields: {
        seen_by_ids: {
          $map: {
            input: {
              $filter: {
                input: "$message_receipts",
                as: "receipt",
                cond: {
                  $and: [
                    { $eq: ["$$receipt.status", 1] },
                    { $ne: ["$$receipt.receiver_id", currentUserId] },
                    { $ne: ["$$receipt.receiver_id", "$sender_id"] },
                  ],
                },
              },
            },
            as: "receipt",
            in: "$$receipt.receiver_id",
          },
        },
      },
    },
    {
      $project: {
        _id: 1,
        message_id: 1,
        status: 1,
        seen_by_ids: 1,
        "group._id": 1,
        "group.name": 1,
        "group.photo": 1,
        "group.short_desc": 1,
        "message.sender_id": 1,
        "message.message": 1,
        "message.type": 1,
        "message.attachmentUrl": 1,
        "message.attachmentName": 1,
        "message.mimeType": 1,
        "message.reply_to": 1,
        "message.reactions": 1,
        "message.createdAt": 1,
        "sender._id": 1,
        "sender.name": 1,
        "sender.photo": 1,
        "receiver._id": 1,
        "receiver.name": 1,
        "receiver.photo": 1,
      },
    },
    { $sort: { "message.createdAt": 1 } },
  ]);

  const memberIds = new Set();
  for (const item of data) {
    for (const id of item.seen_by_ids || []) memberIds.add(String(id));
    for (const reaction of item.message?.reactions || []) memberIds.add(String(reaction.user_id));
  }
  const memberProfiles = memberIds.size
    ? await userSchema.find({ _id: { $in: [...memberIds].map((id) => new mongoose.Types.ObjectId(id)) } })
      .select("name photo").lean()
    : [];
  const profilesById = new Map(memberProfiles.map((profile) => [String(profile._id), profile]));
  const enrichedData = data.map((item) => {
    const seenBy = (item.seen_by_ids || [])
      .map((id) => profilesById.get(String(id)))
      .filter(Boolean)
      .map((profile) => ({ _id: String(profile._id), name: profile.name, photo: profile.photo }));
    const reactions = (item.message?.reactions || []).map((reaction) => {
      const profile = profilesById.get(String(reaction.user_id));
      return {
        user_id: String(reaction.user_id),
        emoji: reaction.emoji,
        ...(profile ? { name: profile.name, photo: profile.photo } : {}),
      };
    });
    return {
      ...item,
      seen_by: seenBy,
      message: { ...item.message, reactions },
      seen_by_ids: undefined,
    };
  });

  const unreadBySender = new Map();
  for (const log of unreadLogs || []) {
    const senderId = String(log.sender_id);
    if (senderId === sessionUserId) continue;
    const ids = unreadBySender.get(senderId) || [];
    ids.push(String(log.message_id));
    unreadBySender.set(senderId, ids);
  }
  const actor = unreadBySender.size
    ? await userSchema.findById(currentUserId).select("name photo").lean()
    : null;
  const secret = process.env.AUTH_SECRET ||
    (process.env.NODE_ENV !== "production" && "local-development-only-secret-change-before-deploy");
  const issuedAt = Date.now();
  const seenEvents = secret && actor
    ? [...unreadBySender.entries()].map(([senderId, messageIds]) => {
      const event = {
        actor_id: sessionUserId,
        actor_name: actor.name || "Someone",
        actor_photo: actor.photo || "",
        message_ids: messageIds,
        recipient_ids: [senderId],
      };
      const signature = createHmac("sha256", secret)
        .update(JSON.stringify({ event, issuedAt }))
        .digest("base64url");
      return { ...event, issuedAt, signature };
    })
    : [];

  return NextResponse.json({ success: true, data: enrichedData, seen_events: seenEvents });
}

export async function POST(request) {
  const sessionUserId = await getSessionUserId(request);
  if (!sessionUserId) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid request body." }, { status: 400 });
  }
  const { receiver_id, is_group, attachmentUrl, attachmentName, mimeType, type } = body;
  const replyTo = typeof body.reply_to === "string" && objectIdPattern.test(body.reply_to)
    ? new mongoose.Types.ObjectId(body.reply_to)
    : null;
  const text = typeof body.message === "string" ? body.message.trim() : "";
  const isGroup = is_group === 1 || is_group === true;
  if (!receiver_id || !objectIdPattern.test(receiver_id) || (!text && !attachmentUrl) || text.length > 5000) {
    return NextResponse.json({ success: false, message: "A valid recipient and message are required." }, { status: 400 });
  }
  if (attachmentUrl && !new RegExp(`^/api/attachments/${sessionUserId}_[a-f0-9-]+\\.(jpg|png|gif|webp|webm|ogg|mp3|m4a|mp4|mov|pdf)$`, "i").test(attachmentUrl)) {
    return NextResponse.json({ success: false, message: "Invalid attachment." }, { status: 400 });
  }
  const allowedTypes = ["text", "image", "audio", "video", "file"];
  if (type && !allowedTypes.includes(type)) {
    return NextResponse.json({ success: false, message: "Invalid message type." }, { status: 400 });
  }

  await mongoDB_connect();
  const senderId = new mongoose.Types.ObjectId(sessionUserId);
  const receiverId = new mongoose.Types.ObjectId(receiver_id);
  if (attachmentUrl && await messageSchema.exists({ attachmentUrl })) {
    return NextResponse.json({ success: false, message: "This attachment has already been sent." }, { status: 409 });
  }
  if (isGroup) {
    const member = await groupMemberSchema.exists({ group_id: receiverId, user_id: senderId, status: 1 });
    if (!member) return NextResponse.json({ success: false, message: "You are not a member of this group." }, { status: 403 });
    if (replyTo && !(await messageLogSchema.exists({ message_id: replyTo, group_id: receiverId, receiver_id: senderId }))) {
      return NextResponse.json({ success: false, message: "The message you are replying to is unavailable." }, { status: 400 });
    }
  } else if (senderId.equals(receiverId)) {
    return NextResponse.json({ success: false, message: "Recipient not found." }, { status: 404 });
  } else {
    const [senderProfile, receiverProfile] = await Promise.all([
      userSchema.findById(senderId).select("blockedUsers").lean(),
      userSchema.findOne({ _id: receiverId, status: 1 }).select("blockedUsers").lean(),
    ]);
    if (!receiverProfile) {
      return NextResponse.json({ success: false, message: "Recipient not found." }, { status: 404 });
    }
    const blockedBySender = (senderProfile?.blockedUsers || []).some((id) => String(id) === String(receiverId));
    const blockedByReceiver = (receiverProfile.blockedUsers || []).some((id) => String(id) === String(senderId));
    if (blockedBySender || blockedByReceiver) {
      return NextResponse.json({
        success: false,
        message: blockedBySender ? "Unblock this contact before sending messages." : "This contact has blocked you.",
      }, { status: 403 });
    }
  }
  if (!isGroup && replyTo && !(await messageLogSchema.exists({
      message_id: replyTo,
      $or: [
        { sender_id: senderId, receiver_id: receiverId },
        { sender_id: receiverId, receiver_id: senderId },
      ],
      group_id: { $exists: false },
    }))) {
    return NextResponse.json({ success: false, message: "The message you are replying to is unavailable." }, { status: 400 });
  }

  const message = await messageSchema.create({
    sender_id: senderId,
    ...(isGroup ? { group_id: receiverId } : {}),
    message: text,
    type: type || (attachmentUrl ? "file" : "text"),
    attachmentUrl,
    attachmentName: typeof attachmentName === "string" ? attachmentName.slice(0, 180) : undefined,
    mimeType: typeof mimeType === "string" ? mimeType.slice(0, 100) : undefined,
    ...(replyTo ? { reply_to: replyTo } : {}),
  });

  let logs;
  let recipientIds;
  if (isGroup) {
    const members = await groupMemberSchema.find({ group_id: receiverId, status: 1 }).select("user_id").lean();
    logs = members.map(({ user_id }) => ({
      message_id: message._id,
      group_id: receiverId,
      sender_id: senderId,
      receiver_id: user_id,
      status: senderId.equals(user_id) ? 1 : 0,
    }));
    if (logs.length) await messageLogSchema.insertMany(logs, { ordered: true });
    // the socket server sends the real-time notice (ids only) to these members alone
    recipientIds = members.map(({ user_id }) => String(user_id)).filter((id) => id !== sessionUserId);
  } else {
    await messageLogSchema.create({
      message_id: message._id,
      sender_id: senderId,
      receiver_id: receiverId,
    });
  }

  // Notification like WhatsApp: "<sender>" (or "<sender> @ <group>") with the text; tapping it opens that chat.
  // For a direct message the chat to open on the receiver's phone is the SENDER's (receiver_id is the receiver).
  const pushRecipients = (isGroup ? recipientIds : [receiver_id]).filter((id) => id !== sessionUserId);
  const pendingCounts = pushRecipients.length
    ? await messageLogSchema.aggregate([
        { $match: { receiver_id: { $in: pushRecipients.map((id) => new mongoose.Types.ObjectId(id)) }, status: 0 } },
        { $group: { _id: "$receiver_id", count: { $sum: 1 } } },
      ])
    : [];
  const unreadByUser = new Map(pendingCounts.map((item) => [String(item._id), item.count]));
  const notificationBody = text || (type === "image" ? "📷 Photo" : type === "audio" ? "🎤 Voice message" : type === "video" ? "🎥 Video" : "📎 Attachment");
  const ticketId = isGroup ? receiver_id : sessionUserId;
  const [senderInfo, groupInfo] = await Promise.all([
    userSchema.findById(senderId).select("name").lean(),
    isGroup ? groupSchema.findById(receiverId).select("name").lean() : null,
  ]).catch(() => [null, null]);
  const senderName = senderInfo?.name || "New message";
  await sendPushNotification(pushRecipients, (recipientId) => ({
    title: isGroup ? `${senderName} @ ${groupInfo?.name || "Group"}` : senderName,
    body: notificationBody.slice(0, 180),
    url: `/?ticket=${encodeURIComponent(ticketId)}&is_group=${isGroup ? "1" : "0"}`,
    tag: `message-${ticketId}`,
    badge: unreadByUser.get(recipientId) || 0,
  })).catch((error) => console.error("Unable to prepare a Web Push notification:", error));

  return NextResponse.json({
    success: true,
    data: {
      sender_id: sessionUserId,
      receiver_id,
      is_group: isGroup ? 1 : 0,
      ...(isGroup ? { recipient_ids: recipientIds } : {}),
    },
  });
}

export async function PUT() {
  return NextResponse.json({ success: false, message: "This operation is not supported." }, { status: 405 });
}
