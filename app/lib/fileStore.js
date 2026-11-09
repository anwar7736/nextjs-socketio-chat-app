import mongoose from "mongoose";
import { Readable } from "stream";
import { mongoDB_connect } from "@/app/helpers/helper";

// Attachments, voice notes and profile photos live in MongoDB (GridFS), so every app instance
// (Vercel functions included, whose disk is read-only and temporary) sees the same files.
const BUCKET = "files";

async function bucket() {
  await mongoDB_connect();
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: BUCKET });
}

export async function saveFile(filename, buffer, { contentType, owner } = {}) {
  const store = await bucket();
  await new Promise((resolve, reject) => {
    const upload = store.openUploadStream(filename, { metadata: { contentType, owner } });
    upload.once("finish", resolve);
    upload.once("error", reject);
    upload.end(buffer);
  });
}

/** The stored file as a web stream, or null when there is none. */
export async function openFile(filename) {
  const store = await bucket();
  const file = await store.find({ filename }).limit(1).next();
  if (!file) return null;
  return {
    length: file.length,
    contentType: file.metadata?.contentType,
    stream: Readable.toWeb(store.openDownloadStream(file._id)),
  };
}

export async function removeFile(filename) {
  const store = await bucket();
  const files = await store.find({ filename }).toArray();
  await Promise.all(files.map((file) => store.delete(file._id)));
}
