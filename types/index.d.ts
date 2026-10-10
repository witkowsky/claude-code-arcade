/** The games in the arcade, as `/arcade <game>` names them. */
export type GameId = 'flappy' | 'dino' | 'snake' | 'invaders' | 'pong'

export type SlapTier = 'tap' | 'slap' | 'wallop'

/** The latest slap: how many so far, how hard, and when the sensor felt it (epoch ms). */
export type Hit = { n: number; tier: SlapTier; at: number }

/** What a game's surface module posts to the hooks module when a run ends. */
export type GamePost = { game: GameId; score: number }

/** Each game's best score. */
export type Bests = Record<GameId, number>

export type Surface = 'terminal' | 'desktop'

/** What the hooks module hands each game's surface module. */
export type FlappyProps = { hit: Hit; best: number; surface: Surface }

/** Which skin the runner wears: Clawd in Claude's colours, or Chrome's grey T-Rex. */
export type DinoTheme = 'claude' | 'chrome'
export type DinoProps = { hit: Hit; best: number; surface: Surface; theme: DinoTheme }

export type SnakeProps = { best: number; surface: Surface }
export type InvadersProps = { best: number; surface: Surface }
export type PongProps = { best: number; surface: Surface }

declare module 'claude-code' {
  interface PluginState {
    arcade: {
      /** One write per slap; Clawd flaps or jumps when `n` goes up. */
      hit: Hit
      best: Bests
      /** Whether the ClaudeWhip slap sensor is connected. */
      sensor: 'connecting' | 'on' | 'off'
    }
  }
}
