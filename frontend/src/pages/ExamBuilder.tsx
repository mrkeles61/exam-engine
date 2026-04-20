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
import type React from 'react'
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

// ── Pre-made exam templates ──────────────────────────────────────────
// Quick-start sets the teacher can load into the builder and tweak.
interface TemplateInfo {
  courseCode: string
  courseName: string
  examType: 'Final' | 'Vize' | 'Bütünleme'
  duration: string
  keyName: string
}
interface TemplateQuestion {
  type: QType
  text: string
  points: number
  options?: string[]
  correct_letter?: string
  ms_correct?: string[]
  rubric?: string
  space_size?: number
  match_left?: string[]
  match_right?: string[]
  match_pairs?: [number, number][]
  fill_template?: string
  fill_answers?: string[]
}
interface ExamTemplate {
  id: string
  label: string
  info: TemplateInfo
  questions: TemplateQuestion[]
}

const EXAM_TEMPLATES: ExamTemplate[] = [
  {
    id: 'oop',
    label: 'CSE201 · Nesne Tabanlı Programlama (Final)',
    info: {
      courseCode: 'CSE201',
      courseName: 'Nesne Tabanlı Programlama',
      examType: 'Final',
      duration: '90',
      keyName: 'CSE201 OOP Final',
    },
    questions: [
      { type: 'mc', text: 'Hangisi bir OOP prensibi değildir?', points: 5, options: ['Kapsülleme', 'Kalıtım', 'Polimorfizm', 'Derleme'], correct_letter: 'D' },
      { type: 'mc', text: '`abstract` bir sınıfın nesnesi oluşturulabilir mi?', points: 5, options: ['Evet, her zaman', 'Hayır, oluşturulamaz', 'Sadece final ise', 'Sadece interface ise'], correct_letter: 'B' },
      { type: 'mc', text: 'Java\'da hangi erişim belirleyici en kısıtlayıcıdır?', points: 5, options: ['public', 'protected', 'default', 'private'], correct_letter: 'D' },
      { type: 'ms', text: 'Aşağıdakilerden hangileri SOLID prensiplerindendir? (Birden fazla)', points: 6, options: ['Single Responsibility', 'Open/Closed', 'Don\'t Repeat Yourself', 'Liskov Substitution'], ms_correct: ['A', 'B', 'D'] },
      { type: 'fill', text: 'Kavram tamamlama', points: 4, fill_template: 'Bir alt sınıfın üst sınıftan özellik devralmasına ___ denir.', fill_answers: ['kalıtım'] },
      { type: 'fill', text: 'Kavram tamamlama', points: 4, fill_template: 'Aynı isimli metodların farklı parametrelerle tanımlanmasına ___ denir.', fill_answers: ['aşırı yükleme'] },
      { type: 'open', text: 'Kalıtım ve kompozisyon arasındaki farkları en az üç örnekle açıklayınız.', points: 20, rubric: '• 3+ geçerli fark (6p)\n• Doğru örnekler (8p)\n• Dilin akıcılığı ve teknik doğruluk (6p)', space_size: 4 },
      { type: 'open', text: 'Aşağıdaki kod parçasının çıktısını açıklayınız ve olası iyileştirmeleri belirtiniz.', points: 20, rubric: '• Doğru çıktı (10p)\n• En az bir iyileştirme önerisi (5p)\n• Gerekçelendirme (5p)', space_size: 5 },
    ],
  },
  {
    id: 'discrete',
    label: 'MAT221 · Ayrık Matematik (Vize)',
    info: {
      courseCode: 'MAT221',
      courseName: 'Ayrık Matematik',
      examType: 'Vize',
      duration: '75',
      keyName: 'MAT221 Ayrık Matematik Vize',
    },
    questions: [
      { type: 'mc', text: '|A ∪ B| = 10, |A| = 6, |B| = 7 ise |A ∩ B| kaçtır?', points: 4, options: ['2', '3', '4', '5'], correct_letter: 'B' },
      { type: 'mc', text: 'p → q ifadesinin olumsuzu hangisidir?', points: 4, options: ['¬p → ¬q', 'p ∧ ¬q', '¬p ∨ q', 'q → p'], correct_letter: 'B' },
      { type: 'mc', text: 'C(5,2) kaçtır?', points: 4, options: ['5', '10', '20', '25'], correct_letter: 'B' },
      { type: 'mc', text: 'Hangisi her zaman doğrudur?', points: 4, options: ['p ∨ ¬p', 'p ∧ ¬p', 'p → ¬p', '¬(p ∨ p)'], correct_letter: 'A' },
      { type: 'ms', text: 'Aşağıdakilerden hangileri tautolojidir? (Birden fazla)', points: 6, options: ['p ∨ ¬p', 'p → p', 'p ∧ ¬p', '(p ∧ q) → p'], ms_correct: ['A', 'B', 'D'] },
      { type: 'fill', text: 'Temel formül', points: 4, fill_template: 'n elemanlı bir kümenin alt küme sayısı ___\'dır.', fill_answers: ['2^n'] },
      { type: 'fill', text: 'Temel formül', points: 4, fill_template: 'P(n,r) formülü ___ şeklinde yazılır.', fill_answers: ['n!/(n-r)!'] },
      { type: 'fill', text: 'Mantık', points: 4, fill_template: 'p → q ifadesi ___ ifadesine eşdeğerdir.', fill_answers: ['¬p ∨ q'] },
      { type: 'open', text: 'n ≥ 1 için 1 + 2 + ... + n = n(n+1)/2 eşitliğini tümevarımla ispatlayınız.', points: 24, rubric: '• Taban durum (4p)\n• Tümevarım hipotezi (8p)\n• Tümevarım adımı (10p)\n• Sonuç ifadesi (2p)', space_size: 6 },
    ],
  },
  {
    id: 'literature',
    label: 'TDE101 · Türk Edebiyatı (Final)',
    info: {
      courseCode: 'TDE101',
      courseName: 'Türk Edebiyatı',
      examType: 'Final',
      duration: '90',
      keyName: 'TDE101 Türk Edebiyatı Final',
    },
    questions: [
      { type: 'mc', text: 'Divan edebiyatı hangi dönemde hâkim tarzdır?', points: 4, options: ['Tanzimat', 'Servet-i Fünun', 'Klasik Osmanlı', 'Cumhuriyet'], correct_letter: 'C' },
      { type: 'mc', text: '"Mai ve Siyah" romanının yazarı kimdir?', points: 4, options: ['Ahmet Mithat', 'Halit Ziya Uşaklıgil', 'Recaizade Mahmut Ekrem', 'Namık Kemal'], correct_letter: 'B' },
      { type: 'mc', text: 'Yahya Kemal hangi akıma bağlıdır?', points: 4, options: ['Garip', 'Yedi Meşaleciler', 'Hececiler', 'Müstakil'], correct_letter: 'D' },
      { type: 'mc', text: 'Servet-i Fünun dergisi hangi yıl çıkmaya başladı?', points: 4, options: ['1886', '1891', '1896', '1901'], correct_letter: 'C' },
      { type: 'fill', text: 'Dönem tamamlama', points: 4, fill_template: 'Tanzimat edebiyatı ___ yılında başlar.', fill_answers: ['1860'] },
      { type: 'fill', text: 'Eser-Yazar', points: 4, fill_template: '"Çalıkuşu" adlı romanın yazarı ___\'dir.', fill_answers: ['Reşat Nuri Güntekin'] },
      { type: 'open', text: 'Divan edebiyatı ile halk edebiyatı arasındaki temel farkları, örnekler vererek karşılaştırınız.', points: 20, rubric: '• Dil ve üslup farkı (5p)\n• Şekil/ölçü farkı (5p)\n• İçerik-tema farkı (5p)\n• En az iki eser örneği (5p)', space_size: 5 },
      { type: 'open', text: 'Tanzimat edebiyatının Batılılaşma üzerindeki etkisini bir romancı örneği üzerinden tartışınız.', points: 20, rubric: '• Tarihsel bağlam (6p)\n• Seçilen yazar ve eserinin uygunluğu (6p)\n• Batılılaşma-gelenek ilişkisi tartışması (8p)', space_size: 5 },
      { type: 'open', text: 'Cumhuriyet dönemi Türk şiirinin Öz-Türkçeci hareketle ilişkisini kısaca anlatınız.', points: 20, rubric: '• Öz-Türkçeci hareketin tanımı (6p)\n• Şiire etkisi (8p)\n• En az bir şair örneği (6p)', space_size: 5 },
    ],
  },
]

