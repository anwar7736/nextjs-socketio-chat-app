import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getSessionUserId } from "@/app/lib/session";
import { saveFile } from "@/app/lib/fileStore";

export const runtime = "nodejs";

// Vercel functions accept request bodies up to about 4.5 MB; other hosts take larger files.
const MAX_FILE_MB = Number(process.env.MAX_UPLOAD_MB) || (process.env.VERCEL ? 4 : 15);
const MAX_FILE_SIZE = MAX_FILE_MB * 1024 * 1024;
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
  let formData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ success: false, message: `Files must be smaller than ${MAX_FILE_MB} MB.` }, { status: 413 });
  }
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
    return NextResponse.json({ success: false, message: `Files must be smaller than ${MAX_FILE_MB} MB.` }, { status: 413 });
  }

  const filename = `${userId}_${randomUUID()}${extension}`;
  await saveFile(filename, Buffer.from(await file.arrayBuffer()), { contentType: mimeType, owner: userId });

  return NextResponse.json({
    success: true,
    data: {
      url: `/api/attachments/${filename}`,
      name: file.name.slice(0, 180),
      mimeType,
    },
  });
}
