import { userSchema } from "@/app/models/userModel";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
const { mongoDB_connect } = require("@/app/helpers/helper");
import { getSessionUserId } from "@/app/lib/session";
import { removeProfileImage, saveProfileImage } from "@/app/lib/profileImage";

export async function PUT(request, content) {
    let id = content.params.id;
    const sessionUserId = await getSessionUserId(request);
    if (!sessionUserId || id !== sessionUserId) {
        return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 403 });
    }
    await mongoDB_connect();
    let success = false;
    let data = [];
    let message = "";
    request = await request.formData();
    let name = request.get('name');
    let phone = request.get('phone');
    let old_password = request.get('old_password');
    let password = request.get('password');
    let address = request.get('address');
    let photo = request.get('photo');
    let inputs = {
        name,
        phone,
        address
    }

    let user = await userSchema.findOne({ phone, _id: { $ne: id } });
    if (user) {
        success = false;
        message = 'Phone number already used.';
    }

    else {
        user = await userSchema.findById(id);
        if (!user) {
            success = false;
            message = "User not fond.";
            return NextResponse.json({ success, data, message });
        }
        const old_photo = user.photo;
        if (old_password) {
            if (typeof password !== "string" || password.length < 10 || password.length > 128) {
                return NextResponse.json({ success: false, data: [], message: "New password must contain at least 10 characters." }, { status: 400 });
            }
            const passwordMatched = await bcrypt.compare(old_password, user.password);
            if (!passwordMatched) {
                success = false;
                message = "Old password is incorrect.";
                return NextResponse.json({ success, data, message });

            }

            inputs.password = await bcrypt.hash(password, 12);
        }

        if (photo) {
            try {
                inputs.photo = await saveProfileImage(photo);
            } catch (error) {
                return NextResponse.json({ success: false, message: error.message }, { status: 400 });
            }
            if (old_photo) await removeProfileImage(old_photo);
        }

        data = await userSchema.updateOne({ _id: id }, { $set: inputs });
        if (data.modifiedCount > 0) {
            success = true;
            message = "Profile updated successfully.";
            data = await userSchema.findById(id, { password: 0 });

        } else {
            success = false;
            message = "Nothing to updated.";

        }
    }

    return NextResponse.json({ success, data, message });

}

export async function GET(request, content) {
    let id = content.params.id;
    const sessionUserId = await getSessionUserId(request);
    if (!sessionUserId) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ success: false, message: "Invalid user." }, { status: 400 });
    await mongoDB_connect();
    const data = await userSchema.findById(id, { name: 1, photo: 1 });
    if (!data) return NextResponse.json({ success: false, message: "User not found." }, { status: 404 });
    return NextResponse.json({ success: true, data });
}