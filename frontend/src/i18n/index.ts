/**
 * Tiny i18n for exam-engine.
 *
 * - TR default (audience: Turkish university professors).
 * - EN as a toggle.
 * - useSyncExternalStore pattern so any component re-renders on language change.
 * - Persisted to localStorage.iku.lang.
 *
 * Usage:
 *   const { t, lang, setLang } = useLang()
 *   t('nav.dashboard')                        // "Pano"
 *   t('dashboard.completedExams', { n: 3 })   // "3 tamamlanmış sınav"
 */
import { useCallback, useSyncExternalStore } from 'react'
import { tr, type TranslationKey } from './tr'
import { en } from './en'

export type Lang = 'tr' | 'en'

const DICTS: Record<Lang, Record<string, string>> = {
  tr: tr as unknown as Record<string, string>,
  en: en as Record<string, string>,
}

const LS_KEY = 'ee.lang'

function readInitial(): Lang {
  if (typeof window === 'undefined') return 'tr'
  const stored = window.localStorage.getItem(LS_KEY)
  return stored === 'en' ? 'en' : 'tr'
}

let current: Lang = readInitial()
const listeners = new Set<() => void>()

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function getSnapshot(): Lang {
  return current
}

export function setLang(next: Lang): void {
  if (next === current) return
  current = next
  try { window.localStorage.setItem(LS_KEY, next) } catch { /* ignore */ }
  listeners.forEach((l) => l())
}

export function getLang(): Lang {
  return current
}

function interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s
  return s.replace(/\{(\w+)\}/g, (_, key: string) =>
    vars[key] !== undefined ? String(vars[key]) : `{${key}}`,
  )
}

/** Call outside of React (e.g. in utilities or toasts). */
export function t(key: TranslationKey, vars?: Record<string, string | number>): string {
  const dict = DICTS[current] || DICTS.tr
  const raw = dict[key] ?? (DICTS.tr[key] as string | undefined) ?? key
  return interpolate(raw, vars)
}

/** React hook — re-renders on language change. */
export function useLang(): {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
} {
  const lang = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const tBound = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) => {
      const dict = DICTS[lang] || DICTS.tr
      const raw = dict[key] ?? (DICTS.tr[key] as string | undefined) ?? key
      return interpolate(raw, vars)
    },
    [lang],
  )
  return { lang, setLang, t: tBound }
}

export type { TranslationKey }
