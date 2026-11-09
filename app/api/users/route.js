import { mongoDB_connect } from "@/app/helpers/helper";
import { userSchema } from "@/app/models/userModel";
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { groupMemberSchema } from "@/app/models/groupMemberModel";
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
    

    return NextResponse.json({ success: true, data });
}