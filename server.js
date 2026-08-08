const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e7 // Supports images up to 10MB
});

// Serve static files directly from root directory
app.use(express.static(__dirname));

// Serve index.html on root access
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// In-memory data store
const globalMessageStore = [];
const activeUsers = new Map(); // Tracks socket.id -> username

function broadcastOnlineUsers() {
  const count = activeUsers.size;
  const users = Array.from(activeUsers.values());
  io.emit('online-users', { count, users });
}

io.on('connection', (socket) => {
  console.log('⚡ User connected:', socket.id);

  // Auto-join Global Server upon socket connection
  socket.join('Global Server');

  // Handle user login
  socket.on('user-joined', (data) => {
    const username = typeof data === 'object' ? data.username : data;
    socket.username = username;
    activeUsers.set(socket.id, username);

    // Send chat history to user
    socket.emit('load-global-history', globalMessageStore);

    // Broadcast updated online user count
    broadcastOnlineUsers();
  });

  // Handle joining specific rooms
  socket.on('join-room', (roomName) => {
    socket.join(roomName);
    if (roomName === 'Global Server') {
      socket.emit('load-global-history', globalMessageStore);
    }
  });

  // Handle message broadcasting across all devices
  socket.on('send-message', (data) => {
    const targetRoom = data.room || 'Global Server';
    
    // Ensure socket is joined to room
    socket.join(targetRoom);

    if (targetRoom === 'Global Server') {
      globalMessageStore.push(data);
      if (globalMessageStore.length > 200) globalMessageStore.shift(); // Keep last 200 messages
    }
    
    // Broadcast message to everyone else in the room
    socket.to(targetRoom).emit('receive-message', data);
  });

  // WebRTC Video Calling Signaling
  socket.on('call-user', (data) => {
    io.to(data.userToCall).emit('call-incoming', { signal: data.signalData, from: data.from });
  });

  socket.on('answer-call', (data) => {
    io.to(data.to).emit('call-accepted', data.signal);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    activeUsers.delete(socket.id);
    broadcastOnlineUsers();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🌌 Cosmic Chat Server live on http://localhost:${PORT}`);
});
