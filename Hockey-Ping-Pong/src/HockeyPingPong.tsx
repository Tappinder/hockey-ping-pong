import { useEffect, useRef, useState } from 'react';
import { useHockeySounds } from './hooks/useHockeySounds';
import { Button } from './components/ui/button';
import { Slider } from './components/ui/slider';
import { Input } from './components/ui/input';

interface GameState {
  ball: { x: number; y: number; dx: number; dy: number };
  paddle1: { x: number; y: number };
  paddle2: { x: number; y: number };
  score: { player1: number; player2: number };
  gameRunning: boolean;
  puckColor: string;
  puckSpeed: number;
  winner: 'player1' | 'player2' | null;
  celebrating: boolean;
}

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 400;
const PADDLE_WIDTH = 15;
const PADDLE_HEIGHT = 80;
const BALL_SIZE = 12;
const BASE_BALL_SPEED = 6;
const PADDLE_SPEED = 6;

export const HockeyPingPong = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameLoopRef = useRef<number>();
  const keysRef = useRef<Set<string>>(new Set());
  const [gameState, setGameState] = useState<GameState>({
    ball: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2, dx: BASE_BALL_SPEED, dy: BASE_BALL_SPEED },
    paddle1: { x: 10, y: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2 },
    paddle2: { x: CANVAS_WIDTH - PADDLE_WIDTH - 10, y: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2 },
    score: { player1: 0, player2: 0 },
    gameRunning: false,
    puckColor: '#fff',
    puckSpeed: BASE_BALL_SPEED,
    winner: null,
    celebrating: false,
  });

  const sounds = useHockeySounds();

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

  useEffect(() => {
    if (gameState.gameRunning) {
      gameLoopRef.current = requestAnimationFrame(gameLoop);
    }
    return () => cancelAnimationFrame(gameLoopRef.current!);
  }, [gameState.gameRunning]);

  const gameLoop = () => {
    updateGame();
    drawGame();
    gameLoopRef.current = requestAnimationFrame(gameLoop);
  };

  const updateGame = () => {
    setGameState(prev => {
      let { ball, paddle1, paddle2, score, puckSpeed } = { ...prev };
      ball.x += ball.dx;
      ball.y += ball.dy;

      if (ball.y <= 0 || ball.y + BALL_SIZE >= CANVAS_HEIGHT) {
        ball.dy *= -1;
        sounds.wall();
      }
      if (ball.x <= paddle1.x + PADDLE_WIDTH &&
          ball.y + BALL_SIZE >= paddle1.y &&
          ball.y <= paddle1.y + PADDLE_HEIGHT) {
        ball.dx = puckSpeed;
        sounds.hit();
      }
      if (ball.x + BALL_SIZE >= paddle2.x &&
          ball.y + BALL_SIZE >= paddle2.y &&
          ball.y <= paddle2.y + PADDLE_HEIGHT) {
        ball.dx = -puckSpeed;
        sounds.hit();
      }

      if (ball.x < 0) {
        score.player2++;
        resetBall(ball, -puckSpeed);
        sounds.goal();
      }
      if (ball.x > CANVAS_WIDTH) {
        score.player1++;
        resetBall(ball, puckSpeed);
        sounds.goal();
      }

      if (keysRef.current.has('w') && paddle1.y > 0) paddle1.y -= PADDLE_SPEED;
      if (keysRef.current.has('s') && paddle1.y < CANVAS_HEIGHT - PADDLE_HEIGHT) paddle1.y += PADDLE_SPEED;
      if (keysRef.current.has('ArrowUp') && paddle2.y > 0) paddle2.y -= PADDLE_SPEED;
      if (keysRef.current.has('ArrowDown') && paddle2.y < CANVAS_HEIGHT - PADDLE_HEIGHT) paddle2.y += PADDLE_SPEED;

      return { ...prev, ball, paddle1, paddle2, score };
    });
  };

  const resetBall = (ball: GameState['ball'], dx: number) => {
    ball.x = CANVAS_WIDTH / 2;
    ball.y = CANVAS_HEIGHT / 2;
    ball.dx = dx;
    ball.dy = BASE_BALL_SPEED * (Math.random() > 0.5 ? 1 : -1);
  };

  const drawGame = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.fillStyle = 'white';
    ctx.fillRect(gameState.paddle1.x, gameState.paddle1.y, PADDLE_WIDTH, PADDLE_HEIGHT);
    ctx.fillRect(gameState.paddle2.x, gameState.paddle2.y, PADDLE_WIDTH, PADDLE_HEIGHT);

    ctx.fillStyle = gameState.puckColor;
    ctx.beginPath();
    ctx.arc(gameState.ball.x, gameState.ball.y, BALL_SIZE / 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = '20px Arial';
    ctx.fillText(gameState.score.player1.toString(), CANVAS_WIDTH / 4, 30);
    ctx.fillText(gameState.score.player2.toString(), (CANVAS_WIDTH / 4) * 3, 30);
  };

  return (
    <div>
      <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} style={{ background: '#0b3d91' }} />
      <Button onClick={() => setGameState({ ...gameState, gameRunning: !gameState.gameRunning })}>
        {gameState.gameRunning ? 'Pause' : 'Start'}
      </Button>
    </div>
  );
};
