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
      // each serverless instance keeps its own pool; small pools keep many instances under the database's connection limit
      .connect(connectionStr, {
        maxPoolSize: Number(process.env.MONGODB_POOL_SIZE) || 10,
        maxIdleTimeMS: 60000,
        serverSelectionTimeoutMS: 10000,
      })
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

export const activityFormat = (date, now = Date.now()) => {
  const timestamp = date ? new Date(date).getTime() : NaN;
  if (!Number.isFinite(timestamp)) return "";
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60000));
  if (minutes < 1) return "Active just now";
  if (minutes === 1) return "Active a minute ago";
  if (minutes < 60) return `Active ${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return "Active an hour ago";
  if (hours < 24) return `Active ${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Active a day ago";
  if (days < 365) return `Active ${days} days ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? "Active a year ago" : `Active ${years} years ago`;
};

let socketInstance;

export const socket_connection = () => {
  if (socketInstance) return socketInstance;
  socketInstance = io(
    process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3002",
    {
      transports: ["websocket", "polling"],
      autoConnect: false,
      auth: (callback) => {
        fetch("/api/socket-token", { cache: "no-store" })
          .then(async (response) => {
            const result = await response.json();
            if (!response.ok || !result.success || !result.token) {
              throw new Error(result.message || "Unable to authenticate the real-time connection.");
            }
            callback({ token: result.token });
          })
          .catch((error) => {
            console.error("Unable to authenticate the real-time connection:", error);
            callback({ token: "" });
          });
      },
    }
  );
  return socketInstance;
};

// photos uploaded by the app are stored in the database (random uuid names, see app/lib/profileImage.js)
const storedPhoto = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}\.(jpg|png|webp)$/i;

export const getImageURL = (imageName, type = null) => {
  if (imageName && !type && storedPhoto.test(imageName)) {
    return `/api/photos/${imageName}`;
  } else if (imageName) {
    return `.${type ? "/public" : ""}/images/users/${imageName}`;
  } else if (!imageName && !type) {
    return `./images/default.svg`;
  } else {
    return null;
  }
};

export const loadMessages = async (data) => {
  const response = await fetch(
    `api/messages?auth_id=${auth()?._id}&ref_id=${data?._id}&is_group=${
      data?.is_group
    }`
  );
  const res = await response.json();
  if (!response.ok || !res.success) {
    throw new Error(res.message || "Unable to load messages.");
  }
  const activeSocket = socket_connection();
  for (const event of res.seen_events || []) {
    activeSocket.emit("messages-seen", event);
  }
  return res.data;
};
