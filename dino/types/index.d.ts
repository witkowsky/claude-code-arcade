export type DinoTier = 'tap' | 'slap' | 'wallop'

/** The latest slap: how many so far, how hard, and when the sensor felt it (epoch ms). */
export type DinoHit = { n: number; tier: DinoTier; at: number }

/** What the game's surface module posts to the hooks module when a run ends. */
export type DinoPost = { game: 'dino'; score: number }

/** Which skin the runner wears: Clawd in Claude's colours, or Chrome's grey T-Rex. */
export type DinoTheme = 'claude' | 'chrome'

/** What the hooks module hands the game's surface module. */
export type DinoProps = { hit: DinoHit; best: number; surface: 'terminal' | 'desktop'; theme: DinoTheme }

declare module 'claude-code' {
  interface PluginState {
    dino: {
      /** One write per slap; the dino jumps when `n` goes up. */
      hit: DinoHit
      best: number
      /** Whether the ClaudeWhip slap sensor is connected. */
      sensor: 'connecting' | 'on' | 'off'
    }
  }
}
