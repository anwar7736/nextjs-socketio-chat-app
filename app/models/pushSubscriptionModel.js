import mongoose from "mongoose";

const pushSubscriptionModel = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  endpoint: { type: String, required: true, unique: true },
  subscription: {
    endpoint: { type: String, required: true },
    expirationTime: { type: Number, default: null },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
  },
}, { timestamps: true });

export const pushSubscriptionSchema = mongoose.models.push_subscriptions ||
  mongoose.model("push_subscriptions", pushSubscriptionModel);
