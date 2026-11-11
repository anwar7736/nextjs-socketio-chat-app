const { default: mongoose } = require("mongoose");

const userModel = new mongoose.Schema({
    "name":String,
    "phone":String,
    "email": { type: String, lowercase: true, trim: true, unique: true, sparse: true },
    "emailVerified": { type: Boolean, default: false },
    "password":String,
    "twoFactorEnabled": { type: Boolean, default: false },
    "twoFactorSecret": { type: String, select: false },
    "pendingTwoFactorSecret": { type: String, select: false },
    "address":String,
    "photo":String,
    "lastSeenAt": Date,
    "nicknames": { type: Map, of: String },
    "status": {type: Number, default: 1 }, // 0=>inactive, 1=>active
}, {
    timestamps: true
});

export const userSchema = mongoose.models.users ||
mongoose.model("users", userModel);