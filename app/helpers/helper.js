import mongoose from "mongoose"
import { getCookie, hasCookie } from "cookies-next";
import { connectionStr } from "../lib/db";
import { io } from "socket.io-client";

export const mongoDB_connect = async () => 
{
    return await mongoose.connect(connectionStr);
}


export const auth = () => 
{
    return isAuth() ? JSON.parse(getCookie('auth')) : '';
}

export const isAuth = () => 
{
    return hasCookie('auth') ? true : false;
}

export const dateFormat = (date) =>
{
    if(date)
    {
        return new Date(date).toLocaleDateString("en-US", { 
            year: "numeric", 
            month: "long", 
            day: "numeric" 
          });
    }
    else return "";
}

export const dateTimeFormat = (date) =>
{
    if(date)
    {
        return new Date(date).toLocaleDateString("en-US", { 
            year: "numeric", 
            month: "short", 
            day: "numeric",
            hour: "numeric",
            minute: "numeric",
          });
    }
    else return "";
}

export const socket_connection = () => {
    let socket = io("http://localhost:3001");
    return socket;
}

export const getImageURL = (imageName, type = null) => {
    if(imageName)
    {
        return `.${type ? '/public': ''}/images/users/${imageName}`;
    }
    else if(!imageName && !type){
        return `./images/default.svg`
    }
    else{
        return null;
    }
}