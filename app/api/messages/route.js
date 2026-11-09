import { mongoDB_connect } from "@/app/helpers/helper";
import { getSessionUserId } from "@/app/lib/session";
import { messageSchema } from "@/app/models/messageModel";
import { messageLogSchema } from "@/app/models/messageLogModel";
import { groupMemberSchema } from "@/app/models/groupMemberModel";
import { userSchema } from "@/app/models/userModel";
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
  if (isGroup) {
    const membership = await groupMemberSchema.exists({ group_id: referenceId, user_id: currentUserId, status: 1 });
    if (!membership) return NextResponse.json({ success: false, message: "You are not a member of this group." }, { status: 403 });
    await messageLogSchema.updateMany(
      { group_id: referenceId, receiver_id: currentUserId, status: 0 },
      { $set: { status: 1 } }
    );
    match = { group_id: referenceId, receiver_id: currentUserId };
  } else {
    if (referenceId.equals(currentUserId)) {
      return NextResponse.json({ success: false, message: "A conversation partner is required." }, { status: 400 });
    }
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
    {
      $project: {
        _id: 1,
        status: 1,
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
  return NextResponse.json({ success: true, data });
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
  } else if (senderId.equals(receiverId) || !(await userSchema.exists({ _id: receiverId, status: 1 }))) {
    return NextResponse.json({ success: false, message: "Recipient not found." }, { status: 404 });
  }

  const message = await messageSchema.create({
    sender_id: senderId,
    ...(isGroup ? { group_id: receiverId } : {}),
    message: text,
    type: type || (attachmentUrl ? "file" : "text"),
    attachmentUrl,
    attachmentName: typeof attachmentName === "string" ? attachmentName.slice(0, 180) : undefined,
    mimeType: typeof mimeType === "string" ? mimeType.slice(0, 100) : undefined,
  });

  let logs;
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
  } else {
    await messageLogSchema.create({
      message_id: message._id,
      sender_id: senderId,
      receiver_id: receiverId,
    });
  }

  return NextResponse.json({
    success: true,
    data: { sender_id: sessionUserId, receiver_id, is_group: isGroup ? 1 : 0 },
  });
}

export async function PUT() {
  return NextResponse.json({ success: false, message: "This operation is not supported." }, { status: 405 });
}
