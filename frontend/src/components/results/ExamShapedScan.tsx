/**
 * ExamShapedScan — a realistic mock of a scanned IKU exam page.
 *
 * Reproduces the visual conventions of Faruk's iku-exam-generator printed
 * output (without porting its Electron code):
 *   • 4 bullseye corner markers (TL / TR / BL / BR) — registration targets
 *   • QR code in the top-right, encoded P{page}_{course}_{type}_{year}
 *   • University header: T.C. Istanbul Kültür University + course/exam meta
 *   • Student number region with 10 digit boxes
 *   • Instructions block
 *   • Question blocks absolutely-positioned by bbox (from backend mock data)
 *
 * Renders in pure HTML+SVG — no external scan image needed. Used both as
 * the scan viewer in the teacher workspace and as thumbnails in Style C.
 */
import { useMemo } from 'react'
import qrcode from 'qrcode-generator'
import type { AnswerDetail } from '../../types'
import { handwritingStyle } from '../../utils/handwriting'
import { useLang } from '../../i18n'

interface Props {
  answers: AnswerDetail[]
  activeQNum: number | null
  onSelectQuestion?: (qn: number) => void
  pageIndex: number          // 1-based
  totalPages: number
  /** Header metadata (falls back to exam title from Results if missing). */
  courseCode?: string
  courseName?: string
  examType?: string          // "Final" | "Vize" | ...
  examDate?: string          // ISO date
  duration?: string          // e.g. "90"
  studentNumber?: string
  /** Compact mode for thumbnails — hides click handlers, smaller chrome. */
  thumbnail?: boolean
}

// ── Bullseye marker ───────────────────────────────────────────────────
function Bullseye({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`absolute w-4 h-4 text-slate-900 ${className}`}
      aria-hidden
    >
      <circle cx="12" cy="12" r="11" fill="currentColor" />
      <circle cx="12" cy="12" r="7.5" fill="#fff" />
      <circle cx="12" cy="12" r="3.5" fill="currentColor" />
    </svg>
  )
}

// ── QR code (data-URL PNG) ────────────────────────────────────────────
function useQrDataUrl(text: string): string {
  return useMemo(() => {
    try {
      const qr = qrcode(0, 'L')
      qr.addData(text)
      qr.make()
      return qr.createDataURL(3, 0)
    } catch {
      return ''
    }
  }, [text])
}

// ── Student number boxes ──────────────────────────────────────────────
function StudentNumberBoxes({ studentNumber, thumbnail }: { studentNumber?: string; thumbnail?: boolean }) {
  const digits = (studentNumber ?? '').padStart(10, '\u00A0').slice(0, 10).split('')
  const size = thumbnail ? 10 : 22
  return (
    <div className="flex gap-[2px]">
      {digits.map((d, i) => (
        <div
          key={i}
          className="flex items-center justify-center border border-slate-800 font-mono"
          style={{
            width: `${size}px`,
            height: `${size * 1.25}px`,
            fontSize: `${size * 0.6}px`,
            lineHeight: 1,
          }}
        >
          {d.trim() || ''}
        </div>
      ))}
    </div>
  )
}

// ── Shared helpers: image row + reserved ruled-space ──────────────────
function ImageRow({ answer, thumbnail }: { answer: AnswerDetail; thumbnail?: boolean }) {
  if (!answer.image_url) return null
  return (
    <div className={thumbnail ? 'mb-0.5' : 'mb-1'}>
      <img
        src={answer.image_url}
        alt=""
        className={`object-contain rounded-sm border border-slate-300 ${
          thumbnail ? 'max-h-8 w-auto' : 'max-h-24 w-auto'
        }`}
      />
    </div>
  )
}

/** space_size 1..6 → N ruled lines (h-5/h-6). Mapping per plan. */
const SPACE_SIZE_LINES: Record<number, number> = {
  1: 2,
  2: 4,
  3: 6,
  4: 8,
  5: 10,
  6: 14,
}

function ReservedSpace({ size, thumbnail }: { size?: number; thumbnail?: boolean }) {
  if (!size || size <= 0) return null
  const n = SPACE_SIZE_LINES[size] ?? 0
  if (!n) return null
  return (
    <div className={`mt-1 ${thumbnail ? 'space-y-0' : ''}`}>
      {Array.from({ length: n }).map((_, i) => (
        <div
          key={i}
          className={`border-b border-slate-300 ${thumbnail ? 'h-2' : 'h-5 sm:h-6'}`}
        />
      ))}
    </div>
  )
}

