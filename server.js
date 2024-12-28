const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const app = express();
const server = createServer(app);
const io = new Server(server,{
    cors:{
        origin: '*'
    }
});

  const users = {};

  io.on('connection', (socket) => {
      socket.on('register-user', (userId) => {
          users[userId] = socket.id;
          socket.emit('active-users', Object.keys(users));
          socket.broadcast.emit('active-users', Object.keys(users));
      });

      socket.on('new-user', (data) => {
          socket.broadcast.emit('new-user', data);
      });

      socket.on('user-updated', (data) => {
        const parsedData = JSON.parse(data);
          socket.broadcast.emit('user-updated', parsedData);
      });

      socket.on('user-logout', (userId) => {
          delete users[userId];
          socket.broadcast.emit('active-users', Object.keys(users));
      });
  
      socket.on('private-message', (data) => {
          const parsedData = JSON.parse(data);
          io.emit('private-message', parsedData);
      });

      socket.on('message-deleted', (data) => {
        const parsedData = JSON.parse(data);
        io.to(users[parsedData?.receiver[0]?._id]).emit('message-deleted', parsedData);
      });

      socket.on('disconnect', () => {
          for (const userId in users) {
              if (users[userId] === socket.id) {
                  delete users[userId];
                  socket.broadcast.emit('active-users', Object.keys(users));
                  break;
              }
          }
      });
  });
  

server.listen(3001);
