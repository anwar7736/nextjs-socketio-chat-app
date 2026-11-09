import { mongoDB_connect } from "@/app/helpers/helper";
import { userSchema } from "@/app/models/userModel";
import { NextResponse } from "next/server";
import { getSessionUserId } from "@/app/lib/session";

export async function GET(request) {
    const userId = await getSessionUserId(request);
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    await mongoDB_connect();
    const search = (request.nextUrl.searchParams.get('search') || '').slice(0, 100);
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let data = await userSchema.aggregate([
        {
            $match: {
                name: { $regex: new RegExp(escapedSearch, 'i') },
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
        { $limit: 200 },
    ]);

    return NextResponse.json({ success: true, data });
}