// ── Content blocks (MC / MS / Fill / Open / Match) ────────────────────
function MCBlock({ answer, thumbnail }: { answer: AnswerDetail; thumbnail?: boolean }) {
  const options = answer.option_texts ?? { A: '', B: '', C: '', D: '' }
  const fills = answer.bubble_fills ?? {}
  const bubbleSize = thumbnail ? 6 : 10
  return (
    <div className="absolute inset-0 px-2 py-1 overflow-hidden font-sans text-slate-900"
         style={{ fontSize: thumbnail ? '6px' : '9px', lineHeight: 1.25 }}>
      <ImageRow answer={answer} thumbnail={thumbnail} />
      <div className="flex gap-1 items-start">
        <span className="font-bold text-slate-700 shrink-0">{answer.question_number}.</span>
        <p className="text-slate-800 line-clamp-2">{answer.question_text ?? ''}</p>
      </div>
      <div className="mt-0.5 pl-3 space-y-[1px]">
        {Object.entries(options).map(([letter, text]) => {
          const filled = (fills[letter] ?? 0) > 0.5
          return (
            <div key={letter} className="flex items-center gap-1.5">
              <span
                className={`inline-block rounded-full border border-slate-700 shrink-0 ${
                  filled ? 'bg-slate-900' : 'bg-white'
                }`}
                style={{ width: `${bubbleSize}px`, height: `${bubbleSize}px` }}
              />
              <span className="text-slate-700 truncate">{letter}) {text}</span>
            </div>
          )
        })}
      </div>
      <ReservedSpace size={answer.space_size} thumbnail={thumbnail} />
    </div>
  )
}

function MsBlock({ answer, thumbnail }: { answer: AnswerDetail; thumbnail?: boolean }) {
  const options = answer.option_texts ?? { A: '', B: '', C: '', D: '' }
  const picked = new Set((answer.ms_student_answers ?? []).map((s) => s.toUpperCase()))
  const boxSize = thumbnail ? 6 : 12
  return (
    <div
      className="absolute inset-0 px-2 py-1 overflow-hidden font-sans text-slate-900"
      style={{ fontSize: thumbnail ? '6px' : '9px', lineHeight: 1.25 }}
    >
      <ImageRow answer={answer} thumbnail={thumbnail} />
      <div className="flex gap-1 items-start">
        <span className="font-bold text-slate-700 shrink-0">{answer.question_number}.</span>
        <p className="text-slate-800 line-clamp-2">{answer.question_text ?? ''}</p>
      </div>
      <div className="mt-0.5 pl-3 space-y-[1px]">
        {Object.entries(options).map(([letter, text]) => {
          const filled = picked.has(letter.toUpperCase())
          return (
            <div key={letter} className="flex items-center gap-1.5">
              <span
                className={`inline-flex items-center justify-center border border-slate-800 rounded-sm shrink-0 ${
                  filled ? 'bg-slate-900 text-white' : 'bg-white text-transparent'
                }`}
                style={{
                  width: `${boxSize}px`,
                  height: `${boxSize}px`,
                  fontSize: `${boxSize * 0.85}px`,
                  lineHeight: 1,
                }}
                aria-hidden
              >
                {filled ? '✓' : ''}
              </span>
              <span className="text-slate-700 truncate">{letter}) {text}</span>
            </div>
          )
        })}
      </div>
      <ReservedSpace size={answer.space_size} thumbnail={thumbnail} />
    </div>
  )
}

function FillBlock({ answer, thumbnail }: { answer: AnswerDetail; thumbnail?: boolean }) {
  const template = answer.fill_template ?? ''
  const blanks = answer.fill_blanks ?? {}
  const hw = handwritingStyle(answer.handwriting_seed)
  const chunks = template.split(/___/)
  return (
    <div
      className="absolute inset-0 p-2 overflow-hidden font-sans text-slate-900"
      style={{ fontSize: thumbnail ? '6px' : '10px', lineHeight: thumbnail ? 1.4 : 1.6 }}
    >
      <ImageRow answer={answer} thumbnail={thumbnail} />
      <div className="flex gap-1 items-start">
        <span className="font-bold text-slate-700 shrink-0">{answer.question_number}.</span>
        <div className="text-slate-800">
          {chunks.map((chunk, i) => (
            <span key={i}>
              {chunk}
              {i < chunks.length - 1 && (
                <span
                  className={`inline-block mx-0.5 px-1 border-b border-slate-600 ${hw.fontClass} ${hw.colorClass}`}
                  style={{
                    fontSize: `${thumbnail ? hw.fontSizePx * 0.5 : hw.fontSizePx}px`,
                    transform: `rotate(${hw.jitter(i).rotation}deg)`,
                    minWidth: thumbnail ? '28px' : '58px',
                    textAlign: 'center',
                  }}
                >
                  {blanks[String(i + 1)] || '\u00A0'}
                </span>
              )}
            </span>
          ))}
        </div>
      </div>
      <ReservedSpace size={answer.space_size} thumbnail={thumbnail} />
    </div>
  )
}

