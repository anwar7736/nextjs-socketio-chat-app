const { default: mongoose } = require("mongoose");

const groupModel = new mongoose.Schema({
    "name":String,
    "photo":String,
    "short_desc":String,
    "status": {type: Number, default: 1 }, // 0=>inactive, 1=>active
    "created_by":mongoose.Schema.Types.ObjectId,
}, {
    timestamps: true
});

export const groupSchema = mongoose.models.groups ||
mongoose.model("groups", groupModel);