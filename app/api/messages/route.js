import { auth, mongoDB_connect } from "@/app/helpers/helper";
import { NextResponse } from "next/server";
import { messageSchema } from "@/app/models/messageModel";
import mongoose from "mongoose";
import { messageLogSchema } from "@/app/models/messageLogModel";
mongoDB_connect();
export async function GET(request) {
  let success = false;
  const queryParams = request.nextUrl.searchParams;
  const auth_id = queryParams.get('auth_id');
  const ref_id = queryParams.get('ref_id');
  const is_group = queryParams.get('is_group');
  
  if (!auth_id || !ref_id) {
    return NextResponse.json({ success, data: [], message: 'auth_id and ref_id are required.' });
  }

  const authObjectId = new mongoose.Types.ObjectId(auth_id);
  const refObjectId = new mongoose.Types.ObjectId(ref_id);

  let match = {};

  try {
    if (is_group === "1") {
      await messageLogSchema.updateMany(
        { group_id: refObjectId, receiver_id: authObjectId, status: 0 },
        { $set: { status: 1 } }
      );

      match = {
        $match: {
          group_id: { $eq: refObjectId },
          receiver_id: { $eq: authObjectId }
        }
      };
    } else {
      await messageLogSchema.updateMany(
        { sender_id: refObjectId, receiver_id: authObjectId, status: 0 },
        { $set: { status: 1 } }
      );

      match = {
        $match: {
          $or: [
            { group_id: null },
            { group_id: { $exists: false } }
          ],
          $or: [
            {
              sender_id: authObjectId,
              receiver_id: refObjectId
            },
            {
              sender_id: refObjectId,
              receiver_id: authObjectId
            }
          ]
        }
      };
    }

    const data = await messageLogSchema.aggregate([
      match,
      {
        $lookup: {
          from: "groups",
          localField: "group_id",
          foreignField: "_id",
          as: "group"
        }
      },
      { $unwind: { path: "$group", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "messages",
          localField: "message_id",
          foreignField: "_id",
          as: "message"
        }
      },
      { $unwind: "$message" },
      {
        $lookup: {
          from: "users",
          localField: "sender_id",
          foreignField: "_id",
          as: "sender"
        }
      },
      { $unwind: "$sender" },
      {
        $lookup: {
          from: "users",
          localField: "receiver_id",
          foreignField: "_id",
          as: "receiver"
        }
      },
      { $unwind: "$receiver" },
      {
        $project: {
          _id: 1,
          status: 1,
          "group._id": 1,
          "group.name": 1,
          "group.photo": 1,
          "group.short_desc": 1,
          "message.sender_id": 1,
          "message.message": 1,
          "message.createdAt": 1,
          "sender._id": 1,
          "sender.name": 1,
          "sender.photo": 1,
          "receiver._id": 1,
          "receiver.name": 1,
          "receiver.photo": 1,
        }
      }
    ]);

    success = !!data.length;
    return NextResponse.json({ success, data });
  } catch (error) {
    console.error("Error fetching data:", error);
    return NextResponse.json({ success: false, data: [], error: error.message });
  }
}



export async function POST(request) {
  request = await request.json();
  let success = false;
  let data = [];
  let res = await new messageSchema(request);
      res = await res.save();
  if(res)
  {
    success = true;
    data = res;
  }
  return NextResponse.json({ success, data });
}

export async function PUT(request) {
  request = await request.json();
  let success = false;
  let data = [];
  let res = await messageSchema.updateMany(request, { $set: { status: 1 } }); //seen
  if(res)
  {
    success = true;
    data = res;
  }
  return NextResponse.json({ success, data });
}



