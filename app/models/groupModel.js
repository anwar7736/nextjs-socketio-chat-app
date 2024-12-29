const { default: mongoose } = require("mongoose");

const groupModel = new mongoose.Schema({
    "name":String,
    "photo":String,
    "short_desc":String,
    "created_by":mongoose.Schema.Types.ObjectId,
    "status": {type: Number, default: 1 }, // 0=>inactive, 1=>active
}, {
    timestamps: true
});

export const groupSchema = mongoose.models.groups ||
mongoose.model("groups", groupModel);