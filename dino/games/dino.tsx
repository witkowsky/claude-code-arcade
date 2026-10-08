// The Chrome "no internet" T-Rex, drawn in half-block pixels by the surface itself.
// Chrome's own rules (speed 6 -> 13 px/frame, accel 0.001, gravity 0.6, jump -10,
// gap = width*speed + minGap*0.6 .. x1.5, pterodactyls from speed 8.5, night every
// 700 points), scaled by K to a dino 15 pixels tall. Space/↑/click/slap jumps, ↓ ducks.
import type { ClientModule, ClientSurface } from 'claude-code'

import type { DinoProps } from '../types'
import type { Frame } from './pixels'
import { canvas, digits, frame, rect, sprite } from './pixels'

const K = 1 / 3
const GRAVITY = 0.6 * K
const JUMP_V = -10 * K
const DROP_V = -5 * K
const SPEED0 = 6
const SPEED_MAX = 13
const ACCEL = 0.001
const PTERO_SPEED = 8.5

const RUN_A = [
  '.......XXXXXX.',
  '......XX.XXXXX',
  '......XXXXXXXX',
  '......XXXXX...',
  '......XXXXXXX.',
  'X....XXXX.....',
  'X...XXXXXXX...',
  'XX.XXXXXX.X...',
  'XXXXXXXXX.....',
  '.XXXXXXXX.....',
  '..XXXXXXX.....',
  '...XXXXX......',
  '....X..XX.....',
  '....X.........',
  '....XX........',
]
const RUN_B = [...RUN_A.slice(0, 12), '...XX..X......', '.......X......', '.......XX.....']
const STAND = [...RUN_A.slice(0, 12), '...XX..XX.....', '...X....X.....', '...XX...XX....']
const DEAD = ['.......XXXXXX.', '......X.X.XXXX', '......XX.XXXXX', '......X.XXXXXX', ...RUN_A.slice(4, 12), '...XX..XX.....', '...X....X.....', '...XX...XX....']
const DUCK_A = [
  'X..........XXXXXX.',
  'XXX...XXXXXX.XXXXX',
  '.XXXXXXXXXXXXXXXXX',
  '..XXXXXXXXXXXXX...',
  '...XXXXXXXXX.XX...',
  '....X..XX.........',
  '....XX............',
]
const DUCK_B = [...DUCK_A.slice(0, 5), '...XX..X..........', '........XX........']
const CACTUS_S = ['..X..', '..X..', 'X.X..', 'X.X.X', 'X.X.X', 'XXX.X', '..XXX', '..X..', '..X..', '..X..', '..X..', '..X..']
const CACTUS_L = ['...X...', '..XXX..', 'X.XXX..', 'X.XXX.X', 'X.XXX.X', 'X.XXX.X', 'XXXXX.X', '.XXXXXX', '..XXX..', '..XXX..', '..XXX..', '..XXX..', '..XXX..', '..XXX..', '..XXX..', '..XXX..']
const PTERO_A = ['....X.........', '....XX........', '..X.XXX.......', '.XX.XXXX......', 'XXXXXXXXXXXX..', '......XXXXXXXX', '......XXXXX...', '.......XXX....']
const PTERO_B = ['..............', '..X...........', '.XX...........', 'XXXXXXXXXXXX..', '....XXXXXXXXXX', '....XXXXXX....', '....XXX.......', '....XX........']
const CLOUD = ['..XXX..', '.XXXXXX', 'XXXXXXX']

type Kind = 'small' | 'large' | 'ptero'
type Obstacle = { kind: Kind; x: number; y: number; w: number; h: number; count: number; gap: number }
type World = {
  state: 'ready' | 'running' | 'crashed'
  y: number // dino's height above the ground (0 = on it), pixels
  vy: number
  duckFor: number
  speed: number // Chrome px/frame at 1x
  distance: number // Chrome px at 1x
  obstacles: Obstacle[]
  clouds: { x: number; y: number }[]
  frames: number
  deadFor: number
  bumps: number[]
}
type State = { w: World; seen: number; surface: DinoProps['surface']; lag: number | null; posted: boolean; tick: number }

function fresh(): World {
  return { state: 'ready', y: 0, vy: 0, duckFor: 0, speed: SPEED0, distance: 0, obstacles: [], clouds: [{ x: 20, y: 4 }, { x: 55, y: 8 }], frames: 0, deadFor: 0, bumps: [] }
}

const score = (w: World) => Math.floor(w.distance * 0.025)

function dims(surface: ClientSurface<State>, kind: DinoProps['surface']) {
  const c = canvas(kind, Math.max(30, surface.columns || 70), Math.max(8, surface.rows || 22))
  return { ...c, gy: c.ph - 5 }
}

