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

export const messageLogSchema = mongoose.models.message_logs ||
mongoose.model("message_logs", messageLogModel);