function templateToQuestions(tpl: ExamTemplate): Question[] {
  return tpl.questions.map((tq, i) => {
    const q = blankQuestion(tq.type, i + 1)
    q.question_text = tq.text
    q.points = tq.points
    if (tq.options) q.options = [...tq.options]
    if (tq.correct_letter) q.correct_letter = tq.correct_letter
    if (tq.ms_correct) q.ms_correct = [...tq.ms_correct]
    if (tq.rubric !== undefined) q.rubric = tq.rubric
    if (tq.space_size !== undefined) q.space_size = tq.space_size
    if (tq.match_left) q.match_left = [...tq.match_left]
    if (tq.match_right) q.match_right = [...tq.match_right]
    if (tq.match_pairs) q.match_pairs = tq.match_pairs.map((p) => [p[0], p[1]] as [number, number])
    if (tq.fill_template !== undefined) q.fill_template = tq.fill_template
    if (tq.fill_answers) q.fill_answers = [...tq.fill_answers]
    return q
  })
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

  // Template loader
  const applyTemplate = useCallback((tpl: ExamTemplate) => {
    setCourseCode(tpl.info.courseCode)
    setCourseName(tpl.info.courseName)
    setExamType(tpl.info.examType)
    setDuration(tpl.info.duration)
    setKeyName(tpl.info.keyName)
    const qs = templateToQuestions(tpl)
    setQuestions(qs)
    setActiveId(qs[0]?.id ?? null)
  }, [])

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

  const moveQuestionToIndex = useCallback((fromId: string, toIndex: number) => {
    setQuestions((qs) => {
      const fromIdx = qs.findIndex((q) => q.id === fromId)
      if (fromIdx < 0 || fromIdx === toIndex) return qs
      const next = [...qs]
      const [picked] = next.splice(fromIdx, 1)
      const insertAt = fromIdx < toIndex ? toIndex - 1 : toIndex
      next.splice(insertAt, 0, picked)
      return next.map((q, i) => ({ ...q, question_number: i + 1 }))
    })
  }, [])

  // ── Preview answer-detail stubs ────────────────────────────────────
  // 2-column masonry: wide types (match, open) span both columns; mc/ms/fill
  // pack into the shortest column first. Mirrors backend _flow_bbox.
  const previewAnswers: AnswerDetail[] = useMemo(() => {
    const PAGE_TOP_P1 = 0.28
    const PAGE_TOP_OTHER = 0.08
    const PAGE_BOTTOM = 0.94
    const LEFT_X = 0.06
    const GUTTER = 0.02
    const COL_WIDTH = (1 - 2 * LEFT_X - GUTTER) / 2 // ≈ 0.43
    const FULL_WIDTH = 1 - 2 * LEFT_X // ≈ 0.88
    const VERTICAL_GAP = 0.01

    const WIDE_TYPES = new Set<QType>(['match', 'open'])

    const heightFor = (q: Question): number => {
      const type = q.question_type
      let h: number
      // Heights sized to fit 4 options + the question text without clipping
      // inside the block's `overflow-hidden` container. Values tuned on the
      // narrowest viewport we support (V4 scan panel ≈ 350px wide).
      if (type === 'mc') h = 0.18
      else if (type === 'ms') h = 0.19
      else if (type === 'fill') h = 0.14
      else if (type === 'match') h = 0.22
      else {
        // open
        const space = typeof q.space_size === 'number' && q.space_size > 0 ? q.space_size : 0
        h = 0.24 + 0.04 * space
      }
      if (q.image_url) h += 0.08
      return h
    }

    const round4 = (n: number) => Math.round(n * 10000) / 10000

    let page = 1
    let yLeft = PAGE_TOP_P1
    let yRight = PAGE_TOP_P1

    const bboxes: { page: number; x: number; y: number; w: number; h: number }[] = []

    for (const q of questions) {
      const h = heightFor(q)
      const isWide = WIDE_TYPES.has(q.question_type)

      if (isWide) {
        // Wide questions start at max(yLeft, yRight); both columns sync after.
        let y = Math.max(yLeft, yRight)
        if (y + h > PAGE_BOTTOM) {
          page += 1
          y = PAGE_TOP_OTHER
        }
        bboxes.push({
          page,
          x: round4(LEFT_X),
          y: round4(y),
          w: round4(FULL_WIDTH),
          h: round4(h),
        })
        yLeft = y + h + VERTICAL_GAP
        yRight = y + h + VERTICAL_GAP
      } else {
        // Place in shortest column; if both overflow, new page.
        const useLeft = yLeft <= yRight
        let y = useLeft ? yLeft : yRight
        let x = useLeft ? LEFT_X : LEFT_X + COL_WIDTH + GUTTER
        if (y + h > PAGE_BOTTOM) {
          page += 1
          yLeft = PAGE_TOP_OTHER
          yRight = PAGE_TOP_OTHER
          y = PAGE_TOP_OTHER
          x = LEFT_X
          bboxes.push({
            page,
            x: round4(x),
            y: round4(y),
            w: round4(COL_WIDTH),
            h: round4(h),
          })
          yLeft = y + h + VERTICAL_GAP
        } else {
          bboxes.push({
            page,
            x: round4(x),
            y: round4(y),
            w: round4(COL_WIDTH),
            h: round4(h),
          })
          if (useLeft) yLeft = y + h + VERTICAL_GAP
          else yRight = y + h + VERTICAL_GAP
        }
      }
    }

    return questions.map((q, i) => {
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
        bbox: bboxes[i],
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

  // Single-page render — Info + Templates on top, Questions editor and
  // feed-style preview below. No more stepper.
  return (
    <div className="min-h-full bg-slate-50 pb-16">
      <BuilderPage
        // Info
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
        // Templates
        onApplyTemplate={applyTemplate}
        // Questions
        questions={questions}
        active={active}
        activeIndex={activeIndex}
        setActiveId={setActiveId}
        addQuestion={addQuestion}
        deleteQuestion={deleteQuestion}
        duplicateQuestion={duplicateQuestion}
        moveQuestion={moveQuestion}
        moveQuestionToIndex={moveQuestionToIndex}
        updateQuestion={updateQuestion}
        // Preview
        previewAnswers={previewAnswers}
        totalPages={totalPages}
        // Save
        onSave={handleSave}
        saving={saving}
      />
    </div>
  )
}

// ── Single-page builder ──────────────────────────────────────────────
interface BuilderPageProps {
  // Info
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
  // Templates
  onApplyTemplate: (tpl: ExamTemplate) => void
  // Questions
  questions: Question[]
  active: Question | null
  activeIndex: number
  setActiveId: (id: string) => void
  addQuestion: (t: QType) => void
  deleteQuestion: (id: string) => void
  duplicateQuestion: (id: string) => void
  moveQuestion: (id: string, delta: -1 | 1) => void
  moveQuestionToIndex: (fromId: string, toIndex: number) => void
  updateQuestion: (id: string, patch: Partial<Question>) => void
  // Preview
  previewAnswers: AnswerDetail[]
  totalPages: number
  // Save
  onSave: () => void
  saving: boolean
}

function BuilderPage(p: BuilderPageProps) {
  const { t, lang } = useLang()
  const pageIndices = Array.from({ length: Math.max(1, p.totalPages) }, (_, i) => i + 1)

  // Preview feed — every page stacked, scrolls with the column.
  const PreviewFeed = (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
        <h3 className="text-sm font-bold text-slate-900">
          {lang === 'tr' ? 'Önizleme' : 'Preview'}
        </h3>
        <span className="text-[11px] font-mono text-slate-500">
          {p.totalPages} {lang === 'tr' ? 'sayfa' : 'pages'}
        </span>
      </div>
      <div className="p-4 bg-slate-100/60 space-y-6 max-h-[calc(100vh-12rem)] overflow-y-auto">
        {pageIndices.map((pageIdx) => (
          <div key={pageIdx}>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">
              {lang === 'tr' ? 'Sayfa' : 'Page'} {pageIdx} / {p.totalPages}
            </div>
            <ExamShapedScan
              answers={p.previewAnswers}
              activeQNum={p.active?.question_number ?? null}
              pageIndex={pageIdx}
              totalPages={p.totalPages}
              courseCode={p.courseCode}
              courseName={p.courseName}
              examType={p.examType}
              examDate={p.examDate}
              duration={p.duration}
              studentNumber="2021000000"
              studentName={t('builder.preview.sampleName')}
            />
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div className="mx-auto max-w-[1800px] px-5 py-5">
      {/* Templates bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-widest text-slate-500 mr-2">
          {lang === 'tr' ? 'Şablonlar' : 'Templates'}:
        </span>
        {EXAM_TEMPLATES.map((tpl) => (
          <button
            key={tpl.id}
            onClick={() => {
              if (
                p.questions.length > 0 &&
                !window.confirm(
                  lang === 'tr'
                    ? 'Mevcut sorular şablonla değiştirilecek. Devam edilsin mi?'
                    : 'Existing questions will be replaced by the template. Continue?',
                )
              ) return
              p.onApplyTemplate(tpl)
            }}
            className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-iku-red/5 hover:border-iku-red hover:text-iku-red transition-colors"
          >
            {tpl.label}
          </button>
        ))}
      </div>

      {/* Info card */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900 mb-3 uppercase tracking-wider">
          {t('builder.info.title')}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <LabeledInput label={t('builder.courseCode')}  value={p.courseCode}  onChange={p.setCourseCode}  placeholder="CSE201" />
          <LabeledInput label={t('builder.courseName')}  value={p.courseName}  onChange={p.setCourseName}  placeholder={t('builder.courseNamePlaceholder')} />
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
          <LabeledInput label={t('builder.examDate')} value={p.examDate} onChange={p.setExamDate} type="date" />
          <LabeledInput label={t('builder.duration')} value={p.duration} onChange={p.setDuration} type="number" />
          <LabeledInput label={t('builder.keyName')}  value={p.keyName}  onChange={p.setKeyName} />
        </div>
      </div>

      {/* Questions area: Sidebar + Editor + Preview feed */}
      <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)_minmax(360px,26rem)] gap-4 items-start">
        <QuestionSidebar
          questions={p.questions}
          activeId={p.active?.id ?? null}
          onSelect={p.setActiveId}
          onDelete={p.deleteQuestion}
          onMove={p.moveQuestion}
          onMoveToIndex={p.moveQuestionToIndex}
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

          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            <button
              onClick={p.onSave}
              disabled={p.saving}
              className="h-11 min-w-[160px] px-6 rounded-lg text-white text-sm font-bold shadow-md flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              style={{ backgroundColor: '#ED1C24' }}
              onMouseEnter={(e) => { if (!p.saving) e.currentTarget.style.backgroundColor = '#C41820' }}
              onMouseLeave={(e) => { if (!p.saving) e.currentTarget.style.backgroundColor = '#ED1C24' }}
            >
              <span className="material-symbols-outlined text-base">save</span>
              {p.saving ? t('builder.preview.saving') : t('builder.preview.save')}
            </button>
          </div>

          {/* On narrow viewports the preview stacks below the editor */}
          <div className="xl:hidden mt-4">{PreviewFeed}</div>
        </div>

        {/* Live preview right column — sticky, only on xl+ */}
        <div className="hidden xl:block sticky top-4">{PreviewFeed}</div>
      </div>
    </div>
  )
}

// (Dead code kept for reference — Stepper / InfoStep / EditorStep are no longer mounted)
function _UnusedStepper({ step }: { step: 0 | 1 }) {
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
        <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end items-center">
          <button
            onClick={p.onNext}
            className="h-11 min-w-[160px] px-6 rounded-lg text-white text-sm font-bold shadow-md flex items-center justify-center gap-2 flex-shrink-0 transition-colors"
            style={{ backgroundColor: '#ED1C24' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#C41820' }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ED1C24' }}
          >
            <span>{t('builder.info.next')}</span>
            <span className="material-symbols-outlined text-base">arrow_forward</span>
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
  moveQuestionToIndex: (fromId: string, toIndex: number) => void
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
          studentNumber="2021000000"
          studentName={t('builder.preview.sampleName')}
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
          onMoveToIndex={p.moveQuestionToIndex}
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
  onMoveToIndex: (fromId: string, toIndex: number) => void
  onAdd: (t: QType) => void
}

function QuestionSidebar(p: QuestionSidebarProps) {
  const { t } = useLang()
  const [addOpen, setAddOpen] = useState(false)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id)
    e.dataTransfer.effectAllowed = 'move'
    setDraggedId(id)
  }
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const mid = rect.top + rect.height / 2
    setDragOverIdx(e.clientY < mid ? idx : idx + 1)
  }
  const handleDragLeaveRow = () => {
    // Note: not clearing here causes indicator to flicker. Keep the last
    // computed overIdx so drop has target; the container-level leave clears.
  }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const fromId = e.dataTransfer.getData('text/plain')
    if (fromId && dragOverIdx !== null) p.onMoveToIndex(fromId, dragOverIdx)
    setDragOverIdx(null)
    setDraggedId(null)
  }
  const handleDragEnd = () => {
    setDragOverIdx(null)
    setDraggedId(null)
  }

  return (
    <aside className="w-72 shrink-0 bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-3 py-2.5 border-b border-slate-100 bg-slate-50/60">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          {t('builder.sidebar.title', { n: p.questions.length })}
        </h3>
      </div>

      <div
        className="max-h-[68vh] overflow-y-auto"
        onDragLeave={(e) => {
          // Only clear when leaving the whole list, not when moving between rows.
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setDragOverIdx(null)
          }
        }}
      >
        {p.questions.length === 0 && (
          <div className="px-4 py-6 text-xs text-slate-500 text-center">
            {t('builder.sidebar.empty')}
          </div>
        )}
        {p.questions.map((q, i) => (
          <div key={q.id}>
            {dragOverIdx === i && (
              <div className="h-0.5 bg-iku-red rounded mx-2" />
            )}
            <QuestionRow
              q={q}
              index={i}
              active={q.id === p.activeId}
              dragging={draggedId === q.id}
              onSelect={() => p.onSelect(q.id)}
              onMoveUp={() => p.onMove(q.id, -1)}
              onMoveDown={() => p.onMove(q.id, 1)}
              onDelete={() => p.onDelete(q.id)}
              onDragStart={(e) => handleDragStart(e, q.id)}
              onDragOver={(e) => handleDragOver(e, i)}
              onDragLeave={handleDragLeaveRow}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
            />
          </div>
        ))}
        {/* Trailing drop-zone for append-to-end */}
        {p.questions.length > 0 && (
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragOverIdx(p.questions.length)
            }}
            onDrop={handleDrop}
            className="h-4"
          >
            {dragOverIdx === p.questions.length && (
              <div className="h-0.5 bg-iku-red rounded mx-2" />
            )}
          </div>
        )}
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
  dragging,
  onSelect,
  onMoveUp,
  onMoveDown,
  onDelete,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: {
  q: Question
  index: number
  active: boolean
  dragging: boolean
  onSelect: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
  onDragStart: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onDragEnd: (e: React.DragEvent) => void
}) {
  const { t } = useLang()
  const preview = q.question_text.replace(/\s+/g, ' ').slice(0, 30)
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      style={dragging ? { opacity: 0.5 } : undefined}
      className={`px-2 py-2.5 flex items-center gap-2 cursor-pointer transition-colors border-b border-slate-100 ${
        active ? 'bg-red-50 border-l-2 border-iku-red' : 'hover:bg-slate-50 border-l-2 border-transparent'
      }`}
    >
      <span
        className="material-symbols-outlined text-slate-400 cursor-grab text-base shrink-0"
        title="Drag to reorder"
      >
        drag_indicator
      </span>
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
