import { getCookie, hasCookie } from "cookies-next";
import mongoose from "mongoose";
import { io } from "socket.io-client";
import { connectionStr } from "../lib/db";
export const mongoDB_connect = async () => {
  return await mongoose.connect(connectionStr);
};

export const auth = () => {
  return isAuth() ? JSON.parse(getCookie("auth")) : "";
};

export const isAuth = () => {
  return hasCookie("auth");
};

export const causer_id = () => {
  return isAuth() ? auth()?._id : null;
};

export const dateFormat = (date) => {
  if (date) {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } else return "";
};

export const dateTimeFormat = (date) => {
  if (date) {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    });
  } else return "";
};

export const socket_connection = () => {
  let socket = io("https://chat.anwar.info.bd");
  return socket;
};

export const getImageURL = (imageName, type = null) => {
  if (imageName) {
    return `.${type ? "/public" : ""}/images/users/${imageName}`;
  } else if (!imageName && !type) {
    return `./images/default.svg`;
  } else {
    return null;
  }
};

export const loadMessages = async (data) => {
  let res = await fetch(
    `api/messages?auth_id=${auth()?._id}&ref_id=${data?._id}&is_group=${
      data?.is_group
    }`
  );
  res = await res.json();
  if (res.success) {
    return res.data;
  }
};
