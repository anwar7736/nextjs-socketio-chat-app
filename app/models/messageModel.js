const { default: mongoose } = require("mongoose");

const messageModel = new mongoose.Schema({
    "sender_id": mongoose.Schema.Types.ObjectId,
    "group_id": mongoose.Schema.Types.ObjectId,
    "message":String,
    "type": { type: String, enum: ["text", "image", "audio", "video", "file"], default: "text" },
    "attachmentUrl": String,
    "attachmentName": String,
    "mimeType": String,
    "reply_to": mongoose.Schema.Types.ObjectId,
    "reactions": [{
        _id: false,
        user_id: mongoose.Schema.Types.ObjectId,
        emoji: String,
    }],
    "status": {type: Number, default: 1 }, // 0=>inactive, 1=>active
}, {
    timestamps: true
});

messageModel.index({ sender_id: 1, createdAt: -1 });
messageModel.index({ group_id: 1, createdAt: -1 });
messageModel.index({ attachmentUrl: 1 }, { unique: true, sparse: true });

export const messageSchema = mongoose.models.messages ||
mongoose.model("messages", messageModel);