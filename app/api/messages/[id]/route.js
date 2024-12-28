import { NextResponse } from "next/server";
const { mongoDB_connect, auth } = require("@/app/helpers/helper");
import { messageSchema } from "@/app/models/messageModel";
import mongoose from "mongoose";
import { messageLogSchema } from "@/app/models/messageLogModel";

mongoDB_connect();
export async function PATCH(request, content) { //Unseen a message
  let _id = content.params.id;
  let success = false;
  let message = "";
  let data = [];
  data = await messageLogSchema.updateOne({ _id }, { $set: { status: 2 } }); //2=>unseen
  if (data.modifiedCount > 0) {
    success = true;
    message = "Message has been removed.";
  }

  return NextResponse.json({ success, message, message_id: _id });
}

export async function DELETE(request, content) {
  let _id = content.params.id;
  let success = false;
  let message = "";
  let msg_id = null;
  let log = await messageLogSchema.findById(_id);
  if(log)
  {
    msg_id = log?.message_id
  }
  let logsDeleted = await messageLogSchema.deleteMany({ message_id: msg_id });
  if (logsDeleted) {
    let msgDeleted = await messageSchema.deleteOne({ msg_id });
    if (msgDeleted) {
      success = true;
      message = "Message has been removed.";
    }
  }


  return NextResponse.json({ success, message, message_id: _id });
}