function spawn(w: World, pw: number): void {
  const kinds: Kind[] = w.speed >= PTERO_SPEED ? ['small', 'large', 'ptero'] : ['small', 'large']
  const kind = kinds[Math.floor(Math.random() * kinds.length)] as Kind
  const size = kind === 'ptero' ? 1 : 1 + Math.floor(Math.random() * (w.speed > 7 ? 3 : w.speed > 6.5 ? 2 : 1))
  const base = kind === 'ptero' ? PTERO_A : kind === 'small' ? CACTUS_S : CACTUS_L
  const sw = (base[0] ?? '').length
  const width1x = kind === 'ptero' ? 46 : (kind === 'small' ? 17 : 25) * size
  const minGap = Math.round(width1x * w.speed + (kind === 'ptero' ? 150 : 120) * 0.6)
  const gap = (minGap + Math.random() * minGap * 0.5) * K
  const y = kind === 'ptero' ? [0, 8.4, 16.7][Math.floor(Math.random() * 3)] ?? 0 : 0
  w.obstacles.push({ kind, x: pw + 2, y, w: kind === 'ptero' ? sw : size * (sw + 1) - 1, h: base.length, count: size, gap })
}

function jump(w: World, power: number): void {
  if (w.state === 'ready') w.state = 'running'
  if (w.state !== 'running' || w.y > 0) return
  w.duckFor = 0
  w.vy = JUMP_V * power
}

function act(surface: ClientSurface<State>, what: 'jump' | 'duck', power = 1): void {
  const s = surface.state
  if (!s) return
  const w = s.w
  if (w.state === 'crashed') {
    if (w.deadFor < 0.5 || what === 'duck') return
    s.w = fresh()
    s.w.state = 'running'
    s.posted = false
    return
  }
  if (what === 'jump') jump(w, power)
  else if (w.y > 0) w.vy = Math.max(w.vy, -DROP_V) // fast drop
  else w.duckFor = 0.45
}

/** One 60 fps frame of Chrome's runner; returns true on the frame the dino crashed. */
function step(w: World, pw: number): boolean {
  w.frames++
  if (w.state === 'crashed') {
    w.deadFor += 1 / 60
    return false
  }
  if (w.state === 'ready') return false
  w.speed = Math.min(SPEED_MAX, w.speed + ACCEL)
  w.distance += w.speed
  const dx = w.speed * K
  if (w.y > 0 || w.vy !== 0) {
    w.vy += GRAVITY
    w.y -= w.vy
    if (w.y <= 0) {
      w.y = 0
      w.vy = 0
    }
  }
  w.duckFor = Math.max(0, w.duckFor - 1 / 60)
  for (const o of w.obstacles) o.x -= o.kind === 'ptero' ? dx * 1.1 : dx
  w.obstacles = w.obstacles.filter(o => o.x + o.w > -2)
  const last = w.obstacles[w.obstacles.length - 1]
  if (!last || last.x + last.w + last.gap < pw) spawn(w, pw)
  for (const c of w.clouds) c.x -= dx * 0.2
  w.clouds = w.clouds.filter(c => c.x > -8)
  if (w.clouds.length < 3 && Math.random() < 0.004) w.clouds.push({ x: pw + 2, y: 2 + Math.floor(Math.random() * 8) })

  // Collision: the dino's box (inset a pixel) against each obstacle's.
  const ducking = w.duckFor > 0 && w.y === 0
  const dw = ducking ? 17 : 13
  const dh = ducking ? 7 : 15
  const d = { x0: 4 + 1, x1: 4 + dw - 1, y0: w.y + 1, y1: w.y + dh - 1 }
  for (const o of w.obstacles) {
    const ox0 = o.x + 1
    const ox1 = o.x + o.w - 1
    const oy0 = o.y + 1
    const oy1 = o.y + o.h - 1
    if (d.x1 > ox0 && d.x0 < ox1 && d.y1 > oy0 && d.y0 < oy1) {
      w.state = 'crashed'
      w.deadFor = 0
      return true
    }
  }
  return false
}

function tick(surface: ClientSurface<State>): void {
  const s = surface.state
  if (!s) return
  const { pw } = dims(surface, s.surface)
  let crashed = false
  for (let i = 0; i < 2; i++) crashed = step(s.w, pw) || crashed
  if (crashed && !s.posted) {
    s.posted = true
    surface.post({ game: 'dino', score: score(s.w) })
  }
  surface.setState({ ...s, tick: s.tick + 1 })
}

