import { createReadStream } from "fs";
import { stat } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { NextResponse } from "next/server";
import { openFile } from "@/app/lib/fileStore";
import { storedPhotoPattern } from "@/app/lib/profileImage";

export const runtime = "nodejs";

const types = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

// Profile and group photos (signed-in users only, checked by middleware.js).
export async function GET(_request, context) {
  const { filename } = await context.params;
  const match = storedPhotoPattern.exec(filename || "");
  if (!match) return NextResponse.json({ success: false, message: "File not found." }, { status: 404 });

  let stream;
  let size;
  const stored = await openFile(filename);
  if (stored) {
    stream = stored.stream;
    size = stored.length;
  } else {
    // photos uploaded before they moved to the database
    const filePath = path.join(process.cwd(), "public", "images", "users", filename);
    try {
      size = (await stat(filePath)).size;
    } catch {
      return NextResponse.json({ success: false, message: "File not found." }, { status: 404 });
    }
    stream = Readable.toWeb(createReadStream(filePath));
  }

  return new Response(stream, {
    headers: {
      "Content-Type": types[match[1].toLowerCase()],
      "Content-Length": String(size),
      // the name is random and never reused, so the browser may keep it
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
