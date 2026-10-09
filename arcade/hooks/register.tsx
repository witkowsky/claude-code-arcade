// Claude Code Arcade: every game in one plugin. `/arcade` opens a menu, `/arcade <game>` a
// game's own pane. Each game runs on the drawing surface (games/<game>.tsx); this module opens
// the panes, keeps the best scores and, when slaps are on and ClaudeWhip is installed, turns a
// slap on the MacBook into a flap or a jump while a game is open (pausing the whip meanwhile).
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Bests, DinoTheme, GameId } from '../types'
import { SENSOR_SOCKET, parseSlap, takeLines } from './slaps'

type $T = EngineInterface

// Slaps are switched off for now: no sensor socket, no whip pause. To bring them back, set
// this and restore the pauseWhip / slapMinG fields in plugin.json's userConfig.
const SLAPS = false

const HIT = { plugin: 'arcade', key: 'hit' } as const
const SENSOR = { plugin: 'arcade', key: 'sensor' } as const
const hitA = atom(HIT, { n: 0, tier: 'slap', at: 0 })
const bestA = atom({ plugin: 'arcade', key: 'best' } as const, { flappy: 0, dino: 0, snake: 0, invaders: 0, pong: 0 } as Bests)
const sensorA = atom(SENSOR, 'connecting')

const COMMAND = 'arcade'
const MENU = 'arcade'

type Game = { name: string; title: string; reply: string; help: string; usesSlaps: boolean }

const GAMES: Record<GameId, Game> = {
  flappy: {
    name: 'Flappy Claude',
    title: '✻ Flappy Claude',
    reply: 'Flappy Claude is up. Click the game, then Space to flap.',
    help: 'Clawd flaps between pipes · Space to flap',
    usesSlaps: true,
  },
  dino: {
    name: 'Dino',
    title: '✻ Clawd run',
    reply: "Clawd's offline. Click the game, then Space to jump and ↓ to duck.",
    help: 'the no-internet runner · Space to jump, ↓ to duck',
    usesSlaps: true,
  },
  snake: {
    name: 'Clawd Snake',
    title: '✻ Clawd Snake',
    reply: 'Clawd Snake is up. Click the game, then an arrow key to slither.',
    help: 'eat ✻ tokens, grow, avoid yourself · arrows to steer',
    usesSlaps: false,
  },
  invaders: {
    name: 'Bug Invaders',
    title: '✻ Bug Invaders',
    reply: 'Bug Invaders are up. Click the game, then ←/→ to move and Space to fire.',
    help: 'Clawd vs marching bugs · ←/→ to move, Space to fire',
    usesSlaps: false,
  },
  pong: {
    name: 'Clawd Pong',
    title: '✻ Clawd Pong',
    reply: 'Clawd Pong is up. Click the game, then ↑/↓ to play Haiku.',
    help: 'beat Haiku, then Sonnet, then Opus · ↑/↓ to move',
    usesSlaps: false,
  },
}
const IDS = Object.keys(GAMES) as GameId[]
const isGame = (v: unknown): v is GameId => typeof v === 'string' && v in GAMES
const paneOf = (id: GameId) => `arcade-${id}`

type Opts = { dinoTheme: DinoTheme; pauseWhip: boolean; slapMinG: number }

function opts(o: Record<string, unknown> | undefined): Opts {
  const minG = o?.slapMinG
  return {
    dinoTheme: o?.dinoTheme === 'chrome' ? 'chrome' : 'claude',
    pauseWhip: o?.pauseWhip !== false,
    slapMinG: typeof minG === 'number' && Number.isFinite(minG) ? Math.max(0, minG) : 0.08,
  }
}

// Bookkeeping only (a reload starts it over); everything drawn lives in $.state.
const S = {
  listening: false,
  wantSlaps: false,
  slaps: 0,
  sensor: 'connecting' as 'connecting' | 'on' | 'off',
  whipHome: '',
  whipCli: null as string[] | null,
  /** The game panes open now. */
  open: new Set<GameId>(),
}

async function exists($: $T, path: string): Promise<boolean> {
  try {
    await $.fs.stat(path)
    return true
  } catch {
    return false
  }
}

async function readJson($: $T, path: string): Promise<any> {
  try {
    return JSON.parse(await $.fs.read(path))
  } catch {
    return null
  }
}

function wait($: $T, ms: number): Promise<void> {
  return new Promise(resolve => {
    $.clock.after(ms, resolve)
  })
}

async function setSensor($: $T, value: 'on' | 'off'): Promise<void> {
  if (S.sensor === value) return
  S.sensor = value
  await $.state.set(SENSOR, value)
}

// ---------- slaps: ClaudeWhip's sensor socket, only while the pane is open ----------

/**
 * Started once per session. While the pane is open it streams the sensor socket and writes
 * each slap once, straight to state; the sensor serves 8 clients, so it lets go when closed
 * (on the next line it reads, since a quiet socket gives the loop nothing to wake on).
 */
