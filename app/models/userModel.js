const { default: mongoose } = require("mongoose");

const userModel = new mongoose.Schema({
    "name":String,
    "phone":String,
    "password":String,
    "address":String,
    "photo":String,
    "status": {type: Number, default: 1 }, // 0=>inactive, 1=>active
}, {
    timestamps: true
});

export const userSchema = mongoose.models.users ||
mongoose.model("users", userModel);