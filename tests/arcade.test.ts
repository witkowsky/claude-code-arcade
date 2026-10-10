import { expect, test } from 'claude-code/testing'

const MENU = {
  plugin: 'arcade',
  component: 'Pane',
  requestId: 'arcade',
  props: { title: 'Claude Code Arcade', isFocused: true, bodyColumns: 60, placement: 'dock' } as any,
  viewport: { columns: 120, rows: 30 },
} as const

test('/arcade <game> opens that game, and names the games for anything else', async ($, on) => {
  const opened: string[] = []
  // Nothing beneath the plugin places panes in a test: note each open and say it is placed.
  on('ui.open', async (_$, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true as const } }
  })
  on('ui.close', async () => ({ value: undefined }))
  expect((await $.command.run({ command: 'arcade', args: 'snake' })).text).toMatch(/Clawd Snake is up/)
  expect((await $.command.run({ command: 'arcade', args: 'Flappy' })).text).toMatch(/Flappy Claude is up/)
  expect((await $.command.run({ command: 'arcade', args: 'tetris' })).text).toMatch(/\/arcade flappy, \/arcade dino, \/arcade snake, \/arcade invaders, \/arcade pong/)
  expect((await $.command.run({ command: 'arcade', args: '' })).text).toMatch(/Pick a game/)
  expect(opened).toEqual(['arcade-snake', 'arcade-flappy', 'arcade'])
})

test('the menu lists every game on terminal and desktop', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...MENU, surface })
    for (const key of ['flappy', 'dino', 'snake', 'invaders', 'pong']) expect(await ui.find({ type: 'Button', key })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'close' })).toBeDefined()
    await ui.unmount()
  }
})
