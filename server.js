const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e7 // Supports images up to 10MB
});

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Storage for messages grouped by room
const messageStores = {
  'Global Server': []
};
const activeUsers = new Map();

function broadcastOnlineUsers() {
  const count = activeUsers.size;
  const users = Array.from(activeUsers.values());
  io.emit('online-users', { count, users });
}

io.on('connection', (socket) => {
  console.log('⚡ User connected:', socket.id);

  // User initial login
  socket.on('user-joined', (data) => {
    const username = typeof data === 'object' ? data.username : data;
    const room = (typeof data === 'object' && data.room) ? data.room : 'Global Server';

    socket.username = username;
    socket.currentRoom = room;

    activeUsers.set(socket.id, username);
    socket.join(room);

    // Send history for the current room
    const history = messageStores[room] || [];
    socket.emit('load-room-history', { room, history });

    broadcastOnlineUsers();
  });

  // Handle switching rooms explicitly
  socket.on('join-room', (roomName) => {
    if (socket.currentRoom) {
      socket.leave(socket.currentRoom);
    }

    socket.currentRoom = roomName;
    socket.join(roomName);

    if (!messageStores[roomName]) {
      messageStores[roomName] = [];
    }

    // Send saved history for this room to the joining user
    socket.emit('load-room-history', {
      room: roomName,
      history: messageStores[roomName]
    });
  });

  // Handle sending messages (Broadcasts to EVERYONE in room, including sender confirmation if needed)
  socket.on('send-message', (data) => {
    const targetRoom = data.room || 'Global Server';

    if (!messageStores[targetRoom]) {
      messageStores[targetRoom] = [];
    }

    // Save message history
    messageStores[targetRoom].push(data);
    if (messageStores[targetRoom].length > 200) {
      messageStores[targetRoom].shift();
    }

    // Broadcast message to EVERYONE connected in targetRoom (including sender for sync)
    io.to(targetRoom).emit('receive-message', data);
  });

  // WebRTC Signaling
  socket.on('call-user', (data) => {
    io.to(data.userToCall).emit('call-incoming', { signal: data.signalData, from: data.from });
  });

  socket.on('answer-call', (data) => {
    io.to(data.to).emit('call-accepted', data.signal);
  });

  socket.on('disconnect', () => {
    activeUsers.delete(socket.id);
    broadcastOnlineUsers();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🌌 Cosmic Chat Server live on http://localhost:${PORT}`);
});
