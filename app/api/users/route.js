import { mongoDB_connect } from "@/app/helpers/helper";
import { userSchema } from "@/app/models/userModel";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { groupMemberSchema } from "@/app/models/groupMemberModel";
import { groupSchema } from "@/app/models/groupModel";

mongoDB_connect();
export async function GET(request) {
    let success = false;
    const queryParams = request.nextUrl.searchParams;
    const auth_id = queryParams.get('auth_id');
    const search = queryParams.get('search');
    let data = await userSchema.aggregate([
        // User Query
        {
            $match: {
                name: { $regex: new RegExp(search, 'i') },
                _id: { $ne: new mongoose.Types.ObjectId(auth_id) },
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
                                    { $eq: ["$$log.receiver_id", new mongoose.Types.ObjectId(auth_id)] }
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
                                    user_id: new mongoose.Types.ObjectId(auth_id),
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
                                                { $eq: ["$$log.receiver_id", new mongoose.Types.ObjectId(auth_id)] }
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
                            name: { $regex: new RegExp(search, 'i') }
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
    

    if(data.length > 0)
    {
        success = true;
    }
    
    return NextResponse.json({ success, data });
}