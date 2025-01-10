import { userSchema } from "@/app/models/userModel";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
const { mongoDB_connect, getImageURL } = require("@/app/helpers/helper");
import { writeFile, unlink } from 'fs/promises';

mongoDB_connect();
export async function PUT(request, content) {
    let id = content.params.id;
    let success = false;
    let data = [];
    let message = "";
    request = await request.formData();
    let name = request.get('name');
    let phone = request.get('phone');
    let old_password = request.get('old_password');
    let password = request.get('password');
    let address = request.get('address');
    let old_photo = request.get('old_photo');
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
        if (old_password) {
            const passwordMatched = await bcrypt.compare(old_password, user.password);
            if (!passwordMatched) {
                success = false;
                message = "Old password is incorrect.";
                return NextResponse.json({ success, data, message });

            }

            inputs.password = await bcrypt.hash(password, 10);
        }

        if (photo) {
            let buffer;
            if (photo.arrayBuffer) {
                // For File or Blob objects
                let byteData = await photo.arrayBuffer();
                buffer = Buffer.from(byteData);
            } else if (Buffer.isBuffer(photo)) {
                // For already available Buffer
                buffer = photo;
                
            }

            if(buffer)
            {
                let file_name = `${Math.floor(Math.random() * 9999999999)}_${photo.name || 'uploaded_file'}`;
                let upload_path = getImageURL(file_name, 1);
            
                // Save the new file
                await writeFile(upload_path, buffer);
            
                // Unlink the old photo if it exists
                if (old_photo) {
                    unlink(getImageURL(old_photo, 1));
                }
            
                inputs.photo = file_name;
            }
        
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
    let success = false;
    let data = [];
    data = await userSchema.findById(id);
    if (data) {
        success = true;
    }

    return NextResponse.json({ success, data });
}