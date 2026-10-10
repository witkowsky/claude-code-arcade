import { expect, test } from 'claude-code/testing'

import { createWorld, gapFor, speedFor } from '../games/flappy-engine'
import { parseSlap } from '../hooks/slaps'

const PANE = {
  plugin: 'arcade',
  component: 'Pane',
  requestId: 'arcade-flappy',
  props: { title: 'Flappy Claude', isFocused: true, bodyColumns: 60, placement: 'dock' } as any,
  viewport: { columns: 120, rows: 30 },
} as const

test('the course narrows and speeds up, within limits', async () => {
  expect(gapFor(1)).toBe(165)
  expect(gapFor(100)).toBe(125)
  expect(speedFor(0)).toBe(140)
  expect(speedFor(1000)).toBe(230)
})

test('a flap climbs, gravity falls, and the ground ends the run', async () => {
  const g = createWorld(() => 0.5)
  g.reset(800)
  g.flap()
  const y0 = g.world.bird.y
  g.update(1 / 60, 800)
  expect(g.world.bird.y).toBeLessThan(y0)
  let ended = false
  for (let i = 0; i < 600 && !ended; i++) ended = g.update(1 / 60, 800)
  expect(ended).toBe(true)
  expect(g.world.state).toBe('dead')
})

test('slap lines parse like the ClaudeWhip bridge, typing taps ignored', async () => {
  expect(parseSlap('{"ts":999900,"g":0.63,"tier":"slap"}', 0.08, 1_000_000)).toEqual({ g: 0.63, tier: 'slap', at: 999900 })
  expect(parseSlap('{"ts":1,"g":0.03,"tier":"tap"}', 0.08, 1_000_000)).toBeNull()
})

test('the pane draws Clawd on terminal and desktop', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Client', key: 'flappy' })).toBeDefined()
    await ui.resize({ columns: 50, rows: 16, in: 'flappy' })
    await ui.advance(100)
    // The terminal paints half-blocks; the desktop paints background-only cells.
    const blocks = await ui.findAll({ type: 'Text', text: surface === 'terminal' ? /▀/ : /^ +$/, in: 'flappy' })
    expect(blocks.length).toBeGreaterThan(5)
    const orange = await ui.findAll({ type: 'Text', in: 'flappy' })
    expect(orange.some(t => JSON.stringify(t).includes('#D77757'))).toBe(true)
    await ui.unmount()
  }
})

test('Space starts the flight, and doing nothing crashes it', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.resize({ columns: 50, rows: 16, in: 'flappy' })
    expect(await ui.find({ type: 'Text', text: /SPACE to fly/, in: 'flappy' })).toBeDefined()
    await ui.key({ key: ' ', in: 'flappy' })
    await ui.advance(10000)
    expect(await ui.find({ type: 'Text', text: /crashed at/, in: 'flappy' })).toBeDefined()
    await ui.unmount()
  }
})