function MatchBlock({ answer, thumbnail }: { answer: AnswerDetail; thumbnail?: boolean }) {
  const left = answer.match_left ?? []
  const right = answer.match_right ?? []
  const pairs = answer.match_student_pairs ?? []
  const hw = handwritingStyle(answer.handwriting_seed)
  // Build "1→B, 2→A, …" string
  const pairString = pairs
    .slice()
    .sort((a, b) => a[0] - b[0])
    .map(([li, ri]) => `${li + 1}→${String.fromCharCode(65 + ri)}`)
    .join(', ')
  return (
    <div
      className="absolute inset-0 p-2 overflow-hidden font-serif text-slate-900"
      style={{ fontSize: thumbnail ? '6px' : '10px', lineHeight: 1.35 }}
    >
      <ImageRow answer={answer} thumbnail={thumbnail} />
      <div className="flex gap-1 items-start mb-1">
        <span className="font-bold text-slate-700 shrink-0">{answer.question_number}.</span>
        <p className="text-slate-800 line-clamp-2">{answer.question_text ?? ''}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 pl-3">
        <div>
          <div className={`font-bold text-slate-700 border-b border-slate-400 mb-0.5 ${thumbnail ? 'text-[5px]' : 'text-[9px]'}`}>
            Sol
          </div>
          <ol className="space-y-[1px]">
            {left.map((txt, i) => (
              <li key={i} className="text-slate-800 truncate">
                {i + 1}. {txt}
              </li>
            ))}
          </ol>
        </div>
        <div>
          <div className={`font-bold text-slate-700 border-b border-slate-400 mb-0.5 ${thumbnail ? 'text-[5px]' : 'text-[9px]'}`}>
            Sağ
          </div>
          <ol className="space-y-[1px]">
            {right.map((txt, i) => (
              <li key={i} className="text-slate-800 truncate">
                {String.fromCharCode(65 + i)}. {txt}
              </li>
            ))}
          </ol>
        </div>
      </div>
      {pairString && (
        <div className={`mt-1 pl-3 flex items-baseline gap-1 ${thumbnail ? 'text-[5px]' : 'text-[9px]'}`}>
          <span className="font-semibold text-slate-700 shrink-0">Cevaplar:</span>
          <span
            className={`${hw.fontClass} ${hw.colorClass}`}
            style={{
              fontSize: `${thumbnail ? hw.fontSizePx * 0.5 : hw.fontSizePx}px`,
              transform: `rotate(${hw.rotationDeg}deg)`,
              display: 'inline-block',
            }}
          >
            {pairString}
          </span>
        </div>
      )}
      <ReservedSpace size={answer.space_size} thumbnail={thumbnail} />
    </div>
  )
}

