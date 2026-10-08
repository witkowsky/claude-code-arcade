// The Chrome "no internet" runner, drawn in half-block pixels by the surface itself, in one of
// two skins: Clawd in Claude's colours hopping pipes and dodging bugs ("claude"), or Chrome's
// grey T-Rex among cacti and pterodactyls ("chrome"). Chrome's own rules either way (speed 6 ->
// 13 px/frame, accel 0.001, gravity 0.6, jump -10, gap = width*speed + minGap*0.6 .. x1.5,
// flyers from speed 8.5, night every 700 points), scaled by K to a runner 12-15 pixels tall.
// Space/↑/click jumps, ↓ ducks.
import type { ClientModule, ClientSurface } from 'claude-code'

import type { DinoProps, DinoTheme } from '../types'
import type { Frame, Run } from './pixels'
import { canvas, cells, digits, fill, frame, mix, rect, sprite, squash } from './pixels'

const K = 1 / 3
const GRAVITY = 0.6 * K
const JUMP_V = -10 * K
const DROP_V = -5 * K
const SPEED0 = 6
const SPEED_MAX = 13
const ACCEL = 0.001
const PTERO_SPEED = 8.5

type Art = readonly string[]

// ---------- chrome: the T-Rex, cacti, pterodactyls ----------

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

// ---------- claude: Clawd, pipes, bugs ----------

// Clawd, the Claude Code mascot: the logo's ▐▛███▜▌ blocks at twice the size, 12 pixels tall so
// the middle bug still needs a duck. X body, E eyes; arms up in the air, x eyes when he crashes.
const BODY = '..XXXXXXXXXXXX..'
const ARMS = 'XXXXXXXXXXXXXXXX'
const EYES = '..XXEXXXXXXEXX..'
const LEGS = '...X.X....X.X...'
const CLAWD_RUN_A = [BODY, BODY, EYES, EYES, BODY, ARMS, ARMS, BODY, BODY, BODY, LEGS, '...X........X...']
const CLAWD_RUN_B = [...CLAWD_RUN_A.slice(0, 11), '.....X....X.....']
const CLAWD_STAND = [...CLAWD_RUN_A.slice(0, 11), LEGS]
const CLAWD_JUMP = [BODY, BODY, 'XXXXEXXXXXXEXXXX', 'XXXXEXXXXXXEXXXX', BODY, BODY, BODY, BODY, BODY, BODY, LEGS, LEGS]
const CLAWD_DEAD = [BODY, '..XEXEXXXXEXEX..', EYES, '..XEXEXXXXEXEX..', BODY, ARMS, ARMS, BODY, BODY, BODY, LEGS, LEGS]
const CLAWD_DUCK_A = [
  '...XXXXXXXXXXXX...',
  '...XXEXXXXXXEXX...',
  '...XXXXXXXXXXXX...',
  'XXXXXXXXXXXXXXXXXX',
  '...XXXXXXXXXXXX...',
  '....X.X....X.X....',
  '....X........X....',
]
const CLAWD_DUCK_B = [...CLAWD_DUCK_A.slice(0, 6), '......X....X......']
// Clawd for the desktop's tall cells (about 0.6 wide per 1 tall), drawn after the squash so his
// eyes stay: one row of legs, closed eyes when he crashes.
const CELL_RUN_A = [BODY, EYES, BODY, ARMS, BODY, BODY, '...X........X...']
const CELL_RUN_B = [...CELL_RUN_A.slice(0, 6), '.....X....X.....']
const CELL_STAND = [...CELL_RUN_A.slice(0, 6), LEGS]
const CELL_JUMP = [BODY, 'XXXXEXXXXXXEXXXX', BODY, BODY, BODY, BODY, LEGS]
const CELL_DEAD = [BODY, '..XEEEXXXXEEEX..', BODY, ARMS, BODY, BODY, LEGS]
const CELL_DUCK_A = ['...XXEXXXXXXEXX...', 'XXXXXXXXXXXXXXXXXX', '...XXXXXXXXXXXX...', '....X........X....']
const CELL_DUCK_B = [...CELL_DUCK_A.slice(0, 3), '......X....X......']
// Flappy Claude's pipes, cut down to the cacti's footprint: D lip, L light edge, P pipe, dark edge.
const PIPE_S = ['DDDDD', 'DDDDD', ...new Array<string>(10).fill('.LPD.')]
const PIPE_L = ['DDDDDDD', 'DDDDDDD', ...new Array<string>(14).fill('.LPPPD.')]
// A bug in place of the pterodactyl, flying left: B body, E eye, W wings up and down.
const BUG_UP = [
  '.....WWW.WWW..',
  '....WWWWWWWW..',
  'B.B..WWWWWW...',
  '.BBBBBBBBBBB..',
  'BEBBBBBBBBBBBB',
  'BBBBBBBBBBBBB.',
  '.BBBBBBBBBBB..',
  '...B.B.B.B....',
]
const BUG_DOWN = ['..............', '..............', 'B.B...........', '.BBBBBBBBBBB..', 'BEBBBBBBBBBBBB', 'BBBBBBBBBBBBB.', '.BBBBWWWWWWW..', '...BWWWWWWW...']

