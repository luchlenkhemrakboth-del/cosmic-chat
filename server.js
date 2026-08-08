const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e7 // Supports image transfers up to 10MB
});

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Global Server Message Memory (Saves messages in memory)
const globalMessageStore = [];

io.on('connection', (socket) => {
  console.log('⚡ User connected:', socket.id);

  // Send historical global messages to newly connected user
  socket.emit('load-global-history', globalMessageStore);

  // Handle joining rooms
  socket.on('join-room', (roomName) => {
    socket.join(roomName);
  });

  // Handle message broadcasting
  socket.on('send-message', (data) => {
    if (data.room === 'Global Server') {
      globalMessageStore.push(data); // Save in global memory
      if (globalMessageStore.length > 200) globalMessageStore.shift(); // Keep last 200
    }
    
    // Broadcast to others in the room
    socket.to(data.room).emit('receive-message', data);
  });

  // WebRTC Signaling for Video Calling
  socket.on('call-user', (data) => {
    io.to(data.userToCall).emit('call-incoming', { signal: data.signalData, from: data.from });
  });

  socket.on('answer-call', (data) => {
    io.to(data.to).emit('call-accepted', data.signal);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🌌 Cosmic Chat Server live on http://localhost:${PORT}`);
});
