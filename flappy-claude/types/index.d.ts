export type FlappyTier = 'tap' | 'slap' | 'wallop'

/** The latest slap: how many so far, how hard, and when the sensor felt it (epoch ms). */
export type FlappyHit = { n: number; tier: FlappyTier; at: number }

/** What the game's surface module posts to the hooks module when a run ends. */
export type FlappyPost = { game: 'flappy'; score: number }

/** What the hooks module hands the game's surface module. */
export type FlappyProps = { hit: FlappyHit; best: number; surface: 'terminal' | 'desktop' }

declare module 'claude-code' {
  interface PluginState {
    'flappy-claude': {
      /** One write per slap; Clawd flaps when `n` goes up. */
      hit: FlappyHit
      best: number
      /** Whether the ClaudeWhip slap sensor is connected. */
      sensor: 'connecting' | 'on' | 'off'
    }
  }
}
