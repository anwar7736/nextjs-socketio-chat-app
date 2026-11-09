const { default: mongoose } = require("mongoose");

const groupMemberModel = new mongoose.Schema({
    "group_id": mongoose.Schema.Types.ObjectId,
    "user_id": mongoose.Schema.Types.ObjectId,
    "created_by": mongoose.Schema.Types.ObjectId,
    "is_admin": {type: Number, default: 0 }, // 0=>member, 1=>admin
    "status": {type: Number, default: 1 }, // 0=>inactive, 1=>active
}, {
    timestamps: true
});

groupMemberModel.index({ user_id: 1, status: 1, group_id: 1 });
groupMemberModel.index({ group_id: 1, status: 1 });

export const groupMemberSchema = mongoose.models.group_members ||
mongoose.model("group_members", groupMemberModel);