/**
 * Language toggle pill — TR | EN.
 * Persists to localStorage and re-renders all translated components.
 */
import { useLang, type Lang } from '../i18n'

interface Props {
  /** 'dark' for dark surfaces (sidebar footer), 'light' for light (top nav). */
  variant?: 'dark' | 'light'
}

export function LangToggle({ variant = 'light' }: Props) {
  const { lang, setLang } = useLang()

  const base =
    variant === 'dark'
      ? 'bg-white/10 border-white/10'
      : 'bg-slate-100 border-slate-200'

  const btnIdle =
    variant === 'dark'
      ? 'text-white/60 hover:text-white'
      : 'text-slate-500 hover:text-slate-900'

  const btnActive =
    variant === 'dark'
      ? 'bg-white/15 text-white'
      : 'bg-white text-slate-900 shadow-sm'

  const make = (code: Lang, label: string) => (
    <button
      key={code}
      onClick={() => setLang(code)}
      aria-pressed={lang === code}
      className={`px-2 h-6 text-[10px] font-bold tracking-wider rounded ${
        lang === code ? btnActive : btnIdle
      }`}
    >
      {label}
    </button>
  )

  return (
    <div
      role="group"
      aria-label="Language"
      className={`inline-flex items-center gap-0.5 rounded-md border p-0.5 h-7 ${base}`}
    >
      {make('tr', 'TR')}
      {make('en', 'EN')}
    </div>
  )
}