function draw(s: State, best: number, pw: number, ph: number, gy: number, isCells: boolean): Frame {
  const w = s.w
  const night = Math.floor(score(w) / 700) % 2 === 1
  const bg = night ? '#202124' : '#f7f7f7'
  const fg = night ? '#acacac' : '#535353'
  const cloud = night ? '#3c4043' : '#dadada'
  const f = frame(pw, ph, bg)

  for (const c of w.clouds) sprite(f, CLOUD, { X: cloud }, c.x, c.y)

  // Ground line with a few scrolling bumps and pebbles.
  rect(f, 0, gy, pw, 1, fg)
  const off = Math.floor(w.distance * K) % 13
  for (let x = -off; x < pw; x += 13) {
    rect(f, x, gy + 2, 2, 1, fg)
    rect(f, x + 7, gy + 3, 1, 1, fg)
  }

  for (const o of w.obstacles) {
    const top = gy - o.y - o.h
    if (o.kind === 'ptero') sprite(f, Math.floor(w.frames / 10) % 2 ? PTERO_A : PTERO_B, { X: fg }, o.x, top)
    else {
      const art = o.kind === 'small' ? CACTUS_S : CACTUS_L
      const cw = (art[0] ?? '').length + 1
      for (let i = 0; i < o.count; i++) sprite(f, art, { X: fg }, o.x + i * cw, top)
    }
  }

  const ducking = w.duckFor > 0 && w.y === 0 && w.state === 'running'
  const alt = Math.floor(w.frames / 6) % 2 === 0
  const art =
    w.state === 'crashed' ? DEAD : w.state === 'ready' ? STAND : ducking ? (alt ? DUCK_A : DUCK_B) : w.y > 0 ? STAND : alt ? RUN_A : RUN_B
  sprite(f, art, { X: fg }, 4, gy - Math.round(w.y) - art.length + 1)

  // The desktop squashes pixel rows into its taller cells, where 3x5 digits blur: its HUD has the score.
  if (!isCells) {
    const now = String(score(w)).padStart(5, '0')
    const nx = pw - now.length * 4 - 1
    digits(f, now, nx, 1, fg)
    digits(f, String(best).padStart(5, '0'), nx - 4 * 6 - 2, 1, night ? '#757575' : '#a0a0a0')
  }
  return f
}

const Dino: ClientModule<DinoProps, State> = (props, surface) => {
  let s = surface.state
  if (!s) {
    s = { w: fresh(), seen: props.hit.n, surface: props.surface, lag: null, posted: false, tick: 0 }
    surface.setState(s)
    surface.every(33, () => tick(surface))
    surface.onKey(k => {
      if (k.key === ' ' || k.key === 'space' || k.key === 'up' || k.key === 'return' || k.key === 'w') act(surface, 'jump')
      else if (k.key === 'down' || k.key === 's') act(surface, 'duck')
    })
    surface.onPointer(p => {
      if (p.type === 'down') act(surface, 'jump')
    })
  } else if (props.hit.n !== s.seen) {
    if (props.hit.n > s.seen) {
      act(surface, 'jump', props.hit.tier === 'wallop' ? 1.15 : 1)
      if (props.hit.at > 0) s.lag = Math.max(0, Date.now() - props.hit.at)
    }
    s.seen = props.hit.n
  }

  const { Box, Text } = surface.elements
  const d = dims(surface, props.surface)
  const best = Math.max(props.best, s.w.state === 'crashed' ? score(s.w) : 0)
  const lines = d.toRuns(draw(s, best, d.pw, d.ph, d.gy, d.isCells))
  const hint =
    s.w.state === 'ready'
      ? 'No internet. Click here, then SPACE to jump, ↓ to duck · or slap the MacBook'
      : s.w.state === 'crashed'
        ? 'G A M E   O V E R · SPACE / slap to restart'
        : ''
  const hud = `HI ${String(best).padStart(5, '0')}  ${String(score(s.w)).padStart(5, '0')}${s.lag !== null ? `  slap→jump ${s.lag}ms` : ''}`

  return (
    <Box flexDirection="column">
      {lines.map(line => (
        <Box flexDirection="row">
          {line.map(r =>
            d.isCells ? (
              <Text backgroundColor={r.bg}>{' '.repeat(r.n)}</Text>
            ) : (
              <Text color={r.fg} backgroundColor={r.bg}>
                {'▀'.repeat(r.n)}
              </Text>
            ),
          )}
        </Box>
      ))}
      <Text wrap="truncate-end">
        <Text dimColor>{hud}</Text>
        <Text dimColor>{hint ? `  ${hint}` : ''}</Text>
      </Text>
    </Box>
  )
}

export default Dino
