/**
 * Per-student handwriting style — seeded RNG (Mulberry32).
 *
 * Given the student's `handwriting_seed` (int from the backend, derived
 * from their student_id), produce a stable style bundle so the same student
 * always looks the same across navigations / re-renders.
 *
 *   fontClass   — one of 3 handwriting Google Fonts
 *   colorClass  — black, dark-blue, or slate-ish
 *   sizeClass   — small jitter (±1px on base size)
 *   rotationDeg — overall block rotation ±0.6°
 *   lineJitter  — per-word/-line jitter so paragraph lines wobble
 */
export interface HandwritingStyle {
  fontClass: string
  colorClass: string
  sizeClass: string
  fontSizePx: number
  rotationDeg: number
  jitter: (i: number) => { rotation: number; xOffset: number }
}

// Mulberry32 — 32-bit seeded PRNG, tiny + fast + deterministic.
function mulberry32(seed: number) {
  let s = seed >>> 0
  return function rand() {
    s = (s + 0x6D2B79F5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const FONTS = ['font-caveat', 'font-kalam', 'font-patrick'] as const
const COLORS = ['text-gray-900', 'text-blue-900', 'text-slate-800'] as const

export function handwritingStyle(seed: number | null | undefined): HandwritingStyle {
  const s = typeof seed === 'number' && Number.isFinite(seed) ? seed : 0
  const rng = mulberry32(s)

  const fontClass = FONTS[Math.floor(rng() * FONTS.length)]
  const colorClass = COLORS[Math.floor(rng() * COLORS.length)]
  // Base size varies between 14px and 16px per student
  const fontSizePx = 14 + Math.floor(rng() * 3) // 14, 15, or 16
  // Use a Tailwind text size proxy for the chip — but we'll mostly inline via style={fontSize}
  const sizeClass = fontSizePx >= 16 ? 'text-[16px]' : fontSizePx >= 15 ? 'text-[15px]' : 'text-[14px]'
  const rotationDeg = (rng() - 0.5) * 1.2 // ±0.6°

  // Per-line / per-word jitter so a paragraph isn't perfectly straight.
  const jitter = (i: number) => {
    const r = mulberry32(s + i * 17)
    return {
      rotation: (r() - 0.5) * 1.4,
      xOffset: (r() - 0.5) * 2,
    }
  }

  return { fontClass, colorClass, sizeClass, fontSizePx, rotationDeg, jitter }
}
