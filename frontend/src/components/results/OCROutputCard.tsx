/**
 * OCROutputCard — prominent "what the OCR/detection actually read" panel.
 *
 * Shows per-question-type raw outputs:
 *   • MC    → bubble fill % per option + OCR confidence + which letter the
 *             detector "chose" (darkest bubble)
 *   • Fill  → OCR text per blank with per-blank confidence, expected vs read
 *   • Open  → first 200 chars of OCR'd handwritten text + model confidence
 *
 * This is the single source of truth for "did the machine read this right?"
 * — the teacher's primary decision input.
 */
import type { AnswerDetail } from '../../types'
import { useLang } from '../../i18n'

interface Props {
  answer: AnswerDetail
  /** Compact spacing for right-rail placement. */
  compact?: boolean
}

const DARKNESS_COLOR = (v: number): string => {
  if (v >= 0.5) return 'bg-slate-900'
  if (v >= 0.3) return 'bg-slate-500'
  if (v >= 0.15) return 'bg-slate-300'
  return 'bg-slate-100'
}

const CONF_COLOR = (v: number | null | undefined): string => {
  const c = v ?? 0
  if (c >= 0.9) return 'text-emerald-700 bg-emerald-50 border-emerald-200'
  if (c >= 0.75) return 'text-amber-700 bg-amber-50 border-amber-200'
  return 'text-red-700 bg-red-50 border-red-200'
}

export default function OCROutputCard({ answer, compact = false }: Props) {
  const { t } = useLang()
  const ocrPct = Math.round((answer.ocr_confidence ?? 0) * 100)
  const modelPct = Math.round((answer.confidence ?? 0) * 100)

  return (
    <section className={`rounded-xl border border-slate-200 bg-white ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-slate-600 text-base">scanner</span>
          <h4 className="text-[11px] font-bold tracking-widest uppercase text-slate-700">
            {t('ocr.title')}
          </h4>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${CONF_COLOR(answer.ocr_confidence)}`}>
            OCR {ocrPct}%
          </span>
        </div>
      </div>

      {/* ── MC: bubble detector output ───────────────────────────── */}
      {answer.question_type === 'mc' && answer.bubble_fills && (
        <>
          <p className="text-[10px] text-slate-500 mb-2">
            {t('ocr.mcHint')}
          </p>
          <div className="space-y-1.5">
            {Object.entries(answer.bubble_fills).map(([letter, darkness]) => {
              const pct = Math.round(darkness * 100)
              const isSelected = letter === answer.student_answer
              const isExpected = letter === answer.correct_answer
              return (
                <div
                  key={letter}
                  className={`flex items-center gap-2 px-2 py-1 rounded-md ${
                    isSelected ? 'bg-primary-50 ring-1 ring-primary-300' : ''
                  }`}
                >
                  <span className="font-mono text-xs font-bold text-slate-700 w-3">{letter}</span>
                  <div className="flex-1 h-3 bg-slate-100 rounded-sm overflow-hidden">
                    <div
                      className={`h-full ${DARKNESS_COLOR(darkness)} transition-all`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-slate-600 tabular-nums w-8 text-right">
                    {pct}%
                  </span>
                  {isSelected && (
                    <span className="text-[9px] font-bold text-primary-700 bg-primary-100 px-1.5 py-0.5 rounded">
                      {t('ocr.selectedTag')}
                    </span>
                  )}
                  {isExpected && !isSelected && (
                    <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                      {t('ocr.correctTag')}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 text-[10px] text-slate-500">
            {t('ocr.threshold')}
          </div>
        </>
      )}

      {/* ── Fill: per-blank OCR text output ───────────────────────── */}
      {answer.question_type === 'fill' && (
        <>
          <p className="text-[10px] text-slate-500 mb-2">
            {t('ocr.fillHint')}
          </p>
          <div className="space-y-2">
            {answer.fill_blanks && Object.entries(answer.fill_blanks).map(([idx, readText]) => {
              const correctText = answer.correct_blanks?.[idx] ?? ''
              const match = readText.trim().toLowerCase() === correctText.trim().toLowerCase()
              const isEmpty = !readText.trim()
              return (
                <div
                  key={idx}
                  className={`rounded-md border p-2 ${
                    match ? 'bg-emerald-50 border-emerald-200' :
                    isEmpty ? 'bg-slate-50 border-slate-200' :
                    'bg-amber-50 border-amber-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[10px] font-bold text-slate-600">
                      {t('ocr.blankLabel')} #{idx}
                    </span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                      match ? 'bg-emerald-600 text-white' :
                      isEmpty ? 'bg-slate-400 text-white' :
                      'bg-amber-600 text-white'
                    }`}>
                      {match ? `✓ ${t('ocr.matched')}` : isEmpty ? t('ocr.empty') : `≠ ${t('ocr.differs')}`}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[10px] text-slate-500 shrink-0">{t('ocr.read')}:</span>
                    <span className="font-mono text-xs font-semibold text-slate-900 flex-1 min-w-0 truncate">
                      {readText || '—'}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="text-[10px] text-slate-500 shrink-0">{t('ocr.expected')}:</span>
                    <span className="font-mono text-xs text-slate-600 flex-1 min-w-0 truncate">
                      {correctText}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ── Open: handwriting OCR output ─────────────────────────── */}
      {answer.question_type === 'open' && answer.handwritten_answer && (
        <>
          <p className="text-[10px] text-slate-500 mb-2">
            {t('ocr.openHint')}
          </p>
          <div className="bg-slate-50 border border-slate-200 rounded-md p-2.5">
            <p className="text-[10px] text-slate-500 mb-1 font-semibold tracking-wide">
              {t('ocr.readText')}
            </p>
            <p className="text-xs text-slate-800 leading-relaxed font-sans whitespace-pre-wrap line-clamp-6">
              {answer.handwritten_answer}
            </p>
            <div className="mt-2 pt-2 border-t border-slate-200 flex items-center justify-between text-[10px]">
              <span className="text-slate-500 font-mono">
                {t('ocr.charsCount', { n: answer.handwritten_answer.length })}
              </span>
              <span className={`font-semibold px-2 py-0.5 rounded-full border ${CONF_COLOR(answer.confidence)}`}>
                {t('ocr.modelConfidence')}: {modelPct}%
              </span>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
