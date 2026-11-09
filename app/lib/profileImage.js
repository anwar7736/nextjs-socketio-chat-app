import { randomUUID } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";

const imageExtensions = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);

export async function saveProfileImage(file) {
  const extension = file && imageExtensions.get(file.type);
  if (!extension || typeof file.arrayBuffer !== "function" || file.size < 1 || file.size > 5 * 1024 * 1024) {
    throw new Error("Profile photos must be JPG, PNG, or WebP and smaller than 5 MB.");
  }
  const filename = `${randomUUID()}${extension}`;
  const directory = path.join(process.cwd(), "public", "images", "users");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, filename), Buffer.from(await file.arrayBuffer()), { flag: "wx" });
  return filename;
}

export async function removeProfileImage(filename) {
  if (!/^[a-f\d-]+\.(jpg|png|webp)$/i.test(filename || "")) return;
  await unlink(path.join(process.cwd(), "public", "images", "users", filename));
}
