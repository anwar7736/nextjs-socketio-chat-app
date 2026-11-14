import { mongoDB_connect } from "@/app/helpers/helper";
import { NextResponse } from "next/server";
import { groupSchema } from "@/app/models/groupModel";
import { groupMemberSchema } from "@/app/models/groupMemberModel";
import mongoose from "mongoose";
import { getSessionUserId } from "@/app/lib/session";
import { userSchema } from "@/app/models/userModel";
import { removeProfileImage, saveProfileImage } from "@/app/lib/profileImage";

export async function POST(request) {
    const userId = await getSessionUserId(request);
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    await mongoDB_connect();
    let payload = await request.formData();
    let name = String(payload.get('name') || '').trim().slice(0, 100);
    let short_desc = String(payload.get('short_desc') || '').trim().slice(0, 500);
    let photo = payload.get('photo');
    let created_by = userId;
    let group_members;
    try {
        group_members = JSON.parse(payload.get('group_members'));
    } catch {
        return NextResponse.json({ success: false, message: "Invalid group members." }, { status: 400 });
    }
    if (name.length < 3 || !Array.isArray(group_members) || group_members.length > 100) {
        return NextResponse.json({ success: false, message: "Provide a group name and up to 100 members." }, { status: 400 });
    }
    group_members = group_members
        .filter(member => mongoose.isValidObjectId(member?.user_id))
        .map(member => ({
            user_id: member.user_id,
            is_admin: member.is_admin === 1 || member.is_admin === true ? 1 : 0,
        }));
    const validUserIds = new Set((await userSchema.find({
        _id: { $in: group_members.map(member => member.user_id) },
        status: 1,
    }).select("_id").lean()).map(member => String(member._id)));
    group_members = group_members.filter(member => validUserIds.has(String(member.user_id)));
    if (!group_members.some(member => String(member.user_id) === userId)) {
        group_members.push({ user_id: userId, is_admin: 1 });
    }
    let success = false;
    let data = [];
    let message = "";
    let inputs = {
        "name": name,
        "short_desc": short_desc,
        "photo": "",
        "created_by": created_by,
    };

    if (photo && typeof photo !== "string" && photo.size > 0) {
        try {
            inputs.photo = await saveProfileImage(photo);
        } catch (error) {
            return NextResponse.json({ success: false, message: error.message }, { status: 400 });
        }
    }

    data = await new groupSchema(inputs);
    data = await data.save();
    if (data) {
        inputs = group_members?.map(member => ({
            ...member,
            group_id: data?._id,
            created_by,
        }));
        if (inputs) {
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
        "created_by": data?.created_by
    }

    return NextResponse.json({ success, message, data });
}


export async function GET(request) {
    const userId = await getSessionUserId(request);
    const _id = request.nextUrl.searchParams.get('id');
    if (!userId || !mongoose.isValidObjectId(_id)) {
        return NextResponse.json({ success: false, message: "Unauthorized or invalid group." }, { status: 400 });
    }
    await mongoDB_connect();
    const membership = await groupMemberSchema.exists({ group_id: _id, user_id: userId, status: 1 });
    if (!membership) return NextResponse.json({ success: false, message: "Group not found." }, { status: 404 });
    let data = await groupSchema.aggregate([
        {
            $match: { _id: new mongoose.Types.ObjectId(_id) }
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
                "members.status": 1
            }
        },
        {
            $lookup: {
                from: 'users',
                localField: 'members.created_by',
                foreignField: '_id',
                as: 'members.created_by_user',
            }
        },
        {
            $unwind: {
                path: "$members.created_by_user",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $group: {
                _id: "$_id",
                name: { $first: "$name" },
                short_desc: { $first: "$short_desc" },
                photo: { $first: "$photo" },
                createdAt: { $first: "$createdAt" },
                created_by: { $first: "$created_by" },
                creator: { $first: "$creator" },
                members: {
                    $push: {
                        user_id: "$members.user_id",
                        is_admin: "$members.is_admin",
                        creator: "$members.created_by_user.name",
                        createdAt: "$members.createdAt",
                    }
                }
            }
        },
        {
            $lookup: {
                from: 'users',
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
                members: 1
            }
        }
    ]);

    if (data) {
        data = data.length > 0 ? data[0] : null;
    }

    return NextResponse.json({ success: Boolean(data), data });
}

// Update group
export async function PUT(request) {
    const userId = await getSessionUserId(request);
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    await mongoDB_connect();
    let payload = await request.formData();
    let group_id = payload.get('group_id');
    let name = payload.get('name');
    let short_desc = payload.get('short_desc');
    let photo = payload.get('photo');
    let group_members;
    try {
        group_members = JSON.parse(payload.get('group_members'));
    } catch {
        return NextResponse.json({ success: false, message: "Invalid group members." }, { status: 400 });
    }
    let created_by = userId;
    let creator = await userSchema.findById(userId).select("name");
    if (!mongoose.isValidObjectId(group_id) || !Array.isArray(group_members) || group_members.length > 100) {
        return NextResponse.json({ success: false, message: "Invalid group update." }, { status: 400 });
    }
    if (typeof name !== "string" || name.trim().length < 3) {
        return NextResponse.json({ success: false, message: "Group name must contain at least 3 characters." }, { status: 400 });
    }
    name = name.trim().slice(0, 100);
    short_desc = typeof short_desc === "string" ? short_desc.trim().slice(0, 500) : "";
    const adminMembership = await groupMemberSchema.exists({ group_id, user_id: userId, status: 1, is_admin: 1 });
    if (!adminMembership) return NextResponse.json({ success: false, message: "Only active group admins can make changes." }, { status: 403 });
    group_members = group_members
        .filter(member => mongoose.isValidObjectId(member?.user_id))
        .map(member => ({
            user_id: member.user_id,
            is_admin: member.is_admin === 1 || member.is_admin === true ? 1 : 0,
        }));
    const validUserIds = new Set((await userSchema.find({
        _id: { $in: group_members.map(member => member.user_id) },
        status: 1,
    }).select("_id").lean()).map(member => String(member._id)));
    group_members = group_members.filter(member => validUserIds.has(String(member.user_id)));
    let success = false;
    let data = [];
    let response = [];
    let message = "";
    let existingGroup = await groupSchema.findById(group_id).select("photo");
    if (!existingGroup) return NextResponse.json({ success: false, message: "Group not found." }, { status: 404 });
    const old_photo = existingGroup.photo;
    let inputs = {
        "name": name,
        "short_desc": short_desc,
        "photo": old_photo,
    };

    if (photo && typeof photo !== "string" && photo.size > 0) {
        try {
            inputs.photo = await saveProfileImage(photo);
        } catch (error) {
            return NextResponse.json({ success: false, message: error.message }, { status: 400 });
        }
        if (old_photo) await removeProfileImage(old_photo);
    }

    data = await groupSchema.updateOne({ _id: group_id }, { $set: inputs });
    if (data) {
        success = true;
        message = "Group updated successfully.";
        const groupMembersArray = group_members.map(member => member.user_id);
        const newUsers = [];
        const updatedUsers = [];

        // Notify and remove members no longer in the group.
        const removedUsers = await groupMemberSchema.find({
            group_id,
            user_id: { $nin: groupMembersArray }
        });

        const removedMsg = `You are removed from ${name} by ${creator?.name || "a group admin"}`;
        removedUsers.forEach(member => {
            response.push({
                user_id: member.user_id,
                status: 0,
                message: removedMsg,
            });
        });

        await groupMemberSchema.deleteMany({ _id: { $in: removedUsers.map(member => member._id) } });

        // Add new members and apply admin-role changes.
        for (const member of group_members) {
            const { user_id, is_admin } = member;
            const existingMember = await groupMemberSchema.findOne({ group_id, user_id, status: 1 });

            if (existingMember) {
                if (existingMember.is_admin != is_admin) {
                    const memberMessage = is_admin
                        ? `Now you are group admin of ${name} by ${creator?.name || "a group admin"}`
                        : `Now you are not group admin of ${name} by ${creator?.name || "a group admin"}`;
                    updatedUsers.push(user_id);
                    response.push({ user_id, message: memberMessage });
                    await groupMemberSchema.findOneAndUpdate(
                        { group_id, user_id },
                        { $set: { is_admin } },
                        { new: true }
                    );
                }
            } else {
                const newMember = await new groupMemberSchema({ group_id, user_id, is_admin, created_by }).save();
                newUsers.push(user_id);
                response.push({ user_id, status: 1, message: `You are added to ${name} by ${creator?.name || "a group admin"}` });
            }
        }

        // Notify all remaining members of group details changes. distinct() returns
        // user IDs directly (not documents), so use each value as user_id.
        const condition = {
            group_id,
            user_id: { $in: groupMembersArray, $nin: updatedUsers.concat(newUsers) },
            status: 1,
        };
        const unchangedUsers = await groupMemberSchema.find(condition).distinct('user_id');
        const groupUpdateMsg = `${name} updated by ${creator?.name || "a group admin"}`;
        if (unchangedUsers.length > 0 && data.modifiedCount > 0) {
            unchangedUsers.forEach(memberId => {
                response.push({
                    user_id: memberId,
                    message: groupUpdateMsg,
                });
            });
        }

        // Remove duplicates for the actor, then re-add with is_causer flag
        // so their own other tabs/devices also receive the real-time update.
        response = response.filter(res => String(res?.user_id) !== String(created_by));
        response.push({ user_id: created_by, is_causer: true });

        data = {
            _id: group_id,
            name,
            short_desc,
            photo: inputs.photo,
            total_members: group_members.length,
            member_ids: groupMembersArray.map(String),
            response,
            causer_id: created_by
        };
    }

    return NextResponse.json({ success, message, data });
}


// Leave from group
export async function PATCH(request) {
    const sessionUserId = await getSessionUserId(request);
    const { group_id } = await request.json();
    if (!sessionUserId || !mongoose.isValidObjectId(group_id)) {
        return NextResponse.json({ success: false, message: "Unauthorized or invalid group." }, { status: 400 });
    }
    const user_id = sessionUserId;
    await mongoDB_connect();
    const membership = await groupMemberSchema.exists({ group_id, user_id, status: 1 });
    if (!membership) return NextResponse.json({ success: false, message: "You are not an active group member." }, { status: 403 });
    let success = false;
    let data = [];
    let message = "";
    data = await groupMemberSchema.updateOne({ group_id, user_id, status: 1 }, { $set: { status: 0 } });
    if (data.modifiedCount > 0) {
        success = true;
        message = "You are left from this group";
    }

    const groupMembers = await groupMemberSchema.find({ group_id, status: { $eq: 1 } });

    return NextResponse.json({ success, message, group_id, groupMembers });
}

export async function DELETE(request) {
    const userId = await getSessionUserId(request);
    const _id = request.nextUrl.searchParams.get('id');
    if (!userId || !mongoose.isValidObjectId(_id)) {
        return NextResponse.json({ success: false, message: "Unauthorized or invalid group." }, { status: 400 });
    }
    await mongoDB_connect();
    const adminMembership = await groupMemberSchema.exists({ group_id: _id, user_id: userId, status: 1, is_admin: 1 });
    if (!adminMembership) return NextResponse.json({ success: false, message: "Only an active group admin can delete this group." }, { status: 403 });
    let success = false;
    let message = "";
    let groupMembers = [];
    try {
        groupMembers = await groupMemberSchema.find({ group_id: _id, status: { $eq: 1 } });
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
        message = `An error occurred while deleting the group.${error}`;
    }

    return NextResponse.json({ success, message, groupMembers });
}
