const { default: mongoose } = require("mongoose");

const messageLogModel = new mongoose.Schema({
    "message_id": mongoose.Schema.Types.ObjectId,
    "group_id": mongoose.Schema.Types.ObjectId,
    "sender_id": mongoose.Schema.Types.ObjectId,
    "receiver_id": mongoose.Schema.Types.ObjectId,
    "status": {type: Number, default: 0 }, // 0=>pending, 1=>seen, 2=>unseen
}, {
    timestamps: true
});

messageLogModel.index({ receiver_id: 1, group_id: 1, status: 1, createdAt: -1 });
messageLogModel.index({ sender_id: 1, receiver_id: 1, createdAt: -1 });
messageLogModel.index({ message_id: 1 });
messageLogModel.index({ message_id: 1, receiver_id: 1 });

export const messageLogSchema = mongoose.models.message_logs ||
mongoose.model("message_logs", messageLogModel);