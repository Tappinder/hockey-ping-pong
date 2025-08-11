// src/components/HockeyPingPong.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { usePhoton } from '@/hooks/usePhoton'; // scaffolded below
import { useHockeySounds } from '@/hooks/useHockeySounds';

/* ---------------------------
   Constants & Types
   --------------------------- */
const VIRTUAL_WIDTH = 800;
const VIRTUAL_HEIGHT = 400;

const PADDLE_WIDTH = 15;
const PADDLE_HEIGHT = 80;
const PUCK_RADIUS = 12;
const BASE_PUCK_SPEED = 6;
const PADDLE_SPEED = 6;

type Winner = 'player1' | 'player2' | null;

interface Ball {
  x: number;
  y: number;
  dx: number;
  dy: number;
}
interface Paddle {
  x: number;
  y: number;
}
interface Score {
  player1: number;
  player2: number;
}
interface GameState {
  ball: Ball;
  paddle1: Paddle;
  paddle2: Paddle;
  score: Score;
  gameRunning: boolean;
  puckColor: string;
  puckSpeed: number;
  winner: Winner;
  celebrating: boolean;
}

/* ---------------------------
   Component
   --------------------------- */
export const HockeyPingPong: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const touchRef = useRef<{ player1Y: number | null; player2Y: number | null }>({ player1Y: null, player2Y: null });
  const [gameMode, setGameMode] = useState<'1-player' | '2-player'>('2-player');
  const [playerNames, setPlayerNames] = useState({ player1: 'Player 1', player2: 'Player 2' });
  const [stickType, setStickType] = useState<'normal' | 'goalie'>('normal');
  const hockeySounds = useHockeySounds();

  // network hook (scaffolded below). Will be a no-op if Photon not configured.
  const {
    isConnected,
    isInRoom,
    localActorNumber,
    joinOrCreateMatch,
    leaveMatch,
    sendInput, // send local paddle pos
    onRemoteState, // subscribe to remote authoritative state when in multiplayer
    setAppId, // optional helper to set AppId at runtime
  } = usePhoton();

  // Game state (keeps physics in virtual coordinate system)
  const [gameState, setGameState] = useState<GameState>(() => ({
    ball: {
      x: VIRTUAL_WIDTH / 2,
      y: VIRTUAL_HEIGHT / 2,
      dx: BASE_PUCK_SPEED,
      dy: BASE_PUCK_SPEED,
    },
    paddle1: { x: 20, y: VIRTUAL_HEIGHT / 2 - PADDLE_HEIGHT / 2 },
    paddle2: { x: VIRTUAL_WIDTH - 20 - PADDLE_WIDTH, y: VIRTUAL_HEIGHT / 2 - PADDLE_HEIGHT / 2 },
    score: { player1: 0, player2: 0 },
    gameRunning: false,
    puckColor: '#1a1a2e',
    puckSpeed: 1,
    winner: null,
    celebrating: false,
  }));

  // Scaling for responsive canvas: compute CSS size to fit viewport while preserving AR.
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const updateScale = () => {
      const marginW = Math.min(window.innerWidth * 0.96, 480); // keep some margins on very wide devices
      const marginH = Math.min(window.innerHeight * 0.78, 800);
      const scaleX = marginW / VIRTUAL_WIDTH;
      const scaleY = marginH / VIRTUAL_HEIGHT;
      setScale(Math.max(0.5, Math.min(scaleX, scaleY))); // clamp scale
      // also set canvas CSS width/height directly
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.style.width = `${VIRTUAL_WIDTH * Math.min(scaleX, scaleY)}px`;
        canvas.style.height = `${VIRTUAL_HEIGHT * Math.min(scaleX, scaleY)}px`;
      }
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  /* ---------------------------
     Drawing utilities (use virtual coords)
     --------------------------- */
  const drawHockeyStick = useCallback(
    (ctx: CanvasRenderingContext2D, x: number, y: number, isLeft: boolean) => {
      ctx.save();
      const stickWidth = stickType === 'goalie' ? PADDLE_WIDTH + 8 : PADDLE_WIDTH;
      const stickHeight = stickType === 'goalie' ? PADDLE_HEIGHT + 20 : PADDLE_HEIGHT;
      const bladeHeight = stickType === 'goalie' ? 35 : 20;

      const gradient = ctx.createLinearGradient(x, y, x + stickWidth, y + stickHeight);
      gradient.addColorStop(0, 'hsl(220, 20%, 65%)');
      gradient.addColorStop(0.5, 'hsl(220, 30%, 85%)');
      gradient.addColorStop(1, 'hsl(220, 20%, 65%)');

      ctx.fillStyle = gradient;
      ctx.strokeStyle = 'hsl(220, 40%, 50%)';
      ctx.lineWidth = stickType === 'goalie' ? 3 : 2;

      const shaftWidth = stickType === 'goalie' ? 6 : 4;
      const stickX = isLeft ? x : x + stickWidth - shaftWidth;
      ctx.fillRect(stickX, y, shaftWidth, stickHeight);
      ctx.strokeRect(stickX, y, shaftWidth, stickHeight);

      const bladeY = isLeft ? y + stickHeight - bladeHeight : y;
      const bladeX = isLeft ? x + shaftWidth : x;
      const bladeWidth = stickWidth - shaftWidth;

      // fallback rounded blade if roundRect unavailable
      ctx.beginPath();
      ctx.moveTo(bladeX, bladeY + 4);
      ctx.quadraticCurveTo(bladeX + bladeWidth / 2, bladeY - 6, bladeX + bladeWidth, bladeY + 4);
      ctx.lineTo(bladeX + bladeWidth, bladeY + bladeHeight - 4);
      ctx.quadraticCurveTo(bladeX + bladeWidth / 2, bladeY + bladeHeight + 6, bladeX, bladeY + bladeHeight - 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      if (stickType === 'goalie') {
        ctx.strokeStyle = 'hsl(220, 50%, 40%)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(bladeX + 4, bladeY + 6);
        ctx.lineTo(bladeX + bladeWidth - 4, bladeY + 6);
        ctx.moveTo(bladeX + 4, bladeY + bladeHeight - 6);
        ctx.lineTo(bladeX + bladeWidth - 4, bladeY + bladeHeight - 6);
        ctx.stroke();
      }
      ctx.restore();
    },
    [stickType],
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear and scale to virtual coordinates
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Draw into virtual coordinate space (no ctx.scale here since canvas is sized to VIRTUAL dims)
    // NOTE: canvas.width/height are set to virtual dims in useEffect below
    // Ice rink background
    const grad = ctx.createLinearGradient(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
    grad.addColorStop(0, 'hsl(200, 100%, 97%)');
    grad.addColorStop(1, 'hsl(200, 100%, 92%)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);

    // Center dashed line (fixed bug)
    ctx.strokeStyle = 'hsl(200, 50%, 80%)';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(VIRTUAL_WIDTH / 2, 0);
    ctx.lineTo(VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT);
    ctx.stroke();
    ctx.setLineDash([]);

    // Center circle
    ctx.strokeStyle = 'hsl(200, 60%, 75%)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT / 2, 50, 0, Math.PI * 2);
    ctx.stroke();

    // Sticks
    drawHockeyStick(ctx, gameState.paddle1.x, gameState.paddle1.y, true);
    drawHockeyStick(ctx, gameState.paddle2.x, gameState.paddle2.y, false);

    // puck
    const puckGrad = ctx.createRadialGradient(gameState.ball.x, gameState.ball.y, 0, gameState.ball.x, gameState.ball.y, PUCK_RADIUS);
    const hex = gameState.puckColor;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    puckGrad.addColorStop(0, `rgb(${Math.min(255, r + 30)}, ${Math.min(255, g + 30)}, ${Math.min(255, b + 30)})`);
    puckGrad.addColorStop(1, gameState.puckColor);

    ctx.fillStyle = puckGrad;
    ctx.beginPath();
    ctx.arc(gameState.ball.x, gameState.ball.y, PUCK_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // highlight
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.arc(gameState.ball.x - 3, gameState.ball.y - 3, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }, [gameState, drawHockeyStick]);

  /* ---------------------------
     Game logic / update loop
     --------------------------- */
  // Reset ball helper
  const resetBall = useCallback((toLeft = Math.random() > 0.5) => {
    setGameState(prev => {
      const speed = BASE_PUCK_SPEED * prev.puckSpeed;
      return {
        ...prev,
        ball: {
          x: VIRTUAL_WIDTH / 2,
          y: VIRTUAL_HEIGHT / 2,
          dx: (toLeft ? -1 : 1) * speed,
          dy: (Math.random() - 0.5) * speed,
        },
      };
    });
  }, []);

  // Core update tick runs local if not in multiplayer authoritative mode.
  const updateGame = useCallback(() => {
    setGameState(prev => {
      if (!prev.gameRunning) return prev;
      const next = JSON.parse(JSON.stringify(prev)) as GameState;

      // Move puck
      next.ball.x += next.ball.dx;
      next.ball.y += next.ball.dy;

      // Wall collisions
      if (next.ball.y <= PUCK_RADIUS || next.ball.y >= VIRTUAL_HEIGHT - PUCK_RADIUS) {
        next.ball.dy = -next.ball.dy;
      }

      // Collisions with paddles (simple AABB detection)
      const ballLeft = next.ball.x - PUCK_RADIUS;
      const ballRight = next.ball.x + PUCK_RADIUS;
      const ballTop = next.ball.y - PUCK_RADIUS;
      const ballBottom = next.ball.y + PUCK_RADIUS;
      const currentSpeed = BASE_PUCK_SPEED * next.puckSpeed;

      // Left paddle
      if (
        ballLeft <= next.paddle1.x + PADDLE_WIDTH &&
        ballRight >= next.paddle1.x &&
        ballBottom >= next.paddle1.y &&
        ballTop <= next.paddle1.y + PADDLE_HEIGHT
      ) {
        next.ball.dx = Math.abs(next.ball.dx) || currentSpeed;
        const hitPos = (next.ball.y - next.paddle1.y) / PADDLE_HEIGHT;
        next.ball.dy = (hitPos - 0.5) * currentSpeed * 1.5;
        hockeySounds.playPuckHit();
      }

      // Right paddle
      if (
        ballRight >= next.paddle2.x &&
        ballLeft <= next.paddle2.x + PADDLE_WIDTH &&
        ballBottom >= next.paddle2.y &&
        ballTop <= next.paddle2.y + PADDLE_HEIGHT
      ) {
        next.ball.dx = -Math.abs(next.ball.dx) || -currentSpeed;
        const hitPos = (next.ball.y - next.paddle2.y) / PADDLE_HEIGHT;
        next.ball.dy = (hitPos - 0.5) * currentSpeed * 1.5;
        hockeySounds.playPuckHit();
      }

      // Scoring
      if (next.ball.x < 0) {
        next.score.player2++;
        hockeySounds.playGoalHorn();
        if (next.score.player2 >= 10) {
          next.winner = 'player2';
          next.celebrating = true;
          next.gameRunning = false;
        } else {
          next.ball.x = VIRTUAL_WIDTH / 2;
          next.ball.y = VIRTUAL_HEIGHT / 2;
          next.ball.dx = currentSpeed;
          next.ball.dy = (Math.random() - 0.5) * currentSpeed;
        }
      } else if (next.ball.x > VIRTUAL_WIDTH) {
        next.score.player1++;
        hockeySounds.playGoalHorn();
        if (next.score.player1 >= 10) {
          next.winner = 'player1';
          next.celebrating = true;
          next.gameRunning = false;
        } else {
          next.ball.x = VIRTUAL_WIDTH / 2;
          next.ball.y = VIRTUAL_HEIGHT / 2;
          next.ball.dx = -currentSpeed;
          next.ball.dy = (Math.random() - 0.5) * currentSpeed;
        }
      }

      // Input handling
      const keys = keysRef.current;
      const touch = touchRef.current;

      // Player1 controls (W/S)
      if (keys.has('w') || keys.has('W')) {
        next.paddle1.y = Math.max(0, next.paddle1.y - PADDLE_SPEED);
      }
      if (keys.has('s') || keys.has('S')) {
        next.paddle1.y = Math.min(VIRTUAL_HEIGHT - PADDLE_HEIGHT, next.paddle1.y + PADDLE_SPEED);
      }
      if (touch.player1Y !== null) {
        next.paddle1.y = Math.max(0, Math.min(VIRTUAL_HEIGHT - PADDLE_HEIGHT, touch.player1Y - PADDLE_HEIGHT / 2));
      }

      // Player2 controls / AI
      if (gameMode === '2-player' && !isInRoom) {
        if (keys.has('ArrowUp')) {
          next.paddle2.y = Math.max(0, next.paddle2.y - PADDLE_SPEED);
        }
        if (keys.has('ArrowDown')) {
          next.paddle2.y = Math.min(VIRTUAL_HEIGHT - PADDLE_HEIGHT, next.paddle2.y + PADDLE_SPEED);
        }
        if (touch.player2Y !== null) {
          next.paddle2.y = Math.max(0, Math.min(VIRTUAL_HEIGHT - PADDLE_HEIGHT, touch.player2Y - PADDLE_HEIGHT / 2));
        }
      } else if (gameMode === '1-player' && !isInRoom) {
        // Basic AI (only when not in multiplayer mode)
        const paddleCenter = next.paddle2.y + PADDLE_HEIGHT / 2;
        const ballY = next.ball.y;
        const difficulty = 0.75;
        if (next.ball.dx > 0 && next.ball.x > VIRTUAL_WIDTH / 2) {
          const targetY = ballY - PADDLE_HEIGHT / 2;
          const diff = targetY - next.paddle2.y;
          const moveSpeed = PADDLE_SPEED * difficulty * (0.8 + Math.random() * 0.4);
          if (Math.abs(diff) > 4) {
            if (diff > 0) {
              next.paddle2.y = Math.min(VIRTUAL_HEIGHT - PADDLE_HEIGHT, next.paddle2.y + moveSpeed);
            } else {
              next.paddle2.y = Math.max(0, next.paddle2.y - moveSpeed);
            }
          }
        }
      }

      // If in multiplayer and we're the local player, send our paddleY to the network
      if (isInRoom && localActorNumber) {
        // actor 1 is left, actor 2 is right — decide which side you're controlling locally
        const amLeft = localActorNumber === 1;
        sendInput({
          paddleY: amLeft ? next.paddle1.y : next.paddle2.y,
          timestamp: Date.now(),
        });
      }

      return next;
    });
  }, [gameMode, hockeySounds, isInRoom, localActorNumber, sendInput]);

  // Game loop
  useEffect(() => {
    // set canvas internal size to virtual dims so drawing code uses VIRTUAL coords
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = VIRTUAL_WIDTH;
      canvas.height = VIRTUAL_HEIGHT;
    }

    const tick = () => {
      updateGame();
      draw();
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [draw, updateGame]);

  /* ---------------------------
     Input handlers
     --------------------------- */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => keysRef.current.add(e.key);
    const handleKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.key);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const handleCanvasTouch = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = VIRTUAL_WIDTH / rect.width;
      const scaleY = VIRTUAL_HEIGHT / rect.height;
      Array.from(e.touches).forEach(t => {
        const x = (t.clientX - rect.left) * scaleX;
        const y = (t.clientY - rect.top) * scaleY;
        if (x < VIRTUAL_WIDTH / 2) {
          touchRef.current.player1Y = y;
        } else if (gameMode === '2-player') {
          touchRef.current.player2Y = y;
        } else {
          // single player: touching right side could move AI paddle for testing
          // ignore to avoid messing AI
        }
      });
    },
    [gameMode],
  );

  const handleTouchEnd = useCallback(() => {
    touchRef.current.player1Y = null;
    touchRef.current.player2Y = null;
  }, []);

  /* ---------------------------
     Simple UI controls (minimal)
     --------------------------- */
  const startGame = () => setGameState(prev => ({ ...prev, gameRunning: true }));
  const pauseGame = () => setGameState(prev => ({ ...prev, gameRunning: false }));
  const resetGame = () => {
    setGameState(prev => ({
      ...prev,
      ball: { x: VIRTUAL_WIDTH / 2, y: VIRTUAL_HEIGHT / 2, dx: BASE_PUCK_SPEED * prev.puckSpeed, dy: BASE_PUCK_SPEED * prev.puckSpeed },
      paddle1: { x: 20, y: VIRTUAL_HEIGHT / 2 - PADDLE_HEIGHT / 2 },
      paddle2: { x: VIRTUAL_WIDTH - 20 - PADDLE_WIDTH, y: VIRTUAL_HEIGHT / 2 - PADDLE_HEIGHT / 2 },
      score: { player1: 0, player2: 0 },
      gameRunning: false,
      winner: null,
      celebrating: false,
    }));
  };

  /* ---------------------------
     Multiplayer hooks: receive remote authoritative state
     --------------------------- */
  useEffect(() => {
    // When in a multiplayer room, the hook will call our handler with authoritative state updates.
    const unsub = onRemoteState((remoteState: Partial<GameState>) => {
      // remoteState is small and authoritative: { ball, paddle1, paddle2, score, gameRunning, winner }
      setGameState(prev => ({ ...prev, ...remoteState } as any));
    });
    return () => unsub && unsub();
  }, [onRemoteState]);

  /* ---------------------------
     JSX - simplified UI for clarity
     --------------------------- */
  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h2>Hockey Ping Pong</h2>

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 14, color: '#333' }}>
            Desktop: W/S or ↑/↓ &nbsp; | &nbsp; Mobile: touch left/right
          </div>
          <div style={{ marginTop: 6 }}>
            {gameState.score.player1} - {gameState.score.player2}
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div
        style={{
          width: Math.round(VIRTUAL_WIDTH * scale),
          height: Math.round(VIRTUAL_HEIGHT * scale),
          margin: '0 auto',
          touchAction: 'none',
          userSelect: 'none',
          borderRadius: 8,
          overflow: 'hidden',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        }}
      >
        <canvas
          ref={canvasRef}
          onTouchStart={handleCanvasTouch}
          onTouchMove={handleCanvasTouch}
          onTouchEnd={handleTouchEnd}
          style={{ display: 'block', width: '100%', height: '100%' }}
        />
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        {!gameState.gameRunning ? (
          <button onClick={startGame}>Start</button>
        ) : (
          <button onClick={pauseGame}>Pause</button>
        )}
        <button onClick={resetGame}>Reset</button>

        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          Mode
          <select value={gameMode} onChange={e => setGameMode(e.target.value as any)} disabled={gameState.gameRunning}>
            <option value="1-player">1 Player</option>
            <option value="2-player">2 Player</option>
          </select>
        </label>

        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          Stick
          <select value={stickType} onChange={e => setStickType(e.target.value as any)} disabled={gameState.gameRunning}>
            <option value="normal">Normal</option>
            <option value="goalie">Goalie</option>
          </select>
        </label>

        {/* Multiplayer buttons */}
        <div style={{ marginLeft: 'auto' }}>
          {isConnected ? (
            isInRoom ? (
              <button onClick={() => leaveMatch()}>Leave Match</button>
            ) : (
              <button
                onClick={() => {
                  // quick join or create
                  joinOrCreateMatch({ maxPlayers: 2, mode: 'quick' });
                }}
              >
                Quick Match (Photon)
              </button>
            )
          ) : (
            <div style={{ color: '#999' }}>Photon: Not connected</div>
          )}
        </div>
      </div>

      {/* Winner */}
      {gameState.winner && (
        <div style={{ marginTop: 12, padding: 12, background: '#fffbe6', borderRadius: 6 }}>
          <strong>🏆 {gameState.winner === 'player1' ? playerNames.player1 : playerNames.player2} Wins!</strong>
          <div>Final Score: {gameState.score.player1} - {gameState.score.player2}</div>
          <div style={{ marginTop: 8 }}>
            <button onClick={() => { resetGame(); setGameState(prev => ({ ...prev, winner: null, celebrating: false })); }}>Start New Game</button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 12, fontSize: 13, color: '#444' }}>
        First to 10 wins. Multiplayer uses Photon (if configured).
      </div>
    </div>
  );
};
