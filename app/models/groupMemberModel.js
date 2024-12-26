const { default: mongoose } = require("mongoose");

const groupMemberModel = new mongoose.Schema({
    "group_id": mongoose.Schema.Types.ObjectId,
    "user_id": mongoose.Schema.Types.ObjectId,
    "created_by": mongoose.Schema.Types.ObjectId,
    "status": {type: Number, default: 1 }, // 0=>inactive, 1=>active
    "is_admin": {type: Number, default: 0 }, // 0=>member, 1=>admin
}, {
    timestamps: true
});

export const groupMemberSchema = mongoose.models.group_members ||
mongoose.model("group_members", groupMemberModel);