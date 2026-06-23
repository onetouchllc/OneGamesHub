/**
 * game.js — ONE GAMES HUB Game Module Registry
 *
 * Loaded inside each game iframe. Reads URL params, bootstraps the
 * correct game module using the shared GameEngine, and handles
 * the socket-bridge lifecycle (waiting screen, ready, playerLeft).
 *
 * Each game module (TicTacToeGame, PongGame, …) extends GameEngine
 * and is registered below via GameRegistry.register().
 */

'use strict';

// ─────────────────────────────────────────────
// URL PARAMS (set by main.js when launching)
// ─────────────────────────────────────────────
const _params    = new URLSearchParams(location.search);
const GAME_ID    = _params.get('game')   || document.title.toLowerCase().replace(/\s+/g,'');
const ROOM_ID    = _params.get('room')   || null;
const PLAYER_IDX = parseInt(_params.get('player') ?? '-1');
const IS_SOLO    = PLAYER_IDX === -1;
const IS_MULTI   = !IS_SOLO;

// ─────────────────────────────────────────────
// WAITING SCREEN HELPER
// ─────────────────────────────────────────────
const WaitingScreen = {
  show(roomId) {
    let el = document.getElementById('__waiting');
    if (!el) {
      el = document.createElement('div');
      el.id = '__waiting';
      el.style.cssText = `
        position:fixed;inset:0;z-index:9999;
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        gap:18px;background:rgba(5,8,16,0.95);backdrop-filter:blur(10px);
        font-family:'Baloo 2',sans-serif;color:#e0e8ff;
      `;
      el.innerHTML = `
        <div style="font-size:11px;letter-spacing:0.4em;color:#5a6a9a">SHARE ROOM CODE</div>
        <div style="font-size:36px;font-weight:800;letter-spacing:0.3em;color:#00c8ff;
             background:#0a0f1e;border:1px solid rgba(0,200,255,0.3);padding:12px 32px;border-radius:12px">
          ${roomId || '----'}
        </div>
        <div style="width:38px;height:38px;border:3px solid rgba(0,200,255,0.2);
             border-top-color:#00c8ff;border-radius:50%;animation:__spin 1s linear infinite"></div>
        <div style="font-size:11px;letter-spacing:0.25em;color:#5a6a9a">WAITING FOR OPPONENT…</div>
        <style>@keyframes __spin{to{transform:rotate(360deg)}}</style>
      `;
      document.body.appendChild(el);
    }
    el.style.display = 'flex';
  },
  hide() {
    const el = document.getElementById('__waiting');
    if (el) el.style.display = 'none';
  },
};

// ─────────────────────────────────────────────
// TOAST HELPER
// ─────────────────────────────────────────────
function gameToast(msg, duration = 2500) {
  let el = document.getElementById('__gtoast');
  if (!el) {
    el = document.createElement('div');
    el.id = '__gtoast';
    el.style.cssText = `
      position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(80px);
      background:#0d1428;border:1px solid rgba(0,200,255,0.25);color:#e0e8ff;
      padding:10px 22px;border-radius:10px;font-size:13px;letter-spacing:0.08em;
      font-family:'Baloo 2',sans-serif;font-weight:800;
      transition:transform 0.3s ease;z-index:10000;white-space:nowrap;
    `;
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.transform = 'translateX(-50%) translateY(0)';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.transform = 'translateX(-50%) translateY(80px)'; }, duration);
}

// ─────────────────────────────────────────────
// BANNER HELPER  (win/lose/draw overlay)
// ─────────────────────────────────────────────
function showGameBanner({ title, sub = '', onReplay }) {
  let el = document.getElementById('__banner');
  if (!el) {
    el = document.createElement('div');
    el.id = '__banner';
    el.style.cssText = `
      position:fixed;inset:0;z-index:9998;display:flex;flex-direction:column;
      align-items:center;justify-content:center;gap:20px;
      background:rgba(5,8,16,0.88);backdrop-filter:blur(8px);
    `;
    document.body.appendChild(el);
  }
  el.innerHTML = `
    <div style="font-family:'Baloo 2',sans-serif;font-size:clamp(28px,5vw,52px);font-weight:800;
         background:linear-gradient(135deg,#fff,#00c8ff,#ff6b2b);
         -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
         text-align:center;padding:0 20px">${title}</div>
    ${sub ? `<div style="font-family:'Baloo 2',sans-serif;font-size:13px;color:#5a6a9a;letter-spacing:0.2em">${sub}</div>` : ''}
    <button id="__replay-btn" style="
      font-family:'Baloo 2',sans-serif;font-size:12px;font-weight:800;letter-spacing:0.12em;
      padding:12px 28px;border-radius:8px;border:none;cursor:pointer;text-transform:uppercase;
      background:linear-gradient(135deg,#00c8ff,#0088cc);color:#000;margin-top:8px;
      transition:filter 0.2s;
    ">PLAY AGAIN</button>
  `;
  el.style.display = 'flex';
  document.getElementById('__replay-btn').addEventListener('click', () => {
    el.style.display = 'none';
    if (onReplay) onReplay();
  });
}

