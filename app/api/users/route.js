import { mongoDB_connect } from "@/app/helpers/helper";
import { userSchema } from "@/app/models/userModel";
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { groupMemberSchema } from "@/app/models/groupMemberModel";
import { messageLogSchema } from "@/app/models/messageLogModel";
import { getSessionUserId } from "@/app/lib/session";

export async function GET(request) {
    const userId = await getSessionUserId(request);
    const queryParams = request.nextUrl.searchParams;
    const auth_id = queryParams.get('auth_id');
    const search = (queryParams.get('search') || '').slice(0, 100);
    if (!userId || (auth_id && auth_id !== userId)) {
        return NextResponse.json({ success: false, message: 'Unauthorized.' }, { status: 401 });
    }
    await mongoDB_connect();
    const authObjectId = new mongoose.Types.ObjectId(userId);
    const currentUser = await userSchema.findById(authObjectId)
        .select("nicknames archivedConversations blockedUsers")
        .lean();
    const nicknames = currentUser?.nicknames instanceof Map
        ? Object.fromEntries(currentUser.nicknames)
        : currentUser?.nicknames || {};
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let data = await userSchema.aggregate([
        // User Query
        {
            $match: {
                name: { $regex: new RegExp(escapedSearch, 'i') },
                _id: { $ne: authObjectId },
            }
        },
        {
            $lookup: {
                from: "message_logs",
                localField: "_id",
                foreignField: "sender_id",
                as: "message_logs"
            }
        },
        {
            $addFields: {
                last_activity: {
                    $max: "$message_logs.createdAt" // Find the most recent activity
                },
                pending: {
                    $size: {
                        $filter: {
                            input: "$message_logs",
                            as: "log",
                            cond: {
                                $and: [
                                    {
                                        $or: [
                                            { $eq: ["$$log.group_id", null] },
                                            { $not: { $ifNull: ["$$log.group_id", false] } }
                                        ]
                                    },
                                    { $eq: ["$$log.status", 0] },
                                    { $eq: ["$$log.receiver_id", authObjectId] }
                                ]
                            }
                        }
                    }
                },
                is_group: 0,
                total_members: 0 
            }
        },
        {
            $project: {
                _id: 1,
                name: 1,
                photo: 1,
                lastSeenAt: 1,
                pending: 1,
                last_activity: 1,
                is_group: 1,
                total_members: 1
            }
        },
        // Union with Group Query
        {
            $unionWith: {
                coll: "groups", // Replace with your actual group collection name
                pipeline: [
                    {
                        $lookup: {
                            from: "group_members",
                            localField: "_id",
                            foreignField: "group_id",
                            as: "members"
                        }
                    },
                    {
                        $match: {
                            members: {
                                $elemMatch: {
                                    user_id: authObjectId,
                                    status: 1 // Active member
                                }
                            }
                        }
                    },
                    // Add a stage to count the total group members
                    {
                        $addFields: {
                            total_members: {
                                $size: {
                                    $filter: {
                                        input: "$members",
                                        as: "member",
                                        cond: { $eq: ["$$member.status", 1] }
                                    }
                                }
                            }
                        }
                    },
                    {
                        $addFields: {
                            member_ids: {
                                $map: {
                                    input: { $filter: { input: "$members", as: "member", cond: { $eq: ["$$member.status", 1] } } },
                                    as: "member",
                                    in: "$$member.user_id"
                                }
                            }
                        }
                    },
            
                    {
                        $lookup: {
                            from: "message_logs",
                            localField: "_id",
                            foreignField: "group_id",
                            as: "message_logs"
                        }
                    },
                    {
                        $addFields: {
                            last_activity: {
                                $max: "$message_logs.createdAt" // Find the most recent activity
                            },
                            pending: {
                                $size: {
                                    $filter: {
                                        input: "$message_logs",
                                        as: "log",
                                        cond: {
                                            $and: [
                                                { $eq: ["$$log.status", 0] },
                                                { $eq: ["$$log.receiver_id", authObjectId] }
                                            ]
                                        }
                                    }
                                }
                            },
                            is_group: 1 // Flag for group
                        }
                    },
                    {
                        $match: {
                            name: { $regex: new RegExp(escapedSearch, 'i') }
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            name: 1,
                            photo: 1,
                            member_ids: 1,
                            pending: 1,
                            last_activity: 1,
                            is_group: 1,
                            total_members: 1
                        }
                    }
                ]
            }
        },
        // Sort combined results by last_activity
        {
            $sort: { last_activity: -1 }
        }
    ]);
    
    const groupIds = data
        .filter((item) => Number(item.is_group) === 1)
        .map((item) => new mongoose.Types.ObjectId(item._id));
    const recentLogs = groupIds.length || data.length
        ? await messageLogSchema.aggregate([
            {
                $match: {
                    $or: [
                        { sender_id: authObjectId, group_id: { $exists: false } },
                        { receiver_id: authObjectId, group_id: { $exists: false } },
                        ...(groupIds.length ? [{ group_id: { $in: groupIds }, receiver_id: authObjectId }] : []),
                    ],
                },
            },
            { $sort: { createdAt: -1 } },
            {
                $group: {
                    _id: {
                        $cond: [
                            { $ifNull: ["$group_id", false] },
                            "$group_id",
                            { $cond: [{ $eq: ["$sender_id", authObjectId] }, "$receiver_id", "$sender_id"] },
                        ],
                    },
                    message_id: { $first: "$message_id" },
                    sender_id: { $first: "$sender_id" },
                    status: { $first: "$status" },
                    createdAt: { $first: "$createdAt" },
                    group_id: { $first: "$group_id" },
                },
            },
            { $lookup: { from: "messages", localField: "message_id", foreignField: "_id", as: "message" } },
            { $unwind: "$message" },
            {
                $project: {
                    _id: 1,
                    message_id: 1,
                    sender_id: 1,
                    status: 1,
                    createdAt: 1,
                    group_id: 1,
                    text: "$message.message",
                    type: "$message.type",
                    attachmentName: "$message.attachmentName",
                },
            },
        ])
        : [];
    const latestMessageIds = recentLogs
        .filter((item) => item.group_id)
        .map((item) => item.message_id);
    const groupSeenCounts = latestMessageIds.length
        ? await messageLogSchema.aggregate([
            { $match: { message_id: { $in: latestMessageIds }, status: 1 } },
            {
                $group: {
                    _id: "$message_id",
                    count: { $sum: { $cond: [{ $ne: ["$sender_id", "$receiver_id"] }, 1, 0] } },
                },
            },
        ])
        : [];
    const groupSeenByMessage = new Map(groupSeenCounts.map((item) => [String(item._id), item.count]));
    const recentByConversation = new Map(recentLogs.map((item) => [String(item._id), item]));
    const blockedByUsers = data.length
        ? await userSchema.find({
            _id: { $in: data.filter((item) => Number(item.is_group) === 0).map((item) => item._id) },
            blockedUsers: authObjectId,
        }).select("_id").lean()
        : [];
    const blockedByIds = new Set(blockedByUsers.map((item) => String(item._id)));
    const archivedIds = new Set((currentUser?.archivedConversations || []).map(String));
    const blockedIds = new Set((currentUser?.blockedUsers || []).map(String));
    const withNicknames = data.map((item) => {
        const latest = recentByConversation.get(String(item._id));
        return {
            ...item,
            ...(Number(item.is_group) === 0 ? { nickname: nicknames[String(item._id)] || "" } : {}),
            archived: archivedIds.has(String(item._id)),
            blocked: blockedIds.has(String(item._id)),
            blockedByPartner: blockedByIds.has(String(item._id)),
            ...(latest ? {
                last_activity: latest.createdAt,
                last_message: latest.text || "",
                last_message_type: latest.type || "text",
                last_message_attachment: latest.attachmentName || "",
                last_message_sender_id: String(latest.sender_id),
                last_message_status: Number(item.is_group) === 1
                    ? (groupSeenByMessage.get(String(latest.message_id)) || 0)
                    : latest.status,
            } : {}),
        };
    }).sort((a, b) => new Date(b.last_activity || 0) - new Date(a.last_activity || 0));
    return NextResponse.json({ success: true, data: withNicknames });
}