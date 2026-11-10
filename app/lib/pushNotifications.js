import { sendNotification, setVapidDetails } from "web-push";
import { pushSubscriptionSchema } from "@/app/models/pushSubscriptionModel";

let vapidConfigured = false;
let missingVapidWarningLogged = false;

export function getVapidPublicKey() {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
}

function configureWebPush() {
  const publicKey = getVapidPublicKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  if (!vapidConfigured) {
    setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", publicKey, privateKey);
    vapidConfigured = true;
  }
  return true;
}

export async function sendPushNotification(userIds, payload) {
  if (!configureWebPush()) {
    if (!missingVapidWarningLogged) {
      console.warn("Web Push is disabled: configure NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.");
      missingVapidWarningLogged = true;
    }
    return;
  }

  const subscriptions = await pushSubscriptionSchema.find({ user_id: { $in: userIds } }).lean();
  await Promise.all(subscriptions.map(async ({ _id, endpoint, subscription }) => {
    try {
      await sendNotification(subscription, JSON.stringify(payload));
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        await pushSubscriptionSchema.deleteOne({ _id });
      } else {
        console.error("Unable to deliver a Web Push notification:", error);
      }
    }
  }));
}
