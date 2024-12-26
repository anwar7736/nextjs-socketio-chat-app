import { getImageURL, mongoDB_connect } from "@/app/helpers/helper";
import { userSchema } from "@/app/models/userModel";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { writeFile } from 'fs/promises';

mongoDB_connect();
export async function POST(request) {
    let payload = await request.formData();
    let phone = payload.get('phone');
    let password = payload.get('password');
    let login = payload.get('login');
    let success = false;
    let data = [];
    let message = "";
    if (login == 1) {
        data = await userSchema.findOne({ phone });
        if (data) {
            const passwordMatched = await bcrypt.compare(password, data.password);
            if (passwordMatched) {
                message = 'Login Successfully';
                success = true;
            }
            else {
                message = 'Password did not matched';
            }
        }
        else {
            message = 'User not found';
        }
    }
    else {
        let name = payload.get('name');
        let address = payload.get('address');
        let photo = payload.get('photo');
        const user = await userSchema.findOne({ phone });
        if (user) {
            message = 'Account already exists.';
            success = false;
        }
        else {
            password = await bcrypt.hash(password, 10);
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

                if (buffer) {
                    let file_name = `${Math.floor(Math.random() * 9999999999)}_${photo.name || 'uploaded_file'}`;
                    let upload_path = getImageURL(file_name, 1);

                    // Save the new file
                    await writeFile(upload_path, buffer);

                    photo = file_name;
                }

            }
            else {
                photo = "";
            }

            let res = await new userSchema({ name, phone, address, password, photo });
            res = await res.save();
            message = 'Registration Successfully';
            data = res;
            success = true;
        }
    }

    return NextResponse.json({ success, message, data });
}

export async function GET(request) {
    let success = false;
    let data = [];
    data = await userSchema.find();
    if (data) {
        success = true;
    }

    return NextResponse.json({ success, data });
}