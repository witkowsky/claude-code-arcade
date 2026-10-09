import { expect, test } from 'claude-code/testing'

import { bombMsFor, createWorld, marchMsFor } from '../games/invaders-engine'

const PANE = {
  plugin: 'arcade',
  component: 'Pane',
  requestId: 'arcade-invaders',
  props: { title: 'Bug Invaders', isFocused: true, bodyColumns: 60, placement: 'dock' } as any,
  viewport: { columns: 120, rows: 30 },
} as const

const run = (g: ReturnType<typeof createWorld>, seconds: number) => {
  let ended = false
  for (let i = 0; i < seconds * 30 && !ended; i++) ended = g.update(1 / 30)
  return ended
}

test('the formation quickens as it thins and with each wave', async () => {
  expect(marchMsFor(40, 40, 1)).toBeGreaterThan(marchMsFor(1, 40, 1))
  expect(marchMsFor(40, 40, 3)).toBeLessThan(marchMsFor(40, 40, 1))
  expect(bombMsFor(100)).toBe(350)
})

test('a ✻ shot hits the bug above Clawd and scores', async () => {
  const g = createWorld(() => 0.5)
  g.reset(76, 46)
  const bug = g.world.bugs[g.world.bugs.length - 1]!
  g.world.shields = []
  g.world.player.x = g.world.player.target = bug.x + 3 - 4
  g.fire()
  run(g, 1.5)
  expect(g.world.score).toBeGreaterThan(0)
  expect(g.world.bugs.filter(b => !b.alive).length).toBe(1)
})

test('only one ✻ flies at a time', async () => {
  const g = createWorld(() => 0.5)
  g.reset(76, 46)
  g.fire()
  const first = { ...g.world.shot! }
  g.update(1 / 30)
  g.fire()
  expect(g.world.shot!.x).toBe(first.x)
})

test('sitting still, the bugs win in the end', async () => {
  const g = createWorld(() => 0.5)
  g.reset(76, 46)
  g.move(0)
  expect(run(g, 300)).toBe(true)
  expect(g.world.state).toBe('dead')
})

test('the pane draws the bugs and Clawd on terminal and desktop, and Space starts the run', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Client', key: 'invaders' })).toBeDefined()
    await ui.resize({ columns: 60, rows: 22, in: 'invaders' })
    await ui.advance(100)
    const blocks = await ui.findAll({ type: 'Text', text: surface === 'terminal' ? /▀/ : /^ +$/, in: 'invaders' })
    expect(blocks.length).toBeGreaterThan(5)
    const texts = await ui.findAll({ type: 'Text', in: 'invaders' })
    expect(texts.some(t => JSON.stringify(t).includes('#D77757'))).toBe(true)
    expect(await ui.find({ type: 'Text', text: /SPACE to fire/, in: 'invaders' })).toBeDefined()
    await ui.key({ key: ' ', in: 'invaders' })
    await ui.advance(300000)
    expect(await ui.find({ type: 'Text', text: /bugs won at \d+/, in: 'invaders' })).toBeDefined()
    await ui.unmount()
  }
})
