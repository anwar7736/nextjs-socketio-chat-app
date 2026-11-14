import { createHmac } from "crypto";
import { unlink } from "fs/promises";
import { mongoDB_connect } from "@/app/helpers/helper";
import { getSessionUserId } from "@/app/lib/session";
import { removeFile } from "@/app/lib/fileStore";
import { messageSchema } from "@/app/models/messageModel";
import { messageLogSchema } from "@/app/models/messageLogModel";
import { userSchema } from "@/app/models/userModel";
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
  const log = await messageLogSchema.findById(messageLogId).select("message_id sender_id receiver_id");
  if (!log) return NextResponse.json({ success: false, message: "Message not found." }, { status: 404 });
  const userObjectId = new mongoose.Types.ObjectId(userId);
  if (log.receiver_id.equals(userObjectId)) {
    log.status = 2;
    await log.save();
  } else if (log.sender_id.equals(userObjectId)) {
    await messageSchema.updateOne(
      { _id: log.message_id, sender_id: userObjectId },
      { $addToSet: { hiddenFor: userObjectId } }
    );
  } else {
    return NextResponse.json({ success: false, message: "You cannot hide this message." }, { status: 403 });
  }
  return NextResponse.json({ success: true, message: "Message hidden.", log_id: messageLogId, message_id: String(log.message_id) });
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

  const recipientIds = (await messageLogSchema.find({ message_id: log.message_id }).distinct("receiver_id")).map(String);
  const message = await messageSchema.findOne({
    _id: log.message_id,
    sender_id: new mongoose.Types.ObjectId(userId),
  }).select("attachmentUrl group_id deletedForEveryone");
  if (!message || message.deletedForEveryone) return NextResponse.json({ success: false, message: "Message not found." }, { status: 404 });
  const attachmentUrl = message.attachmentUrl;
  // attachmentUrl has a unique sparse index: an empty string is a value (every second deleted message would
  // collide on ""), so the fields are removed, not blanked
  await messageSchema.updateOne(
    { _id: message._id, sender_id: new mongoose.Types.ObjectId(userId) },
    {
      $set: {
        message: "",
        deletedForEveryone: true,
        editedAt: null,
        reactions: [],
      },
      $unset: { attachmentUrl: "", attachmentName: "", mimeType: "", durationSeconds: "" },
    }
  );
  const filename = attachmentUrl?.match(/^\/api\/attachments\/([a-f\d]{24})_([a-f\d-]{36}\.(?:jpg|png|gif|webp|webm|ogg|mp3|m4a|mp4|mov|pdf))$/i);
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

const isEmoji = (value) =>
  typeof value === "string" &&
  value.length <= 32 &&
  /[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u.test(value);

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
  if (body?.action === "edit") {
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text || text.length > 5000) {
      return NextResponse.json({ success: false, message: "Message text must be between 1 and 5000 characters." }, { status: 400 });
    }
    await mongoDB_connect();
    const log = await messageLogSchema.findOne({ _id: messageLogId, sender_id: new mongoose.Types.ObjectId(userId) })
      .select("message_id group_id receiver_id sender_id");
    if (!log) return NextResponse.json({ success: false, message: "You can only edit your own message." }, { status: 403 });
    const message = await messageSchema.findOneAndUpdate(
      { _id: log.message_id, sender_id: new mongoose.Types.ObjectId(userId), type: "text", deletedForEveryone: { $ne: true } },
      { $set: { message: text, editedAt: new Date() } },
      { new: true }
    ).select("message editedAt");
    if (!message) return NextResponse.json({ success: false, message: "Only active text messages can be edited." }, { status: 400 });
    const recipientIds = [...new Set((await messageLogSchema.find({ message_id: log.message_id }).distinct("receiver_id")).map(String))];
    const event = {
      actor_id: userId,
      message_id: String(log.message_id),
      message: message.message,
      editedAt: message.editedAt.toISOString(),
      recipient_ids: recipientIds,
    };
    const secret = process.env.AUTH_SECRET ||
      (process.env.NODE_ENV !== "production" && "local-development-only-secret-change-before-deploy");
    if (!secret) return NextResponse.json({ success: false, message: "Realtime message editing is not configured." }, { status: 500 });
    const issuedAt = Date.now();
    const signature = createHmac("sha256", secret)
      .update(JSON.stringify({ event, issuedAt }))
      .digest("base64url");
    return NextResponse.json({ success: true, message_id: String(log.message_id), message: message.message, editedAt: message.editedAt, socket_event: { ...event, issuedAt, signature } });
  }

  if (!isEmoji(body?.emoji)) {
    return NextResponse.json({ success: false, message: "Choose a supported reaction." }, { status: 400 });
  }

  await mongoDB_connect();
  const log = await messageLogSchema.findOne({ _id: messageLogId })
    .select("message_id group_id sender_id receiver_id");
  if (!log) return NextResponse.json({ success: false, message: "Message not found." }, { status: 404 });
  const message = await messageSchema.findById(log.message_id);
  if (!message || message.deletedForEveryone) return NextResponse.json({ success: false, message: "Message not found." }, { status: 404 });
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
  const reactionProfiles = await userSchema.find({
    _id: { $in: message.reactions.map(({ user_id }) => user_id) },
  }).select("name photo").lean();
  const profilesById = new Map(reactionProfiles.map((profile) => [String(profile._id), profile]));
  const reactions = message.reactions.map(({ user_id, emoji }) => {
    const profile = profilesById.get(String(user_id));
    return {
      user_id: String(user_id),
      emoji,
      ...(profile ? { name: profile.name, photo: profile.photo } : {}),
    };
  });
  const reactionEvent = {
    actor_id: userId,
    message_id: String(log.message_id),
    recipient_ids: [...new Set(recipientIds)],
    reactions,
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
    reactions,
    socket_event: { ...reactionEvent, issuedAt, signature },
  });
}
