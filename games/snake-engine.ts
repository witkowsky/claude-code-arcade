// Classic Snake on a grid: the snake steps one cell at a time, eats ✻ tokens to grow, and
// dies on the wall or its own body. Every few tokens an Opus token shows up for a few
// seconds, worth more. The step gets quicker as it eats. Pure: no surface.

export type Dir = 'up' | 'down' | 'left' | 'right'
export type Cell = { x: number; y: number }

export const START_LEN = 4
const STEP_START = 140
const STEP_MIN = 65
const STEP_PER_TOKEN = 3
/** An Opus token appears after every BONUS_EVERY tokens and lasts BONUS_TTL seconds. */
export const BONUS_EVERY = 5
export const BONUS_TTL = 6
export const BONUS_POINTS = 5
const BONUS_GROW = 3
const QUEUE = 3

export type World = {
  state: 'ready' | 'playing' | 'paused' | 'dead'
  cols: number
  rows: number
  /** Head first. */
  snake: Cell[]
  dir: Dir
  queue: Dir[]
  grow: number
  food: Cell
  bonus: { at: Cell; ttl: number } | null
  score: number
  eaten: number
  acc: number
  t: number
  deadFor: number
  cause: 'wall' | 'self' | 'full' | null
}

const STEP: Record<Dir, Cell> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }
const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' }

export const stepMsFor = (eaten: number): number => Math.max(STEP_MIN, STEP_START - eaten * STEP_PER_TOKEN)

export function createWorld(rand: () => number = Math.random) {
  const w = {} as World

  const same = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y

  /** A random free cell, or null when the snake fills the board. */
  function free(): Cell | null {
    const taken = new Set(w.snake.map(c => c.y * w.cols + c.x))
    if (w.food) taken.add(w.food.y * w.cols + w.food.x)
    if (w.bonus) taken.add(w.bonus.at.y * w.cols + w.bonus.at.x)
    const n = w.cols * w.rows - taken.size
    if (n <= 0) return null
    let k = Math.floor(rand() * n)
    for (let i = 0; i < w.cols * w.rows; i++) {
      if (taken.has(i)) continue
      if (k-- === 0) return { x: i % w.cols, y: Math.floor(i / w.cols) }
    }
    return null
  }

  function reset(cols: number, rows: number): void {
    cols = Math.max(START_LEN + 4, Math.floor(cols))
    rows = Math.max(4, Math.floor(rows))
    const y = Math.floor(rows / 2)
    const x = Math.min(cols - 3, Math.floor(cols / 3) + START_LEN - 1)
    Object.assign(w, {
      state: 'ready',
      cols,
      rows,
      snake: Array.from({ length: START_LEN }, (_, i) => ({ x: x - i, y })),
      dir: 'right',
      queue: [],
      grow: 0,
      food: undefined as unknown as Cell,
      bonus: null,
      score: 0,
      eaten: 0,
      acc: 0,
      t: 0,
      deadFor: 0,
      cause: null,
    } satisfies World)
    w.food = free() ?? { x: 0, y: 0 }
  }

  /** Queues a turn; the first one starts the run. A reversal into the neck is ignored. */
  function turn(d: Dir): void {
    if (w.state === 'dead') return
    const last = w.queue[w.queue.length - 1] ?? w.dir
    if (w.state === 'ready' || w.state === 'paused') w.state = 'playing'
    if (d === last || d === OPPOSITE[last] || w.queue.length >= QUEUE) return
    w.queue.push(d)
  }

  function togglePause(): void {
    if (w.state === 'ready') w.state = 'playing'
    else if (w.state === 'playing') w.state = 'paused'
    else if (w.state === 'paused') w.state = 'playing'
  }

  function die(cause: World['cause']): void {
    w.state = 'dead'
    w.cause = cause
    w.deadFor = 0
  }

  /** One cell forward; true when it ended the run. */
  function step(): boolean {
    const d = w.queue.shift()
    if (d) w.dir = d
    const head = w.snake[0] as Cell
    const next = { x: head.x + STEP[w.dir].x, y: head.y + STEP[w.dir].y }
    if (next.x < 0 || next.y < 0 || next.x >= w.cols || next.y >= w.rows) {
      die('wall')
      return true
    }
    // The tail moves out of the way this step unless the snake is growing.
    const body = w.grow > 0 ? w.snake : w.snake.slice(0, -1)
    if (body.some(c => same(c, next))) {
      die('self')
      return true
    }
    w.snake.unshift(next)
    if (same(next, w.food)) {
      w.score++
      w.eaten++
      w.grow++
      const food = free()
      if (!food) {
        die('full')
        return true
      }
      w.food = food
      if (w.eaten % BONUS_EVERY === 0 && !w.bonus) {
        const at = free()
        if (at) w.bonus = { at, ttl: BONUS_TTL }
      }
    } else if (w.bonus && same(next, w.bonus.at)) {
      w.score += BONUS_POINTS
      w.grow += BONUS_GROW
      w.bonus = null
    }
    if (w.grow > 0) w.grow--
    else w.snake.pop()
    return false
  }

  /** Advances the world by dt seconds; returns true on the step the run ended. */
  function update(dt: number): boolean {
    w.t += dt
    if (w.state === 'dead') {
      w.deadFor += dt
      return false
    }
    if (w.state !== 'playing') return false
    if (w.bonus) {
      w.bonus.ttl -= dt
      if (w.bonus.ttl <= 0) w.bonus = null
    }
    w.acc += dt * 1000
    while (w.acc >= stepMsFor(w.eaten)) {
      w.acc -= stepMsFor(w.eaten)
      if (step()) return true
    }
    return false
  }

  return { world: w, reset, turn, togglePause, update }
}
