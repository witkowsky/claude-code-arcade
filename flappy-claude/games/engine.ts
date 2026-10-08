// Classic Flappy Bird rules: gravity, a flap that sets the climb speed, pipes with a gap
// that narrows and a scroll that speeds up as the score grows. World units are pixels of a
// canvas VIEW_H tall; the drawing scales them to whatever the pane gives. Pure: no surface.

export const VIEW_H = 512
export const GROUND = 80
const GRAVITY = 1500
const FLAP_V = -430
const MAX_FALL = 700
export const PIPE_W = 60
const SPACING = 210
const GAP_START = 165
const GAP_MIN = 125
const SPEED_START = 140
const SPEED_MAX = 230
const MARGIN = 50
const MAX_SHIFT = 130
/** Clawd's box: the sprite is about 100 x 55 units, the hitbox a little inside it. */
export const HALF_W = 40
export const HALF_H = 22

export type Pipe = { k: number; x: number; center: number; gap: number; passed: boolean; token: boolean; tokenTaken: boolean }

export type World = {
  state: 'ready' | 'flying' | 'dying' | 'dead'
  score: number
  tokens: number
  t: number
  scroll: number
  speed: number
  bird: { x: number; y: number; vy: number; flap: number; flash: number }
  pipes: Pipe[]
  next: number
  deadFor: number
}

export const gapFor = (k: number): number => Math.max(GAP_MIN, GAP_START - (k - 1) * 2)
export const speedFor = (score: number): number => Math.min(SPEED_MAX, SPEED_START + score * 3)

export function createWorld(rand: () => number = Math.random) {
  const w = {} as World

  function spawn(x: number): void {
    const k = w.next++
    const gap = gapFor(k)
    const lo = MARGIN + gap / 2
    const hi = VIEW_H - GROUND - MARGIN - gap / 2
    const prev = w.pipes[w.pipes.length - 1]
    const from = prev ? Math.max(lo, prev.center - MAX_SHIFT) : lo
    const to = prev ? Math.min(hi, prev.center + MAX_SHIFT) : hi
    w.pipes.push({ k, x, center: from + rand() * Math.max(0, to - from), gap, passed: false, token: k > 1 && rand() < 0.4, tokenTaken: false })
  }

  function reset(viewW: number): void {
    Object.assign(w, {
      state: 'ready',
      score: 0,
      tokens: 0,
      t: 0,
      scroll: 0,
      speed: SPEED_START,
      bird: { x: Math.min(viewW * 0.25, 180), y: VIEW_H * 0.42, vy: 0, flap: 0, flash: 0 },
      pipes: [],
      next: 1,
      deadFor: 0,
    } satisfies World)
    for (let x = w.bird.x + 360; x < viewW + SPACING * 2; x += SPACING) spawn(x)
  }

  /** One flap; `power` 1 is a normal flap, a wallop flaps harder. */
  function flap(power = 1): void {
    if (w.state === 'ready') w.state = 'flying'
    if (w.state !== 'flying') return
    w.bird.vy = FLAP_V * power
    w.bird.flap = 0.25
  }

  function crash(): void {
    if (w.state !== 'flying') return
    w.state = 'dying'
    w.bird.flash = 1
    w.bird.vy = Math.min(w.bird.vy, -180)
  }

  /** Advances the world by dt seconds; returns true on the step the run ended. */
  function update(dt: number, viewW: number): boolean {
    w.t += dt
    const b = w.bird
    b.flap = Math.max(0, b.flap - dt)
    b.flash = Math.max(0, b.flash - dt * 3)

    if (w.state === 'ready') {
      b.y = VIEW_H * 0.42 + Math.sin(w.t * 3) * 8
      w.scroll += w.speed * 0.4 * dt
      return false
    }
    if (w.state === 'dead') {
      w.deadFor += dt
      return false
    }

    b.vy = Math.min(MAX_FALL, b.vy + GRAVITY * dt)
    b.y += b.vy * dt
    if (b.y + HALF_H > VIEW_H - GROUND) {
      b.y = VIEW_H - GROUND - HALF_H
      crash()
      w.state = 'dead'
      w.deadFor = 0
      return true
    }
    if (b.y - HALF_H < 0) {
      b.y = HALF_H
      b.vy = 0
    }
    if (w.state === 'dying') return false

    w.speed = speedFor(w.score)
    const dx = w.speed * dt
    w.scroll += dx
    for (const p of w.pipes) {
      p.x -= dx
      const overlapsX = b.x + HALF_W > p.x && b.x - HALF_W < p.x + PIPE_W
      if (overlapsX && (b.y - HALF_H < p.center - p.gap / 2 || b.y + HALF_H > p.center + p.gap / 2)) {
        crash()
        return false
      }
      if (p.token && !p.tokenTaken && Math.abs(b.x - (p.x + PIPE_W / 2)) < HALF_W && Math.abs(b.y - p.center) < HALF_H + 12) {
        p.tokenTaken = true
        w.tokens++
      }
      if (!p.passed && p.x + PIPE_W < b.x - HALF_W) {
        p.passed = true
        w.score = p.k
      }
    }
    while (w.pipes.length && (w.pipes[0] as Pipe).x < -PIPE_W - 20) w.pipes.shift()
    let last = w.pipes[w.pipes.length - 1]
    while (last && last.x < viewW + SPACING) {
      spawn(last.x + SPACING)
      last = w.pipes[w.pipes.length - 1]
    }
    return false
  }

  return { world: w, reset, flap, update }
}
