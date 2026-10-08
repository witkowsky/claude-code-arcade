// Flappy Claude: Clawd, the Claude Code mascot, flapping between pipes. The surface runs the
// game itself (a Client module): its own 30 fps clock, Space/↑/click to flap, and a slap on
// the MacBook (props.hit.n going up, fed by the hooks module from ClaudeWhip) flaps too.
import type { ClientModule, ClientSurface } from 'claude-code'

import type { FlappyProps } from '../types'
import { GROUND, PIPE_W, VIEW_H, createWorld } from './engine'
import type { Frame, Run } from './pixels'
import { DESKTOP_CELL_ASPECT, cells, digits, fill, frame, halfBlocks, mix, rect, sprite, spriteSize, squash } from './pixels'

const ORANGE = '#D77757' // Claude Code's own "claude" theme colour
const INK = '#141413'
const SKY_TOP = '#F0EEE6'
const SKY_LOW = '#E6D9C6'
const CLOUD = '#FFFFFF'
const PIPE = '#3D3D3A'
const PIPE_LIGHT = '#6B6A65'
const PIPE_DARK = '#262624'
const GROUND_C = '#B1ADA1'
const GROUND_DASH = '#9C9890'

// Clawd in square pixels (terminal half-blocks): body, eyes, arms out / arms up, four legs.
const CLAWD = ['.XXXXXXX.', '.XEXXXEX.', 'XXXXXXXXX', '.XXXXXXX.', '.X.X.X.X.']
const CLAWD_UP = ['.XXXXXXX.', 'XXEXXXEXX', '.XXXXXXX.', '.XXXXXXX.', '.X.X.X.X.']
// Clawd for the desktop's tall cells (about 0.6 wide per 1 tall): three rows keep the eyes.
const CLAWD_CELLS = ['.XEXXXEX.', 'XXXXXXXXX', '.X.X.X.X.']
const CLAWD_CELLS_UP = ['XXEXXXEXX', '.XXXXXXX.', '.X.X.X.X.']
const PAL: Record<string, string> = { X: ORANGE, E: INK }
const PAL_HIT: Record<string, string> = { X: '#FFFFFF', E: ORANGE }
const TOKEN = ['.X.', 'XXX', '.X.']

// Claude Code-ish spinner words, shown every few gates.
const VERBS = ['Clauding', 'Flibbertigibbeting', 'Noodling', 'Percolating', 'Schlepping', 'Moseying', 'Booping', 'Finagling', 'Pondering', 'Vibing', 'Honking', 'Zigzagging']

type Game = ReturnType<typeof createWorld>
type State = { game: Game; seen: number; surface: FlappyProps['surface']; lag: number | null; posted: boolean; tick: number }

const DT = 1 / 60

/** The square-pixel canvas for this region, one row kept for the HUD. */
function layout(surface: ClientSurface<State>, kind: FlappyProps['surface']) {
  const pw = Math.max(24, surface.columns || 60)
  const bodyRows = Math.max(6, (surface.rows || 22) - 1)
  const ph = kind === 'desktop' ? Math.round(bodyRows / DESKTOP_CELL_ASPECT) : bodyRows * 2
  const sc = VIEW_H / ph
  return { pw, ph, bodyRows, sc, viewW: pw * sc }
}

function act(surface: ClientSurface<State>, power: number): void {
  const s = surface.state
  if (!s) return
  const w = s.game.world
  if (w.state === 'dead') {
    if (w.deadFor < 0.5) return
    s.game.reset(layout(surface, s.surface).viewW)
    s.posted = false
    return
  }
  s.game.flap(power)
}

function tick(surface: ClientSurface<State>): void {
  const s = surface.state
  if (!s) return
  const { viewW } = layout(surface, s.surface)
  let ended = false
  for (let i = 0; i < 2; i++) ended = s.game.update(DT, viewW) || ended
  if (ended && !s.posted) {
    s.posted = true
    surface.post({ game: 'flappy', score: s.game.world.score })
  }
  surface.setState({ ...s, tick: s.tick + 1 })
}

