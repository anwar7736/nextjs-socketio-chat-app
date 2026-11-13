const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

const users = {};

io.on("connection", (socket) => {
  socket.on("register-user", (userId) => {
    if (!userId) return;
    users[String(userId)] = socket.id;
    socket.emit("active-users", Object.keys(users));
    socket.broadcast.emit("active-users", Object.keys(users));
  });

  socket.on("new-user", (data) => {
    const parsedData = typeof data === "string" ? JSON.parse(data) : data;
    socket.broadcast.emit("new-user", parsedData);
  });

  socket.on("user-updated", (data) => {
    const parsedData = typeof data === "string" ? JSON.parse(data) : data;
    socket.broadcast.emit("user-updated", parsedData);
  });

  socket.on("user-logout", (userId) => {
    delete users[String(userId)];
    socket.broadcast.emit("active-users", Object.keys(users));
  });

  socket.on("private-message", (data) => {
    const parsedData = typeof data === "string" ? JSON.parse(data) : data;
    io.emit("private-message", parsedData);
  });

  socket.on("message-deleted", (data) => {
    const parsedData = typeof data === "string" ? JSON.parse(data) : data;
    const receiverId = String(parsedData?.receiver?._id || "");
    if (users[receiverId]) io.to(users[receiverId]).emit("message-deleted", parsedData);
  });

  socket.on("add-group", (data) => {
    const parsedData = typeof data === "string" ? JSON.parse(data) : data;
    parsedData.group_members?.forEach((member) => {
      const socketId = users[String(member?.user_id || "")];
      if (socketId) io.to(socketId).emit("add-group", parsedData);
    });
  });

  socket.on("update-group", (data) => {
    const parsedData = typeof data === "string" ? JSON.parse(data) : data;
    // Notify all current members about group metadata changes, including members
    // whose role/membership did not change and therefore have no response entry.
    const recipientIds = new Set([
      ...(parsedData?.member_ids || []).map((id) => String(id?._id || id)),
      ...(parsedData?.response || []).map((item) => String(item?.user_id?._id || item?.user_id)),
    ]);

    recipientIds.forEach((userId) => {
      const socketId = users[userId];
      if (!socketId) return;
      const response = (parsedData?.response || []).find(
        (item) => String(item?.user_id?._id || item?.user_id) === userId
      );
      io.to(socketId).emit("update-group", {
        ...parsedData,
        ...(response ? { res: response } : {}),
      });
    });
  });

  socket.on("delete-group", (data) => {
    const parsedData = typeof data === "string" ? JSON.parse(data) : data;
    parsedData?.groupMembers?.forEach((member) => {
      const userId = String(member?.user_id || member || "");
      if (users[userId]) io.to(users[userId]).emit("delete-group", parsedData);
    });
  });

  socket.on("leave-group", (data) => {
    const parsedData = typeof data === "string" ? JSON.parse(data) : data;
    parsedData?.groupMembers?.forEach((member) => {
      const userId = String(member?.user_id || member || "");
      if (users[userId]) io.to(users[userId]).emit("leave-group", parsedData);
    });
  });

  socket.on("disconnect", () => {
    for (const userId in users) {
      if (users[userId] === socket.id) {
        delete users[userId];
        socket.broadcast.emit("active-users", Object.keys(users));
        break;
      }
    }
  });
});

server.listen(3001);
