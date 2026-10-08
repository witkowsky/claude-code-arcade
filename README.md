# Claude Code Arcade

Little games that live in a Claude Code pane, for the minutes while the agent works. They run in the terminal and in the desktop app's Code tab.

| Game | Command | What it is |
|---|---|---|
| **Flappy Claude** | `/flappy` | Flappy Bird with Clawd, the Claude Code mascot, flapping between pipes. Collect ✻ tokens. |
| **Dino** | `/dino` | The Chrome "no internet" runner. Clawd hops pipes and ducks bugs in Claude's colours, or pick the original T-Rex with its cacti and pterodactyls. |

## Install

At a Claude Code prompt:

```
/plugin install flappy-claude --marketplace witkowsky/claude-code-arcade
```

```
/plugin install dino --marketplace witkowsky/claude-code-arcade
```

Answer `y` to add the marketplace and pick a scope. Then start a new session, or run `/reload-plugins`.

The games are mods: plugins built from function hooks. They need a Claude Code build that loads mods, both in the terminal and in the desktop Code tab.

## Play

- `/flappy` or `/dino` opens the game in a pane.
- **Click the game once** so it gets the keyboard, then:
  - Flappy Claude: **Space** / **↑** / click to flap.
  - Dino: **Space** / **↑** / click to jump, **↓** to duck.
- After a crash, Space starts a new run. Your best score is kept between sessions.
- **Esc** returns to the prompt, and `close` closes the pane.

### Runner

`/dino` runs Clawd by default. To get Chrome's grey T-Rex back, set `theme` to `chrome` (`/plugin configure dino@claude-code-arcade`).

## How it works

- Each game is a `Client` surface module, so it runs on the drawing surface itself, with its own 30 fps clock and keyboard and mouse input. Nothing makes a round trip per frame.
- Frames are drawn in pixels:
  - **Terminal:** each cell shows two pixels as a `▀` half block.
  - **Desktop:** text sits in taller line boxes there, so each cell is one background-coloured pixel. The frame is drawn in square pixels and folded into those taller cells, keeping thin details like Clawd's eyes.
- The hooks module opens the pane and keeps the best score in the plugin store.

Each plugin has tests:

```bash
claude plugin test flappy-claude
```

```bash
claude plugin test dino
```

## Credits

- Unofficial fan project, not affiliated with or endorsed by Anthropic. Clawd is the Claude Code mascot.
- Both runners follow the rules of Chrome's T-Rex runner: its speeds, gravity, gaps and pterodactyl timing come from Chromium's BSD-licensed source. The sprites were redrawn for this tiny pixel grid.

MIT licensed, see [LICENSE](LICENSE).