/** Everything but Clawd, in square pixels. */
function scene(s: State, pw: number, ph: number, sc: number, paintScore: boolean): Frame {
  const w = s.game.world
  const f = frame(pw, ph, SKY_TOP)
  const groundY = Math.round((VIEW_H - GROUND) / sc)
  for (let y = 0; y < groundY; y++) fill(f, 0, y, pw, 1, mix(SKY_TOP, SKY_LOW, y / Math.max(1, groundY)))

  // Clouds drift at a third of the scroll.
  const span = pw + 24
  for (let i = 0; i < 4; i++) {
    const x = (((i * 37 + 11 - (w.scroll / sc) * 0.33) % span) + span) % span - 12
    const y = 2 + ((i * 7) % Math.max(3, Math.floor(groundY / 3)))
    fill(f, x + 2, y, 6, 1, CLOUD)
    fill(f, x, y + 1, 10, 2, CLOUD)
  }

  for (const p of w.pipes) {
    const x = p.x / sc
    const pwid = Math.max(3, PIPE_W / sc)
    const top = (p.center - p.gap / 2) / sc
    const bottom = (p.center + p.gap / 2) / sc
    rect(f, x, 0, pwid, top, PIPE)
    rect(f, x, bottom, pwid, groundY - bottom, PIPE)
    rect(f, x, 0, 1, top, PIPE_LIGHT)
    rect(f, x, bottom, 1, groundY - bottom, PIPE_LIGHT)
    rect(f, x + pwid - 1, 0, 1, top, PIPE_DARK)
    rect(f, x + pwid - 1, bottom, 1, groundY - bottom, PIPE_DARK)
    rect(f, x - 1, top - 2, pwid + 2, 2, PIPE_DARK)
    rect(f, x - 1, bottom, pwid + 2, 2, PIPE_DARK)
    if (p.token && !p.tokenTaken) sprite(f, TOKEN, { X: ORANGE }, x + pwid / 2 - 1, p.center / sc - 1)
  }

  fill(f, 0, groundY, pw, ph - groundY, GROUND_C)
  rect(f, 0, groundY, pw, 1, ORANGE)
  const off = Math.floor(w.scroll / sc) % 6
  for (let x = -off; x < pw; x += 6) fill(f, x, groundY + 2, 3, 1, GROUND_DASH)

  if (paintScore) {
    const score = String(w.score)
    digits(f, score, Math.floor(pw / 2 - (score.length * 4) / 2), 2, INK)
  }
  return f
}

/** Where Clawd's sprite goes on a frame `rows` tall, its top-left corner. */
function clawdAt(s: State, art: readonly string[], sc: number, rowsScale: number) {
  const b = s.game.world.bird
  const { w, h } = spriteSize(art)
  return { x: Math.round(b.x / sc - w / 2), y: Math.round((b.y / sc) * rowsScale - h / 2) }
}

function render(s: State, surface: ClientSurface<State>): Run[][] {
  const L = layout(surface, s.surface)
  const b = s.game.world.bird
  const flapping = b.flap > 0.12 || (s.game.world.state === 'ready' && Math.floor(s.game.world.t * 4) % 2 === 0)
  const pal = b.flash > 0.3 ? PAL_HIT : PAL
  if (s.surface === 'desktop') {
    // The desktop squashes square pixels into its taller cells; Clawd is drawn after, at cell scale.
    const g = squash(scene(s, L.pw, L.ph, L.sc, false), L.bodyRows)
    const art = flapping ? CLAWD_CELLS_UP : CLAWD_CELLS
    const at = clawdAt(s, art, L.sc, L.bodyRows / L.ph)
    sprite(g, art, pal, at.x, at.y)
    return cells(g)
  }
  const f = scene(s, L.pw, L.ph, L.sc, true)
  const art = flapping ? CLAWD_UP : CLAWD
  const at = clawdAt(s, art, L.sc, 1)
  sprite(f, art, pal, at.x, at.y)
  return halfBlocks(f)
}

const Flappy: ClientModule<FlappyProps, State> = (props, surface) => {
  let s = surface.state
  if (!s) {
    const game = createWorld()
    game.reset(layout(surface, props.surface).viewW)
    s = { game, seen: props.hit.n, surface: props.surface, lag: null, posted: false, tick: 0 }
    surface.setState(s)
    surface.every(33, () => tick(surface))
    surface.onKey(k => {
      if (k.key === ' ' || k.key === 'space' || k.key === 'up' || k.key === 'return' || k.key === 'w') act(surface, 1)
    })
    surface.onPointer(p => {
      if (p.type === 'down') act(surface, 1)
    })
  } else if (props.hit.n !== s.seen) {
    // A slap on the MacBook: the hooks module bumps the count, Clawd flaps (a wallop flaps harder).
    if (props.hit.n > s.seen) {
      act(surface, props.hit.tier === 'wallop' ? 1.3 : 1)
      if (props.hit.at > 0) s.lag = Math.max(0, Date.now() - props.hit.at)
    }
    s.seen = props.hit.n
  }

  const { Box, Text } = surface.elements
  const lines = render(s, surface)
  const w = s.game.world
  const best = Math.max(props.best, w.state === 'dead' ? w.score : 0)
  const verb = VERBS[Math.floor(w.score / 5) % VERBS.length] ?? 'Clauding'
  const hint =
    w.state === 'ready'
      ? 'click here, then SPACE to fly'
      : w.state === 'dead'
        ? `crashed at ${w.score} · SPACE to fly again`
        : w.score >= 5
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
        <Text color="claude">{`★ ${w.score}  ✻ ${w.tokens}  best ${best}`}</Text>
        <Text dimColor>{`${s.lag !== null ? `  slap→flap ${s.lag}ms` : ''}${hint ? `  ${hint}` : ''}`}</Text>
      </Text>
    </Box>
  )
}

export default Flappy
