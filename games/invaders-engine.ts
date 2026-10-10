// Space Invaders with bugs: a formation marches side to side, dropping a row at each edge and
// quickening as it thins, while the bottom bugs drop bombs. Clawd moves along the bottom and
// fires one ✻ at a time; test suites (shields) soak up shots from both sides; now and then an
// Opus ship crosses the top for a bonus. World units are the canvas's square pixels. Pure.

export const PLAYER_W = 9
export const PLAYER_H = 5
export const BUG_W = 7
export const BUG_H = 5
const GAP_X = 4
const GAP_Y = 2
const PLAYER_SPEED = 55
const SHOT_SPEED = 75
const BOMB_SPEED = 26
const MARCH_DX = 1
const DROP = 2
export const SHIELD_W = 9
export const SHIELD_H = 4
export const UFO_W = 9
export const UFO_H = 3
const UFO_SPEED = 18
const LIVES = 3
/** Points per formation row, top first. */
const ROW_POINTS = [30, 20, 20, 10, 10]

export type Bug = { x: number; y: number; row: number; alive: boolean }
export type Bomb = { x: number; y: number }

export type World = {
  state: 'ready' | 'playing' | 'respawn' | 'dead'
  w: number
  h: number
  t: number
  score: number
  lives: number
  wave: number
  player: { x: number; target: number; flash: number }
  shot: { x: number; y: number } | null
  bugs: Bug[]
  dir: 1 | -1
  marchAcc: number
  frame: number
  bombs: Bomb[]
  bombAcc: number
  /** One string per shield row; '#' standing, '.' shot away. */
  shields: { x: number; y: number; px: string[] }[]
  ufo: { x: number; dir: 1 | -1; points: number } | null
  ufoAcc: number
  popped: { x: number; y: number; ttl: number; text: string }[]
  waitFor: number
  /** The pause after a wave is cleared (rather than after a hit). */
  cleared: boolean
  deadFor: number
}

export const marchMsFor = (alive: number, total: number, wave: number): number =>
  Math.max(40, (90 + 520 * (alive / Math.max(1, total))) * Math.pow(0.9, wave - 1))
export const bombMsFor = (wave: number): number => Math.max(350, 1100 - (wave - 1) * 120)

