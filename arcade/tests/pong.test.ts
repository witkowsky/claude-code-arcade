import { expect, test } from 'claude-code/testing'

import { POINTS_TO_WIN, createWorld, modelFor } from '../games/pong-engine'

const PANE = {
  plugin: 'arcade',
  component: 'Pane',
  requestId: 'arcade-pong',
  props: { title: 'Clawd Pong', isFocused: true, bodyColumns: 60, placement: 'dock' } as any,
  viewport: { columns: 120, rows: 30 },
} as const

const run = (g: ReturnType<typeof createWorld>, seconds: number, each?: () => void) => {
  let ended = false
  for (let i = 0; i < seconds * 30 && !ended; i++) {
    each?.()
    ended = g.update(1 / 30)
  }
  return ended
}

test('the ladder climbs Haiku, Sonnet, Opus, and Opus only gets quicker', async () => {
  expect([0, 1, 2, 3].map(l => modelFor(l).name)).toEqual(['Haiku', 'Sonnet', 'Opus', 'Opus'])
  expect(modelFor(1).speed).toBeGreaterThan(modelFor(0).speed)
  expect(modelFor(4).speed).toBeGreaterThan(modelFor(2).speed)
})

test('a paddle in the way returns the ball, quicker', async () => {
  const g = createWorld(() => 0.5)
  g.reset(76, 46)
  g.start()
  run(g, 0.5)
  const w = g.world
  w.serveDir = -1
  w.ball = { x: 20, y: w.player.y + w.paddleH / 2 - 1, vx: -30, vy: 0 }
  w.state = 'playing'
  run(g, 1)
  expect(w.returns).toBe(1)
  expect(w.ball.vx).toBeGreaterThan(30)
})

test(`a still paddle loses the match ${POINTS_TO_WIN}-something, and that ends the run`, async () => {
  const g = createWorld(() => 0.9)
  g.reset(76, 46)
  g.start()
  // Clawd hides in the top corner; the model returns everything.
  expect(run(g, 600, () => g.moveTo(0))).toBe(true)
  expect(g.world.them).toBe(POINTS_TO_WIN)
  expect(g.world.state).toBe('dead')
})

test('winning a match brings the next model', async () => {
  const g = createWorld(() => 0.5)
  g.reset(76, 46)
  g.start()
  const w = g.world
  w.you = POINTS_TO_WIN - 1
  w.state = 'playing'
  w.ball = { x: w.w - 1, y: 1, vx: 50, vy: 0 }
  w.cpu.y = w.h - w.paddleH - 1
  run(g, 0.2)
  expect(w.state).toBe('won')
  run(g, 3)
  expect(w.level).toBe(1)
  expect(w.you).toBe(0)
})

test('the pane draws the court on terminal and desktop, and a rematch follows a loss', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Client', key: 'pong' })).toBeDefined()
    await ui.resize({ columns: 60, rows: 22, in: 'pong' })
    await ui.advance(100)
    const blocks = await ui.findAll({ type: 'Text', text: surface === 'terminal' ? /▀/ : /^ +$/, in: 'pong' })
    expect(blocks.length).toBeGreaterThan(5)
    const texts = await ui.findAll({ type: 'Text', in: 'pong' })
    expect(texts.some(t => JSON.stringify(t).includes('#D77757'))).toBe(true)
    expect(await ui.find({ type: 'Text', text: /to play Haiku/, in: 'pong' })).toBeDefined()
    await ui.key({ key: ' ', in: 'pong' })
    // Nobody plays: in a few minutes of game time the run is over.
    let over = undefined
    for (let i = 0; i < 20 && !over; i++) {
      await ui.advance(60000)
      over = await ui.find({ type: 'Text', text: /wins · SPACE for a rematch/, in: 'pong' })
    }
    expect(over).toBeDefined()
    await ui.unmount()
  }
})
