// Pong up a ladder: Clawd's paddle on the left against a model on the right, first to
// POINTS_TO_WIN takes the match, and each win brings a quicker, sharper model: Haiku, Sonnet,
// then Opus (who only gets faster). The ball quickens with every return and leaves a paddle at
// an angle set by where it struck. A lost match ends the run; the score is every point Clawd
// won on the way. World units are the canvas's square pixels. Pure.

export const POINTS_TO_WIN = 5
export const BALL = 3
export const PADDLE_W = 2
const PLAYER_SPEED = 70
const SPEEDUP = 1.07
const SERVE_PAUSE = 0.9
const MATCH_PAUSE = 2.2

export type Model = { name: string; speed: number; aimError: number }

/** The ladder; past the end, Opus keeps going, quicker each time. `speed` is in heights/s. */
/** `aimError` is how far off-centre the model may meet the ball, in paddle heights: past about
 * 0.6 the ball slips by the paddle's end. */
const LADDER: Model[] = [
  { name: 'Haiku', speed: 0.5, aimError: 0.85 },
  { name: 'Sonnet', speed: 0.7, aimError: 0.72 },
  { name: 'Opus', speed: 0.9, aimError: 0.62 },
]

export function modelFor(level: number): Model {
  const last = LADDER[LADDER.length - 1] as Model
  const m = LADDER[level] ?? { ...last, speed: last.speed * Math.pow(1.1, level - LADDER.length + 1), aimError: Math.max(0.5, last.aimError - 0.03 * (level - LADDER.length + 1)) }
  return level >= LADDER.length ? { ...m, name: 'Opus' } : m
}

export type World = {
  state: 'ready' | 'serve' | 'playing' | 'won' | 'dead'
  w: number
  h: number
  t: number
  level: number
  you: number
  them: number
  score: number
  returns: number
  rally: number
  paddleH: number
  player: { y: number; target: number }
  cpu: { y: number; aim: number }
  ball: { x: number; y: number; vx: number; vy: number }
  /** Who serves next: 1 towards the model, -1 towards Clawd. */
  serveDir: 1 | -1
  waitFor: number
  deadFor: number
}

