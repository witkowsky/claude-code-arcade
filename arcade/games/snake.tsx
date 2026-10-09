// Clawd Snake: Clawd, the Claude Code mascot, stretched into a snake, eating ✻ tokens on a
// Claude-cream board. The surface runs the game itself (a Client module): its own 30 fps
// clock, arrows / WASD / hjkl to steer, a click to turn towards it, Space to pause.
import type { ClientModule, ClientSurface } from 'claude-code'

import type { SnakeProps } from '../types'
import type { Dir } from './snake-engine'
import { createWorld } from './snake-engine'
import type { Frame, Run } from './pixels'
import { cells, frame, halfBlocks, mix, rect } from './pixels'

const ORANGE = '#D77757' // Claude Code's own "claude" theme colour
const ORANGE_DARK = '#C4633F'
const INK = '#141413'
const CREAM = '#F0EEE6'
const MARGIN = '#E6D9C6'
const WALL = '#3D3D3A'
const TOKEN = '#B8532E'
const TOKEN_GLOW = '#EBA88D'
const OPUS = INK
const WHITE = '#FFFFFF'

// Claude Code-ish spinner words, shown every few tokens.
const VERBS = ['Clauding', 'Slithering', 'Noodling', 'Percolating', 'Schlepping', 'Moseying', 'Booping', 'Finagling', 'Pondering', 'Vibing', 'Honking', 'Zigzagging']

type Game = ReturnType<typeof createWorld>
type State = { game: Game; surface: SnakeProps['surface']; posted: boolean; tick: number }

const DT = 1 / 30

/**
 * The board for this region, one row kept for the HUD. A grid cell is CW x CH pixels:
 * terminal pixels are half a cell tall (3 x 3 is square), desktop pixels are whole cells
 * about 0.6 as wide as tall (3 x 2 is near enough square).
 */
function layout(surface: ClientSurface<State>, kind: SnakeProps['surface']) {
  const pw = Math.max(30, surface.columns || 60)
  const bodyRows = Math.max(6, (surface.rows || 22) - 1)
  const ph = kind === 'desktop' ? bodyRows : bodyRows * 2
  const cw = 3
  const ch = kind === 'desktop' ? 2 : 3
  const cols = Math.floor((pw - 2) / cw)
  const rows = Math.floor((ph - 2) / ch)
  return { pw, ph, cw, ch, cols, rows }
}

function fresh(surface: ClientSurface<State>, s: State): void {
  const L = layout(surface, s.surface)
  s.game.reset(L.cols, L.rows)
  s.posted = false
}

/** The board fits a new pane size between runs; mid-run it keeps its size. */
function fit(surface: ClientSurface<State>, s: State): void {
  const w = s.game.world
  const L = layout(surface, s.surface)
  if (w.state === 'ready' && (w.cols !== L.cols || w.rows !== L.rows)) fresh(surface, s)
}

function steer(surface: ClientSurface<State>, d: Dir): void {
  const s = surface.state
  if (!s) return
  const w = s.game.world
  if (w.state === 'dead') {
    if (w.deadFor < 0.5) return
    fresh(surface, s)
  }
  fit(surface, s)
  s.game.turn(d)
}

function space(surface: ClientSurface<State>): void {
  const s = surface.state
  if (!s) return
  const w = s.game.world
  if (w.state === 'dead') {
    if (w.deadFor < 0.5) return
    fresh(surface, s)
    return
  }
  fit(surface, s)
  s.game.togglePause()
}

const KEYS: Record<string, Dir> = { up: 'up', down: 'down', left: 'left', right: 'right', w: 'up', s: 'down', a: 'left', d: 'right', k: 'up', j: 'down', h: 'left', l: 'right' }

/** Where the board sits on the frame: its top-left pixel. */
function origin(L: ReturnType<typeof layout>, cols: number, rows: number) {
  return { ox: Math.floor((L.pw - cols * L.cw) / 2), oy: Math.floor((L.ph - rows * L.ch) / 2) }
}

/** A click turns the snake towards it, across its current heading. */
function click(surface: ClientSurface<State>, cx: number, cy: number): void {
  const s = surface.state
  if (!s) return
  const w = s.game.world
  if (w.state === 'ready' || w.state === 'dead' || w.state === 'paused') return space(surface)
  const L = layout(surface, s.surface)
  const { ox, oy } = origin(L, w.cols, w.rows)
  const px = cx
  const py = s.surface === 'desktop' ? cy : cy * 2 + 1
  const head = w.snake[0]
  if (!head) return
  const hx = ox + head.x * L.cw + L.cw / 2
  const hy = oy + head.y * L.ch + L.ch / 2
  const last = w.queue[w.queue.length - 1] ?? w.dir
  if (last === 'left' || last === 'right') s.game.turn(py < hy ? 'up' : 'down')
  else s.game.turn(px < hx ? 'left' : 'right')
}

function tick(surface: ClientSurface<State>): void {
  const s = surface.state
  if (!s) return
  const ended = s.game.update(DT)
  if (ended && !s.posted) {
    s.posted = true
    surface.post({ game: 'snake', score: s.game.world.score })
  }
  surface.setState({ ...s, tick: s.tick + 1 })
}

