import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import { NextResponse } from "next/server";
import path from "path";
import { getSessionUserId } from "@/app/lib/session";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const allowedTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/gif", ".gif"],
  ["image/webp", ".webp"],
  ["audio/webm", ".webm"],
  ["audio/ogg", ".ogg"],
  ["audio/mpeg", ".mp3"],
  ["audio/mp4", ".m4a"],
  ["video/webm", ".webm"],
  ["video/mp4", ".mp4"],
  ["video/quicktime", ".mov"],
  ["application/pdf", ".pdf"],
]);

export async function POST(request) {
  const userId = await getSessionUserId(request);
  if (!userId) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || typeof file.arrayBuffer !== "function") {
    return NextResponse.json({ success: false, message: "Choose a file to upload." }, { status: 400 });
  }

  const mimeType = file.type.split(";")[0].trim().toLowerCase();
  const extension = allowedTypes.get(mimeType);
  if (!extension) {
    return NextResponse.json({ success: false, message: "This file type is not supported." }, { status: 415 });
  }
  if (file.size === 0 || file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ success: false, message: "Files must be smaller than 15 MB." }, { status: 413 });
  }

  const filename = `${userId}_${randomUUID()}${extension}`;
  const uploadDirectory = path.join(process.cwd(), "uploads", userId);
  await mkdir(uploadDirectory, { recursive: true });
  await writeFile(path.join(uploadDirectory, filename), Buffer.from(await file.arrayBuffer()), { flag: "wx" });

  return NextResponse.json({
    success: true,
    data: {
      url: `/api/attachments/${filename}`,
      name: file.name.slice(0, 180),
      mimeType,
    },
  });
}
