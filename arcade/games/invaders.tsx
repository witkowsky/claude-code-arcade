// Bug Invaders: Space Invaders in Claude Code's dark theme. Clawd holds the bottom row and fires
// ✻ tokens at a marching formation of bugs; olive test suites shield him; an Opus ship crosses
// the top for a bonus. The surface runs the game itself (a Client module): ←/→ (or A/D, H/L) to
// move, Space/↑ to fire, or the pointer to steer and a click to fire.
import type { ClientModule, ClientSurface } from 'claude-code'

import type { InvadersProps } from '../types'
import { createWorld } from './invaders-engine'
import type { Frame, Run } from './pixels'
import { canvas, digits, fill, frame, rect, sprite } from './pixels'

const ORANGE = '#D77757' // Claude Code's own "claude" theme colour
const INK = '#141413'
const NIGHT = '#1F1E1D'
const STAR = '#3D3D3A'
const CREAM = '#F0EEE6'
const SAND = '#E6D9C6'
const STONE = '#B1ADA1'
const OLIVE = '#788C5D'
const WHITE = '#FFFFFF'

// Clawd, as in Flappy Claude: arms out, four legs.
const CLAWD = ['.XXXXXXX.', '.XEXXXEX.', 'XXXXXXXXX', '.XXXXXXX.', '.X.X.X.X.']
// Bugs, two frames of legs; E eyes glow orange.
const BUG_A = ['.B...B.', '..BBB..', '.BEBEB.', 'BBBBBBB', 'B.B.B.B']
const BUG_B = ['B.....B', '..BBB..', '.BEBEB.', 'BBBBBBB', '.B.B.B.']
const ROW_COLOURS = [CREAM, SAND, SAND, STONE, STONE]
const POP = ['X.X.X.X', '.X.X.X.', 'X.X.X.X']
// The Opus ship: cream hull, orange lights.
const UFO = ['..XXXXX..', '.XOXOXOX.', 'XXXXXXXXX']

type Game = ReturnType<typeof createWorld>
type State = { game: Game; surface: InvadersProps['surface']; posted: boolean; tick: number }

const DT = 1 / 30

function dims(surface: ClientSurface<State>, kind: InvadersProps['surface']) {
  return canvas(kind, Math.max(40, surface.columns || 70), Math.max(12, surface.rows || 22))
}

function fresh(surface: ClientSurface<State>, s: State): void {
  const c = dims(surface, s.surface)
  s.game.reset(c.pw, c.ph)
  s.posted = false
}

/** Space and the first move start a run; after a crash, Space starts another. */
function restartOr(surface: ClientSurface<State>, then: (g: Game) => void): void {
  const s = surface.state
  if (!s) return
  const w = s.game.world
  if (w.state === 'dead') {
    if (w.deadFor >= 0.6) fresh(surface, s)
    return
  }
  const c = dims(surface, s.surface)
  if (w.state === 'ready' && (w.w !== c.pw || w.h !== c.ph)) fresh(surface, s)
  then(s.game)
}

function tick(surface: ClientSurface<State>): void {
  const s = surface.state
  if (!s) return
  if (s.game.update(DT) && !s.posted) {
    s.posted = true
    surface.post({ game: 'invaders', score: s.game.world.score })
  }
  surface.setState({ ...s, tick: s.tick + 1 })
}

function draw(s: State, pw: number, ph: number): Frame {
  const g = s.game
  const w = g.world
  const f = frame(pw, ph, NIGHT)
  for (let i = 0; i < 18; i++) fill(f, (i * 37 + 5) % pw, (i * 13 + 2) % Math.max(1, ph - 8), 1, 1, STAR)
  fill(f, 0, ph - 1, pw, 1, STAR)

  for (const sh of w.shields)
    sh.px.forEach((row, dy) => {
      for (let dx = 0; dx < row.length; dx++) if (row[dx] === '#') rect(f, sh.x + dx, sh.y + dy, 1, 1, OLIVE)
    })

  for (const b of w.bugs) {
    if (!b.alive) continue
    sprite(f, w.frame ? BUG_B : BUG_A, { B: ROW_COLOURS[b.row] ?? STONE, E: ORANGE }, Math.round(b.x), Math.round(b.y))
  }
  for (const p of w.popped) {
    if (p.text) digits(f, p.text, Math.round(p.x), 0, ORANGE)
    else sprite(f, POP, { X: ORANGE }, Math.round(p.x) - 1, Math.round(p.y))
  }
  if (w.ufo) sprite(f, UFO, { X: CREAM, O: Math.floor(w.t * 6) % 2 ? ORANGE : SAND }, Math.round(w.ufo.x), 0)

  for (const b of w.bombs) {
    const zig = Math.floor(b.y / 2) % 2
    rect(f, b.x + zig, b.y, 1, 1, CREAM)
    rect(f, b.x + 1 - zig, b.y + 1, 1, 1, CREAM)
  }
  if (w.shot) rect(f, Math.round(w.shot.x), Math.round(w.shot.y), 1, 2, ORANGE)

  const hidden = w.state === 'respawn' && w.player.flash > 0 && Math.floor(w.t * 10) % 2 === 0
  if (!hidden) {
    const pal = w.player.flash > 0.5 ? { X: WHITE, E: ORANGE } : { X: ORANGE, E: INK }
    sprite(f, CLAWD, pal, Math.round(w.player.x), g.playerY())
  }
  return f
}

const Invaders: ClientModule<InvadersProps, State> = (props, surface) => {
  let s = surface.state
  if (!s) {
    s = { game: createWorld(), surface: props.surface, posted: false, tick: 0 }
    fresh(surface, s)
    surface.setState(s)
    surface.every(33, () => tick(surface))
    surface.onKey(k => {
      const key = k.key
      if (key === 'left' || key === 'a' || key === 'h') restartOr(surface, g => g.move(-4))
      else if (key === 'right' || key === 'd' || key === 'l') restartOr(surface, g => g.move(4))
      else if (key === ' ' || key === 'space' || key === 'up' || key === 'w' || key === 'k' || key === 'return') restartOr(surface, g => g.fire())
    })
    surface.onPointer(p => {
      const st = surface.state
      if (!st || st.game.world.state === 'dead') {
        if (p.type === 'down') restartOr(surface, () => {})
        return
      }
      if (p.type === 'move' || p.type === 'down') st.game.moveTo(p.x)
      if (p.type === 'down') restartOr(surface, g => g.fire())
    })
  }

  const { Box, Text } = surface.elements
  const c = dims(surface, s.surface)
  const lines: Run[][] = c.toRuns(draw(s, c.pw, c.ph))
  const w = s.game.world
  const best = Math.max(props.best, w.state === 'dead' ? w.score : 0)
  const lives = '♥'.repeat(Math.max(0, w.lives))
  const hint =
    w.state === 'ready'
      ? 'click here, then ←/→ to move and SPACE to fire'
      : w.state === 'dead'
        ? `bugs won at ${w.score} · SPACE to debug again`
        : w.state === 'respawn' && w.cleared
          ? `wave ${w.wave}: more bugs incoming`
          : w.ufo
            ? 'Opus ship! shoot it'
            : ''

  return (
    <Box flexDirection="column">
      {lines.map(line => (
        <Box flexDirection="row">
          {line.map(r =>
            c.isCells ? (
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
        <Text color="claude">{`★ ${w.score}  ${lives}  wave ${w.wave}  best ${best}`}</Text>
        <Text dimColor>{hint ? `  ${hint}` : ''}</Text>
      </Text>
    </Box>
  )
}

export default Invaders