/** Clawd's two eyes on the leading edge of the head cell. */
function eyes(d: Dir, cw: number, ch: number): [number, number][] {
  if (d === 'right') return [[cw - 1, 0], [cw - 1, ch - 1]]
  if (d === 'left') return [[0, 0], [0, ch - 1]]
  if (d === 'up') return [[0, 0], [cw - 1, 0]]
  return [[0, ch - 1], [cw - 1, ch - 1]]
}

function draw(s: State, surface: ClientSurface<State>): Run[][] {
  const L = layout(surface, s.surface)
  const w = s.game.world
  const f: Frame = frame(L.pw, L.ph, MARGIN)
  const { ox, oy } = origin(L, w.cols, w.rows)
  const bw = w.cols * L.cw
  const bh = w.rows * L.ch

  // Board: a wall line around a plain cream field (a checker would split every row into
  // dozens of runs and push the tree past its size limit).
  rect(f, ox - 1, oy - 1, bw + 2, bh + 2, WALL, true)
  rect(f, ox, oy, bw, bh, CREAM, true)

  const at = (x: number, y: number, dx: number, dy: number, c: string) => rect(f, ox + x * L.cw + dx, oy + y * L.ch + dy, 1, 1, c)
  const cell = (x: number, y: number, c: string) => rect(f, ox + x * L.cw, oy + y * L.ch, L.cw, L.ch, c)

  // ✻ token: a dark plus with glowing corners that pulse.
  const glow = Math.floor(w.t * 3) % 2 ? TOKEN_GLOW : mix(TOKEN_GLOW, CREAM, 0.5)
  for (let dy = 0; dy < L.ch; dy++)
    for (let dx = 0; dx < L.cw; dx++) {
      const plus = L.ch === 3 ? dx === 1 || dy === 1 : (dx + dy) % 2 === 1
      at(w.food.x, w.food.y, dx, dy, plus ? TOKEN : glow)
    }

  // Opus token: ink with an orange heart, blinking in its last two seconds.
  if (w.bonus && (w.bonus.ttl > 2 || Math.floor(w.t * 8) % 2 === 0)) {
    cell(w.bonus.at.x, w.bonus.at.y, OPUS)
    at(w.bonus.at.x, w.bonus.at.y, 1, L.ch === 3 ? 1 : 0, ORANGE)
  }

  // Clawd: an orange body in alternating segments that fades towards the tail; white flashes on a crash.
  const flash = w.state === 'dead' && w.deadFor < 1 && Math.floor(w.deadFor * 8) % 2 === 0
  const n = w.snake.length
  for (let i = n - 1; i >= 0; i--) {
    const c = w.snake[i]
    if (!c) continue
    const base = i % 2 ? ORANGE_DARK : ORANGE
    const tail = n > 6 ? Math.max(0, (i - (n - 4)) / 4) : 0
    cell(c.x, c.y, flash ? WHITE : mix(base, CREAM, tail * 0.45))
  }
  const head = w.snake[0]
  if (head) {
    cell(head.x, head.y, flash ? WHITE : ORANGE)
    const blink = w.state !== 'dead' && Math.floor(w.t * 10) % 40 === 0
    const lastDir = w.state === 'ready' ? 'right' : w.dir
    for (const [dx, dy] of eyes(lastDir, L.cw, L.ch)) at(head.x, head.y, dx, dy, flash ? ORANGE : blink ? ORANGE_DARK : INK)
  }

  return s.surface === 'desktop' ? cells(f) : halfBlocks(f)
}

const Snake: ClientModule<SnakeProps, State> = (props, surface) => {
  let s = surface.state
  if (!s) {
    s = { game: createWorld(), surface: props.surface, posted: false, tick: 0 }
    fresh(surface, s)
    surface.setState(s)
    surface.every(33, () => tick(surface))
    surface.onKey(k => {
      const d = KEYS[k.key]
      if (d) steer(surface, d)
      else if (k.key === ' ' || k.key === 'space' || k.key === 'return' || k.key === 'p') space(surface)
    })
    surface.onPointer(p => {
      if (p.type === 'down') click(surface, p.x, p.y)
    })
  }
  fit(surface, s)

  const { Box, Text } = surface.elements
  const lines = draw(s, surface)
  const w = s.game.world
  const best = Math.max(props.best, w.state === 'dead' ? w.score : 0)
  const verb = VERBS[Math.floor(w.eaten / 5) % VERBS.length] ?? 'Clauding'
  const hint =
    w.state === 'ready'
      ? 'click here, then an arrow key to slither'
      : w.state === 'paused'
        ? 'paused · SPACE to resume'
        : w.state === 'dead'
          ? `${w.cause === 'self' ? 'context overflow' : w.cause === 'full' ? 'context window full!' : 'hit the wall'} at ${w.score} · SPACE to go again`
          : w.bonus
            ? `Opus token! ${Math.ceil(w.bonus.ttl)}s`
            : w.eaten >= 5
              ? `✻ ${verb}…`
              : ''

  return (
    <Box flexDirection="column">
      {lines.map(line => (
        <Box flexDirection="row">
          {line.map(r =>
            s.surface === 'desktop' ? (
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
        <Text color="claude">{`★ ${w.score}  ✻ ${w.snake.length}  best ${best}`}</Text>
        <Text dimColor>{hint ? `  ${hint}` : ''}</Text>
      </Text>
    </Box>
  )
}

export default Snake
