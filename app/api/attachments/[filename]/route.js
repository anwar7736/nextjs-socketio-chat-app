import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";
import path from "path";
import { mongoDB_connect } from "@/app/helpers/helper";
import { getSessionUserId } from "@/app/lib/session";
import { openFile } from "@/app/lib/fileStore";
import { messageSchema } from "@/app/models/messageModel";
import { messageLogSchema } from "@/app/models/messageLogModel";
import mongoose from "mongoose";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request, context) {
  const userId = await getSessionUserId(request);
  const { filename } = await context.params;
  if (!userId) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  const filenameMatch = /^([a-f\d]{24})_([a-f\d-]{36}\.(jpg|png|gif|webp|webm|ogg|mp3|m4a|mp4|mov|pdf))$/i.exec(filename || "");
  if (!filenameMatch) {
    return NextResponse.json({ success: false, message: "File not found." }, { status: 404 });
  }

  await mongoDB_connect();
  const message = await messageSchema.findOne({ attachmentUrl: `/api/attachments/${filename}` }).select("sender_id mimeType attachmentName");
  if (!message) return NextResponse.json({ success: false, message: "File not found." }, { status: 404 });
  const ownerId = filenameMatch[1];
  const isSender = String(message.sender_id) === userId && ownerId === userId;
  const canRead = isSender || await messageLogSchema.exists({
    message_id: message._id,
    receiver_id: new mongoose.Types.ObjectId(userId),
  });
  if (!canRead) return NextResponse.json({ success: false, message: "File not found." }, { status: 404 });

  let stream;
  let size;
  const stored = await openFile(filename);
  if (stored) {
    stream = stored.stream;
    size = stored.length;
  } else {
    // files uploaded before attachments moved to the database
    const filePath = path.join(process.cwd(), "uploads", ownerId, filenameMatch[2]);
    try {
      size = (await stat(filePath)).size;
    } catch (error) {
      if (error.code === "ENOENT") return NextResponse.json({ success: false, message: "File not found." }, { status: 404 });
      throw error;
    }
    stream = Readable.toWeb(createReadStream(filePath));
  }
  return new Response(stream, {
    headers: {
      "Content-Type": message.mimeType || "application/octet-stream",
      "Content-Length": String(size),
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
