import { randomUUID } from "crypto";
import { unlink } from "fs/promises";
import path from "path";
import { removeFile, saveFile } from "@/app/lib/fileStore";

const imageExtensions = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);

// new photos are stored in the database and served by /api/photos/<name>
export const storedPhotoPattern = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}\.(jpg|png|webp)$/i;

export async function saveProfileImage(file) {
  const extension = file && imageExtensions.get(file.type);
  // 4 MB keeps the upload under Vercel's request size limit
  if (!extension || typeof file.arrayBuffer !== "function" || file.size < 1 || file.size > 4 * 1024 * 1024) {
    throw new Error("Profile photos must be JPG, PNG, or WebP and smaller than 4 MB.");
  }
  const filename = `${randomUUID()}${extension}`;
  await saveFile(filename, Buffer.from(await file.arrayBuffer()), { contentType: file.type });
  return filename;
}

export async function removeProfileImage(filename) {
  if (!/^[a-f\d-]+\.(jpg|png|webp)$/i.test(filename || "")) return;
  await removeFile(filename);
  try {
    await unlink(path.join(process.cwd(), "public", "images", "users", filename)); // older photos kept on disk
  } catch (error) {
    if (!["ENOENT", "EROFS", "EACCES"].includes(error.code)) throw error;
  }
}