export function createWorld(rand: () => number = Math.random) {
  const w = {} as World

  const baseSpeed = () => w.w * 0.65
  const leftX = () => 2
  const rightX = () => w.w - 2 - PADDLE_W
  const clampY = (y: number) => Math.max(1, Math.min(w.h - 1 - w.paddleH, y))

  function placeBall(): void {
    w.ball = { x: w.w / 2 - BALL / 2, y: w.h / 2 - BALL / 2, vx: 0, vy: 0 }
    w.rally = 0
    w.cpu.aim = (rand() * 2 - 1) * modelFor(w.level).aimError
  }

  function reset(width: number, height: number): void {
    const wd = Math.max(40, Math.floor(width))
    const ht = Math.max(20, Math.floor(height))
    const paddleH = Math.max(6, Math.round(ht * 0.22))
    Object.assign(w, {
      state: 'ready',
      w: wd,
      h: ht,
      t: 0,
      level: 0,
      you: 0,
      them: 0,
      score: 0,
      returns: 0,
      rally: 0,
      paddleH,
      player: { y: (ht - paddleH) / 2, target: (ht - paddleH) / 2 },
      cpu: { y: (ht - paddleH) / 2, aim: 0 },
      ball: { x: 0, y: 0, vx: 0, vy: 0 },
      serveDir: 1,
      waitFor: 0,
      deadFor: 0,
    } satisfies World)
    placeBall()
  }

  function serve(): void {
    const sp = baseSpeed()
    const angle = (rand() * 2 - 1) * 0.5
    w.ball.vx = w.serveDir * sp * Math.cos(angle)
    w.ball.vy = sp * Math.sin(angle)
    w.state = 'playing'
  }

  function start(): void {
    if (w.state === 'ready') {
      w.state = 'serve'
      w.waitFor = 0.3
    }
  }

  /** Nudges Clawd's paddle by `dy` pixels: a key press (or its repeat) moves it a step. */
  function move(dy: number): void {
    start()
    w.player.target = clampY(w.player.target + dy)
  }

  /** Sends Clawd's paddle so its middle sits at y (the pointer). */
  function moveTo(y: number): void {
    w.player.target = clampY(y - w.paddleH / 2)
  }

  function point(toYou: boolean): boolean {
    if (toYou) {
      w.you++
      w.score++
    } else w.them++
    w.serveDir = toYou ? 1 : -1
    if (w.you >= POINTS_TO_WIN) {
      w.state = 'won'
      w.waitFor = MATCH_PAUSE
      placeBall()
      return false
    }
    if (w.them >= POINTS_TO_WIN) {
      w.state = 'dead'
      w.deadFor = 0
      return true
    }
    w.state = 'serve'
    w.waitFor = SERVE_PAUSE
    placeBall()
    return false
  }

  /** Off a paddle: back the other way, quicker, angled by where it struck (-1 top .. 1 bottom). */
  function bounce(paddleY: number, dir: 1 | -1): void {
    const b = w.ball
    const hit = (b.y + BALL / 2 - (paddleY + w.paddleH / 2)) / (w.paddleH / 2 + BALL / 2)
    const speed = Math.min(w.w * 1.6, Math.hypot(b.vx, b.vy) * SPEEDUP)
    const angle = Math.max(-1, Math.min(1, hit)) * 1.0
    b.vx = dir * speed * Math.cos(angle)
    b.vy = speed * Math.sin(angle)
    w.rally++
  }

  /** Advances the world by dt seconds; returns true on the step the run ended. */
  function update(dt: number): boolean {
    w.t += dt
    if (w.state === 'dead') {
      w.deadFor += dt
      return false
    }
    if (w.state === 'ready') return false

    // Clawd's paddle glides to its target.
    const p = w.player
    const step = PLAYER_SPEED * (w.h / 46) * dt
    p.y = Math.abs(p.target - p.y) <= step ? p.target : p.y + Math.sign(p.target - p.y) * step

    // The model follows the ball when it is coming, with a miss of its own, else drifts home.
    const m = modelFor(w.level)
    const b = w.ball
    const coming = b.vx > 0
    const want = coming ? b.y + BALL / 2 + w.cpu.aim * w.paddleH - w.paddleH / 2 : (w.h - w.paddleH) / 2
    const cpuStep = m.speed * w.h * dt * (coming ? 1 : 0.5)
    const dy = clampY(want) - w.cpu.y
    w.cpu.y = clampY(w.cpu.y + Math.max(-cpuStep, Math.min(cpuStep, dy)))

    if (w.state === 'serve' || w.state === 'won') {
      w.waitFor -= dt
      if (w.waitFor > 0) return false
      if (w.state === 'won') {
        w.level++
        w.you = 0
        w.them = 0
        w.serveDir = 1
        placeBall()
      }
      serve()
      return false
    }

    b.x += b.vx * dt
    b.y += b.vy * dt
    if (b.y < 0) {
      b.y = -b.y
      b.vy = Math.abs(b.vy)
    } else if (b.y + BALL > w.h) {
      b.y = 2 * (w.h - BALL) - b.y
      b.vy = -Math.abs(b.vy)
    }

    const overlaps = (py: number) => b.y + BALL > py && b.y < py + w.paddleH
    if (b.vx < 0 && b.x <= leftX() + PADDLE_W && b.x + BALL > leftX() && overlaps(p.y)) {
      b.x = leftX() + PADDLE_W
      bounce(p.y, 1)
      w.returns++
      w.cpu.aim = (rand() * 2 - 1) * m.aimError
    } else if (b.vx > 0 && b.x + BALL >= rightX() && b.x < rightX() + PADDLE_W && overlaps(w.cpu.y)) {
      b.x = rightX() - BALL
      bounce(w.cpu.y, -1)
    }

    if (b.x + BALL < 0) return point(false)
    if (b.x > w.w) return point(true)
    return false
  }

  return { world: w, reset, start, move, moveTo, update, leftX, rightX }
}