const ORANGE = '#D77757' // Claude Code's own "claude" theme colour
const INK = '#141413'

// Claude Code-ish spinner words, shown as the run goes on.
const VERBS = ['Clauding', 'Flibbertigibbeting', 'Noodling', 'Percolating', 'Schlepping', 'Moseying', 'Booping', 'Finagling', 'Pondering', 'Vibing', 'Honking', 'Zigzagging']

// ---------- skins ----------

type Look = { run: [Art, Art]; stand: Art; jump: Art; dead: Art; duck: [Art, Art] }
type Colours = {
  sky: [string, string] // top, just above the ground
  ground: string | null // below the ground line; null leaves the sky
  line: string
  pebble: string
  cloud: string
  runner: Record<string, string>
  obstacle: Record<string, string>
  score: string
  best: string
}
type Skin = {
  look: Look
  cells: Look | null // a desktop-cell runner drawn after the squash; null squashes it with the rest
  box: { stand: [number, number]; duck: [number, number] } // the runner's collision box, w x h
  feet: number // how many rows the runner's sprite overlaps the ground line
  small: Art
  large: Art
  fly: [Art, Art]
  colours: (night: boolean) => Colours
}

const SKINS: Record<DinoTheme, Skin> = {
  chrome: {
    look: { run: [RUN_A, RUN_B], stand: STAND, jump: STAND, dead: DEAD, duck: [DUCK_A, DUCK_B] },
    cells: null,
    box: { stand: [13, 15], duck: [17, 7] },
    feet: 1,
    small: CACTUS_S,
    large: CACTUS_L,
    fly: [PTERO_A, PTERO_B],
    colours: night => {
      const bg = night ? '#202124' : '#f7f7f7'
      const fg = night ? '#acacac' : '#535353'
      return { sky: [bg, bg], ground: null, line: fg, pebble: fg, cloud: night ? '#3c4043' : '#dadada', runner: { X: fg }, obstacle: { X: fg }, score: fg, best: night ? '#757575' : '#a0a0a0' }
    },
  },
  claude: {
    look: { run: [CLAWD_RUN_A, CLAWD_RUN_B], stand: CLAWD_STAND, jump: CLAWD_JUMP, dead: CLAWD_DEAD, duck: [CLAWD_DUCK_A, CLAWD_DUCK_B] },
    cells: { run: [CELL_RUN_A, CELL_RUN_B], stand: CELL_STAND, jump: CELL_JUMP, dead: CELL_DEAD, duck: [CELL_DUCK_A, CELL_DUCK_B] },
    box: { stand: [15, 12], duck: [17, 7] },
    feet: 0,
    small: PIPE_S,
    large: PIPE_L,
    fly: [BUG_UP, BUG_DOWN],
    colours: night =>
      night
        ? {
            sky: ['#1F1E1D', '#262624'],
            ground: '#3D3D3A',
            line: ORANGE,
            pebble: '#5A5955',
            cloud: '#30302E',
            runner: { X: ORANGE, E: INK },
            obstacle: { D: '#8A877F', L: '#D6D2C6', P: '#B1ADA1', B: '#B1ADA1', W: '#6B6A65', E: '#1F1E1D' },
            score: '#F0EEE6',
            best: '#6B6A65',
          }
        : {
            sky: ['#F0EEE6', '#E6D9C6'],
            ground: '#B1ADA1',
            line: ORANGE,
            pebble: '#9C9890',
            cloud: '#FFFFFF',
            runner: { X: ORANGE, E: INK },
            obstacle: { D: '#262624', L: '#6B6A65', P: '#3D3D3A', B: '#3D3D3A', W: '#B1ADA1', E: '#F0EEE6' },
            score: INK,
            best: '#9C9890',
          },
  },
}

// ---------- the world ----------

