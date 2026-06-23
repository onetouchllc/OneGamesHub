// main.js - Lobby Navigation & Socket Room Management

// ── CrazyGames SDK ──
// Loaded via <script> tag in index.html as window.CrazyGames.SDK
let crazySDKReady = false;
(async function initCrazyGamesSDK() {
  try {
    if (window.CrazyGames && window.CrazyGames.SDK) {
      window.CrazyGames.SDK.game.loadingStart();
      await window.CrazyGames.SDK.init();
      crazySDKReady = true;
      window.CrazyGames.SDK.game.loadingStop();
      console.log('[CrazyGames] SDK initialized');
    }
  } catch (err) {
    console.warn('[CrazyGames] SDK init failed:', err);
  }
})();

const socket = io();
let currentGame = null;
let currentRoomId = null;
let playerIndex = 0;

// ── DOM Refs ──
const overlay = document.getElementById('game-overlay');
const gameFrame = document.getElementById('game-frame');
const overlayTitle = document.getElementById('overlay-title');
const roomModal = document.getElementById('room-modal');
const modalGameTitle = document.getElementById('modal-game-title');
const waitingBadge = document.getElementById('waiting-badge');
const roomCodeDisplay = document.getElementById('room-code-display');
const joinInput = document.getElementById('join-code-input');

// ── Pending messages queue ──
// If socket events arrive before iframe finishes loading, we queue them
// and flush once iframe fires its 'load' event.
let pendingMessages = [];
let iframeReady = false;

function sendToFrame(msg) {
  if (iframeReady && gameFrame.contentWindow) {
    gameFrame.contentWindow.postMessage(msg, '*');
  } else {
    pendingMessages.push(msg);
  }
}

gameFrame.addEventListener('load', () => {
  iframeReady = true;
  // Flush any queued messages with a small delay so the iframe's scripts
  // have time to attach their message listeners
  setTimeout(() => {
    pendingMessages.forEach(msg => {
      gameFrame.contentWindow?.postMessage(msg, '*');
    });
    pendingMessages = [];
  }, 120);
});

// Reset queue whenever we navigate away from a game
function resetFrameState() {
  iframeReady = false;
  pendingMessages = [];
}

// ── Card click handlers ──
document.querySelectorAll('.game-card').forEach(card => {
  card.addEventListener('click', () => {
    currentGame = card.dataset.game;
    const name = card.dataset.name;
    modalGameTitle.textContent = name.toUpperCase();
    roomModal.classList.add('active');
  });
});

// ── Modal Buttons ──
document.getElementById('btn-solo').addEventListener('click', () => {
  closeModal();
  launchGame(currentGame, null, -1);
});

document.getElementById('btn-create-room').addEventListener('click', () => {
  socket.emit('room:create', { game: currentGame });
});

document.getElementById('btn-join-room').addEventListener('click', () => {
  const code = joinInput.value.trim().toUpperCase();
  if (!code) { showToast('Enter a room code!', 'error'); return; }
  socket.emit('room:join', { roomId: code });
});

joinInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-join-room').click();
});

// ── Socket Events ──
socket.on('room:joined', ({ roomId, playerIndex: idx, game }) => {
  currentRoomId = roomId;
  playerIndex = idx;
  closeModal();

  if (idx === 0) {
    // Creator: show waiting badge, then load game
    waitingBadge.classList.add('active');
    roomCodeDisplay.style.display = 'block';
    roomCodeDisplay.textContent = `ROOM: ${roomId}`;
    showToast(`Room created! Code: ${roomId}`, 'success');
  } else {
    // Joiner: hide waiting badge if visible
    waitingBadge.classList.remove('active');
    showToast(`Joined room ${roomId}!`, 'success');
  }

  launchGame(game, roomId, idx);
});

socket.on('room:ready', ({ players }) => {
  if (players >= 2) {
    waitingBadge.classList.remove('active');
    showToast('Opponent joined! Game on!', 'success');
    // Send to iframe (queued if not loaded yet)
    sendToFrame({ type: 'room:ready', players });
  }
});

