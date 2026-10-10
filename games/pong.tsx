// Clawd Pong: Clawd's orange paddle against the models, Haiku, then Sonnet, then Opus, on a
// Claude-cream court with a ✻ for a ball. The surface runs the game itself (a Client module):
// ↑/↓ (or W/S, K/J) to move, or the pointer to steer; Space or a click to start.
import type { ClientModule, ClientSurface } from 'claude-code'

import type { PongProps } from '../types'
import { PADDLE_W, POINTS_TO_WIN, createWorld, modelFor } from './pong-engine'
import type { Frame, Run } from './pixels'
import { canvas, digits, fill, frame, rect, sprite } from './pixels'

const ORANGE = '#D77757' // Claude Code's own "claude" theme colour
const TOKEN = '#B8532E'
const INK = '#141413'
const CREAM = '#F0EEE6'
const STONE = '#B1ADA1'
const WALL = '#3D3D3A'

const STAR = ['.X.', 'XXX', '.X.']

type Game = ReturnType<typeof createWorld>
type State = { game: Game; surface: PongProps['surface']; posted: boolean; tick: number }

const DT = 1 / 30

function dims(surface: ClientSurface<State>, kind: PongProps['surface']) {
  return canvas(kind, Math.max(40, surface.columns || 70), Math.max(12, surface.rows || 22))
}

function fresh(surface: ClientSurface<State>, s: State): void {
  const c = dims(surface, s.surface)
  s.game.reset(c.pw, c.ph)
  s.posted = false
}

/** A key, a click or the pointer: restarts after a lost match, else does `then`. */
function act(surface: ClientSurface<State>, then: (g: Game) => void): void {
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
    surface.post({ game: 'pong', score: s.game.world.score })
  }
  surface.setState({ ...s, tick: s.tick + 1 })
}

function draw(s: State, pw: number, ph: number): Frame {
  const g = s.game
  const w = g.world
  const f = frame(pw, ph, CREAM)
  fill(f, 0, 0, pw, 1, WALL)
  fill(f, 0, ph - 1, pw, 1, WALL)
  for (let y = 2; y < ph - 2; y += 4) fill(f, Math.floor(pw / 2), y, 1, 2, STONE)

  const you = String(w.you)
  const them = String(w.them)
  digits(f, you, Math.floor(pw / 2) - 4 - you.length * 4, 3, ORANGE)
  digits(f, them, Math.floor(pw / 2) + 4, 3, INK)

  // Clawd's paddle has his eyes; the model's is plain ink.
  const py = Math.round(w.player.y)
  rect(f, g.leftX(), py, PADDLE_W, w.paddleH, ORANGE)
  const mid = py + Math.floor(w.paddleH / 2)
  rect(f, g.leftX() + 1, mid - 2, 1, 1, INK)
  rect(f, g.leftX() + 1, mid + 1, 1, 1, INK)
  rect(f, g.rightX(), Math.round(w.cpu.y), PADDLE_W, w.paddleH, INK)

  if (w.state !== 'won' && w.state !== 'dead') sprite(f, STAR, { X: TOKEN }, Math.round(w.ball.x), Math.round(w.ball.y))
  return f
}

const Pong: ClientModule<PongProps, State> = (props, surface) => {
  let s = surface.state
  if (!s) {
    s = { game: createWorld(), surface: props.surface, posted: false, tick: 0 }
    fresh(surface, s)
    surface.setState(s)
    surface.every(33, () => tick(surface))
    surface.onKey(k => {
      const key = k.key
      if (key === 'up' || key === 'w' || key === 'k') act(surface, g => g.move(-4))
      else if (key === 'down' || key === 's' || key === 'j') act(surface, g => g.move(4))
      else if (key === ' ' || key === 'space' || key === 'return') act(surface, g => g.start())
    })
    surface.onPointer(p => {
      const st = surface.state
      if (!st) return
      // The pointer's row, in canvas pixels: two per terminal row, about 1.7 per desktop row.
      const d = dims(surface, st.surface)
      const y = d.isCells ? ((p.y + 0.5) * d.ph) / Math.max(1, d.rows) : p.y * 2 + 1
      if (p.type === 'down') act(surface, g => (g.start(), g.moveTo(y)))
      else if (p.type === 'move' && st.game.world.state !== 'dead') st.game.moveTo(y)
    })
  }

  const { Box, Text } = surface.elements
  const c = dims(surface, s.surface)
  const lines: Run[][] = c.toRuns(draw(s, c.pw, c.ph))
  const w = s.game.world
  const model = modelFor(w.level)
  const next = modelFor(w.level + 1)
  const best = Math.max(props.best, w.state === 'dead' ? w.score : 0)
  const hint =
    w.state === 'ready'
      ? `click here, then ↑/↓ to play ${model.name} (first to ${POINTS_TO_WIN})`
      : w.state === 'won'
        ? `beat ${model.name}! next up: ${next.name}`
        : w.state === 'dead'
          ? `${model.name} wins · SPACE for a rematch`
          : `vs ${model.name}`

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
        <Text color="claude">{`★ ${w.score}  rally ${w.rally}  ladder ${w.level + 1}  best ${best}`}</Text>
        <Text dimColor>{hint ? `  ${hint}` : ''}</Text>
      </Text>
    </Box>
  )
}

export default Pong