function OpenBlock({ answer, thumbnail }: { answer: AnswerDetail; thumbnail?: boolean }) {
  const hw = handwritingStyle(answer.handwriting_seed)
  const text = answer.handwritten_answer ?? ''
  const lines = text.split(/\s+/).reduce((acc: string[], word) => {
    const last = acc[acc.length - 1]
    if (!last || (last + ' ' + word).length > (thumbnail ? 28 : 46)) acc.push(word)
    else acc[acc.length - 1] = last + ' ' + word
    return acc
  }, [])
  const lineHeightPx = thumbnail ? 10 : 24
  // Open blocks already render ruled lines to fill their area. Only layer
  // extra reserved space on top when space_size is big enough to explicitly
  // exceed what the natural allotment already covers.
  const naturalOpenCapacity = thumbnail ? 18 : 14
  const requestedLines = answer.space_size ? (SPACE_SIZE_LINES[answer.space_size] ?? 0) : 0
  const showExtraSpace = requestedLines > naturalOpenCapacity
  return (
    <div className="absolute inset-0 p-3 overflow-hidden font-sans text-slate-900">
      <ImageRow answer={answer} thumbnail={thumbnail} />
      {answer.question_text && (
        <div
          className="flex gap-1 items-start mb-2 text-slate-800"
          style={{ fontSize: thumbnail ? '6px' : '10px', lineHeight: 1.3 }}
        >
          <span className="font-bold text-slate-700 shrink-0">{answer.question_number}.</span>
          <p className="line-clamp-2">{answer.question_text}</p>
        </div>
      )}
      <div className={`${hw.fontClass} ${hw.colorClass} relative`}
           style={{
             fontSize: thumbnail ? `${hw.fontSizePx * 0.45}px` : `${hw.fontSizePx + 2}px`,
             lineHeight: `${lineHeightPx}px`,
             transform: `rotate(${hw.rotationDeg}deg)`,
             transformOrigin: 'top left',
           }}>
        <div className="absolute inset-0 opacity-30 pointer-events-none"
             style={{
               backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${lineHeightPx - 1}px, #cbd5e1 ${lineHeightPx - 1}px, #cbd5e1 ${lineHeightPx}px)`,
             }} />
        <div className="relative">
          {lines.slice(0, thumbnail ? 18 : 14).map((line, i) => {
            const j = hw.jitter(i + 1)
            return (
              <div
                key={i}
                style={{ transform: `rotate(${j.rotation}deg) translateX(${j.xOffset}px)` }}
              >
                {line}
              </div>
            )
          })}
        </div>
      </div>
      {showExtraSpace && (
        <ReservedSpace size={answer.space_size} thumbnail={thumbnail} />
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────
export default function ExamShapedScan({
  answers, activeQNum, onSelectQuestion, pageIndex, totalPages,
  courseCode = 'CSE201', courseName,
  examType = 'Final', examDate, duration,
  studentNumber, thumbnail = false,
}: Props) {
  const { t } = useLang()
  const resolvedCourseName = courseName ?? t('scan.defaultCourseName')
  const year = (examDate ?? new Date().toISOString()).split('-')[0]
  const qrText = `P${pageIndex}_${courseCode}_${examType}_${year}`
  const qrDataUrl = useQrDataUrl(qrText)

  // Only questions on this page
  const questionsOnPage = answers.filter((a) => (a.bbox?.page ?? 1) === pageIndex)

  return (
    <div
      className={`relative bg-white w-full h-full ${thumbnail ? 'border border-slate-300' : 'shadow-lg border border-slate-200 rounded-sm'}`}
      style={{ aspectRatio: '1 / 1.414' }}
    >
      {/* Bullseye corners */}
      <Bullseye className={thumbnail ? 'top-1 left-1 w-2 h-2' : 'top-2 left-2'} />
      <Bullseye className={thumbnail ? 'top-1 right-1 w-2 h-2' : 'top-2 right-2'} />
      <Bullseye className={thumbnail ? 'bottom-1 left-1 w-2 h-2' : 'bottom-2 left-2'} />
      <Bullseye className={thumbnail ? 'bottom-1 right-1 w-2 h-2' : 'bottom-2 right-2'} />

      {/* Exam header — only on page 1, fits within top 26% of the page.
          Everything below (header → student region → instructions) is
          packed into a fixed region so question bboxes (y ≥ 0.28) never
          overlap it. */}
      {pageIndex === 1 && (
        <div
          className={`absolute left-0 right-0 border-b border-slate-700 ${thumbnail ? 'top-3 px-3 pb-1' : 'top-7 px-6 pb-2'}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {/* IKU-style logomark */}
              <div
                className={`bg-red-700 text-white font-bold rounded-sm flex items-center justify-center shrink-0 ${thumbnail ? 'w-5 h-5 text-[7px]' : 'w-9 h-9 text-xs'}`}
                style={{ letterSpacing: '-0.05em' }}
              >
                İKÜ
              </div>
              <div className="min-w-0">
                <p className={`font-bold tracking-tight leading-tight text-slate-900 ${thumbnail ? 'text-[6px]' : 'text-[10px]'}`}>
                  {t('scan.universityName')}
                </p>
                <p className={`font-semibold text-slate-700 leading-tight ${thumbnail ? 'text-[5px] mt-[1px]' : 'text-[9px] mt-0.5'}`}>
                  {courseCode} · {resolvedCourseName}
                </p>
                <p className={`text-slate-600 leading-tight ${thumbnail ? 'text-[5px]' : 'text-[8px]'} font-sans`}>
                  {examType} · {examDate ?? ''} {duration ? `· ${duration} ${t('scan.minutesShort')}` : ''}
                </p>
              </div>
            </div>
            {/* QR code */}
            {qrDataUrl && (
              <img
                src={qrDataUrl}
                alt="QR"
                className={thumbnail ? 'w-5 h-5' : 'w-11 h-11'}
                style={{ imageRendering: 'pixelated' }}
              />
            )}
          </div>

          {/* Student number region */}
          <div className={`flex items-end justify-between ${thumbnail ? 'mt-0.5' : 'mt-1.5'}`}>
            <div>
              <p className={`font-semibold text-slate-700 uppercase tracking-wider ${thumbnail ? 'text-[4px]' : 'text-[7px]'}`}>
                {t('workspace.studentNumber')}
              </p>
              <div className="mt-0.5">
                <StudentNumberBoxes studentNumber={studentNumber} thumbnail={thumbnail} />
              </div>
            </div>
            <div className={`text-slate-600 text-right ${thumbnail ? 'text-[4px]' : 'text-[7px]'} leading-tight`}>
              <p>{t('scan.fullName')}: _________________</p>
              <p className="mt-0.5">{t('scan.signature')}: _________________</p>
            </div>
          </div>

          {/* Instructions — inline under student region, same bordered block */}
          {!thumbnail && (
            <div className="mt-1.5 pt-1 border-t border-slate-300 text-[7px] text-slate-600 leading-tight">
              <span className="font-bold tracking-wide text-slate-700">{t('scan.instructionsLabel')}: </span>
              {t('scan.instructionsBody')}
            </div>
          )}
        </div>
      )}

      {/* Question content area */}
      {questionsOnPage.map((a) => {
        if (!a.bbox) return null
        return (
          <div
            key={`content-${a.question_number}`}
            className="absolute"
            style={{
              top: `${a.bbox.y * 100}%`,
              left: `${a.bbox.x * 100}%`,
              width: `${a.bbox.w * 100}%`,
              height: `${a.bbox.h * 100}%`,
            }}
          >
            {a.question_type === 'mc' && <MCBlock answer={a} thumbnail={thumbnail} />}
            {a.question_type === 'ms' && <MsBlock answer={a} thumbnail={thumbnail} />}
            {a.question_type === 'fill' && <FillBlock answer={a} thumbnail={thumbnail} />}
            {a.question_type === 'open' && <OpenBlock answer={a} thumbnail={thumbnail} />}
            {a.question_type === 'match' && <MatchBlock answer={a} thumbnail={thumbnail} />}
          </div>
        )
      })}

      {/* Bbox overlays (click targets + status colouring) */}
      {!thumbnail && onSelectQuestion && questionsOnPage.map((a) => {
        if (!a.bbox) return null
        const isActive = activeQNum === a.question_number
        const borderCls = isActive
          ? 'border-primary-500 ring-2 ring-primary-500/20'
          : a.override_applied
            ? 'border-amber-400 border-dashed'
            : a.needs_review
              ? 'border-amber-300/60'
              : a.is_correct === false
                ? 'border-red-300/50'
                : 'border-transparent hover:border-slate-400/50'
        return (
          <button
            key={a.question_number}
            onClick={() => onSelectQuestion(a.question_number)}
            className={`absolute border-2 rounded transition-all hover:bg-slate-100/30 ${borderCls}`}
            style={{
              top: `${a.bbox.y * 100}%`,
              left: `${a.bbox.x * 100}%`,
              width: `${a.bbox.w * 100}%`,
              height: `${a.bbox.h * 100}%`,
            }}
            title={`${t('workspace.question')} ${a.question_number}${a.label ? ' — ' + a.label : ''}`}
          >
            {isActive && (
              <span className="absolute -top-[18px] left-0 bg-primary-500 text-white
                               text-[9px] px-1.5 py-0.5 font-bold rounded-sm whitespace-nowrap">
                Q{a.question_number}
              </span>
            )}
          </button>
        )
      })}

      {/* Page footer */}
      <div
        className={`absolute left-0 right-0 text-center text-slate-600 ${thumbnail ? 'bottom-1 text-[4px]' : 'bottom-2 text-[8px]'}`}
      >
        <span className="bg-white px-2">{t('workspace.page')} {pageIndex} / {totalPages}</span>
      </div>
    </div>
  )
}
