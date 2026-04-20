/**
 * ExamBuilder — 3-step exam creation page, re-drawn for Faruk-parity layout.
 *
 * Step 0  — Info form (course code / name / type / date / duration / key name)
 * Step 1  — Two-column question editor (sidebar list + type-aware editor panel)
 *           supporting mc / ms / open / match / fill with image upload,
 *           per-item penalty, and a solution-space selector.
 * Step 2  — Page-accurate preview (ExamShapedScan) + Save/Back buttons.
 *
 * The page is mounted inside FullScreenLayout (App.tsx), which renders the
 * shared TopNav for us — this component only emits the content below the nav.
 *
 * Save: POST /api/answer-keys with the extended QuestionSchema payload.
 */
import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import ExamShapedScan from '../components/results/ExamShapedScan'
import type { AnswerDetail } from '../types'
import { useToast } from '../contexts/ToastContext'
import { useLang, t as tGlobal } from '../i18n'

// ── Types ────────────────────────────────────────────────────────────
type QType = 'mc' | 'ms' | 'open' | 'match' | 'fill'

interface Question {
  id: string
  question_number: number
  question_type: QType
  question_text: string
  points: number
  penalty_per_item: number
  image_url: string | null
  space_size: number
  // mc
  options: string[]
  correct_letter: string      // 'A' | 'B' | …
  // ms
  ms_correct: string[]        // ['A', 'C']
  // open
  rubric: string
  // match
  match_left: string[]
  match_right: string[]
  match_pairs: [number, number][]
  // fill
  fill_template: string
  fill_answers: string[]
}

const LETTERS = 'ABCDEFGHIJ'
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

const TYPE_ICONS: Record<QType, string> = {
  mc: '🔘',
  ms: '☑️',
  open: '📝',
  match: '🔗',
  fill: '🔤',
}

const SPACE_KEYS = [
  'builder.spaceNone',
  'builder.spaceTiny',
  'builder.spaceSmall',
  'builder.spaceMedium',
  'builder.spaceLarge',
  'builder.spaceXL',
  'builder.spaceXXL',
] as const

function blankQuestion(type: QType, number: number): Question {
  const base: Question = {
    id: uid(),
    question_number: number,
    question_type: type,
    question_text: '',
    points: 5,
    penalty_per_item: 0,
    image_url: null,
    space_size: 0,
    options: [],
    correct_letter: 'A',
    ms_correct: [],
    rubric: '',
    match_left: [],
    match_right: [],
    match_pairs: [],
    fill_template: '',
    fill_answers: [],
  }
  if (type === 'mc') {
    base.question_text = tGlobal('builder.defaultMcText', { n: number })
    base.options = ['A', 'B', 'C', 'D'].map((l) =>
      tGlobal('builder.defaultMcOption', { letter: l }),
    )
    base.correct_letter = 'A'
  } else if (type === 'ms') {
    base.question_text = tGlobal('builder.defaultMsText', { n: number })
    base.options = ['A', 'B', 'C', 'D'].map((l) =>
      tGlobal('builder.defaultMcOption', { letter: l }),
    )
    base.ms_correct = ['A']
  } else if (type === 'open') {
    base.question_text = tGlobal('builder.defaultOpenText', { n: number })
    base.rubric = tGlobal('builder.defaultRubric')
    base.points = 20
    base.space_size = 3
  } else if (type === 'match') {
    base.question_text = tGlobal('builder.defaultMatchText', { n: number })
    base.match_left = [1, 2, 3].map((i) => tGlobal('builder.defaultMatchLeft', { n: i }))
    base.match_right = [1, 2, 3].map((i) => tGlobal('builder.defaultMatchRight', { n: i }))
    base.match_pairs = [
      [0, 0],
      [1, 1],
      [2, 2],
    ]
  } else if (type === 'fill') {
    base.question_text = tGlobal('builder.defaultFillText', { n: number })
    base.fill_template = tGlobal('builder.defaultFillTemplate')
    base.fill_answers = ['Ankara']
    base.points = 4
  }
  return base
}

function countBlanks(template: string): number {
  const matches = template.match(/___/g)
  return matches ? matches.length : 0
}

