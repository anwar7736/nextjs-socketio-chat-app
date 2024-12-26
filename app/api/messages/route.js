import { mongoDB_connect } from "@/app/helpers/helper";
import { NextResponse } from "next/server";
import { messageSchema } from "@/app/models/messageModel";
import mongoose from "mongoose";
import { getCookie } from "cookies-next";
mongoDB_connect();
export async function GET(request) {
  let success = false;
  const queryParams = request.nextUrl.searchParams;
  const auth_id = queryParams.get('auth_id');
  const user_id = queryParams.get('user_id');
  let data = [];
  let res = await messageSchema.updateMany(
    {
      sender_id: user_id,
      receiver_id: auth_id,
      status: 0 //pending
    },
    { $set: { status: 1 } } //seen
  );


  data = await messageSchema.aggregate([
    {
      $lookup: {
        from: "users",
        localField: "sender_id",
        foreignField: "_id",
        as: "sender"
      }
    },
    {
      $lookup: {
        from: "users",
        localField: "receiver_id",
        foreignField: "_id",
        as: "receiver"
      }
    },
    {
      $match: {
        $or: [
          {
            sender_id: new mongoose.Types.ObjectId(auth_id),
            receiver_id: new mongoose.Types.ObjectId(user_id)
          },
          {
            sender_id: new mongoose.Types.ObjectId(user_id),
            receiver_id: new mongoose.Types.ObjectId(auth_id)
          }
        ]
      }
    },
    {
      $project: {
        _id: 1,
        message: 1,
        status: 1,
        createdAt: 1,
        "sender._id": 1,
        "sender.name": 1,
        "sender.photo": 1,
        "receiver._id": 1,
        "receiver.name": 1,
        "receiver.photo": 1,
      }
    }
  ]);

  if (data) {
    success = true;
  }

  return NextResponse.json({ success, data });
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