socket.on('room:playerLeft', () => {
  showToast('Opponent disconnected', 'error');
  sendToFrame({ type: 'room:playerLeft' });
});

socket.on('room:error', (msg) => {
  showToast(msg, 'error');
});

// ── Launch Game ──
function launchGame(game, roomId, pIdx) {
  resetFrameState();

  const params = new URLSearchParams();
  if (roomId) params.set('room', roomId);
  params.set('player', pIdx);
  params.set('socketId', socket.id);

  const gameFiles = {
    tictactoe:   'tictactoe',
    connectfour: 'connectfour',
    rpsls:       'rpsls',
    checkers:    'checkers',
    dotsboxes:   'dotsboxes',
    battleship:  'battleship',
    memorymatch: 'memorymatch',
    snake:       'snake',
    pong:        'pong',
    wordguess:   'wordguess'
  };

  const gameNames = {
    tictactoe:   'TIC-TAC-TOE',
    connectfour: 'CONNECT FOUR',
    rpsls:       'RPSLS',
    checkers:    'CHECKERS',
    dotsboxes:   'DOTS & BOXES',
    battleship:  'BATTLESHIP',
    memorymatch: 'MEMORY MATCH',
    snake:       'SNAKE',
    pong:        'PONG',
    wordguess:   'WORD GUESS DUEL'
  };

  overlayTitle.textContent = gameNames[game] || game.toUpperCase();
  gameFrame.src = `/games/${gameFiles[game]}.html?${params.toString()}`;
  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';

  // Tell CrazyGames the player has started/resumed gameplay
  if (crazySDKReady) {
    try { window.CrazyGames.SDK.game.gameplayStart(); } catch (e) {}
  }

  // If joiner (idx === 1): server already emitted room:ready BEFORE this frame
  // loaded. We need to ask server to resend state after iframe is ready.
  if (pIdx === 1 && roomId) {
    // After iframe loads, tell it it's already in a ready room
    gameFrame.addEventListener('load', function onLoad() {
      gameFrame.removeEventListener('load', onLoad);
      setTimeout(() => {
        // Re-request current game state from server
        socket.emit('room:resync', { roomId });
      }, 150);
    }, { once: true });
  }
}

// ── Controls ──
function closeOverlay() {
  overlay.classList.remove('active');
  gameFrame.src = '';
  resetFrameState();
  document.body.style.overflow = '';
  waitingBadge.classList.remove('active');
  roomCodeDisplay.style.display = 'none';
  currentRoomId = null;
  if (document.fullscreenElement) document.exitFullscreen();

  // Tell CrazyGames the player has paused/stopped gameplay
  if (crazySDKReady) {
    try { window.CrazyGames.SDK.game.gameplayStop(); } catch (e) {}
  }
}

function closeModal() {
  roomModal.classList.remove('active');
  joinInput.value = '';
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    overlay.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen();
  }
}

// ── Toast ──
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `show ${type}`;
  setTimeout(() => { t.className = ''; }, 3000);
}

// ── Keyboard shortcuts ──
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && overlay.classList.contains('active')) closeOverlay();
  if (e.key === 'Escape' && roomModal.classList.contains('active')) closeModal();
});

// ── Messages from game iframes → forward to server ──
window.addEventListener('message', e => {
  if (e.data?.type === 'socket:emit') {
    socket.emit(e.data.event, e.data.data);
  }
  // iframe signals it is fully ready to receive messages
  if (e.data?.type === 'iframe:ready') {
    iframeReady = true;
    setTimeout(() => {
      pendingMessages.forEach(msg => {
        gameFrame.contentWindow?.postMessage(msg, '*');
      });
      pendingMessages = [];
    }, 50);
  }
});

// ── Forward all server→client socket events into the iframe ──
const gameEvents = [
  'ttt:state',
  'pong:state',
  'c4:state',
  'game:action',
  'game:state',
  'room:ready',
  'room:playerLeft',
  'room:resync'
];

gameEvents.forEach(ev => {
  socket.on(ev, data => {
    sendToFrame({ type: ev, data });
  });
});