// ── Main page ────────────────────────────────────────────────────────
export default function ExamBuilder() {
  const navigate = useNavigate()
  const toast = useToast()
  const { t } = useLang()

  // Step
  const [step, setStep] = useState<0 | 1>(0)

  // Info
  const [courseCode, setCourseCode] = useState('CSE201')
  const [courseName, setCourseName] = useState(() => tGlobal('builder.defaultCourseName'))
  const [examType, setExamType] = useState<'Final' | 'Vize' | 'Bütünleme'>('Final')
  const [examDate, setExamDate] = useState(() => new Date().toISOString().split('T')[0])
  const [duration, setDuration] = useState('90')
  const [keyName, setKeyName] = useState('CSE201 OOP Final')

  // Questions
  const [questions, setQuestions] = useState<Question[]>(() => [
    blankQuestion('mc', 1),
    blankQuestion('ms', 2),
    blankQuestion('open', 3),
    blankQuestion('match', 4),
    blankQuestion('fill', 5),
  ])
  const [activeId, setActiveId] = useState<string | null>(questions[0]?.id ?? null)
  const [saving, setSaving] = useState(false)

  const active = questions.find((q) => q.id === activeId) ?? null
  const activeIndex = active ? questions.findIndex((q) => q.id === active.id) : -1

  const updateQuestion = useCallback((id: string, patch: Partial<Question>) => {
    setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, ...patch } : q)))
  }, [])

  const addQuestion = useCallback(
    (type: QType) => {
      const next = blankQuestion(type, questions.length + 1)
      const updated = [...questions, next]
      setQuestions(updated)
      setActiveId(next.id)
    },
    [questions],
  )

  const deleteQuestion = useCallback(
    (id: string) => {
      if (questions.length <= 1) {
        toast.error(t('builder.needLastQuestion'))
        return
      }
      const idx = questions.findIndex((q) => q.id === id)
      const next = questions
        .filter((q) => q.id !== id)
        .map((q, i) => ({ ...q, question_number: i + 1 }))
      setQuestions(next)
      if (activeId === id) setActiveId(next[Math.max(0, idx - 1)]?.id ?? null)
    },
    [activeId, questions, toast, t],
  )

  const duplicateQuestion = useCallback(
    (id: string) => {
      const src = questions.find((q) => q.id === id)
      if (!src) return
      const copy: Question = {
        ...src,
        id: uid(),
        options: [...src.options],
        ms_correct: [...src.ms_correct],
        match_left: [...src.match_left],
        match_right: [...src.match_right],
        match_pairs: src.match_pairs.map((p) => [p[0], p[1]] as [number, number]),
        fill_answers: [...src.fill_answers],
      }
      const idx = questions.findIndex((q) => q.id === id)
      const next = [...questions.slice(0, idx + 1), copy, ...questions.slice(idx + 1)].map(
        (q, i) => ({ ...q, question_number: i + 1 }),
      )
      setQuestions(next)
      setActiveId(copy.id)
    },
    [questions],
  )

  const moveQuestion = useCallback(
    (id: string, delta: -1 | 1) => {
      const idx = questions.findIndex((q) => q.id === id)
      const targetIdx = idx + delta
      if (idx < 0 || targetIdx < 0 || targetIdx >= questions.length) return
      const next = [...questions]
      ;[next[idx], next[targetIdx]] = [next[targetIdx], next[idx]]
      setQuestions(next.map((q, i) => ({ ...q, question_number: i + 1 })))
    },
    [questions],
  )

  // ── Preview answer-detail stubs ────────────────────────────────────
  // Flow layout — lay out questions in document order, page-break when full.
  const previewAnswers: AnswerDetail[] = useMemo(() => {
    const PAGE_TOP_PAGE1 = 0.28
    const PAGE_TOP_OTHER = 0.08
    const PAGE_BOTTOM = 0.94
    const PAGE_LEFT = 0.08
    const PAGE_WIDTH = 0.84
    const VERTICAL_GAP = 0.01

    const heightFor = (q: Question): number => {
      const type = q.question_type
      let h: number
      if (type === 'mc') h = 0.075
      else if (type === 'ms') h = 0.085
      else if (type === 'fill') h = 0.11
      else if (type === 'match') h = 0.22
      else {
        // open
        const space = typeof q.space_size === 'number' && q.space_size > 0 ? q.space_size : 0
        h = space > 0 ? 0.24 + 0.04 * space : 0.34
      }
      if (q.image_url) h += 0.08
      return h
    }

    let page = 1
    let y = PAGE_TOP_PAGE1

    return questions.map((q, i) => {
      const h = heightFor(q)
      if (y + h > PAGE_BOTTOM) {
        page += 1
        y = PAGE_TOP_OTHER
      }
      const bbox = { page, x: PAGE_LEFT, y: Math.round(y * 10000) / 10000, w: PAGE_WIDTH, h: Math.round(h * 10000) / 10000 }
      y += h + VERTICAL_GAP

      const options = Array.isArray(q.options) ? q.options : []
      const fillAnswers = Array.isArray(q.fill_answers) ? q.fill_answers : []
      const matchPairs = Array.isArray(q.match_pairs) ? q.match_pairs : []

      const base: AnswerDetail = {
        question_number: i + 1,
        question_type: q.question_type,
        label: (q.question_text ?? '').slice(0, 40),
        student_answer: null,
        correct_answer:
          q.question_type === 'mc' ? (q.correct_letter ?? 'A') : null,
        is_correct: null,
        score: 0,
        max_score: q.points ?? 0,
        feedback: null,
        confidence: null,
        ocr_confidence: null,
        bbox,
        bubble_fills: null,
        ai_reasoning: null,
        model_used: null,
        rubric_breakdown: null,
        override_applied: false,
        needs_review: false,
        question_text: q.question_text ?? '',
        option_texts:
          q.question_type === 'mc' || q.question_type === 'ms'
            ? Object.fromEntries(options.map((v, oi) => [LETTERS[oi], v]))
            : null,
        handwritten_answer: null,
        fill_template: q.question_type === 'fill' ? (q.fill_template ?? '') : null,
        fill_blanks: null,
        correct_blanks:
          q.question_type === 'fill'
            ? Object.fromEntries(fillAnswers.map((v, bi) => [String(bi + 1), v ?? '']))
            : null,
        handwriting_seed: null,
        ms_correct: q.question_type === 'ms' ? [...(q.ms_correct ?? [])] : undefined,
        match_left: q.question_type === 'match' ? [...(q.match_left ?? [])] : undefined,
        match_right: q.question_type === 'match' ? [...(q.match_right ?? [])] : undefined,
        match_pairs:
          q.question_type === 'match'
            ? matchPairs.map((p) => [p[0], p[1]] as [number, number])
            : undefined,
        image_url: q.image_url ?? null,
        space_size: q.space_size ?? 0,
      }
      return base
    })
  }, [questions])

  const totalPages = useMemo(
    () => Math.max(1, ...previewAnswers.map((a) => a.bbox?.page ?? 1)),
    [previewAnswers],
  )
  const [previewPage, setPreviewPage] = useState(1)

  // ── Save ───────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!keyName.trim()) {
      toast.error(t('builder.needKeyName'))
      return
    }
    if (questions.length === 0) {
      toast.error(t('builder.needQuestion'))
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: keyName,
        course_name: courseName,
        questions: questions.map((q, i) => {
          // Build an options map for mc/ms (backend expects {A: "...", B: "..."})
          const optionsMap =
            q.question_type === 'mc' || q.question_type === 'ms'
              ? Object.fromEntries(q.options.map((v, oi) => [LETTERS[oi], v]))
              : null
          return {
            number: i + 1,
            type: q.question_type,
            question_type: q.question_type,
            points: q.points,
            penalty_per_item: q.penalty_per_item,
            image_url: q.image_url,
            space_size: q.space_size,
            correct_answer:
              q.question_type === 'mc' ? q.correct_letter : null,
            rubric: q.question_type === 'open' ? q.rubric : null,
            text: q.question_text,
            options: optionsMap,
            fill_template: q.question_type === 'fill' ? q.fill_template : null,
            fill_answers: q.question_type === 'fill' ? q.fill_answers : null,
            ms_correct: q.question_type === 'ms' ? q.ms_correct : null,
            match_left: q.question_type === 'match' ? q.match_left : null,
            match_right: q.question_type === 'match' ? q.match_right : null,
            match_pairs:
              q.question_type === 'match'
                ? q.match_pairs.map((p) => [p[0], p[1]])
                : null,
          }
        }),
      }
      const res = await api.post<{ id: string }>('/answer-keys', payload)
      toast.success(t('builder.saved'))
      navigate(`/answer-keys?highlight=${res.data.id}`)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : t('builder.saveFailed'))
    } finally {
      setSaving(false)
    }
  }, [keyName, courseName, questions, navigate, toast, t])

  // ── Stepper render ─────────────────────────────────────────────────
  return (
    <div className="min-h-full bg-slate-50 pb-16">
      <Stepper step={step} />

      {step === 0 && (
        <InfoStep
          courseCode={courseCode}
          setCourseCode={setCourseCode}
          courseName={courseName}
          setCourseName={setCourseName}
          examType={examType}
          setExamType={setExamType}
          examDate={examDate}
          setExamDate={setExamDate}
          duration={duration}
          setDuration={setDuration}
          keyName={keyName}
          setKeyName={setKeyName}
          onNext={() => setStep(1)}
        />
      )}

      {step === 1 && (
        <EditorStep
          questions={questions}
          active={active}
          activeIndex={activeIndex}
          setActiveId={setActiveId}
          addQuestion={addQuestion}
          deleteQuestion={deleteQuestion}
          duplicateQuestion={duplicateQuestion}
          moveQuestion={moveQuestion}
          updateQuestion={updateQuestion}
          onBack={() => setStep(0)}
          previewAnswers={previewAnswers}
          previewPage={previewPage}
          setPreviewPage={setPreviewPage}
          totalPages={totalPages}
          courseCode={courseCode}
          courseName={courseName}
          examType={examType}
          examDate={examDate}
          duration={duration}
          onSave={handleSave}
          saving={saving}
        />
      )}
    </div>
  )
}

