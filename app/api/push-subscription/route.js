import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { mongoDB_connect } from "@/app/helpers/helper";
import { getSessionUserId } from "@/app/lib/session";
import { getVapidPublicKey } from "@/app/lib/pushNotifications";
import { pushSubscriptionSchema } from "@/app/models/pushSubscriptionModel";

function validPushEndpoint(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      (host === "fcm.googleapis.com" ||
        host === "push.services.mozilla.com" ||
        host.endsWith(".push.services.mozilla.com") ||
        host.endsWith(".notify.windows.com") ||
        host === "web.push.apple.com" ||
        host.endsWith(".push.apple.com"));
  } catch {
    return false;
  }
}

export async function GET(request) {
  const userId = await getSessionUserId(request);
  if (!userId) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  if (!getVapidPublicKey() || !process.env.VAPID_PRIVATE_KEY) {
    return NextResponse.json({ success: false, message: "Web Push is not configured on this server." }, { status: 503 });
  }
  return NextResponse.json({ success: true, publicKey: getVapidPublicKey() });
}

export async function POST(request) {
  const userId = await getSessionUserId(request);
  if (!userId) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  let subscription;
  try {
    subscription = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid subscription data." }, { status: 400 });
  }
  if (
    typeof subscription?.endpoint !== "string" ||
    subscription.endpoint.length > 2048 ||
    !validPushEndpoint(subscription.endpoint) ||
    typeof subscription?.keys?.p256dh !== "string" ||
    !/^[a-zA-Z0-9_-]{20,256}$/.test(subscription.keys.p256dh) ||
    typeof subscription?.keys?.auth !== "string" ||
    !/^[a-zA-Z0-9_-]{16,128}$/.test(subscription.keys.auth) ||
    (subscription.expirationTime != null && !Number.isFinite(subscription.expirationTime))
  ) {
    return NextResponse.json({ success: false, message: "Invalid browser push subscription." }, { status: 400 });
  }
  if (!getVapidPublicKey() || !process.env.VAPID_PRIVATE_KEY) {
    return NextResponse.json({ success: false, message: "Web Push is not configured on this server." }, { status: 503 });
  }

  await mongoDB_connect();
  await pushSubscriptionSchema.findOneAndUpdate(
    { endpoint: subscription.endpoint },
    {
      $set: {
        user_id: new mongoose.Types.ObjectId(userId),
        endpoint: subscription.endpoint,
        subscription: {
          endpoint: subscription.endpoint,
          expirationTime: subscription.expirationTime || null,
          keys: subscription.keys,
        },
      },
    },
    { upsert: true, new: true, runValidators: true }
  );
  return NextResponse.json({ success: true });
}

export async function DELETE(request) {
  const userId = await getSessionUserId(request);
  if (!userId) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid subscription data." }, { status: 400 });
  }
  if (typeof body?.endpoint !== "string" || body.endpoint.length > 2048 || !validPushEndpoint(body.endpoint)) {
    return NextResponse.json({ success: false, message: "Invalid browser push subscription." }, { status: 400 });
  }
  await mongoDB_connect();
  await pushSubscriptionSchema.deleteOne({
    user_id: new mongoose.Types.ObjectId(userId),
    endpoint: body.endpoint,
  });
  return NextResponse.json({ success: true });
}
