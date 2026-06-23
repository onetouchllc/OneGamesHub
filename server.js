const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

// ─── Game State Stores ───────────────────────────────────────────────────────
const rooms = {};        // roomId → { game, players[], state, pongInterval }
const playerRoom = {};   // socketId → roomId

// ─── Room Helpers ────────────────────────────────────────────────────────────
function createRoom(game) {
  const id = uuidv4().slice(0, 8).toUpperCase();
  rooms[id] = { id, game, players: [], state: null, createdAt: Date.now() };
  return id;
}

function cleanupRoom(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  if (room.pongInterval) clearInterval(room.pongInterval);
  delete rooms[roomId];
}

// ─── TTT ─────────────────────────────────────────────────────────────────────
function tttInitState() {
  return { board: Array(9).fill(null), currentPlayer: 'X', winner: null, winLine: null, moves: 0 };
}

function tttCheckWinner(board) {
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const [a,b,c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c])
      return { winner: board[a], line: [a,b,c] };
  }
  return null;
}

function tttHandleMove(room, socket, data) {
  const { state, players } = room;
  if (!state || state.winner) return;
  const pidx = players.indexOf(socket.id);
  const symbol = pidx === 0 ? 'X' : 'O';
  if (symbol !== state.currentPlayer) return;
  if (state.board[data.index] !== null) return;
  state.board[data.index] = symbol;
  state.moves++;
  const result = tttCheckWinner(state.board);
  if (result) { state.winner = result.winner; state.winLine = result.line; }
  else if (state.moves === 9) { state.winner = 'draw'; }
  else { state.currentPlayer = state.currentPlayer === 'X' ? 'O' : 'X'; }
  io.to(room.id).emit('ttt:state', state);
}

// ─── Pong ─────────────────────────────────────────────────────────────────────
const PONG_W = 800, PONG_H = 500, PADDLE_H = 80, PADDLE_W = 12, BALL_R = 8;

function pongInitState() {
  return {
    ball: { x: PONG_W/2, y: PONG_H/2, vx: 4, vy: 3 },
    paddles: [
      { x: 20, y: PONG_H/2 - PADDLE_H/2, score: 0 },
      { x: PONG_W - 20 - PADDLE_W, y: PONG_H/2 - PADDLE_H/2, score: 0 }
    ],
    running: false, winner: null
  };
}

function pongTick(room) {
  const s = room.state;
  if (!s || !s.running || s.winner) return;
  const b = s.ball;
  b.x += b.vx; b.y += b.vy;
  if (b.y - BALL_R < 0) { b.y = BALL_R; b.vy = Math.abs(b.vy); }
  if (b.y + BALL_R > PONG_H) { b.y = PONG_H - BALL_R; b.vy = -Math.abs(b.vy); }
  const [p0, p1] = s.paddles;
  if (b.x - BALL_R < p0.x + PADDLE_W && b.x > p0.x && b.y > p0.y && b.y < p0.y + PADDLE_H) {
    b.x = p0.x + PADDLE_W + BALL_R;
    b.vx = Math.abs(b.vx) * 1.05;
    b.vy += (b.y - (p0.y + PADDLE_H/2)) * 0.1;
  }
  if (b.x + BALL_R > p1.x && b.x < p1.x + PADDLE_W && b.y > p1.y && b.y < p1.y + PADDLE_H) {
    b.x = p1.x - BALL_R;
    b.vx = -Math.abs(b.vx) * 1.05;
    b.vy += (b.y - (p1.y + PADDLE_H/2)) * 0.1;
  }
  const spd = Math.sqrt(b.vx*b.vx + b.vy*b.vy);
  if (spd > 15) { b.vx = b.vx/spd*15; b.vy = b.vy/spd*15; }
  if (b.x < 0) {
    p1.score++;
    if (p1.score >= 7) { s.winner = 1; s.running = false; }
    else Object.assign(s.ball, { x:PONG_W/2, y:PONG_H/2, vx:4, vy:3*(Math.random()>0.5?1:-1) });
  }
  if (b.x > PONG_W) {
    p0.score++;
    if (p0.score >= 7) { s.winner = 0; s.running = false; }
    else Object.assign(s.ball, { x:PONG_W/2, y:PONG_H/2, vx:-4, vy:3*(Math.random()>0.5?1:-1) });
  }
  io.to(room.id).emit('pong:state', s);
}

// ─── Connect Four ─────────────────────────────────────────────────────────────
function c4InitState() {
  return { board: Array(42).fill(null), currentPlayer: 1, winner: null };
}

function c4CheckWinner(board) {
  const rows = 6, cols = 7, get = (r,c) => board[r*cols+c];
  for (let r=0;r<rows;r++) for (let c=0;c<cols;c++) {
    const v=get(r,c); if(!v) continue;
    if(c+3<cols&&v===get(r,c+1)&&v===get(r,c+2)&&v===get(r,c+3)) return v;
    if(r+3<rows&&v===get(r+1,c)&&v===get(r+2,c)&&v===get(r+3,c)) return v;
    if(r+3<rows&&c+3<cols&&v===get(r+1,c+1)&&v===get(r+2,c+2)&&v===get(r+3,c+3)) return v;
    if(r+3<rows&&c-3>=0&&v===get(r+1,c-1)&&v===get(r+2,c-2)&&v===get(r+3,c-3)) return v;
  }
  return null;
}