// ── Stepper ──────────────────────────────────────────────────────────
function Stepper({ step }: { step: 0 | 1 }) {
  const { t } = useLang()
  const items: [string, number][] = [
    [t('builder.step.info'), 0],
    [t('builder.step.questions'), 1],
  ]
  return (
    <div className="bg-white border-b border-slate-200">
      <div className="mx-auto max-w-[1600px] px-5 py-3 flex items-center gap-2">
        {items.map(([label, i], idx) => {
          const state = step === i ? 'active' : step > i ? 'done' : 'idle'
          return (
            <div key={i} className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  state === 'active'
                    ? 'bg-iku-red text-white'
                    : state === 'done'
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-200 text-slate-500'
                }`}
              >
                {state === 'done' ? '✓' : i + 1}
              </div>
              <span
                className={`text-sm font-semibold ${
                  state === 'active' ? 'text-slate-900' : 'text-slate-500'
                }`}
              >
                {label}
              </span>
              {idx < items.length - 1 && (
                <div className="w-8 h-[2px] bg-slate-200 mx-1" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Step 0 — Info ────────────────────────────────────────────────────
interface InfoStepProps {
  courseCode: string
  setCourseCode: (v: string) => void
  courseName: string
  setCourseName: (v: string) => void
  examType: 'Final' | 'Vize' | 'Bütünleme'
  setExamType: (v: 'Final' | 'Vize' | 'Bütünleme') => void
  examDate: string
  setExamDate: (v: string) => void
  duration: string
  setDuration: (v: string) => void
  keyName: string
  setKeyName: (v: string) => void
  onNext: () => void
}

function InfoStep(p: InfoStepProps) {
  const { t } = useLang()
  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 mb-4">{t('builder.info.title')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <LabeledInput
            label={t('builder.courseCode')}
            value={p.courseCode}
            onChange={p.setCourseCode}
            placeholder="CSE201"
          />
          <LabeledInput
            label={t('builder.courseName')}
            value={p.courseName}
            onChange={p.setCourseName}
            placeholder={t('builder.courseNamePlaceholder')}
          />
          <LabeledSelect
            label={t('builder.examType')}
            value={p.examType}
            onChange={(v) => p.setExamType(v as 'Final' | 'Vize' | 'Bütünleme')}
            options={[
              { v: 'Final', l: t('builder.examTypeFinal') },
              { v: 'Vize', l: t('builder.examTypeMidterm') },
              { v: 'Bütünleme', l: t('builder.examTypeMakeup') },
            ]}
          />
          <LabeledInput
            label={t('builder.examDate')}
            value={p.examDate}
            onChange={p.setExamDate}
            type="date"
          />
          <LabeledInput
            label={t('builder.duration')}
            value={p.duration}
            onChange={p.setDuration}
            type="number"
          />
          <LabeledInput
            label={t('builder.keyName')}
            value={p.keyName}
            onChange={p.setKeyName}
          />
        </div>
        <div className="mt-6 flex justify-end">
          <button
            onClick={p.onNext}
            className="h-10 px-5 rounded-lg bg-iku-red text-white text-sm font-bold hover:bg-iku-red-dark shadow-sm"
          >
            {t('builder.info.next')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Step 1 — Editor ──────────────────────────────────────────────────
interface EditorStepProps {
  questions: Question[]
  active: Question | null
  activeIndex: number
  setActiveId: (id: string) => void
  addQuestion: (t: QType) => void
  deleteQuestion: (id: string) => void
  duplicateQuestion: (id: string) => void
  moveQuestion: (id: string, delta: -1 | 1) => void
  updateQuestion: (id: string, patch: Partial<Question>) => void
  onBack: () => void
  // Live preview props
  previewAnswers: AnswerDetail[]
  previewPage: number
  setPreviewPage: (p: number) => void
  totalPages: number
  courseCode: string
  courseName: string
  examType: 'Final' | 'Vize' | 'Bütünleme'
  examDate: string
  duration: string
  onSave: () => void
  saving: boolean
}

function EditorStep(p: EditorStepProps) {
  const { t } = useLang()
  const [mobilePreview, setMobilePreview] = useState(false)

  const PreviewPane = (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900">
          {t('builder.previewPage', { p: p.previewPage, total: p.totalPages })}
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => p.setPreviewPage(Math.max(1, p.previewPage - 1))}
            disabled={p.previewPage <= 1}
            className="w-8 h-8 rounded hover:bg-slate-100 disabled:opacity-30 flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-lg">chevron_left</span>
          </button>
          <button
            onClick={() => p.setPreviewPage(Math.min(p.totalPages, p.previewPage + 1))}
            disabled={p.previewPage >= p.totalPages}
            className="w-8 h-8 rounded hover:bg-slate-100 disabled:opacity-30 flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-lg">chevron_right</span>
          </button>
        </div>
      </div>
      <div className="p-4 bg-slate-100/60 max-h-[calc(100vh-10rem)] overflow-y-auto">
        <ExamShapedScan
          answers={p.previewAnswers}
          activeQNum={p.active?.question_number ?? null}
          pageIndex={p.previewPage}
          totalPages={p.totalPages}
          courseCode={p.courseCode}
          courseName={p.courseName}
          examType={p.examType}
          examDate={p.examDate}
          duration={p.duration}
          studentNumber=""
        />
      </div>
    </div>
  )

  return (
    <div className="mx-auto max-w-[1800px] px-5 py-5">
      <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)_minmax(360px,26rem)] gap-4 items-start">
        <QuestionSidebar
          questions={p.questions}
          activeId={p.active?.id ?? null}
          onSelect={p.setActiveId}
          onDelete={p.deleteQuestion}
          onMove={p.moveQuestion}
          onAdd={p.addQuestion}
        />

        {/* Editor middle column */}
        <div className="min-w-0">
          {p.active && (
            <EditorPanel
              q={p.active}
              total={p.questions.length}
              index={p.activeIndex}
              onChange={(patch) => p.updateQuestion(p.active!.id, patch)}
              onDuplicate={() => p.duplicateQuestion(p.active!.id)}
              onDelete={() => p.deleteQuestion(p.active!.id)}
              canDelete={p.questions.length > 1}
            />
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <button
              onClick={p.onBack}
              className="h-10 px-4 rounded-lg bg-white border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {t('builder.backToInfo')}
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMobilePreview(true)}
                className="xl:hidden h-10 px-4 rounded-lg bg-white border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-base">visibility</span>
                {t('builder.step.preview')}
              </button>
              <button
                onClick={p.onSave}
                disabled={p.saving}
                className="h-10 px-5 rounded-lg bg-iku-red text-white text-sm font-bold hover:bg-iku-red-dark disabled:opacity-50 shadow-sm flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-base">save</span>
                {p.saving ? t('builder.preview.saving') : t('builder.preview.save')}
              </button>
            </div>
          </div>
        </div>

        {/* Live preview right column — sticky, only on xl+ */}
        <div className="hidden xl:block sticky top-4">{PreviewPane}</div>
      </div>

      {/* Mobile / narrow-viewport preview modal */}
      {mobilePreview && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-start justify-center p-4 overflow-y-auto xl:hidden">
          <div className="relative w-full max-w-3xl bg-white rounded-xl shadow-2xl mt-8">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">
                {t('builder.step.preview')}
              </h3>
              <button
                onClick={() => setMobilePreview(false)}
                className="w-8 h-8 rounded hover:bg-slate-100 flex items-center justify-center text-slate-600"
                aria-label="Close preview"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-3">{PreviewPane}</div>
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-200">
              <button
                onClick={() => setMobilePreview(false)}
                className="h-10 px-4 rounded-lg bg-white border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                {t('builder.backToInfo')}
              </button>
              <button
                onClick={() => {
                  setMobilePreview(false)
                  p.onSave()
                }}
                disabled={p.saving}
                className="h-10 px-5 rounded-lg bg-iku-red text-white text-sm font-bold hover:bg-iku-red-dark disabled:opacity-50 shadow-sm flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-base">save</span>
                {p.saving ? t('builder.preview.saving') : t('builder.preview.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sidebar ──────────────────────────────────────────────────────────
interface QuestionSidebarProps {
  questions: Question[]
  activeId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onMove: (id: string, delta: -1 | 1) => void
  onAdd: (t: QType) => void
}

function QuestionSidebar(p: QuestionSidebarProps) {
  const { t } = useLang()
  const [addOpen, setAddOpen] = useState(false)

  return (
    <aside className="w-72 shrink-0 bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-3 py-2.5 border-b border-slate-100 bg-slate-50/60">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          {t('builder.sidebar.title', { n: p.questions.length })}
        </h3>
      </div>

      <div className="max-h-[68vh] overflow-y-auto divide-y divide-slate-100">
        {p.questions.length === 0 && (
          <div className="px-4 py-6 text-xs text-slate-500 text-center">
            {t('builder.sidebar.empty')}
          </div>
        )}
        {p.questions.map((q, i) => (
          <QuestionRow
            key={q.id}
            q={q}
            index={i}
            active={q.id === p.activeId}
            onSelect={() => p.onSelect(q.id)}
            onMoveUp={() => p.onMove(q.id, -1)}
            onMoveDown={() => p.onMove(q.id, 1)}
            onDelete={() => p.onDelete(q.id)}
          />
        ))}
      </div>

      {/* Add question */}
      <div className="p-2.5 border-t border-slate-100 relative">
        <button
          onClick={() => setAddOpen((o) => !o)}
          className="w-full h-9 rounded-lg border-2 border-dashed border-slate-300 text-xs font-bold text-slate-600 hover:border-iku-red hover:text-iku-red transition-colors"
        >
          {t('builder.sidebar.addQuestion')}
        </button>
        {addOpen && (
          <div className="absolute bottom-[calc(100%+4px)] left-2.5 right-2.5 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden z-10">
            {(
              [
                ['mc', t('builder.addMc')],
                ['ms', t('builder.addMs')],
                ['open', t('builder.addOpen')],
                ['match', t('builder.addMatch')],
                ['fill', t('builder.addFill')],
              ] as [QType, string][]
            ).map(([ty, label]) => (
              <button
                key={ty}
                onClick={() => {
                  p.onAdd(ty)
                  setAddOpen(false)
                }}
                className="w-full text-left px-3 py-2 text-xs font-semibold hover:bg-red-50 hover:text-iku-red flex items-center gap-2"
              >
                <span>{TYPE_ICONS[ty]}</span>
                <span>{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}

function typeShortKey(type: QType): 'qtype.mcShort' | 'qtype.msShort' | 'qtype.openShort' | 'qtype.matchShort' | 'qtype.fillShort' {
  if (type === 'mc') return 'qtype.mcShort'
  if (type === 'ms') return 'qtype.msShort'
  if (type === 'open') return 'qtype.openShort'
  if (type === 'match') return 'qtype.matchShort'
  return 'qtype.fillShort'
}

function QuestionRow({
  q,
  index,
  active,
  onSelect,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  q: Question
  index: number
  active: boolean
  onSelect: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
}) {
  const { t } = useLang()
  const preview = q.question_text.replace(/\s+/g, ' ').slice(0, 30)
  return (
    <div
      onClick={onSelect}
      className={`px-3 py-2.5 flex items-center gap-2 cursor-pointer transition-colors ${
        active ? 'bg-red-50 border-l-2 border-iku-red' : 'hover:bg-slate-50 border-l-2 border-transparent'
      }`}
    >
      <span className="w-7 h-5 rounded bg-slate-100 text-slate-700 text-[10px] font-bold flex items-center justify-center shrink-0">
        {t(typeShortKey(q.question_type))}
      </span>
      <span className="text-xs font-bold text-slate-700 tabular-nums w-4 shrink-0">
        {index + 1}.
      </span>
      <span
        className={`flex-1 text-xs truncate ${
          active ? 'text-slate-900 font-semibold' : 'text-slate-600'
        }`}
      >
        {preview || '—'}
      </span>
      <span className="text-[10px] font-bold text-slate-500 tabular-nums shrink-0">
        {q.points}p
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onMoveUp()
        }}
        className="w-5 h-5 rounded hover:bg-slate-200 text-slate-400 flex items-center justify-center"
        title="↑"
      >
        <span className="material-symbols-outlined text-[14px]">arrow_upward</span>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onMoveDown()
        }}
        className="w-5 h-5 rounded hover:bg-slate-200 text-slate-400 flex items-center justify-center"
        title="↓"
      >
        <span className="material-symbols-outlined text-[14px]">arrow_downward</span>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        className="w-5 h-5 rounded hover:bg-red-100 text-red-500 flex items-center justify-center"
        title={t('builder.delete')}
      >
        <span className="material-symbols-outlined text-[14px]">delete</span>
      </button>
    </div>
  )
}

// ── Editor Panel (right side) ────────────────────────────────────────
interface EditorPanelProps {
  q: Question
  total: number
  index: number
  onChange: (patch: Partial<Question>) => void
  onDuplicate: () => void
  onDelete: () => void
  canDelete: boolean
}

function EditorPanel(p: EditorPanelProps) {
  const { t } = useLang()
  const { q } = p
  const showPenalty = q.question_type !== 'open' && q.question_type !== 'match'

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 min-w-0">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 mb-4 pb-4 border-b border-slate-100">
        <h3 className="text-base font-bold text-slate-900">
          {t('builder.editorHeader', { n: p.index + 1, total: p.total })}
        </h3>
        <div className="flex-1" />
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            {t('builder.points')}
          </label>
          <input
            type="number"
            min={1}
            max={100}
            value={q.points}
            onChange={(e) => p.onChange({ points: Math.max(0, Number(e.target.value) || 0) })}
            className="w-16 h-9 px-2 text-sm text-center bg-slate-50 border border-slate-200 rounded-lg focus:border-iku-red focus:outline-none"
          />
        </div>
        {showPenalty && (
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              {t('builder.penalty')}
            </label>
            <input
              type="number"
              min={0}
              step={0.5}
              value={q.penalty_per_item}
              onChange={(e) => {
                const v = parseFloat(e.target.value)
                p.onChange({ penalty_per_item: isNaN(v) || v < 0 ? 0 : v })
              }}
              className="w-16 h-9 px-2 text-sm text-center bg-slate-50 border border-slate-200 rounded-lg focus:border-iku-red focus:outline-none"
            />
          </div>
        )}
        <button
          onClick={p.onDuplicate}
          className="h-9 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700"
        >
          {t('builder.duplicate')}
        </button>
        <button
          onClick={p.onDelete}
          disabled={!p.canDelete}
          className="h-9 px-3 rounded-lg bg-red-50 hover:bg-red-100 text-xs font-bold text-iku-red disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {t('builder.delete')}
        </button>
      </div>

      {/* Type selector */}
      <TypeSelector
        current={q.question_type}
        onChange={(ty) => {
          // Seed type-specific defaults when switching type, preserving points/text/image.
          const fresh = blankQuestion(ty, q.question_number)
          p.onChange({
            question_type: ty,
            options: fresh.options,
            correct_letter: fresh.correct_letter,
            ms_correct: fresh.ms_correct,
            rubric: fresh.rubric,
            match_left: fresh.match_left,
            match_right: fresh.match_right,
            match_pairs: fresh.match_pairs,
            fill_template: fresh.fill_template,
            fill_answers: fresh.fill_answers,
          })
        }}
      />

      {/* Attachment */}
      <ImageDropzone
        imageUrl={q.image_url}
        onChange={(url) => p.onChange({ image_url: url })}
      />

      {/* Question Text */}
      <div className="mt-4">
        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1.5">
          {t('builder.questionText')}
        </label>
        <textarea
          rows={3}
          value={q.question_text}
          onChange={(e) => p.onChange({ question_text: e.target.value })}
          placeholder={t('builder.questionTextPlaceholder')}
          className="w-full text-sm px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:border-iku-red focus:outline-none resize-y min-h-[80px]"
        />
      </div>

      <hr className="my-4 border-slate-100" />

      {/* Type-specific fields */}
      {q.question_type === 'mc' && <McFields q={q} onChange={p.onChange} />}
      {q.question_type === 'ms' && <MsFields q={q} onChange={p.onChange} />}
      {q.question_type === 'open' && <OpenFields q={q} onChange={p.onChange} />}
      {q.question_type === 'match' && <MatchFields q={q} onChange={p.onChange} />}
      {q.question_type === 'fill' && <FillFields q={q} onChange={p.onChange} />}

      <hr className="my-4 border-slate-100" />

      {/* Space selector */}
      <SpaceSelector
        value={q.space_size}
        onChange={(v) => p.onChange({ space_size: v })}
      />
    </div>
  )
}

// ── Type selector (5 pills) ──────────────────────────────────────────
function TypeSelector({
  current,
  onChange,
}: {
  current: QType
  onChange: (t: QType) => void
}) {
  const { t } = useLang()
  const types: [QType, string][] = [
    ['mc', t('qtype.mc')],
    ['ms', t('qtype.ms')],
    ['open', t('qtype.open')],
    ['match', t('qtype.match')],
    ['fill', t('qtype.fill')],
  ]
  return (
    <div className="flex flex-wrap gap-1.5 mb-4">
      {types.map(([ty, label]) => {
        const active = ty === current
        return (
          <button
            key={ty}
            onClick={() => onChange(ty)}
            className={`h-9 px-3 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 border ${
              active
                ? 'bg-white border-iku-red text-iku-red'
                : 'bg-slate-100 border-transparent text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span>{TYPE_ICONS[ty]}</span>
            <span>{label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── Image drop zone ──────────────────────────────────────────────────
function ImageDropzone({
  imageUrl,
  onChange,
}: {
  imageUrl: string | null
  onChange: (url: string | null) => void
}) {
  const { t } = useLang()

  const handleFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') onChange(reader.result)
    }
    reader.readAsDataURL(file)
  }

  return (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1.5">
        {t('builder.attachment')}
      </label>

      {!imageUrl ? (
        <label className="relative block cursor-pointer rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 hover:border-iku-red hover:bg-red-50/40 transition-colors px-4 py-6 text-center">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
              e.target.value = ''
            }}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <div className="text-sm font-semibold text-slate-700">
            📎 {t('builder.uploadImage')}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {t('builder.uploadHint')}
          </div>
        </label>
      ) : (
        <div className="relative inline-block">
          <img
            src={imageUrl}
            alt="attached"
            className="max-h-52 rounded-lg border border-slate-200"
          />
          <button
            onClick={() => onChange(null)}
            title={t('builder.removeImage')}
            className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-iku-red text-white text-xs font-bold shadow flex items-center justify-center hover:bg-iku-red-dark"
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}

// ── MC Fields ────────────────────────────────────────────────────────
function McFields({
  q,
  onChange,
}: {
  q: Question
  onChange: (patch: Partial<Question>) => void
}) {
  const { t } = useLang()
  return (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-2">
        {t('builder.mcOptions')}
      </label>
      <div className="space-y-1.5">
        {q.options.map((opt, i) => {
          const letter = LETTERS[i]
          const selected = q.correct_letter === letter
          return (
            <div
              key={i}
              className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2 py-1.5"
            >
              <button
                onClick={() => onChange({ correct_letter: letter })}
                className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center ${
                  selected ? 'bg-iku-red border-iku-red' : 'border-slate-400 hover:border-iku-red'
                }`}
              >
                {selected && <span className="w-2 h-2 rounded-full bg-white" />}
              </button>
              <span className="text-xs font-bold text-slate-500 w-4 tabular-nums">
                {letter}
              </span>
              <input
                value={opt}
                onChange={(e) => {
                  const next = [...q.options]
                  next[i] = e.target.value
                  onChange({ options: next })
                }}
                placeholder={t('builder.optionPlaceholder', { letter })}
                className="flex-1 h-8 bg-transparent text-sm focus:outline-none"
              />
              {q.options.length > 2 && (
                <button
                  onClick={() => {
                    const next = q.options.filter((_, idx) => idx !== i)
                    let correct = q.correct_letter
                    const removedLetter = letter
                    if (correct === removedLetter) correct = 'A'
                    onChange({ options: next, correct_letter: correct })
                  }}
                  className="w-6 h-6 rounded hover:bg-red-100 text-red-500 flex items-center justify-center"
                  title={t('builder.removeOption')}
                >
                  ×
                </button>
              )}
            </div>
          )
        })}
      </div>
      {q.options.length < 6 && (
        <button
          onClick={() => onChange({ options: [...q.options, ''] })}
          className="mt-2 h-8 px-3 rounded-md border border-dashed border-slate-300 text-xs font-bold text-slate-600 hover:border-iku-red hover:text-iku-red"
        >
          {t('builder.addOption')}
        </button>
      )}
    </div>
  )
}

// ── MS Fields ────────────────────────────────────────────────────────
function MsFields({
  q,
  onChange,
}: {
  q: Question
  onChange: (patch: Partial<Question>) => void
}) {
  const { t } = useLang()
  const toggle = (letter: string) => {
    const current = q.ms_correct
    const next = current.includes(letter)
      ? current.filter((l) => l !== letter)
      : [...current, letter].sort()
    onChange({ ms_correct: next })
  }
  return (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-2">
        {t('builder.mcOptions')}
      </label>
      <div className="space-y-1.5">
        {q.options.map((opt, i) => {
          const letter = LETTERS[i]
          const selected = q.ms_correct.includes(letter)
          return (
            <div
              key={i}
              className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2 py-1.5"
            >
              <button
                onClick={() => toggle(letter)}
                className={`w-5 h-5 rounded-md border-2 shrink-0 flex items-center justify-center text-[11px] font-bold ${
                  selected
                    ? 'bg-iku-red border-iku-red text-white'
                    : 'border-slate-400 text-transparent hover:border-iku-red'
                }`}
              >
                ✓
              </button>
              <span className="text-xs font-bold text-slate-500 w-4 tabular-nums">
                {letter}
              </span>
              <input
                value={opt}
                onChange={(e) => {
                  const next = [...q.options]
                  next[i] = e.target.value
                  onChange({ options: next })
                }}
                placeholder={t('builder.optionPlaceholder', { letter })}
                className="flex-1 h-8 bg-transparent text-sm focus:outline-none"
              />
              {q.options.length > 2 && (
                <button
                  onClick={() => {
                    const removedLetter = letter
                    const next = q.options.filter((_, idx) => idx !== i)
                    const newCorrect = q.ms_correct.filter((l) => l !== removedLetter)
                    onChange({ options: next, ms_correct: newCorrect })
                  }}
                  className="w-6 h-6 rounded hover:bg-red-100 text-red-500 flex items-center justify-center"
                  title={t('builder.removeOption')}
                >
                  ×
                </button>
              )}
            </div>
          )
        })}
      </div>
      {q.options.length < 6 && (
        <button
          onClick={() => onChange({ options: [...q.options, ''] })}
          className="mt-2 h-8 px-3 rounded-md border border-dashed border-slate-300 text-xs font-bold text-slate-600 hover:border-iku-red hover:text-iku-red"
        >
          {t('builder.addOption')}
        </button>
      )}
    </div>
  )
}

// ── Open Fields ──────────────────────────────────────────────────────
function OpenFields({
  q,
  onChange,
}: {
  q: Question
  onChange: (patch: Partial<Question>) => void
}) {
  const { t } = useLang()
  return (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1.5">
          {t('builder.rubric')}
        </label>
        <textarea
          rows={5}
          value={q.rubric}
          onChange={(e) => onChange({ rubric: e.target.value })}
          placeholder={t('builder.rubricPlaceholder')}
          className="w-full text-sm px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:border-iku-red focus:outline-none resize-y"
        />
      </div>
      <ReferenceImage
        label={t('builder.openAnswerImage')}
        imageUrl={q.image_url && q.image_url.startsWith('data:') ? q.image_url : null}
        onChange={(url) => onChange({ image_url: url })}
      />
    </div>
  )
}

function ReferenceImage({
  label,
  imageUrl,
  onChange,
}: {
  label: string
  imageUrl: string | null
  onChange: (url: string | null) => void
}) {
  const { t } = useLang()
  return (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1.5">
        {label}
      </label>
      {!imageUrl ? (
        <label className="relative block cursor-pointer rounded-lg border border-dashed border-slate-300 bg-slate-50 hover:border-iku-red px-3 py-2 text-xs font-semibold text-slate-600">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (!file) return
              const reader = new FileReader()
              reader.onload = () => {
                if (typeof reader.result === 'string') onChange(reader.result)
              }
              reader.readAsDataURL(file)
              e.target.value = ''
            }}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          📎 {t('builder.uploadImage')}
        </label>
      ) : (
        <div className="relative inline-block">
          <img
            src={imageUrl}
            alt="reference"
            className="max-h-40 rounded-lg border border-slate-200"
          />
          <button
            onClick={() => onChange(null)}
            title={t('builder.removeImage')}
            className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-iku-red text-white text-[10px] font-bold shadow flex items-center justify-center"
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}

// ── Match Fields ─────────────────────────────────────────────────────
function MatchFields({
  q,
  onChange,
}: {
  q: Question
  onChange: (patch: Partial<Question>) => void
}) {
  const { t } = useLang()

  const setLeft = (i: number, value: string) => {
    const next = [...q.match_left]
    next[i] = value
    onChange({ match_left: next })
  }
  const setRight = (i: number, value: string) => {
    const next = [...q.match_right]
    next[i] = value
    onChange({ match_right: next })
  }
  const setPair = (leftIdx: number, rightIdxStr: string) => {
    const rightIdx = rightIdxStr === '' ? -1 : Number(rightIdxStr)
    const others = q.match_pairs.filter(([li]) => li !== leftIdx)
    const next: [number, number][] =
      rightIdx < 0 ? others : [...others, [leftIdx, rightIdx] as [number, number]]
    onChange({ match_pairs: next })
  }
  const addLeft = () => onChange({ match_left: [...q.match_left, ''] })
  const addRight = () => onChange({ match_right: [...q.match_right, ''] })
  const removeLeft = (i: number) => {
    if (q.match_left.length <= 2) return
    const next = q.match_left.filter((_, idx) => idx !== i)
    const nextPairs = q.match_pairs
      .filter(([li]) => li !== i)
      .map(([li, ri]) => [li > i ? li - 1 : li, ri] as [number, number])
    onChange({ match_left: next, match_pairs: nextPairs })
  }
  const removeRight = (i: number) => {
    if (q.match_right.length <= 2) return
    const next = q.match_right.filter((_, idx) => idx !== i)
    const nextPairs = q.match_pairs
      .filter(([, ri]) => ri !== i)
      .map(([li, ri]) => [li, ri > i ? ri - 1 : ri] as [number, number])
    onChange({ match_right: next, match_pairs: nextPairs })
  }
  const pairMap = Object.fromEntries(q.match_pairs.map((p) => [p[0], p[1]]))

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left column */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1.5">
            {t('builder.matching.leftColumn')}
          </label>
          <div className="space-y-1.5">
            {q.match_left.map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2 py-1.5"
              >
                <span className="text-xs font-bold text-slate-500 w-5 tabular-nums">
                  {i + 1}.
                </span>
                <input
                  value={item}
                  onChange={(e) => setLeft(i, e.target.value)}
                  placeholder={t('builder.matching.leftItemPlaceholder', { n: i + 1 })}
                  className="flex-1 h-8 bg-transparent text-sm focus:outline-none"
                />
                {q.match_left.length > 2 && (
                  <button
                    onClick={() => removeLeft(i)}
                    className="w-6 h-6 rounded hover:bg-red-100 text-red-500 flex items-center justify-center"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={addLeft}
            className="mt-2 h-8 px-3 rounded-md border border-dashed border-slate-300 text-xs font-bold text-slate-600 hover:border-iku-red hover:text-iku-red"
          >
            {t('builder.matching.addItem')}
          </button>
        </div>

        {/* Right column */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1.5">
            {t('builder.matching.rightColumn')}
          </label>
          <div className="space-y-1.5">
            {q.match_right.map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2 py-1.5"
              >
                <span className="text-xs font-bold text-slate-500 w-5 tabular-nums">
                  {LETTERS[i]}.
                </span>
                <input
                  value={item}
                  onChange={(e) => setRight(i, e.target.value)}
                  placeholder={t('builder.matching.rightItemPlaceholder', { n: i + 1 })}
                  className="flex-1 h-8 bg-transparent text-sm focus:outline-none"
                />
                {q.match_right.length > 2 && (
                  <button
                    onClick={() => removeRight(i)}
                    className="w-6 h-6 rounded hover:bg-red-100 text-red-500 flex items-center justify-center"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={addRight}
            className="mt-2 h-8 px-3 rounded-md border border-dashed border-slate-300 text-xs font-bold text-slate-600 hover:border-iku-red hover:text-iku-red"
          >
            {t('builder.matching.addItem')}
          </button>
        </div>
      </div>

      {/* Correct pairs */}
      <div className="mt-4">
        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-2">
          {t('builder.matching.pairs')}
        </label>
        <div className="flex flex-wrap gap-2">
          {q.match_left.map((_, i) => {
            const currentRight = pairMap[i]
            return (
              <div
                key={i}
                className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5"
              >
                <span className="text-xs font-bold text-slate-700">
                  {i + 1} →
                </span>
                <select
                  value={currentRight !== undefined ? String(currentRight) : ''}
                  onChange={(e) => setPair(i, e.target.value)}
                  className="h-8 px-2 text-xs font-semibold bg-white border border-slate-200 rounded focus:border-iku-red focus:outline-none"
                >
                  <option value="">{t('builder.matching.pickMatch')}</option>
                  {q.match_right.map((_, ri) => (
                    <option key={ri} value={String(ri)}>
                      {LETTERS[ri]}
                    </option>
                  ))}
                </select>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Fill Fields ──────────────────────────────────────────────────────
function FillFields({
  q,
  onChange,
}: {
  q: Question
  onChange: (patch: Partial<Question>) => void
}) {
  const { t } = useLang()
  const count = countBlanks(q.fill_template)

  const updateTemplate = (text: string) => {
    const newCount = countBlanks(text)
    const prev = q.fill_answers
    let next: string[]
    if (newCount > prev.length) {
      next = [...prev, ...Array(newCount - prev.length).fill('')]
    } else {
      next = prev.slice(0, newCount)
    }
    onChange({ fill_template: text, fill_answers: next })
  }

  const setAnswer = (i: number, value: string) => {
    const next = [...q.fill_answers]
    while (next.length <= i) next.push('')
    next[i] = value
    onChange({ fill_answers: next })
  }

  return (
    <div>
      <div className="text-[11px] text-slate-500 mb-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        {t('builder.fill.hint')}
      </div>
      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1.5">
        {t('builder.fillTemplate')}
      </label>
      <textarea
        rows={3}
        value={q.fill_template}
        onChange={(e) => updateTemplate(e.target.value)}
        placeholder={t('builder.fillTemplatePlaceholder')}
        className="w-full text-sm px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:border-iku-red focus:outline-none font-mono resize-y"
      />
      {count > 0 && (
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
          {Array.from({ length: count }, (_, i) => (
            <div
              key={i}
              className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2 py-1.5"
            >
              <span className="text-xs font-bold text-slate-500 shrink-0">
                {t('builder.fill.blankLabel', { n: i + 1 })}
              </span>
              <input
                value={q.fill_answers[i] ?? ''}
                onChange={(e) => setAnswer(i, e.target.value)}
                placeholder={t('builder.fill.blankPlaceholder', { n: i + 1 })}
                className="flex-1 h-8 bg-transparent text-sm focus:outline-none"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Space Selector ───────────────────────────────────────────────────
function SpaceSelector({
  value,
  onChange,
}: {
  value: number
  onChange: (v: number) => void
}) {
  const { t } = useLang()
  return (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-2">
        {t('builder.spaceSize')}
      </label>
      <div className="flex flex-wrap gap-1.5">
        {SPACE_KEYS.map((key, i) => {
          const active = value === i
          return (
            <button
              key={key}
              onClick={() => onChange(i)}
              className={`h-8 px-3 rounded-lg text-xs font-bold transition-colors border ${
                active
                  ? 'bg-white border-iku-red text-iku-red'
                  : 'bg-slate-100 border-transparent text-slate-600 hover:bg-slate-200'
              }`}
            >
              {t(key)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Step 2 — Preview ─────────────────────────────────────────────────

// ── Shared field helpers ────────────────────────────────────────────
function LabeledInput({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1">
        {label}
      </label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-iku-red focus:outline-none"
      />
    </div>
  )
}

function LabeledSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { v: string; l: string }[]
}) {
  return (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-iku-red focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.v} value={o.v}>
            {o.l}
          </option>
        ))}
      </select>
    </div>
  )
}
