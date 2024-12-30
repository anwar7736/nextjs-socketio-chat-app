import { getImageURL, mongoDB_connect } from "@/app/helpers/helper";
import { userSchema } from "@/app/models/userModel";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { writeFile } from 'fs/promises';
import { groupSchema } from "@/app/models/groupModel";
import { groupMemberSchema } from "@/app/models/groupMemberModel";

mongoDB_connect();
export async function POST(request) {
    let payload = await request.formData();
    let name = payload.get('name');
    let short_desc = payload.get('short_desc');
    let photo = payload.get('photo');
    let created_by = payload.get('created_by');
    let group_members = JSON.parse(payload.get('group_members'));
    let success = false;
    let data = [];
    let message = "";
    let inputs = {
        "name": name,
        "short_desc": short_desc,
        "photo": "",
        "created_by": created_by,
    };

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

            inputs.photo = file_name;
        }

    }

    data = await new groupSchema(inputs);
    data = await data.save();
    if (data) {
        inputs = [];
        inputs = group_members?.map(member => ({
            ...member,
            group_id: data?._id,
            created_by,
        }));
       if(inputs){
        let res = await groupMemberSchema.insertMany(inputs);
        if (res) {
            success = true;
            message = "Group created successfully.";
        }
       }
    }

    data = {
        "_id": data?._id,
        "name": data?.name,
        "photo": data?.photo,
        "group_members": group_members,
    }

    return NextResponse.json({ success, message, data });
}


export async function GET(request) {
    let success = false;
    let data = [];
    data = await groupSchema.find();
    if (data) {
        success = true;
    }

    return NextResponse.json({ success, data });
}