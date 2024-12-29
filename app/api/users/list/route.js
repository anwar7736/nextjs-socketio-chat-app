import { mongoDB_connect } from "@/app/helpers/helper";
import { userSchema } from "@/app/models/userModel";
import { NextResponse } from "next/server";

mongoDB_connect();
export async function GET(request) {
    let success = false;
    const search = request.nextUrl.searchParams.get('search');
    let data = await userSchema.aggregate([
        {
            $match: {
                name: { $regex: new RegExp(search, 'i') },
                status: 1
            },
        },
        {
            $project: {
                _id:0,
                user_id: "$_id",
                name: 1,
                photo: 1,
                is_checked: { $literal: false },
                is_admin: { $literal: false },
            },
        },
    ]);

    if(data)
    {
        success = true;
    }
    
    return NextResponse.json({ success, data });
}