async function listen($: $T, minG: number): Promise<void> {
  if (S.listening) return
  S.listening = true
  const sock = (await $.env.get('WHIP_SENSOR_SOCKET')) || SENSOR_SOCKET
  let backoff = 1000
  for (;;) {
    if (!S.wantSlaps) {
      await wait($, 500)
      continue
    }
    if (!(await exists($, sock))) {
      await setSensor($, 'off')
      await wait($, 5000)
      continue
    }
    let buf = ''
    try {
      for await (const chunk of $.process.spawn({ argv: ['/usr/bin/nc', '-dU', sock] })) {
        if (!S.wantSlaps) break // leaving the loop ends nc
        if (chunk.stream !== 'stdout') continue
        backoff = 1000
        await setSensor($, 'on')
        const { lines, rest } = takeLines(buf + chunk.text)
        buf = rest
        for (const line of lines) {
          const slap = parseSlap(line, minG, Date.now())
          if (!slap) continue
          S.slaps++
          await $.state.set(HIT, { n: S.slaps, tier: slap.tier, at: slap.at })
        }
      }
    } catch {}
    if (!S.wantSlaps) continue
    await setSensor($, 'off')
    await wait($, backoff)
    backoff = Math.min(30000, backoff * 2)
  }
}

// Same resolution as ClaudeWhip's lib/paths.js: WHIP_HOME, CLAUDE_CONFIG_DIR/whip, ~/.claude/whip.
async function whipHome($: $T): Promise<string> {
  if (S.whipHome) return S.whipHome
  const wh = await $.env.get('WHIP_HOME')
  const cd = await $.env.get('CLAUDE_CONFIG_DIR')
  S.whipHome = wh || (cd ? `${cd}/whip` : `${(await $.env.get('HOME')) || ''}/.claude/whip`)
  return S.whipHome
}

// node + bin/whip, from what ClaudeWhip's install.sh recorded.
async function whipCli($: $T): Promise<string[] | null> {
  if (S.whipCli) return S.whipCli
  const rec = await readJson($, `${await whipHome($)}/install.json`)
  if (!rec || typeof rec.repoRoot !== 'string') return null
  S.whipCli = typeof rec.node === 'string' && rec.node ? [rec.node, `${rec.repoRoot}/bin/whip`] : ['/usr/bin/env', 'node', `${rec.repoRoot}/bin/whip`]
  return S.whipCli
}

/** Pauses the whip unless it already is, and remembers that we did, so only we undo it. */
async function pauseWhip($: $T): Promise<void> {
  if ((await $.store.get('pausedWhip')) === true) return
  const st = await readJson($, `${await whipHome($)}/state.json`)
  if (!st || st.paused) return
  const cli = await whipCli($)
  if (!cli) return
  const r = await $.process.run([...cli, 'off'], { timeoutMs: 10000 })
  if (r.exitCode === 0) await $.store.set('pausedWhip', true)
}

async function resumeWhip($: $T): Promise<void> {
  if ((await $.store.get('pausedWhip')) !== true) return
  await $.store.delete('pausedWhip')
  const cli = await whipCli($)
  if (cli) await $.process.run([...cli, 'on'], { timeoutMs: 10000 })
}

// ---------- the games ----------

async function openMenu($: $T): Promise<void> {
  await $.ui.open({ id: MENU, title: '✻ Claude Code Arcade', focus: true, rows: IDS.length * 2 + 4 })
}

async function openGame($: $T, id: GameId, o: Opts): Promise<void> {
  await $.ui.close({ id: MENU }).catch(() => {})
  const title = id === 'dino' && o.dinoTheme === 'chrome' ? '🦖 No internet' : GAMES[id].title
  await $.ui.open({ id: paneOf(id), title, focus: true, rows: 26, columns: 76 })
  S.open.add(id)
  S.wantSlaps = SLAPS && [...S.open].some(g => GAMES[g].usesSlaps)
  if (S.wantSlaps && o.pauseWhip) await pauseWhip($)
}

async function closedGame($: $T, id: GameId): Promise<void> {
  S.open.delete(id)
  S.wantSlaps = SLAPS && [...S.open].some(g => GAMES[g].usesSlaps)
  if (!S.wantSlaps) await resumeWhip($)
}

