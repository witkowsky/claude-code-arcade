// The Chrome no-internet runner in a pane, as Clawd (theme "claude") or the T-Rex ("chrome").
// The game runs on the drawing surface (games/dino.tsx); this module opens the pane, keeps the
// best score and, when slaps are on and ClaudeWhip is installed, turns a slap on the MacBook
// into a jump while the pane is open (pausing the whip meanwhile).
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { DinoTheme } from '../types'
import { SENSOR_SOCKET, parseSlap, takeLines } from './slaps'

type $T = EngineInterface

// Slap-to-jump is switched off for now: no sensor socket, no whip pause. To bring it back,
// set this and restore the pauseWhip / slapMinG fields in plugin.json's userConfig.
const SLAPS = false

const HIT = { plugin: 'dino', key: 'hit' } as const
const SENSOR = { plugin: 'dino', key: 'sensor' } as const
const hitA = atom(HIT, { n: 0, tier: 'slap', at: 0 })
const bestA = atom({ plugin: 'dino', key: 'best' } as const, 0)
const sensorA = atom(SENSOR, 'connecting')

const PANE = 'dino-game'
const COMMAND = 'dino'

// What the pane, the command and the toast say for each runner.
const WORDS: Record<DinoTheme, { title: string; icon: string; reply: string }> = {
  claude: { title: '✻ Clawd run', icon: '✻', reply: "Clawd's offline. Click the game, then Space to jump and ↓ to duck." },
  chrome: { title: '🦖 No internet', icon: '🦖', reply: 'No internet. Click the game, then Space to jump and ↓ to duck.' },
}

type Opts = { theme: DinoTheme; pauseWhip: boolean; slapMinG: number }

function opts(o: Record<string, unknown> | undefined): Opts {
  const minG = o?.slapMinG
  return {
    theme: o?.theme === 'chrome' ? 'chrome' : 'claude',
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

// ---------- the game ----------

async function openGame($: $T, o: Opts): Promise<void> {
  S.wantSlaps = SLAPS
  await $.ui.open({ id: PANE, title: WORDS[o.theme].title, focus: true, rows: 26, columns: 76 })
  if (SLAPS && o.pauseWhip) await pauseWhip($)
}

async function closeGame($: $T): Promise<void> {
  S.wantSlaps = false
  await resumeWhip($)
}

export const register: Register = (on, options) => {
  const o = opts(options as Record<string, unknown> | undefined)

  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({ name: COMMAND, description: 'The no-internet runner in a pane, Clawd or the T-Rex: Space or click to jump' })
    } catch {
      $.ui.toast(`dino: another plugin already has /${COMMAND}`)
    }
    const best = Number(await $.store.get('best')) || 0
    if (best > 0) await update($, bestA, () => best)
    // A pause left behind by a reload or crash (its pane is gone now) ends here, slaps on or off.
    await resumeWhip($)
    if (SLAPS) void listen($, o.slapMinG)
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    await closeGame($)
    return next(e)
  })

  on('command.run', { command: 'dino' }, async $ => {
    await openGame($, o)
    return { text: WORDS[o.theme].reply }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    if (e.surface !== 'terminal' && e.surface !== 'desktop') {
      const { Text } = $.ui.resolve(e)
      return <Text>The dino needs the terminal or the desktop app.</Text>
    }
    const [hit, best, sensor] = await Promise.all([read($, hitA), read($, bestA), read($, sensorA)])
    const columns = Math.max(30, Math.min(120, e.props.bodyColumns ?? 76))
    // Desktop cells are big; a shorter region keeps the whole field (and its HUD) in view.
    const rows = e.surface === 'desktop' ? 22 : Math.max(14, Math.min(30, (e.viewport?.rows ?? 30) - 6))
    const { Box, Button, Client, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Client key="dino" module="../games/dino.tsx" props={{ hit, best, surface: e.surface, theme: o.theme }} width={columns} height={rows} />
        <Box flexDirection="row" gap={1}>
          <Button key="close" label="close" role="dismiss" onPress={() => $.ui.close({ id: PANE })} />
          <Text dimColor>{sensor === 'on' ? `👋 slap sensor on · ${hit.n} slaps` : ''}</Text>
        </Box>
      </Box>
    )
  })

  // The score the game posts when a run ends.
  on('ui.message', async ($, e, next) => {
    const d = e.data as { game?: unknown; score?: unknown } | null
    if (d && d.game === 'dino' && typeof d.score === 'number' && Number.isFinite(d.score)) {
      const score = Math.max(0, Math.floor(d.score))
      if (score > (await read($, bestA))) {
        await update($, bestA, () => score)
        await $.store.set('best', score)
        $.ui.toast(`${WORDS[o.theme].icon} New best: ${score}`, { timeoutMs: 2500 })
      }
    }
    return next(e)
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) await closeGame($)
    return next(e)
  })
}
