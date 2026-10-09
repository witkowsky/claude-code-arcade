import { expect, test } from 'claude-code/testing'

import { BONUS_EVERY, BONUS_POINTS, START_LEN, createWorld, stepMsFor } from '../games/snake-engine'

const PANE = {
  plugin: 'arcade',
  component: 'Pane',
  requestId: 'arcade-snake',
  props: { title: 'Clawd Snake', isFocused: true, bodyColumns: 60, placement: 'dock' } as any,
  viewport: { columns: 120, rows: 30 },
} as const

/** Steps the world one cell at a time: a step is stepMsFor(eaten) ms. */
function steps(g: ReturnType<typeof createWorld>, n: number): boolean {
  let ended = false
  for (let i = 0; i < n && !ended; i++) ended = g.update(stepMsFor(g.world.eaten) / 1000 + 1e-6)
  return ended
}

test('the step quickens as it eats, within limits', async () => {
  expect(stepMsFor(0)).toBe(140)
  expect(stepMsFor(1000)).toBe(65)
})

test('the snake waits for a key, then moves one cell per step', async () => {
  const g = createWorld(() => 0)
  g.reset(20, 10)
  const head = { ...g.world.snake[0]! }
  steps(g, 3)
  expect(g.world.snake[0]).toEqual(head)
  g.turn('up')
  steps(g, 1)
  expect(g.world.snake[0]).toEqual({ x: head.x, y: head.y - 1 })
  expect(g.world.snake.length).toBe(START_LEN)
})

test('a reversal into the neck is ignored', async () => {
  const g = createWorld(() => 0)
  g.reset(20, 10)
  g.turn('left')
  steps(g, 1)
  expect(g.world.dir).toBe('right')
  expect(g.world.state).toBe('playing')
})

test('eating a token scores and grows', async () => {
  const g = createWorld(() => 0)
  g.reset(20, 10)
  const head = g.world.snake[0]!
  g.world.food = { x: head.x + 1, y: head.y }
  g.togglePause()
  steps(g, 1)
  expect(g.world.score).toBe(1)
  expect(g.world.snake.length).toBe(START_LEN + 1)
})

test(`every ${BONUS_EVERY} tokens an Opus token is worth ${BONUS_POINTS}`, async () => {
  const g = createWorld(() => 0)
  g.reset(30, 10)
  g.togglePause()
  for (let i = 0; i < BONUS_EVERY; i++) {
    const head = g.world.snake[0]!
    g.world.food = { x: head.x + 1, y: head.y }
    steps(g, 1)
  }
  expect(g.world.bonus).not.toBeNull()
  const head = g.world.snake[0]!
  g.world.bonus!.at = { x: head.x + 1, y: head.y }
  g.world.food = { x: 0, y: 0 }
  steps(g, 1)
  expect(g.world.score).toBe(BONUS_EVERY + BONUS_POINTS)
  expect(g.world.bonus).toBeNull()
})

test('the wall ends the run, and so does its own body', async () => {
  const g = createWorld(() => 0)
  g.reset(20, 10)
  g.world.food = { x: 0, y: 0 }
  g.togglePause()
  expect(steps(g, 100)).toBe(true)
  expect(g.world.cause).toBe('wall')

  g.reset(20, 10)
  g.world.food = { x: 0, y: 0 }
  g.world.snake = [5, 4, 3, 2, 1].map(x => ({ x, y: 5 }))
  g.togglePause()
  g.turn('up')
  g.turn('left')
  g.turn('down')
  expect(steps(g, 3)).toBe(true)
  expect(g.world.cause).toBe('self')
})

test('the pane draws Clawd on terminal and desktop', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Client', key: 'snake' })).toBeDefined()
    await ui.resize({ columns: 50, rows: 16, in: 'snake' })
    await ui.advance(100)
    // The terminal paints half-blocks; the desktop paints background-only cells.
    const blocks = await ui.findAll({ type: 'Text', text: surface === 'terminal' ? /▀/ : /^ +$/, in: 'snake' })
    expect(blocks.length).toBeGreaterThan(5)
    const texts = await ui.findAll({ type: 'Text', in: 'snake' })
    expect(texts.some(t => JSON.stringify(t).includes('#D77757'))).toBe(true)
    await ui.unmount()
  }
})

test('an arrow starts the run, and going straight hits the wall', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.resize({ columns: 50, rows: 16, in: 'snake' })
    expect(await ui.find({ type: 'Text', text: /arrow key to slither/, in: 'snake' })).toBeDefined()
    await ui.key({ key: 'up', in: 'snake' })
    await ui.advance(10000)
    expect(await ui.find({ type: 'Text', text: /hit the wall at/, in: 'snake' })).toBeDefined()
    await ui.key({ key: ' ', in: 'snake' })
    await ui.advance(100)
    expect(await ui.find({ type: 'Text', text: /arrow key to slither/, in: 'snake' })).toBeDefined()
    await ui.unmount()
  }
})
