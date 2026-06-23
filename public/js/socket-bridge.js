// socket-bridge.js — used inside game iframes to communicate with parent socket

const params = new URLSearchParams(location.search);
const ROOM = params.get('room');
const PLAYER = parseInt(params.get('player') ?? '-1');
const IS_SOLO = PLAYER === -1;

// Emit socket event via parent
function socketEmit(event, data) {
  window.parent.postMessage({ type: 'socket:emit', event, data }, '*');
}

// Listen for socket events forwarded from parent
function socketOn(event, cb) {
  window.addEventListener('message', e => {
    if (e.data?.type === event) cb(e.data.data);
  });
}

// Listen for room events
function onRoomReady(cb) {
  window.addEventListener('message', e => {
    if (e.data?.type === 'room:ready') cb(e.data);
  });
}

function onPlayerLeft(cb) {
  window.addEventListener('message', e => {
    if (e.data?.type === 'room:playerLeft') cb();
  });
}

// Signal parent that this iframe is ready to receive messages
window.addEventListener('load', () => {
  window.parent.postMessage({ type: 'iframe:ready' }, '*');
});
// Also fire immediately in case DOMContentLoaded already passed
window.parent.postMessage({ type: 'iframe:ready' }, '*');
