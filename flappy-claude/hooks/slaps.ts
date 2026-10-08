// Slaps straight from the ClaudeWhip sensor daemon: it broadcasts every hit as one JSON
// line ({"ts","g","tier"}) on a unix socket the user owns. Pure parsing lives here; the
// register module streams the socket with `nc -dU` and feeds each line to parseSlap.
import type { FlappyTier } from '../types'

export const SENSOR_SOCKET = '/var/run/claudewhip/sensor.sock'

export type Slap = { g: number; tier: FlappyTier; at: number }

/**
 * One socket line to a slap, with whip/bridge/bridge.js's validation; null to ignore it.
 * `at` is when the sensor felt it, unless that is skewed by more than 5 s from `now`.
 */
export function parseSlap(line: string, minG: number, now: number): Slap | null {
  let ev: any
  try {
    ev = JSON.parse(line)
  } catch {
    return null
  }
  if (!ev || typeof ev !== 'object' || ev.type === 'hello') return null
  const g = Number(ev.g)
  if (!Number.isFinite(g) || g < 0 || g > 16 || g < minG) return null
  const tier: FlappyTier = ev.tier === 'wallop' || ev.tier === 'tap' ? ev.tier : 'slap'
  const ts = Number(ev.ts)
  return { g, tier, at: Number.isFinite(ts) && Math.abs(now - ts) < 5000 ? ts : now }
}

/** Splits a buffer of socket text into complete lines and the unfinished rest. */
export function takeLines(buf: string): { lines: string[]; rest: string } {
  const parts = buf.split('\n')
  const rest = parts.pop() ?? ''
  return { lines: parts, rest: rest.length > 65536 ? '' : rest }
}