export const register: Register = (on, options) => {
  const o = opts(options as Record<string, unknown> | undefined)

  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({ name: COMMAND, description: 'Claude Code Arcade: pick a game, or open one by name', argumentHint: `[${IDS.join('|')}]` })
    } catch {
      $.ui.toast(`arcade: another plugin already has /${COMMAND}`)
    }
    const stored = await Promise.all(IDS.map(async id => [id, Number(await $.store.get(`best.${id}`)) || 0] as const))
    if (stored.some(([, b]) => b > 0)) await update($, bestA, b => ({ ...b, ...Object.fromEntries(stored) }))
    // A pause left behind by a reload or crash (its pane is gone now) ends here, slaps on or off.
    await resumeWhip($)
    if (SLAPS) void listen($, o.slapMinG)
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    S.open.clear()
    S.wantSlaps = false
    await resumeWhip($)
    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (!arg) {
      await openMenu($)
      return { text: 'Pick a game.' }
    }
    if (!isGame(arg)) return { text: `No game called "${arg}". Try: ${IDS.map(id => `/arcade ${id}`).join(', ')}` }
    await openGame($, arg, o)
    return { text: GAMES[arg].reply }
  })

  on('ui.render', { component: 'Pane', requestId: MENU }, async ($, e) => {
    const best = await read($, bestA)
    const { Box, Button, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {IDS.map((id, i) => (
          <Box flexDirection="row" gap={1}>
            <Button key={id} label={GAMES[id].name} hotkey={String(i + 1)} {...(i === 0 ? { variant: 'primary', autoFocus: true } : {})} onPress={() => openGame($, id, o)} />
            <Text dimColor wrap="truncate-end">{`${GAMES[id].help}${best[id] ? ` · best ${best[id]}` : ''}`}</Text>
          </Box>
        ))}
        <Box flexDirection="row" gap={1}>
          <Button key="close" label="close" role="dismiss" onPress={() => $.ui.close({ id: MENU })} />
          <Text dimColor>{`or /arcade ${IDS.join(' | ')}`}</Text>
        </Box>
      </Box>
    )
  })

  for (const id of IDS) {
    on('ui.render', { component: 'Pane', requestId: paneOf(id) }, async ($, e) => {
      if (e.surface !== 'terminal' && e.surface !== 'desktop') {
        const { Text } = $.ui.resolve(e)
        return <Text>{`${GAMES[id].name} needs the terminal or the desktop app.`}</Text>
      }
      const [hit, bests, sensor] = await Promise.all([read($, hitA), read($, bestA), read($, sensorA)])
      const best = bests[id] ?? 0
      const columns = Math.max(30, Math.min(120, e.props.bodyColumns ?? 76))
      // Desktop cells are big; a shorter region keeps the whole field (and its HUD) in view.
      const rows = e.surface === 'desktop' ? 22 : Math.max(14, Math.min(30, (e.viewport?.rows ?? 30) - 6))
      const { Box, Button, Client, Text } = $.ui.resolve(e)
      // A Client's module is a literal path, so each game spells out its own.
      const game =
        id === 'flappy' ? (
          <Client key="flappy" module="../games/flappy.tsx" props={{ hit, best, surface: e.surface }} width={columns} height={rows} />
        ) : id === 'dino' ? (
          <Client key="dino" module="../games/dino.tsx" props={{ hit, best, surface: e.surface, theme: o.dinoTheme }} width={columns} height={rows} />
        ) : id === 'snake' ? (
          <Client key="snake" module="../games/snake.tsx" props={{ best, surface: e.surface }} width={columns} height={rows} />
        ) : id === 'invaders' ? (
          <Client key="invaders" module="../games/invaders.tsx" props={{ best, surface: e.surface }} width={columns} height={rows} />
        ) : (
          <Client key="pong" module="../games/pong.tsx" props={{ best, surface: e.surface }} width={columns} height={rows} />
        )
      return (
        <Box flexDirection="column">
          {game}
          <Box flexDirection="row" gap={1}>
            <Button
              key="games"
              label="games"
              onPress={async () => {
                await $.ui.close({ id: paneOf(id) })
                await openMenu($)
              }}
            />
            <Button key="close" label="close" role="dismiss" onPress={() => $.ui.close({ id: paneOf(id) })} />
            <Text dimColor>{SLAPS && GAMES[id].usesSlaps && sensor === 'on' ? `👋 slap sensor on · ${hit.n} slaps` : ''}</Text>
          </Box>
        </Box>
      )
    })
  }

  // The score a game posts when a run ends.
  on('ui.message', async ($, e, next) => {
    const d = e.data as { game?: unknown; score?: unknown } | null
    if (d && isGame(d.game) && typeof d.score === 'number' && Number.isFinite(d.score)) {
      const id = d.game
      const score = Math.max(0, Math.floor(d.score))
      if (score > ((await read($, bestA))[id] ?? 0)) {
        await update($, bestA, b => ({ ...b, [id]: score }))
        await $.store.set(`best.${id}`, score)
        $.ui.toast(`${id === 'dino' && o.dinoTheme === 'chrome' ? '🦖' : '✻'} ${GAMES[id].name} · new best: ${score}`, { timeoutMs: 2500 })
      }
    }
    return next(e)
  })

  on('ui.close', async ($, e, next) => {
    const id = IDS.find(g => paneOf(g) === e.id)
    if (id) await closedGame($, id)
    return next(e)
  })
}