function c4HandleMove(room, socket, data) {
  const { state, players } = room;
  if (!state || state.winner) return;
  const pidx = players.indexOf(socket.id);
  if (pidx + 1 !== state.currentPlayer) return;
  const cols = 7; let row = -1;
  for (let r=5;r>=0;r--) { if(!state.board[r*cols+data.col]){ row=r; break; } }
  if (row < 0) return;
  state.board[row*cols+data.col] = state.currentPlayer;
  const w = c4CheckWinner(state.board);
  if (w) { state.winner = w; }
  else if (!state.board.includes(null)) { state.winner = 'draw'; }
  else { state.currentPlayer = state.currentPlayer===1?2:1; }
  io.to(room.id).emit('c4:state', state);
}

// ─── Init state for a room ────────────────────────────────────────────────────
function initGameState(room) {
  switch (room.game) {
    case 'tictactoe':   room.state = tttInitState();  break;
    case 'pong':        room.state = pongInitState();  break;
    case 'connectfour': room.state = c4InitState();    break;
    default:            room.state = {};               break;
  }
}

// ─── State event name per game ────────────────────────────────────────────────
function stateEventFor(game) {
  const map = { tictactoe:'ttt:state', pong:'pong:state', connectfour:'c4:state' };
  return map[game] || 'game:state';
}

// ─── Socket Events ────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('+ Connected:', socket.id);

  // ── Create room ──
  socket.on('room:create', ({ game }) => {
    const roomId = createRoom(game);
    rooms[roomId].players.push(socket.id);
    playerRoom[socket.id] = roomId;
    socket.join(roomId);
    initGameState(rooms[roomId]);
    socket.emit('room:joined', { roomId, playerIndex: 0, game });
    console.log(`Room ${roomId} created for game ${game}`);
  });

  // ── Join room ──
  socket.on('room:join', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) { socket.emit('room:error', 'Room not found'); return; }
    if (room.players.length >= 2) { socket.emit('room:error', 'Room is full'); return; }

    room.players.push(socket.id);
    playerRoom[socket.id] = roomId;
    socket.join(roomId);

    const playerIndex = room.players.length - 1; // will be 1

    // Tell the JOINER they joined (they load their iframe from this)
    socket.emit('room:joined', { roomId, playerIndex, game: room.game });

    // Tell BOTH players the room is ready
    io.to(roomId).emit('room:ready', { players: room.players.length });

    // Send current state to JOINER so their iframe can sync immediately
    const stateEv = stateEventFor(room.game);
    socket.emit(stateEv, room.state);

    console.log(`Player ${socket.id} joined room ${roomId}`);
  });

  // ── Resync: joiner iframe loaded and wants current state ──
  socket.on('room:resync', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    const stateEv = stateEventFor(room.game);
    socket.emit(stateEv, room.state);
    // Also resend room:ready so waiting screen hides
    socket.emit('room:ready', { players: room.players.length });
    console.log(`Resync for room ${roomId} → ${socket.id}`);
  });

  // ── Room list ──
  socket.on('room:list', ({ game }) => {
    const available = Object.values(rooms)
      .filter(r => r.game === game && r.players.length < 2)
      .map(r => ({ id: r.id, players: r.players.length }));
    socket.emit('room:list', available);
  });

  // ── TTT ──
  socket.on('ttt:move',  (data) => { const r=rooms[playerRoom[socket.id]]; if(r) tttHandleMove(r,socket,data); });
  socket.on('ttt:reset', ()     => {
    const r=rooms[playerRoom[socket.id]];
    if(r){ r.state=tttInitState(); io.to(r.id).emit('ttt:state',r.state); }
  });

  // ── Pong ──
  socket.on('pong:paddle', (data) => {
    const r=rooms[playerRoom[socket.id]];
    if(!r||!r.state) return;
    const idx=r.players.indexOf(socket.id);
    if(idx<0||idx>1) return;
    r.state.paddles[idx].y = Math.max(0,Math.min(PONG_H-PADDLE_H,data.y));
  });
  socket.on('pong:start', () => {
    const r=rooms[playerRoom[socket.id]];
    if(r&&r.state&&!r.state.running&&!r.state.winner){
      r.state.running=true;
      if(!r.pongInterval) r.pongInterval=setInterval(()=>pongTick(r),1000/60);
    }
  });
  socket.on('pong:reset', () => {
    const r=rooms[playerRoom[socket.id]];
    if(r){ if(r.pongInterval){clearInterval(r.pongInterval);r.pongInterval=null;}
      r.state=pongInitState(); io.to(r.id).emit('pong:state',r.state); }
  });

  // ── Connect Four ──
  socket.on('c4:move',  (data) => { const r=rooms[playerRoom[socket.id]]; if(r) c4HandleMove(r,socket,data); });
  socket.on('c4:reset', ()     => {
    const r=rooms[playerRoom[socket.id]];
    if(r){ r.state=c4InitState(); io.to(r.id).emit('c4:state',r.state); }
  });

  // ── Generic game:action (rpsls, checkers, dab, battleship, memory, wordguess) ──
  socket.on('game:action', (data) => {
    const room = rooms[playerRoom[socket.id]];
    if (!room) return;
    const playerIndex = room.players.indexOf(socket.id);
    io.to(room.id).emit('game:action', { ...data, playerIndex });
  });

  // ── Generic game:state ──
  socket.on('game:state', (data) => {
    const room = rooms[playerRoom[socket.id]];
    if (!room) return;
    room.state = data;
    socket.to(room.id).emit('game:state', data);
  });

  // ── Disconnect ──
  socket.on('disconnect', () => {
    const roomId = playerRoom[socket.id];
    if (roomId) {
      const room = rooms[roomId];
      if (room) {
        room.players = room.players.filter(p => p !== socket.id);
        io.to(roomId).emit('room:playerLeft');
        if (room.players.length === 0) cleanupRoom(roomId);
      }
      delete playerRoom[socket.id];
    }
    console.log('- Disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🎮 Games Hub → http://localhost:${PORT}`));