function hideBanner() {
  const el = document.getElementById('__banner');
  if (el) el.style.display = 'none';
}

// ─────────────────────────────────────────────
// GAME REGISTRY
// ─────────────────────────────────────────────
const GameRegistry = (() => {
  const _modules = {};

  function register(id, ModuleClass) {
    _modules[id] = ModuleClass;
  }

  function launch(id, canvas, opts = {}) {
    const Cls = _modules[id];
    if (!Cls) {
      console.warn(`[GameRegistry] No module registered for "${id}"`);
      return null;
    }
    return new Cls(canvas, { ...opts, gameId: id, roomId: ROOM_ID, playerIdx: PLAYER_IDX, isMulti: IS_MULTI });
  }

  function has(id) { return !!_modules[id]; }
  function list()  { return Object.keys(_modules); }

  return { register, launch, has, list };
})();

// ─────────────────────────────────────────────
// MULTIPLAYER LIFECYCLE MANAGER
// ─────────────────────────────────────────────
class MultiplayerLifecycle {
  /**
   * @param {object} opts
   * @param {string}   opts.roomId
   * @param {number}   opts.playerIdx   0 | 1 | -1(solo)
   * @param {function} opts.onReady     called when opponent joins
   * @param {function} opts.onLeft      called when opponent leaves
   */
  constructor({ roomId, playerIdx, onReady, onLeft }) {
    this.roomId    = roomId;
    this.playerIdx = playerIdx;
    this.ready     = playerIdx === -1; // solo = always ready

    if (playerIdx === 0 && roomId) {
      WaitingScreen.show(roomId);
    }

    window.addEventListener('message', e => {
      if (e.data?.type === 'room:ready') {
        WaitingScreen.hide();
        this.ready = true;
        if (onReady) onReady(e.data);
      }
      if (e.data?.type === 'room:playerLeft') {
        if (onLeft) onLeft();
      }
    });
  }

  /** Emit a socket event via parent bridge */
  emit(event, data = {}) {
    window.parent.postMessage({ type: 'socket:emit', event, data }, '*');
  }

  /** Listen for a socket event forwarded from parent */
  on(event, cb) {
    const handler = e => { if (e.data?.type === event) cb(e.data.data); };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }
}

// ─────────────────────────────────────────────
// SCORE HUD WIDGET
// ─────────────────────────────────────────────
class ScoreHUD {
  /**
   * Creates/updates a compact score bar inside the given parent element.
   * @param {string} parentSelector  CSS selector for container
   * @param {object} opts
   */
  constructor(parentSelector, opts = {}) {
    this._el = document.querySelector(parentSelector);
    this.scores = [0, 0];
    this.labels = opts.labels || ['P1', 'P2'];
    this.colors = opts.colors || ['#00c8ff', '#ff6b2b'];
    this._render();
  }

  _render() {
    if (!this._el) return;
    this._el.innerHTML = `
      <span style="color:${this.colors[0]};font-family:'Baloo 2',sans-serif;font-weight:800">
        ${this.labels[0]}: <span id="__s0">${this.scores[0]}</span>
      </span>
      &nbsp;|&nbsp;
      <span style="color:${this.colors[1]};font-family:'Baloo 2',sans-serif;font-weight:800">
        ${this.labels[1]}: <span id="__s1">${this.scores[1]}</span>
      </span>
    `;
  }

  set(p, val) {
    this.scores[p] = val;
    const el = document.getElementById(`__s${p}`);
    if (el) el.textContent = val;
  }

  increment(p) { this.set(p, this.scores[p] + 1); }
  reset() { this.set(0, 0); this.set(1, 0); }
}

