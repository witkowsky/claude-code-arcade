import { expect, test } from 'claude-code/testing'

import { parseSlap, takeLines } from '../hooks/slaps'

const PANE = {
  plugin: 'dino',
  component: 'Pane',
  requestId: 'dino-game',
  props: { title: 'No internet', isFocused: true, bodyColumns: 60, placement: 'dock' } as any,
  viewport: { columns: 120, rows: 30 },
} as const

test('slap lines parse like the ClaudeWhip bridge, typing taps ignored', async () => {
  const now = 1_000_000
  expect(parseSlap('{"ts":999900,"g":0.63,"tier":"slap"}', 0.08, now)).toEqual({ g: 0.63, tier: 'slap', at: 999900 })
  expect(parseSlap('{"ts":1,"g":1.5,"tier":"wallop"}', 0.08, now)).toEqual({ g: 1.5, tier: 'wallop', at: now })
  expect(parseSlap('{"ts":1,"g":0.03,"tier":"tap"}', 0.08, now)).toBeNull()
  expect(parseSlap('{"type":"hello"}', 0, now)).toBeNull()
  expect(parseSlap('{"g":99}', 0, now)).toBeNull()
  expect(parseSlap('not json', 0, now)).toBeNull()
  expect(takeLines('a\nb\nc')).toEqual({ lines: ['a', 'b'], rest: 'c' })
})

test('the pane draws the dino on terminal and desktop, and it paints pixels', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Client', key: 'dino' })).toBeDefined()
    await ui.resize({ columns: 50, rows: 16, in: 'dino' })
    await ui.advance(100)
    // The terminal paints half-blocks; the desktop paints background-only cells.
    const blocks = await ui.findAll({ type: 'Text', text: surface === 'terminal' ? /▀/ : /^ +$/, in: 'dino' })
    expect(blocks.length).toBeGreaterThan(5)
    await ui.unmount()
  }
})

test('Space starts the run and the first cactus ends it', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.resize({ columns: 50, rows: 16, in: 'dino' })
    expect(await ui.find({ type: 'Text', text: /No internet/, in: 'dino' })).toBeDefined()
    await ui.key({ key: ' ', in: 'dino' })
    await ui.advance(30000) // nobody jumps again: a cactus ends the run
    expect(await ui.find({ type: 'Text', text: /G A M E/, in: 'dino' })).toBeDefined()
    await ui.unmount()
  }
})