export function createWorld(rand: () => number = Math.random) {
  const w = {} as World

  const playerY = () => w.h - PLAYER_H - 1

  function formation(): void {
    const cols = Math.max(3, Math.min(8, Math.floor((w.w - 8) / (BUG_W + GAP_X))))
    // The formation starts in the top half or so, leaving Clawd room to work.
    const rows = Math.max(2, Math.min(5, Math.floor((w.h * 0.55 - 3) / (BUG_H + GAP_Y))))
    const span = cols * (BUG_W + GAP_X) - GAP_X
    const x0 = Math.floor((w.w - span) / 2)
    const y0 = 3 + Math.min(8, (w.wave - 1) * 2)
    w.bugs = []
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) w.bugs.push({ x: x0 + c * (BUG_W + GAP_X), y: y0 + r * (BUG_H + GAP_Y), row: r, alive: true })
    w.dir = 1
    w.marchAcc = 0
    w.bombs = []
    w.shot = null
  }

  function shieldsUp(): void {
    const n = w.w >= 70 ? 4 : 3
    const y = playerY() - SHIELD_H - 4
    w.shields = Array.from({ length: n }, (_, i) => ({
      x: Math.round(((i + 1) * w.w) / (n + 1) - SHIELD_W / 2),
      y,
      px: ['.#######.', '#########', '#########', '###...###'],
    }))
  }

  function reset(width: number, height: number): void {
    Object.assign(w, {
      state: 'ready',
      w: Math.max(40, Math.floor(width)),
      h: Math.max(24, Math.floor(height)),
      t: 0,
      score: 0,
      lives: LIVES,
      wave: 1,
      player: { x: 0, target: 0, flash: 0 },
      shot: null,
      bugs: [],
      dir: 1,
      marchAcc: 0,
      frame: 0,
      bombs: [],
      bombAcc: 0,
      shields: [],
      ufo: null,
      ufoAcc: 0,
      popped: [],
      waitFor: 0,
      cleared: false,
      deadFor: 0,
    } satisfies World)
    w.player.x = w.player.target = Math.floor(w.w / 2 - PLAYER_W / 2)
    formation()
    shieldsUp()
  }

  const clampX = (x: number) => Math.max(1, Math.min(w.w - PLAYER_W - 1, x))

  /** Nudges Clawd's target by `dx` pixels: each key press (or key repeat) moves him a step. */
  function move(dx: number): void {
    if (w.state === 'ready') w.state = 'playing'
    w.player.target = clampX(w.player.target + dx)
  }

  /** Sends Clawd towards an x (the pointer). */
  function moveTo(x: number): void {
    w.player.target = clampX(x - PLAYER_W / 2)
  }

  function fire(): void {
    if (w.state === 'ready') w.state = 'playing'
    if (w.state !== 'playing' || w.shot) return
    w.shot = { x: Math.round(w.player.x + PLAYER_W / 2 - 0.5), y: playerY() - 2 }
  }

  /** Knocks a pixel out of whichever shield covers (x, y); true when one did. */
  function hitShield(x: number, y: number): boolean {
    for (const s of w.shields) {
      const sx = Math.floor(x - s.x)
      const sy = Math.floor(y - s.y)
      const row = s.px[sy]
      if (row === undefined || sx < 0 || sx >= row.length || row[sx] !== '#') continue
      s.px[sy] = row.slice(0, sx) + '.' + row.slice(sx + 1)
      return true
    }
    return false
  }

  function hurt(): boolean {
    w.lives--
    w.player.flash = 1
    w.bombs = []
    w.shot = null
    if (w.lives <= 0) {
      w.state = 'dead'
      w.deadFor = 0
      return true
    }
    w.state = 'respawn'
    w.waitFor = 1.2
    return false
  }

  /** Advances the world by dt seconds; returns true on the step the run ended. */
  function update(dt: number): boolean {
    w.t += dt
    w.player.flash = Math.max(0, w.player.flash - dt * 1.5)
    for (const p of w.popped) p.ttl -= dt
    w.popped = w.popped.filter(p => p.ttl > 0)
    if (w.state === 'dead') {
      w.deadFor += dt
      return false
    }
    if (w.state === 'ready') return false
    if (w.state === 'respawn') {
      w.waitFor -= dt
      if (w.waitFor <= 0) {
        w.state = 'playing'
        w.cleared = false
      }
      return false
    }

    // Clawd glides towards his target.
    const p = w.player
    const step = PLAYER_SPEED * dt
    p.x = Math.abs(p.target - p.x) <= step ? p.target : p.x + Math.sign(p.target - p.x) * step

    const alive = w.bugs.filter(b => b.alive)
    const total = w.bugs.length

    // The march: one step every marchMs, a drop and a turn at the edges.
    w.marchAcc += dt * 1000
    const marchMs = marchMsFor(alive.length, total, w.wave)
    if (w.marchAcc >= marchMs) {
      w.marchAcc -= marchMs
      w.frame ^= 1
      const minX = Math.min(...alive.map(b => b.x))
      const maxX = Math.max(...alive.map(b => b.x + BUG_W))
      if ((w.dir > 0 && maxX + MARCH_DX > w.w - 1) || (w.dir < 0 && minX - MARCH_DX < 1)) {
        w.dir = w.dir > 0 ? -1 : 1
        for (const b of w.bugs) b.y += DROP
      } else for (const b of w.bugs) b.x += MARCH_DX * w.dir
    }

    // Bugs eat the shields they march through, and reaching Clawd's row ends it all.
    for (const b of alive) {
      for (let y = b.y; y < b.y + BUG_H; y++) for (let x = b.x; x < b.x + BUG_W; x++) hitShield(x, y)
      if (b.y + BUG_H >= playerY()) {
        w.lives = 1
        return hurt()
      }
    }

    // Clawd's ✻.
    if (w.shot) {
      w.shot.y -= SHOT_SPEED * dt
      const s = w.shot
      if (s.y < 0) w.shot = null
      else if (hitShield(s.x, s.y) || hitShield(s.x, s.y + 1)) w.shot = null
      else {
        const hit = alive.find(b => s.x >= b.x && s.x < b.x + BUG_W && s.y < b.y + BUG_H && s.y + 2 > b.y)
        if (hit) {
          hit.alive = false
          const pts = ROW_POINTS[hit.row] ?? 10
          w.score += pts
          w.popped.push({ x: hit.x + 1, y: hit.y + 1, ttl: 0.25, text: '' })
          w.shot = null
        } else if (w.ufo && s.y < UFO_H + 1 && s.x >= w.ufo.x && s.x < w.ufo.x + UFO_W) {
          w.score += w.ufo.points
          w.popped.push({ x: w.ufo.x, y: 0, ttl: 1, text: String(w.ufo.points) })
          w.ufo = null
          w.shot = null
        }
      }
    }

    // Bombs from the lowest bug of a random column.
    w.bombAcc += dt * 1000
    if (w.bombAcc >= bombMsFor(w.wave) && alive.length) {
      w.bombAcc = 0
      const cols = [...new Set(alive.map(b => b.x))]
      const x = cols[Math.floor(rand() * cols.length)] as number
      const low = alive.filter(b => b.x === x).reduce((a, b) => (b.y > a.y ? b : a))
      w.bombs.push({ x: low.x + Math.floor(BUG_W / 2), y: low.y + BUG_H })
    }
    for (const b of w.bombs) b.y += BOMB_SPEED * dt
    const py = playerY()
    let hurtNow = false
    w.bombs = w.bombs.filter(b => {
      if (b.y > w.h) return false
      if (hitShield(b.x, b.y + 1) || hitShield(b.x, b.y)) return false
      if (w.shot && Math.abs(w.shot.x - b.x) < 1 && Math.abs(w.shot.y - b.y) < 2) {
        w.shot = null
        return false
      }
      if (b.y + 2 >= py + 1 && b.y <= py + PLAYER_H && b.x >= p.x && b.x < p.x + PLAYER_W) {
        hurtNow = true
        return false
      }
      return true
    })
    if (hurtNow) return hurt()

    // The Opus ship.
    w.ufoAcc += dt
    if (!w.ufo && w.ufoAcc > 14 + rand() * 8) {
      w.ufoAcc = 0
      const dir = rand() < 0.5 ? 1 : -1
      w.ufo = { x: dir > 0 ? -UFO_W : w.w, dir, points: [50, 100, 150][Math.floor(rand() * 3)] ?? 100 }
    }
    if (w.ufo) {
      w.ufo.x += w.ufo.dir * UFO_SPEED * dt
      if (w.ufo.x < -UFO_W - 1 || w.ufo.x > w.w + 1) w.ufo = null
    }

    // A cleared wave: the next one starts lower and quicker, shields rebuilt.
    if (!w.bugs.some(b => b.alive)) {
      w.wave++
      formation()
      shieldsUp()
      w.state = 'respawn'
      w.waitFor = 1.5
      w.cleared = true
    }
    return false
  }

  return { world: w, reset, move, moveTo, fire, update, playerY }
}