// ─────────────────────────────────────────────
// PHYSICS HELPERS (used by Pong, etc.)
// ─────────────────────────────────────────────
const Physics = {
  /** Reflect velocity off an axis-aligned surface */
  reflectX(vel) { return { x: -vel.x, y: vel.y }; },
  reflectY(vel) { return { x: vel.x, y: -vel.y }; },

  /** AABB collision check */
  aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x &&
           a.y < b.y + b.h && a.y + a.h > b.y;
  },

  /** Circle vs AABB */
  circleRect(cx, cy, r, rx, ry, rw, rh) {
    const nearX = MathUtils.clamp(cx, rx, rx + rw);
    const nearY = MathUtils.clamp(cy, ry, ry + rh);
    return MathUtils.dist({ x: cx, y: cy }, { x: nearX, y: nearY }) < r;
  },

  /** Speed cap */
  capSpeed(vx, vy, max) {
    const s = Math.hypot(vx, vy);
    return s > max ? { vx: vx / s * max, vy: vy / s * max } : { vx, vy };
  },
};

// ─────────────────────────────────────────────
// BOARD GAME HELPERS (used by TTT, Connect4, etc.)
// ─────────────────────────────────────────────
const BoardUtils = {
  /**
   * Generic winner check for line-based games.
   * @param {Array}  board   flat array
   * @param {Array}  lines   array of index-tuples
   * @returns {*}  winning value or null
   */
  checkLines(board, lines) {
    for (const line of lines) {
      const v = board[line[0]];
      if (v && line.every(i => board[i] === v)) return { winner: v, line };
    }
    return null;
  },

  /** Returns all empty indices */
  empty(board) { return board.map((v,i)=>v?null:i).filter(i=>i!==null); },

  /** Clone a board */
  clone(board) { return [...board]; },
};

// ─────────────────────────────────────────────
// AI HELPERS
// ─────────────────────────────────────────────
const AI = {
  /**
   * Simple minimax for Tic-Tac-Toe (depth-limited).
   * @param {Array}  board      flat 9-array
   * @param {Array}  lines      win-lines
   * @param {string} aiSymbol
   * @param {string} humanSymbol
   * @returns {number} best index
   */
  minimaxTTT(board, lines, aiSymbol, humanSymbol) {
    function score(b, depth) {
      const res = BoardUtils.checkLines(b, lines);
      if (res?.winner === aiSymbol)    return 10 - depth;
      if (res?.winner === humanSymbol) return depth - 10;
      if (!BoardUtils.empty(b).length) return 0;
      return null;
    }
    function minimax(b, depth, isMax) {
      const s = score(b, depth);
      if (s !== null) return s;
      const empty = BoardUtils.empty(b);
      if (isMax) {
        let best = -Infinity;
        for (const i of empty) {
          const nb = BoardUtils.clone(b); nb[i] = aiSymbol;
          best = Math.max(best, minimax(nb, depth+1, false));
        }
        return best;
      } else {
        let best = Infinity;
        for (const i of empty) {
          const nb = BoardUtils.clone(b); nb[i] = humanSymbol;
          best = Math.min(best, minimax(nb, depth+1, true));
        }
        return best;
      }
    }
    let bestScore = -Infinity, bestMove = -1;
    for (const i of BoardUtils.empty(board)) {
      const nb = BoardUtils.clone(board); nb[i] = aiSymbol;
      const s = minimax(nb, 0, false);
      if (s > bestScore) { bestScore = s; bestMove = i; }
    }
    return bestMove;
  },

  /** Random move fallback */
  random(board) {
    const e = BoardUtils.empty(board);
    return e.length ? e[Math.floor(Math.random() * e.length)] : -1;
  },
};

// ─────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────
window.GameRegistry          = GameRegistry;
window.MultiplayerLifecycle  = MultiplayerLifecycle;
window.WaitingScreen         = WaitingScreen;
window.ScoreHUD              = ScoreHUD;
window.Physics               = Physics;
window.BoardUtils            = BoardUtils;
window.AI                    = AI;
window.gameToast             = gameToast;
window.showGameBanner        = showGameBanner;
window.hideBanner            = hideBanner;
window.GAME_ROOM_ID          = ROOM_ID;
window.GAME_PLAYER_IDX       = PLAYER_IDX;
window.GAME_IS_SOLO          = IS_SOLO;
window.GAME_IS_MULTI         = IS_MULTI;

console.log('[game.js] Module registry loaded — GAME:', GAME_ID, '| PLAYER:', PLAYER_IDX, '| ROOM:', ROOM_ID);
