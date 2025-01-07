import { getImageURL, mongoDB_connect } from "@/app/helpers/helper";
import { NextResponse } from "next/server";
import { writeFile } from 'fs/promises';
import { groupSchema } from "@/app/models/groupModel";
import { groupMemberSchema } from "@/app/models/groupMemberModel";
import mongoose from "mongoose";
import { unlink } from "fs";

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
    const _id = request.nextUrl.searchParams.get('id');
    let data = await groupSchema.aggregate([
        { 
            $match: { _id: new mongoose.Types.ObjectId(_id) } // Match the group by its ID
        },
        {
            $lookup: {
                from: 'group_members',
                localField: '_id',
                foreignField: 'group_id',
                as: 'members',
            }
        },
        {
            $unwind: "$members"
        },
        {
            $match: {
                "members.status": 1 // Filter only active members
            }
        },
        {
            $lookup: {
                from: 'users', // Join users to get the creator details of each member
                localField: 'members.created_by',
                foreignField: '_id',
                as: 'members.created_by_user',
            }
        },
        {
            $unwind: {
                path: "$members.created_by_user",
                preserveNullAndEmptyArrays: true // Handle cases where created_by_user might be null
            }
        },
        {
            $group: {
                _id: "$_id", // Group by group ID
                name: { $first: "$name" },
                short_desc: { $first: "$short_desc" },
                photo: { $first: "$photo" },
                createdAt: { $first: "$createdAt" },
                created_by: { $first: "$created_by" },
                creator: { $first: "$creator" }, // Keep creator details
                members: {
                    $push: {
                        user_id: "$members.user_id",
                        is_admin: "$members.is_admin",
                        creator: "$members.created_by_user.name", // Member creator's name
                        createdAt: "$members.createdAt",
                    }
                }
            }
        },
        {
            $lookup: {
                from: 'users', // Join users to get creator information for the group
                localField: 'created_by',
                foreignField: '_id',
                as: 'creator',
            }
        },
        {
            $unwind: "$creator"
        },
        {
            $project: {
                _id: 1,
                name: 1,
                short_desc: 1,
                photo: 1,
                createdAt: 1,
                "creator.name": 1,
                "creator.photo": 1,
                members: 1 // Members array
            }
        }
    ]);
    
    
    
    if (data) {
        data = data.length > 0 ? data[0] : null;
        success = true;
            
        }
    
    
    return NextResponse.json({ success, data });
}

//Update group
export async function PUT(request) {
    let payload = await request.formData();
    let _id = payload.get('id');
    let name = payload.get('name');
    let short_desc = payload.get('short_desc');
    let photo = payload.get('photo');
    let old_photo = request.get('old_photo');
    let group_members = JSON.parse(payload.get('group_members'));
    let success = false;
    let data = [];
    let message = "";
    let inputs = {
        "name": name,
        "short_desc": short_desc,
        "photo": old_photo,
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
            if (old_photo) {
                unlink(getImageURL(old_photo, 1));
            }
            inputs.photo = file_name;
        }

    }

    data = await new groupSchema.updateOne({_id}, {$set: inputs});
    if (data) {
        inputs = [];
        inputs = group_members?.map(member => ({
            ...member,
            group_id: data?._id,
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


//Leave from group
export async function PATCH(request) {
    let success = false;
    let data = [];
    let message = "";
    const group_id = request.nextUrl.searchParams.get('group_id');
    const user_id = request.nextUrl.searchParams.get('user_id');
    data =  await groupMemberSchema.updateOne({ group_id, user_id }, {$set: { status: 0}});
    if (data) {
        success = true;
        message = "You are left from this group";
    }

    return NextResponse.json({ success, message });
}

export async function DELETE(request) {
    const _id = request.nextUrl.searchParams.get('id');
    let success = false;
    let message = "";

    try {
        const membersDeleted = await groupMemberSchema.deleteMany({ group_id: _id });
        if (membersDeleted.deletedCount > 0) {
            const groupDeleted = await groupSchema.deleteOne({ _id });

            if (groupDeleted.deletedCount > 0) {
                success = true;
                message = "Group deleted successfully.";
            } else {
                message = "Failed to delete group.";
            }
        } else {
            message = "No members found for this group.";
        }
    } catch (error) {
        message = "An error occurred while deleting the group.";
    }

    return NextResponse.json({ success, message });
}
