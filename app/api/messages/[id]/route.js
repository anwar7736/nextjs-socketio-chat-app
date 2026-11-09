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
  }).select("message_id");
  if (!log) return NextResponse.json({ success: false, message: "Message not found." }, { status: 404 });

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
  return NextResponse.json({ success: true, message: "Message removed.", message_id: messageLogId });
}
