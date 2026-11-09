import mongoose from "mongoose";
import { io } from "socket.io-client";
import { connectionStr } from "../lib/db";
export const mongoDB_connect = async () => {
  if (!connectionStr) {
    throw new Error("Set MONGODB_URI or DB_DATABASE, DB_USERNAME, and DB_PASSWORD.");
  }
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (!mongooseConnection) {
    mongooseConnection = mongoose
      .connect(connectionStr, { maxPoolSize: 20, serverSelectionTimeoutMS: 10000 })
      .catch((error) => {
        mongooseConnection = null;
        throw error;
      });
  }
  return mongooseConnection;
};

let mongooseConnection;

export const auth = () => {
  if (typeof window === "undefined") return "";
  try {
    return JSON.parse(window.localStorage.getItem("auth-profile") || '""');
  } catch (error) {
    console.error("Unable to read the signed-in profile:", error);
    return "";
  }
};

export const isAuth = () => {
  return Boolean(auth()?._id);
};

export const setAuthProfile = (user) => {
  if (typeof window !== "undefined") {
    window.localStorage.setItem("auth-profile", JSON.stringify(user));
  }
};

export const clearAuthProfile = () => {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem("auth-profile");
  }
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
  return io(
    process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3002",
    { transports: ["websocket", "polling"], withCredentials: true, autoConnect: false }
  );
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
