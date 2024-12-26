const { default: mongoose } = require("mongoose");

const messageModel = new mongoose.Schema({
    "sender_id": mongoose.Schema.Types.ObjectId,
    "group_id": mongoose.Schema.Types.ObjectId,
    "message":String,
    "status": {type: Number, default: 1 }, // 0=>inactive, 1=>active
}, {
    timestamps: true
});

export const messageSchema = mongoose.models.messages ||
mongoose.model("messages", messageModel);