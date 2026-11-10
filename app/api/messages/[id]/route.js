import { createHmac } from "crypto";
import { unlink } from "fs/promises";
import { mongoDB_connect } from "@/app/helpers/helper";
import { getSessionUserId } from "@/app/lib/session";
import { removeFile } from "@/app/lib/fileStore";
import { messageSchema } from "@/app/models/messageModel";
import { messageLogSchema } from "@/app/models/messageLogModel";
import mongoose from "mongoose";
import path from "path";
import { NextResponse } from "next/server";

const objectIdPattern = /^[a-f\d]{24}$/i;

export async function PATCH(request, context) {
  const userId = await getSessionUserId(request);
  const messageLogId = context.params.id;
  if (!userId) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  if (!objectIdPattern.test(messageLogId)) return NextResponse.json({ success: false, message: "Invalid message." }, { status: 400 });

  await mongoDB_connect();
  const log = await messageLogSchema.findOneAndUpdate(
    { _id: messageLogId, receiver_id: new mongoose.Types.ObjectId(userId) },
    { $set: { status: 2 } },
    { new: true }
  );
  if (!log) return NextResponse.json({ success: false, message: "Message not found." }, { status: 404 });
  return NextResponse.json({ success: true, message: "Message hidden.", message_id: messageLogId });
}

export async function DELETE(request, context) {
  const userId = await getSessionUserId(request);
  const messageLogId = context.params.id;
  if (!userId) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  if (!objectIdPattern.test(messageLogId)) return NextResponse.json({ success: false, message: "Invalid message." }, { status: 400 });

  await mongoDB_connect();
  const log = await messageLogSchema.findOne({
    _id: messageLogId,
    sender_id: new mongoose.Types.ObjectId(userId),
  }).select("message_id group_id receiver_id");
  if (!log) return NextResponse.json({ success: false, message: "Message not found." }, { status: 404 });

  const recipientIds = log.group_id
    ? (await messageLogSchema.find({ message_id: log.message_id }).distinct("receiver_id")).map(String)
    : [String(log.receiver_id)];
  const message = await messageSchema.findOneAndDelete({
    _id: log.message_id,
    sender_id: new mongoose.Types.ObjectId(userId),
  }).select("attachmentUrl");
  if (!message) return NextResponse.json({ success: false, message: "Message not found." }, { status: 404 });
  await messageLogSchema.deleteMany({ message_id: log.message_id });
  const filename = message.attachmentUrl?.match(/^\/api\/attachments\/([a-f\d]{24})_([a-f\d-]{36}\.(?:jpg|png|gif|webp|webm|ogg|mp3|m4a|mp4|mov|pdf))$/i);
  if (filename && filename[1] === userId) {
    await removeFile(`${filename[1]}_${filename[2]}`);
    try {
      await unlink(path.join(process.cwd(), "uploads", userId, filename[2])); // older files kept on disk
    } catch (error) {
      if (!["ENOENT", "EROFS", "EACCES"].includes(error.code)) throw error;
    }
  }
  return NextResponse.json({
    success: true,
    message: "Message removed.",
    message_id: String(log.message_id),
    log_id: messageLogId,
    group_id: log.group_id ? String(log.group_id) : null,
    recipient_ids: recipientIds,
  });
}

const reactionEmojis = new Set(["👍", "❤️", "😂", "😮", "😢", "🙏"]);

export async function PUT(request, context) {
  const userId = await getSessionUserId(request);
  const messageLogId = context.params.id;
  if (!userId) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  if (!objectIdPattern.test(messageLogId)) return NextResponse.json({ success: false, message: "Invalid message." }, { status: 400 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid request body." }, { status: 400 });
  }
  if (!reactionEmojis.has(body?.emoji)) {
    return NextResponse.json({ success: false, message: "Choose a supported reaction." }, { status: 400 });
  }

  await mongoDB_connect();
  const log = await messageLogSchema.findOne({ _id: messageLogId })
    .select("message_id group_id sender_id receiver_id");
  if (!log) return NextResponse.json({ success: false, message: "Message not found." }, { status: 404 });
  const message = await messageSchema.findById(log.message_id);
  if (!message) return NextResponse.json({ success: false, message: "Message not found." }, { status: 404 });
  if (!log.receiver_id.equals(new mongoose.Types.ObjectId(userId)) && !message.sender_id.equals(new mongoose.Types.ObjectId(userId))) {
    return NextResponse.json({ success: false, message: "You cannot react to this message." }, { status: 403 });
  }

  const userObjectId = new mongoose.Types.ObjectId(userId);
  const existing = message.reactions.find((reaction) => reaction.user_id.equals(userObjectId));
  if (existing?.emoji === body.emoji) {
    message.reactions = message.reactions.filter((reaction) => !reaction.user_id.equals(userObjectId));
  } else if (existing) {
    existing.emoji = body.emoji;
  } else {
    message.reactions.push({ user_id: userObjectId, emoji: body.emoji });
  }
  await message.save();

  const recipientIds = log.group_id
    ? (await messageLogSchema.find({ message_id: log.message_id }).distinct("receiver_id")).map(String)
    : [String(message.sender_id), String(log.sender_id), String(log.receiver_id)];
  const reactionEvent = {
    actor_id: userId,
    message_id: String(log.message_id),
    recipient_ids: [...new Set(recipientIds)],
    reactions: message.reactions.map(({ user_id, emoji }) => ({ user_id: String(user_id), emoji })),
  };
  const issuedAt = Date.now();
  const signingSecret = process.env.AUTH_SECRET ||
    (process.env.NODE_ENV !== "production" && "local-development-only-secret-change-before-deploy");
  if (!signingSecret) {
    return NextResponse.json({ success: false, message: "Realtime reactions are not configured." }, { status: 500 });
  }
  const signature = createHmac("sha256", signingSecret)
    .update(JSON.stringify({ event: reactionEvent, issuedAt }))
    .digest("base64url");
  return NextResponse.json({
    success: true,
    message_id: String(log.message_id),
    group_id: log.group_id ? String(log.group_id) : null,
    recipient_ids: [...new Set(recipientIds)],
    reactions: message.reactions.map(({ user_id, emoji }) => ({ user_id: String(user_id), emoji })),
    socket_event: { ...reactionEvent, issuedAt, signature },
  });
}