type Kind = 'small' | 'large' | 'ptero'
type Obstacle = { kind: Kind; x: number; y: number; w: number; h: number; count: number; gap: number }
type World = {
  state: 'ready' | 'running' | 'crashed'
  y: number // the runner's height above the ground (0 = on it), pixels
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
type State = { w: World; seen: number; surface: DinoProps['surface']; theme: DinoTheme; lag: number | null; posted: boolean; tick: number }

function fresh(): World {
  return { state: 'ready', y: 0, vy: 0, duckFor: 0, speed: SPEED0, distance: 0, obstacles: [], clouds: [{ x: 20, y: 4 }, { x: 55, y: 8 }], frames: 0, deadFor: 0, bumps: [] }
}

const score = (w: World) => Math.floor(w.distance * 0.025)
const isNight = (w: World) => Math.floor(score(w) / 700) % 2 === 1

function dims(surface: ClientSurface<State>, kind: DinoProps['surface']) {
  const c = canvas(kind, Math.max(30, surface.columns || 70), Math.max(8, surface.rows || 22))
  return { ...c, gy: c.ph - 5 }
}

function spawn(w: World, pw: number, skin: Skin): void {
  const kinds: Kind[] = w.speed >= PTERO_SPEED ? ['small', 'large', 'ptero'] : ['small', 'large']
  const kind = kinds[Math.floor(Math.random() * kinds.length)] as Kind
  const size = kind === 'ptero' ? 1 : 1 + Math.floor(Math.random() * (w.speed > 7 ? 3 : w.speed > 6.5 ? 2 : 1))
  const base = kind === 'ptero' ? skin.fly[0] : kind === 'small' ? skin.small : skin.large
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

/** One 60 fps frame of Chrome's runner; returns true on the frame the runner crashed. */
function step(w: World, pw: number, skin: Skin): boolean {
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
  if (!last || last.x + last.w + last.gap < pw) spawn(w, pw, skin)
  for (const c of w.clouds) c.x -= dx * 0.2
  w.clouds = w.clouds.filter(c => c.x > -8)
  if (w.clouds.length < 3 && Math.random() < 0.004) w.clouds.push({ x: pw + 2, y: 2 + Math.floor(Math.random() * 8) })

  // Collision: the runner's box (inset a pixel) against each obstacle's.
  const ducking = w.duckFor > 0 && w.y === 0
  const [dw, dh] = ducking ? skin.box.duck : skin.box.stand
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
  for (let i = 0; i < 2; i++) crashed = step(s.w, pw, SKINS[s.theme]) || crashed
  if (crashed && !s.posted) {
    s.posted = true
    surface.post({ game: 'dino', score: score(s.w) })
  }
  surface.setState({ ...s, tick: s.tick + 1 })
}

// ---------- drawing ----------

function pose(w: World, look: Look): Art {
  const ducking = w.duckFor > 0 && w.y === 0 && w.state === 'running'
  const alt = Math.floor(w.frames / 6) % 2 === 0 ? 0 : 1
  if (w.state === 'crashed') return look.dead
  if (w.state === 'ready') return look.stand
  if (ducking) return look.duck[alt]
  return w.y > 0 ? look.jump : look.run[alt]
}

/** The scene in square pixels, and the runner too unless the desktop draws it after the squash. */
function draw(s: State, skin: Skin, c: Colours, best: number, pw: number, ph: number, gy: number, isCells: boolean, withRunner: boolean): Frame {
  const w = s.w
  const f = frame(pw, ph, c.sky[0])
  if (c.sky[1] !== c.sky[0]) for (let y = 1; y < gy; y++) fill(f, 0, y, pw, 1, mix(c.sky[0], c.sky[1], y / gy))
  if (c.ground) fill(f, 0, gy + 1, pw, ph - gy - 1, c.ground)

  for (const cl of w.clouds) sprite(f, CLOUD, { X: c.cloud }, cl.x, cl.y)

  // Ground line with a few scrolling bumps and pebbles.
  rect(f, 0, gy, pw, 1, c.line)
  const off = Math.floor(w.distance * K) % 13
  for (let x = -off; x < pw; x += 13) {
    rect(f, x, gy + 2, 2, 1, c.pebble)
    rect(f, x + 7, gy + 3, 1, 1, c.pebble)
  }

  for (const o of w.obstacles) {
    const top = gy - o.y - o.h
    if (o.kind === 'ptero') sprite(f, skin.fly[Math.floor(w.frames / 10) % 2 ? 0 : 1], c.obstacle, o.x, top)
    else {
      const art = o.kind === 'small' ? skin.small : skin.large
      const cw = (art[0] ?? '').length + 1
      for (let i = 0; i < o.count; i++) sprite(f, art, c.obstacle, o.x + i * cw, top)
    }
  }

  if (withRunner) {
    const art = pose(w, skin.look)
    sprite(f, art, c.runner, 4, gy - Math.round(w.y) - art.length + skin.feet)
  }

  // The desktop squashes pixel rows into its taller cells, where 3x5 digits blur: its HUD has the score.
  if (!isCells) {
    const now = String(score(w)).padStart(5, '0')
    const nx = pw - now.length * 4 - 1
    digits(f, now, nx, 1, c.score)
    digits(f, String(best).padStart(5, '0'), nx - 4 * 6 - 2, 1, c.best)
  }
  return f
}

/** The desktop cell row that squash() folds square-pixel row `y` into. */
function cellRow(y: number, ph: number, rows: number): number {
  let r = Math.floor((y * rows) / ph)
  while (r + 1 < rows && Math.floor(((r + 1) * ph) / rows) <= y) r++
  return r
}

function render(s: State, surface: ClientSurface<State>, best: number): Run[][] {
  const d = dims(surface, s.surface)
  const skin = SKINS[s.theme]
  const c = skin.colours(isNight(s.w))
  const late = d.isCells && skin.cells
  const f = draw(s, skin, c, best, d.pw, d.ph, d.gy, d.isCells, !late)
  if (!late) return d.toRuns(f)
  // Squashed with the rest, Clawd's eyes would fold into his body: he goes on after, at cell scale.
  const g = squash(f, d.rows)
  const art = pose(s.w, late)
  const bottom = cellRow(d.gy - 1 - Math.round(s.w.y), d.ph, d.rows)
  sprite(g, art, c.runner, 4, bottom - art.length + 1)
  return cells(g)
}

function words(s: State, best: number): { hud: string; hint: string } {
  const w = s.w
  const lag = s.lag !== null ? `  slap→jump ${s.lag}ms` : ''
  if (s.theme === 'chrome') {
    const hint = w.state === 'ready' ? 'No internet. Click here, then SPACE to jump, ↓ to duck' : w.state === 'crashed' ? 'G A M E   O V E R · SPACE to restart' : ''
    return { hud: `HI ${String(best).padStart(5, '0')}  ${String(score(w)).padStart(5, '0')}${lag}`, hint }
  }
  const n = score(w)
  const hint =
    w.state === 'ready'
      ? "Clawd's offline. Click here, then SPACE to jump, ↓ to duck"
      : w.state === 'crashed'
        ? `crashed at ${n} · SPACE to run again`
        : n >= 50
          ? `✻ ${VERBS[Math.floor(n / 50) % VERBS.length] ?? 'Clauding'}…`
          : ''
  return { hud: `★ ${n}  best ${best}${lag}`, hint }
}

const Dino: ClientModule<DinoProps, State> = (props, surface) => {
  let s = surface.state
  if (!s) {
    s = { w: fresh(), seen: props.hit.n, surface: props.surface, theme: props.theme, lag: null, posted: false, tick: 0 }
    surface.setState(s)
    surface.every(33, () => tick(surface))
    surface.onKey(k => {
      if (k.key === ' ' || k.key === 'space' || k.key === 'up' || k.key === 'return' || k.key === 'w') act(surface, 'jump')
      else if (k.key === 'down' || k.key === 's') act(surface, 'duck')
    })
    surface.onPointer(p => {
      if (p.type === 'down') act(surface, 'jump')
    })
  } else {
    // The theme option changed under a live pane: the new runner starts a new run.
    if (props.theme !== s.theme) {
      s.theme = props.theme
      s.w = fresh()
      s.posted = false
    }
    if (props.hit.n !== s.seen) {
      if (props.hit.n > s.seen) {
        act(surface, 'jump', props.hit.tier === 'wallop' ? 1.15 : 1)
        if (props.hit.at > 0) s.lag = Math.max(0, Date.now() - props.hit.at)
      }
      s.seen = props.hit.n
    }
  }

  const { Box, Text } = surface.elements
  const best = Math.max(props.best, s.w.state === 'crashed' ? score(s.w) : 0)
  const lines = render(s, surface, best)
  const { hud, hint } = words(s, best)
  const isCells = s.surface === 'desktop'

  return (
    <Box flexDirection="column">
      {lines.map(line => (
        <Box flexDirection="row">
          {line.map(r =>
            isCells ? (
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
        {s.theme === 'claude' ? <Text color="claude">{hud}</Text> : <Text dimColor>{hud}</Text>}
        <Text dimColor>{hint ? `  ${hint}` : ''}</Text>
      </Text>
    </Box>
  )
}

export default Dino
