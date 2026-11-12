const { default: mongoose } = require("mongoose");

const callLogModel = new mongoose.Schema({
  callId: { type: String, required: true, unique: true },
  callerId: { type: mongoose.Schema.Types.ObjectId, required: true },
  conversationId: { type: mongoose.Schema.Types.ObjectId, required: true },
  isGroup: { type: Boolean, default: false },
  isVideo: { type: Boolean, default: false },
  participants: [{ type: mongoose.Schema.Types.ObjectId }],
  status: { type: String, enum: ["ringing", "answered", "ended", "no-answer", "declined"], default: "ringing" },
  startedAt: { type: Date, default: Date.now },
  answeredAt: Date,
  endedAt: Date,
  durationSeconds: { type: Number, default: 0 },
  deletedFor: [{ type: mongoose.Schema.Types.ObjectId }],
  deletedForEveryone: { type: Boolean, default: false },
}, { timestamps: true });

callLogModel.index({ participants: 1, conversationId: 1, isGroup: 1, startedAt: -1 });

export const callLogSchema = mongoose.models.call_logs ||
  mongoose.model("call_logs", callLogModel);
