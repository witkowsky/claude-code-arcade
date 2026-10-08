// A tiny framebuffer and two ways to put it on screen:
// - terminal: half-block cells, each cell two pixels (the ▀ glyph's colour over its background);
// - desktop: background-only cells. The desktop draws ▀ inside a taller line box, so its glyph
//   no longer covers exactly the top half and half-blocks smear; a cell's background does fill it.
//   Desktop cells are about 0.6 as wide as tall, so a game draws square pixels and squash()
//   folds them into the taller cells, keeping thin foreground (a 1-pixel ground line, the dino) visible.
// Runs of identical cells merge into one Text, so a frame stays a few hundred nodes.

export type Frame = { w: number; h: number; px: string[]; fg: Uint8Array }

/** One run of identical cells in a row: `n` cells of top `fg` over bottom `bg`. */
export type Run = { fg: string; bg: string; n: number }

/** Width / height of a desktop text cell, measured off the Code tab (25 x 41 px). */
export const DESKTOP_CELL_ASPECT = 0.6

export function frame(w: number, h: number, bg: string): Frame {
  return { w, h, px: new Array<string>(w * h).fill(bg), fg: new Uint8Array(w * h) }
}

/** Paints a pixel; `isBackground` paints scenery that squash() may drop. */
export function dot(f: Frame, x: number, y: number, c: string, isBackground = false): void {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  if (xi < 0 || yi < 0 || xi >= f.w || yi >= f.h) return
  f.px[yi * f.w + xi] = c
  f.fg[yi * f.w + xi] = isBackground ? 0 : 1
}

export function rect(f: Frame, x: number, y: number, w: number, h: number, c: string, isBackground = false): void {
  const x0 = Math.max(0, Math.floor(x))
  const y0 = Math.max(0, Math.floor(y))
  const x1 = Math.min(f.w, Math.floor(x + w))
  const y1 = Math.min(f.h, Math.floor(y + h))
  for (let yy = y0; yy < y1; yy++)
    for (let xx = x0; xx < x1; xx++) {
      f.px[yy * f.w + xx] = c
      f.fg[yy * f.w + xx] = isBackground ? 0 : 1
    }
}

/** Scenery: a rect squash() may drop in favour of foreground in the same cell. */
export function fill(f: Frame, x: number, y: number, w: number, h: number, c: string): void {
  rect(f, x, y, w, h, c, true)
}

/**
 * Draws a sprite of palette letters ('.' is transparent) with its top-left at (x, y),
 * nearest-neighbour scaled to `size` pixels tall when given.
 */
export function sprite(f: Frame, rows: readonly string[], pal: Record<string, string>, x: number, y: number, size?: number): void {
  const sh = rows.length
  const sw = rows[0]?.length ?? 0
  const { w: tw, h: th } = spriteSize(rows, size)
  for (let ty = 0; ty < th; ty++) {
    const row = rows[Math.min(sh - 1, Math.floor((ty * sh) / th))] ?? ''
    for (let tx = 0; tx < tw; tx++) {
      const ch = row[Math.min(sw - 1, Math.floor((tx * sw) / tw))] ?? '.'
      if (ch === '.') continue
      const c = pal[ch]
      if (c) dot(f, x + tx, y + ty, c)
    }
  }
}

export function spriteSize(rows: readonly string[], size?: number): { w: number; h: number } {
  const sh = rows.length
  const sw = rows[0]?.length ?? 0
  const th = size ? Math.max(1, Math.round(size)) : sh
  return { w: size ? Math.max(1, Math.round((sw * th) / sh)) : sw, h: th }
}

/** 3x5 digits, for numbers painted into the playfield. */
const GLYPHS: Record<string, string[]> = {
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '.##', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###'],
}

export function digits(f: Frame, text: string, x: number, y: number, c: string): number {
  let cx = x
  for (const ch of text) {
    const g = GLYPHS[ch]
    if (g) sprite(f, g, { '#': c }, cx, y)
    cx += 4
  }
  return cx - x
}

/**
 * Folds `f` into `rows` rows: each output pixel takes the first foreground pixel among the
 * source rows it covers, else the first one, so a 1-pixel pipe lip survives the squash.
 */
export function squash(f: Frame, rows: number): Frame {
  const out = frame(f.w, rows, '#000000')
  for (let y = 0; y < rows; y++) {
    const s0 = Math.floor((y * f.h) / rows)
    const s1 = Math.max(s0 + 1, Math.floor(((y + 1) * f.h) / rows))
    for (let x = 0; x < f.w; x++) {
      let pick = s0 * f.w + x
      for (let sy = s0; sy < s1; sy++)
        if (f.fg[sy * f.w + x]) {
          pick = sy * f.w + x
          break
        }
      out.px[y * f.w + x] = f.px[pick] ?? '#000000'
    }
  }
  return out
}

/** Terminal: two pixel rows per cell row, as ▀ runs. */
export function halfBlocks(f: Frame): Run[][] {
  const out: Run[][] = []
  for (let y = 0; y < f.h; y += 2) {
    const line: Run[] = []
    let last: Run | null = null
    for (let x = 0; x < f.w; x++) {
      const fg = f.px[y * f.w + x] ?? '#000000'
      const bg = y + 1 < f.h ? (f.px[(y + 1) * f.w + x] ?? fg) : fg
      if (last && last.fg === fg && last.bg === bg) last.n++
      else {
        last = { fg, bg, n: 1 }
        line.push(last)
      }
    }
    out.push(line)
  }
  return out
}

/** Desktop: one pixel per cell, background colour only. */
export function cells(f: Frame): Run[][] {
  const out: Run[][] = []
  for (let y = 0; y < f.h; y++) {
    const line: Run[] = []
    let last: Run | null = null
    for (let x = 0; x < f.w; x++) {
      const c = f.px[y * f.w + x] ?? '#000000'
      if (last && last.bg === c) last.n++
      else {
        last = { fg: c, bg: c, n: 1 }
        line.push(last)
      }
    }
    out.push(line)
  }
  return out
}

/** Linear blend of two #rrggbb colours, t in 0..1. */
export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const ch = (s: number) => {
    const ca = (pa >> s) & 255
    const cb = (pb >> s) & 255
    return Math.round(ca + (cb - ca) * Math.max(0, Math.min(1, t)))
  }
  return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)
}

/**
 * The square-pixel canvas a game draws for a region of `columns` x `rows` cells (one row
 * kept for the HUD), and how to turn it into runs for the surface.
 */
export function canvas(surface: 'terminal' | 'desktop', columns: number, rows: number): { pw: number; ph: number; toRuns: (f: Frame) => Run[][]; isCells: boolean } {
  const bodyRows = Math.max(6, rows - 1)
  if (surface === 'desktop') {
    return { pw: columns, ph: Math.round(bodyRows / DESKTOP_CELL_ASPECT), toRuns: f => cells(squash(f, bodyRows)), isCells: true }
  }
  return { pw: columns, ph: bodyRows * 2, toRuns: halfBlocks, isCells: false }
}
