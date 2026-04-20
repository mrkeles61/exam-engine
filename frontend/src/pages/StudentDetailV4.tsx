/**
 * V4 — "Consolidated View"
 *
 * Top navigation (no left sidebar, reclaims ~240px of screen width) +
 * sub-strip with student identity and page tabs + 3-column workspace:
 *
 *   LEFT  ~45%  → scan viewer (ExamShapedScan, reused)
 *   MID   ~22%  → question list with inline-editable point scores
 *   RIGHT ~33%  → OCR side-by-side + rubric + notes + score slider
 *
 * Route: /results/:jobId/student/:studentId/v4
 *
 * Self-contained: fetches its own data via existing API, does not reuse the
 * StudentDetail hooks (keeps the layout rewrites isolated).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../api/client'
import type {
  AnswerDetail,
  StudentResult,
  OverrideHistoryResponse,
  ApprovalResponse,
} from '../types'
import { LoadingSpinner } from '../components/LoadingSpinner'
import ExamShapedScan from '../components/results/ExamShapedScan'
import AnswerCutout from '../components/results/AnswerCutout'
import { saveLastReviewed } from '../utils/continueResume'
import { useToast } from '../contexts/ToastContext'
import { useLang } from '../i18n'

// ── Match badge (template match + confidence pill) ───────────────────
function MatchBadge({ name, confidencePct }: { name: string | null; confidencePct: number }) {
  const { t } = useLang()
  const color = confidencePct >= 95
    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
    : confidencePct >= 85
      ? 'bg-amber-50 border-amber-200 text-amber-700'
      : 'bg-red-50 border-red-200 text-red-700'
  const displayName = name && name.trim().length > 0 ? name : '—'
  return (
    <div
      className={`h-9 px-3 rounded-lg text-xs font-semibold flex items-center gap-2 border ${color}`}
      title={t('workspace.demoTooltip')}
    >
      <span className="material-symbols-outlined text-sm">fact_check</span>
      <span className="font-bold">{t('workspace.templateMatch')}:</span>
      <span className="truncate max-w-[220px]">{displayName}</span>
      <span className="tabular-nums">· %{confidencePct}</span>
      <span className="ml-1.5 text-[9px] font-black tracking-wider bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">{t('workspace.demoTag')}</span>
    </div>
  )
}

// ── Per-stage confidence: mini bar + stack ───────────────────────────
/**
 * Deterministic fallback for segmentation confidence when the backend record
 * predates the `segmentation_confidence` field. Lands between 0.88 and 0.99
 * so the mini-bar renders meaningfully instead of a 0% bar.
 */
function _fallbackSegConf(qn: number): number {
  const hash = Math.abs(Math.sin(qn * 9301 + 49297) * 10000) % 1
  return 0.88 + hash * 0.11
}

function ConfBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100)
  const color = pct >= 90 ? 'bg-emerald-500' : pct >= 75 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div>
      <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wide text-slate-500">
        <span>{label}</span>
        <span className="tabular-nums">%{pct}</span>
      </div>
      <div className="h-1 rounded-full bg-slate-100 overflow-hidden mt-0.5">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function ConfidenceStack({ ocr, grading }: {
  /** @deprecated Segmentation bar removed from UI; kept in the type for back-compat at callsites. */
  segmentation?: number | null
  ocr: number | null
  grading: number | null
}) {
  const { t } = useLang()
  return (
    <div className="flex flex-col gap-1 min-w-[120px]">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{t('workspace.confidence.title')}</span>
        <span className="material-symbols-outlined text-xs text-slate-400" title={t('workspace.demoTooltip')}>info</span>
      </div>
      <ConfBar label={t('workspace.confidence.ocr')}          value={ocr ?? 0} />
      <ConfBar label={t('workspace.confidence.grading')}      value={grading ?? 0} />
    </div>
  )
}

// ── Sub-strip: student identity + page tabs ──────────────────────────
function SubStrip({
  result, examMeta, activePage, onPageChange, totalPages,
  prevStudentId, nextStudentId, currentIdx, totalStudents, jobId,
  onApprove, onReopen, onToggleHistory, historyOpen,
}: {
  result: StudentResult
  examMeta: {
    course_code: string
    course_name: string
    exam_type: string
    answer_key_name?: string
    template_match_confidence?: number
  } | null
  activePage: number
  onPageChange: (p: number) => void
  totalPages: number
  prevStudentId: string | null
  nextStudentId: string | null
  currentIdx: number
  totalStudents: number
  jobId: string
  onApprove: () => void
  onReopen: () => void
  onToggleHistory: () => void
  historyOpen: boolean
}) {
  const navigate = useNavigate()
  const { t } = useLang()
  const isApproved = !!result.approved_at
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1)

  return (
    <div className="bg-white border-b border-slate-200">
      <div className="mx-auto max-w-[1600px] px-5 flex flex-wrap items-center gap-x-4 gap-y-2 py-2">
        {/* Left: student identity */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-md bg-slate-100 text-slate-600 flex items-center justify-center">
            <span className="material-symbols-outlined text-base">description</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate leading-tight">
              {result.student_name}
            </p>
            <p className="text-[11px] font-mono text-slate-500 truncate leading-tight">
              {result.student_id}
              {examMeta && ` · ${examMeta.course_code} ${examMeta.exam_type}`}
            </p>
          </div>
        </div>

        {/* Template match badge */}
        <MatchBadge
          name={examMeta?.answer_key_name ?? null}
          confidencePct={Math.round(((examMeta?.template_match_confidence ?? 0)) * 100)}
        />

        {/* Middle: page tabs */}
        <div className="flex flex-wrap gap-1 min-w-0">
          {pages.map((p) => {
            const isActive = p === activePage
            return (
              <button
                key={p}
                onClick={() => onPageChange(p)}
                className="px-3 h-8 rounded-md text-xs font-semibold transition-colors"
                style={
                  isActive
                    ? { backgroundColor: '#1A1A1A', color: '#FFFFFF' }
                    : { color: '#475569' }
                }
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = '#F1F5F9'
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                {t('workspace.page')} {p}
              </button>
            )
          })}
        </div>

        {/* Right: actions */}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <button onClick={onToggleHistory}
            className={`h-9 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 border ${
              historyOpen
                ? 'bg-red-50 border-iku-red text-iku-red'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}>
            <span className="material-symbols-outlined text-base">history</span>
            {t('common.history')}
          </button>
          {isApproved ? (
            <button onClick={onReopen}
              className="h-9 px-4 rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-slate-200 transition-colors"
              style={{ backgroundColor: '#F1F5F9', color: '#334155' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#E2E8F0' }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#F1F5F9' }}>
              <span className="material-symbols-outlined text-base">lock_open</span>
              {t('common.reopen')}
            </button>
          ) : (
            <button onClick={onApprove}
              className="h-9 px-4 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
              style={{ backgroundColor: '#ED1C24', color: '#FFFFFF' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#C41820' }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ED1C24' }}>
              <span className="material-symbols-outlined text-base">check_circle</span>
              {t('common.approve')}
            </button>
          )}
          <div className="flex items-center gap-1 pl-3 ml-1 border-l border-slate-200">
            <button
              onClick={() => prevStudentId && navigate(`/results/${jobId}/student/${prevStudentId}/v4`)}
              disabled={!prevStudentId}
              className="w-8 h-8 rounded-md hover:bg-slate-100 disabled:opacity-30 flex items-center justify-center"
            >
              <span className="material-symbols-outlined text-lg">chevron_left</span>
            </button>
            <span className="text-xs text-slate-500 tabular-nums px-1 font-semibold">
              {currentIdx + 1} / {totalStudents}
            </span>
            <button
              onClick={() => nextStudentId && navigate(`/results/${jobId}/student/${nextStudentId}/v4`)}
              disabled={!nextStudentId}
              className="w-8 h-8 rounded-md hover:bg-slate-100 disabled:opacity-30 flex items-center justify-center"
            >
              <span className="material-symbols-outlined text-lg">chevron_right</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Middle column: question list with inline-editable points ─────────
function QuestionListWithEditablePoints({
  answers, activeQn, onSelect, onPointsChange, approved,
  totalScore, totalMaxPoints, grade, pendingScores, hasPendingChanges,
  onSaveAllPending,
}: {
  answers: AnswerDetail[]
  activeQn: number | null
  onSelect: (qn: number) => void
  onPointsChange: (qn: number, newScore: number, reason: string) => Promise<boolean>
  approved: boolean
  totalScore: number
  totalMaxPoints: number
  grade: string
  pendingScores: Record<number, number>
  hasPendingChanges?: boolean
  onSaveAllPending: (reason: string) => Promise<boolean>
}) {
  const { t, lang } = useLang()
  const [savePanelOpen, setSavePanelOpen] = useState(false)
  const [saveReason, setSaveReason] = useState('')
  const [savingAll, setSavingAll] = useState(false)
  const pendingCount = Object.keys(pendingScores).length
  const reasonOk = saveReason.trim().length >= 10
  const commitAll = async () => {
    if (!reasonOk) return
    setSavingAll(true)
    const ok = await onSaveAllPending(saveReason.trim())
    setSavingAll(false)
    if (ok) {
      setSaveReason('')
      setSavePanelOpen(false)
    }
  }
  return (
    <div className="bg-white rounded-xl border border-slate-200 flex flex-col h-[calc(100vh-8.5rem)] overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-900">{t('workspace.questions')} ({answers.length})</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {[...answers].sort((a, b) => a.question_number - b.question_number).map((a) => {
          const isActive = a.question_number === activeQn
          const ratio = a.max_score > 0 ? a.score / a.max_score : 0
          const dot =
            a.override_applied ? 'bg-teal-500' :
            a.needs_review ? 'bg-amber-500' :
            a.is_correct === false || ratio < 0.4 ? 'bg-red-500' :
            ratio >= 0.7 ? 'bg-emerald-500' : 'bg-slate-400'
          return (
            <QuestionRow
              key={a.question_number}
              answer={a} isActive={isActive} dot={dot}
              approved={approved}
              pendingScore={pendingScores[a.question_number]}
              onSelect={() => onSelect(a.question_number)}
              onSaveScore={(newScore, reason) => onPointsChange(a.question_number, newScore, reason)}
            />
          )
        })}
      </div>

      {/* Sticky total footer */}
      <div className="px-4 py-3 border-t border-slate-100 bg-slate-50">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{t('workspace.totalScore')}</p>
        <div className="flex items-baseline justify-between mt-1">
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-slate-900 font-jakarta tabular-nums">
              {totalScore.toFixed(0)}
            </span>
            <span className="text-sm font-semibold text-slate-500 tabular-nums">
              / {totalMaxPoints.toFixed(0)}
            </span>
          </div>
          <span className="inline-flex px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 text-xs font-bold">
            {grade}
          </span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-slate-200 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-iku-red to-iku-black transition-all"
            style={{ width: `${Math.max(0, Math.min(100, (totalScore / Math.max(1, totalMaxPoints)) * 100))}%` }}
          />
        </div>
        {!approved && (
          <div className="mt-2">
            {!savePanelOpen && !hasPendingChanges && (
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">check_circle</span>
                  {lang === 'tr' ? 'Sınav skoru kaydedildi' : 'Exam total saved'}
                </p>
                <span className="text-[10px] text-slate-400 font-mono">
                  {totalScore.toFixed(1)} / {totalMaxPoints.toFixed(0)}
                </span>
              </div>
            )}
            {!savePanelOpen && hasPendingChanges && (
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] text-amber-600 font-semibold">
                  {pendingCount} {lang === 'tr' ? 'kaydedilmemiş değişiklik' : 'unsaved change' + (pendingCount === 1 ? '' : 's')}
                </p>
                <button
                  onClick={() => setSavePanelOpen(true)}
                  className="h-7 px-2.5 rounded-md text-[11px] font-bold text-white shadow-sm flex items-center gap-1 transition-colors"
                  style={{ backgroundColor: '#ED1C24' }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#C41820' }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ED1C24' }}
                >
                  <span className="material-symbols-outlined text-sm">save</span>
                  {lang === 'tr' ? `Toplamı Kaydet (${pendingCount})` : `Save Total (${pendingCount})`}
                </button>
              </div>
            )}
            {savePanelOpen && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-slate-600">
                  {lang === 'tr'
                    ? `${pendingCount} puan değişikliği için ortak bir gerekçe yazın (min 10 karakter):`
                    : `Write a shared reason for the ${pendingCount} score change${pendingCount === 1 ? '' : 's'} (min 10 chars):`}
                </p>
                <textarea
                  rows={2}
                  placeholder={lang === 'tr' ? 'Örn. OCR düşük güvenli; manuel kontrol sonrası düzeltildi.' : 'e.g. Low OCR confidence; corrected after manual review.'}
                  value={saveReason}
                  onChange={(e) => setSaveReason(e.target.value)}
                  className="w-full text-xs px-2 py-1.5 border border-slate-300 rounded-md focus:border-iku-red focus:outline-none"
                />
                <div className="flex items-center justify-between text-[10px]">
                  <span className={reasonOk ? 'text-emerald-600 font-bold' : 'text-slate-400'}>
                    {saveReason.trim().length}/10
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => { setSavePanelOpen(false); setSaveReason('') }}
                      className="h-7 px-2 rounded-md bg-slate-100 text-slate-600 text-[11px] font-semibold hover:bg-slate-200"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      onClick={commitAll}
                      disabled={!reasonOk || savingAll}
                      className="h-7 px-2.5 rounded-md text-white text-[11px] font-bold shadow-sm disabled:opacity-40 flex items-center gap-1"
                      style={{ backgroundColor: '#ED1C24' }}
                    >
                      {savingAll ? '…' : (lang === 'tr' ? 'Kaydet' : 'Save')}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** One question row — click activates; score has an inline editor. */
function QuestionRow({
  answer, isActive, dot, approved, pendingScore, onSelect, onSaveScore,
}: {
  answer: AnswerDetail
  isActive: boolean
  dot: string
  approved: boolean
  pendingScore: number | undefined
  onSelect: () => void
  onSaveScore: (newScore: number, reason: string) => Promise<boolean>
}) {
  const { t } = useLang()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(answer.score))
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { setDraft(String(answer.score)); setReason('') }, [answer.score, answer.question_number])

  const displayScore = pendingScore ?? answer.score
  const hasPending = pendingScore !== undefined && pendingScore !== answer.score

  const commit = async () => {
    const n = parseFloat(draft)
    if (Number.isNaN(n)) { setEditing(false); return }
    if (n === answer.score) { setEditing(false); return }
    if (reason.trim().length < 10) { alert(t('workspace.reasonTooShort')); return }
    setSaving(true)
    const ok = await onSaveScore(n, reason.trim())
    setSaving(false)
    if (ok) { setEditing(false) }
  }

  return (
    <div
      onClick={!editing ? onSelect : undefined}
      className={`relative px-4 py-2.5 border-b border-slate-100 cursor-pointer transition-colors ${
        isActive ? 'bg-red-50/60' : 'hover:bg-slate-50'
      }`}
    >
      <div className="flex items-center gap-3">
        <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
        <span className={`text-sm font-semibold flex-1 truncate ${isActive ? 'text-iku-red' : 'text-slate-800'}`}>
          {t('workspace.question')} {answer.question_number}
        </span>
        {editing ? (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              type="number"
              step="0.5"
              min={0}
              max={answer.max_score}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-14 h-7 px-1.5 text-xs font-bold text-right border-2 border-iku-red rounded-md"
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commit() }}
            />
            <span className="text-xs text-slate-500">/ {answer.max_score}</span>
          </div>
        ) : (
          <button
            disabled={approved}
            onClick={(e) => { e.stopPropagation(); onSelect(); setEditing(true) }}
            className={`text-xs font-bold tabular-nums px-1.5 py-0.5 rounded ${
              approved ? 'text-slate-400 cursor-not-allowed' :
              isActive ? 'text-iku-red bg-white border border-iku-red' :
              'text-slate-700 hover:bg-slate-200'
            }`}
            title={approved ? 'Onaylı — düzenleme kapalı' : 'Tıklayarak puanı düzenleyin'}
          >
            <span className={hasPending ? 'italic' : ''}>{displayScore}</span>
            <span className="text-slate-400 font-normal"> / {answer.max_score}</span>
            {hasPending && (
              <span
                className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 ml-1"
                title="Kaydedilmedi"
              />
            )}
            {answer.override_applied && <span className="ml-1 text-amber-600">✱</span>}
          </button>
        )}
      </div>

      {editing && (
        <div className="mt-2 pl-5" onClick={(e) => e.stopPropagation()}>
          <textarea
            rows={2}
            placeholder={t('workspace.reasonPlaceholder')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full text-xs px-2 py-1.5 border border-slate-300 rounded-md focus:border-iku-red focus:outline-none"
          />
          <div className="mt-1.5 flex items-center gap-2 text-[10px]">
            <span className={reason.trim().length >= 10 ? 'text-emerald-600 font-bold' : 'text-slate-400'}>
              {reason.trim().length}/10
            </span>
            <div className="ml-auto flex gap-1">
              <button
                className="h-6 px-2 rounded-md bg-slate-100 text-slate-600 font-semibold"
                onClick={() => { setEditing(false); setDraft(String(answer.score)); setReason('') }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={commit}
                disabled={saving || reason.trim().length < 10}
                className="h-6 px-2 rounded-md bg-iku-red text-white font-semibold disabled:opacity-40"
              >
                {saving ? '…' : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Flag region popover: marks an answer needs_review + audit entry ──
function FlagRegionButton({
  approved, onFlag,
}: {
  approved: boolean
  onFlag: (reason: string) => Promise<boolean>
}) {
  const { t } = useLang()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const reasonOk = reason.trim().length >= 10

  const handleSubmit = async () => {
    if (!reasonOk || submitting) return
    setSubmitting(true)
    const ok = await onFlag(reason.trim())
    setSubmitting(false)
    if (ok) { setOpen(false); setReason('') }
  }

  return (
    <div className="flex-1 relative">
      <button
        onClick={() => !approved && setOpen((v) => !v)}
        disabled={approved}
        className="w-full h-10 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold
                   hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed
                   flex items-center justify-center gap-1.5"
      >
        <span className="material-symbols-outlined text-base">flag</span>
        {t('workspace.flagRegion')}
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-full left-0 right-0 mb-2 z-20 bg-white rounded-xl border border-slate-200 shadow-xl p-3"
        >
          <textarea
            rows={3}
            autoFocus
            placeholder={t('workspace.flagReasonPlaceholder')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full text-xs px-2 py-1.5 border border-slate-300 rounded-md focus:border-iku-red focus:outline-none"
          />
          <div className="mt-1 flex items-center">
            <span className={`text-[10px] ${reasonOk ? 'text-emerald-600 font-bold' : 'text-slate-400'}`}>
              {reason.trim().length}/10
            </span>
          </div>
          <div className="mt-2 flex items-center justify-end gap-1.5">
            <button
              onClick={() => { setOpen(false); setReason('') }}
              className="h-7 px-2.5 rounded-md bg-slate-100 text-slate-600 text-xs font-semibold hover:bg-slate-200"
            >
              {t('workspace.remapCancel')}
            </button>
            <button
              onClick={handleSubmit}
              disabled={!reasonOk || submitting}
              className="h-7 px-2.5 rounded-md bg-iku-red text-white text-xs font-semibold hover:bg-iku-red-dark disabled:opacity-40 flex items-center gap-1"
            >
              {submitting && (
                <span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              )}
              {t('workspace.flagSubmit')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Right column: OCR comparison + rubric + notes + slider ───────────
function DeepDivePanel({
  answer, approved, onScoreSubmit, onFlagSegmentation,
  totalPages, examMeta, studentNumber, pendingScore, setPendingScore,
}: {
  answer: AnswerDetail
  approved: boolean
  onScoreSubmit: (newScore: number, reason: string) => Promise<boolean>
  onFlagSegmentation: (reason: string) => Promise<boolean>
  totalPages: number
  examMeta: { course_code: string; course_name: string; exam_type: string; exam_date: string } | null
  studentNumber?: string
  pendingScore: number | undefined
  setPendingScore: (qn: number, value: number | null) => void
}) {
  const { t, lang } = useLang()
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setReason('')
  }, [answer.question_number])

  const score = pendingScore ?? answer.score
  const changed = score !== answer.score
  const reasonOk = reason.trim().length >= 10
  const canSubmit = changed && reasonOk && !submitting && !approved

  const handleApprove = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    const ok = await onScoreSubmit(score, reason.trim())
    setSubmitting(false)
    if (ok) setPendingScore(answer.question_number, null)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8.5rem)]">
      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-0.5">
        {/* Header card */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                {answer.question_type === 'mc' ? t('qtype.mc')
                  : answer.question_type === 'fill' ? t('qtype.fill') : t('qtype.open')}
              </p>
              <h2 className="text-base font-bold text-slate-900 mt-0.5">
                {t('workspace.questionReview', { n: answer.question_number })}
              </h2>
            </div>
            <ConfidenceStack
              segmentation={answer.segmentation_confidence ?? _fallbackSegConf(answer.question_number)}
              ocr={
                answer.question_type === 'mc'
                  ? (answer.bubble_fills?.[answer.student_answer ?? ''] ?? answer.confidence ?? null)
                  : (answer.ocr_confidence ?? null)
              }
              grading={answer.confidence ?? null}
            />
          </div>
        </div>

        {/* METİN ANALİZİ — OCR side-by-side */}
        <OCRComparison
          answer={answer}
          totalPages={totalPages}
          examMeta={examMeta}
          studentNumber={studentNumber}
        />

        {/* Potential-issue ribbon */}
        {answer.needs_review && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2">
            <span className="material-symbols-outlined text-amber-600">warning</span>
            <div className="text-xs text-amber-900 leading-relaxed">
              <span className="font-bold">{t('workspace.possibleError')}</span>
              {t('workspace.lowConfidenceNote')}
            </div>
          </div>
        )}

        {/* Rubric criteria (open + fill if present) */}
        {answer.rubric_breakdown && answer.rubric_breakdown.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-2">
              {t('workspace.rubricCriteria')}
            </h3>
            <ul className="space-y-2">
              {answer.rubric_breakdown.map((r, idx) => {
                const iconCls =
                  r.status === 'pass' ? 'bg-emerald-500 text-white' :
                  r.status === 'partial' ? 'bg-amber-500 text-white' :
                  'bg-slate-200 text-slate-500'
                const borderCls =
                  r.status === 'pass' ? 'border-emerald-200 bg-emerald-50/40' :
                  r.status === 'partial' ? 'border-amber-200 bg-amber-50/40' :
                  'border-slate-200 bg-white'
                return (
                  <li key={idx} className={`rounded-lg border ${borderCls} px-3 py-2 flex items-start gap-2.5`}>
                    <span className={`mt-0.5 w-4 h-4 rounded-[4px] flex items-center justify-center text-[11px] font-bold shrink-0 ${iconCls}`}>
                      {r.status === 'pass' ? '✓' : r.status === 'partial' ? '~' : ' '}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-900 leading-tight">{r.label}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        +{r.score} {t('workspace.points')} <span className="text-slate-400">({t('workspace.pointsFull', { n: r.max_score })})</span>
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {/* AI reasoning (open ended) */}
        {answer.ai_reasoning && (
          <div className="bg-indigo-50/60 rounded-xl border-l-4 border-indigo-400 p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 mb-1 flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">auto_awesome</span>
              {t('workspace.aiReasoning')}
            </p>
            <p className="text-xs text-indigo-900/90 leading-relaxed italic">"{answer.ai_reasoning}"</p>
          </div>
        )}

        {/* Instructor notes */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
            <span>{t('workspace.instructorNotes')}</span>
          </label>
          <textarea
            rows={3}
            placeholder={t('workspace.instructorNotesPlaceholder')}
            value={reason}
            disabled={approved}
            onChange={(e) => setReason(e.target.value)}
            className="mt-2 w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg
                       focus:border-iku-red focus:outline-none disabled:opacity-60 leading-relaxed"
          />
        </div>
      </div>

      {/* Sticky bottom action bar */}
      <div className="mt-3 bg-white rounded-xl border border-slate-200 p-4 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{t('workspace.finalScore')}</p>
          <p className="text-2xl font-black text-slate-900 font-jakarta tabular-nums">
            {score.toFixed(1)}
            <span className="text-sm font-semibold text-slate-400 ml-1">/ {answer.max_score}</span>
          </p>
        </div>
        <input
          type="range" min={0} max={answer.max_score} step={0.5}
          value={score} disabled={approved}
          onChange={(e) => setPendingScore(answer.question_number, parseFloat(e.target.value))}
          className="w-full accent-iku-red disabled:opacity-40"
        />
        {changed && !reasonOk && !approved && (
          <p className="mt-2 text-[11px] text-amber-700 font-semibold">
            {lang === 'tr'
              ? 'Puan değişikliği için ≥10 karakter bir gerekçe yazın.'
              : 'Write a ≥10-character reason to change the score.'}
          </p>
        )}
        <div className="mt-3 flex gap-2">
          <FlagRegionButton approved={approved} onFlag={onFlagSegmentation} />
          <button onClick={handleApprove} disabled={!canSubmit}
            className="flex-1 h-10 rounded-lg bg-iku-red text-white text-xs font-bold
                       hover:bg-iku-red-dark disabled:opacity-40 disabled:cursor-not-allowed
                       flex items-center justify-center gap-1.5 shadow-sm">
            <span className="material-symbols-outlined text-base">check_circle</span>
            {submitting ? t('workspace.savingEllipsis') : t('common.confirmScore')}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Side-by-side OCR comparison — THE key element. */
function OCRComparison({
  answer,
  totalPages,
  examMeta,
  studentNumber,
}: {
  answer: AnswerDetail
  totalPages: number
  examMeta: { course_code: string; course_name: string; exam_type: string; exam_date: string } | null
  studentNumber?: string
}) {
  const { t } = useLang()

  const ocrSide = useMemo(() => {
    if (answer.question_type === 'mc') {
      const fills = answer.bubble_fills ?? {}
      const darkest = Object.entries(fills).sort(([, a], [, b]) => b - a)[0]
      return darkest ? `${darkest[0]} (${Math.round(darkest[1] * 100)}%)` : '—'
    }
    if (answer.question_type === 'fill') {
      return Object.entries(answer.fill_blanks ?? {}).map(([k, v]) => `#${k}: ${v || '—'}`).join(' · ')
    }
    return (answer.handwritten_answer ?? '').slice(0, 200)
  }, [answer])

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-500">{t('workspace.textAnalysis')}</h3>
      </div>
      <div className="space-y-2">
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">
            {t('workspace.studentAnswer')}
          </p>
          <AnswerCutout
            answer={answer}
            totalPages={totalPages}
            courseCode={examMeta?.course_code}
            courseName={examMeta?.course_name}
            examType={examMeta?.exam_type}
            examDate={examMeta?.exam_date}
            studentNumber={studentNumber}
          />
        </div>
        <div className="rounded-lg bg-indigo-50/60 border border-indigo-100 p-3">
          <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wide mb-1">
            {t('workspace.ocrDetection')}
          </p>
          <p className={`leading-relaxed ${
            answer.question_type === 'mc'
              ? 'text-3xl font-black text-indigo-900 text-center font-mono'
              : 'text-xs text-indigo-900 font-mono break-words'
          }`}>
            {ocrSide}
          </p>
        </div>
      </div>
    </div>
  )
}

// ── History drawer ───────────────────────────────────────────────────
function HistoryDrawer({ loading, history, onClose }: {
  loading: boolean
  history: OverrideHistoryResponse | null
  onClose: () => void
}) {
  const { t, lang } = useLang()
  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative bg-white w-full max-w-md h-full shadow-2xl overflow-y-auto"
           onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between">
          <h3 className="font-bold text-slate-900">{t('history.title')}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-4 space-y-2">
          {loading ? <LoadingSpinner text={t('common.loading')} /> :
           !history || history.total === 0 ? (
            <div className="text-center py-10 text-sm text-slate-400">{t('history.empty')}</div>
          ) : history.history.map((h) => {
            const kind = h.kind ?? 'override'
            const chipLabel =
              kind === 'flag_segmentation' ? t('history.flagRegion') :
              t('history.override')
            const chipCls =
              kind === 'flag_segmentation' ? 'bg-amber-100 text-amber-700 border-amber-300' :
              'bg-slate-100 text-slate-700 border-slate-200'
            return (
              <div key={h.id} className="border border-slate-100 rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${chipCls}`}>
                    {chipLabel}
                  </span>
                  <span className="text-xs font-bold">
                    {h.question_number === 0 ? t('history.bulk') : `${t('workspace.question')} ${h.question_number}`}
                  </span>
                  <span className="ml-auto text-[10px] font-mono text-slate-500">
                    {new Date(h.overridden_at).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US')}
                  </span>
                </div>
                <div className="text-xs">
                  <span className="text-slate-500 line-through">{h.previous_score}</span>
                  <span className="mx-1">→</span>
                  <span className="font-bold">{h.new_score}</span>
                </div>
                <p className="text-xs text-slate-600 italic">"{h.reason}"</p>
                {h.overridden_by_email && (
                  <p className="text-[10px] text-slate-400">— {h.overridden_by_email}</p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────
export default function StudentDetailV4() {
  const { jobId, studentId } = useParams<{ jobId: string; studentId: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const { t } = useLang()

  const [result, setResult] = useState<StudentResult | null>(null)
  const [allIds, setAllIds] = useState<string[]>([])
  const [activeQn, setActiveQn] = useState<number | null>(null)
  const [activePage, setActivePage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [examMeta, setExamMeta] = useState<{
    course_code: string
    course_name: string
    exam_type: string
    exam_date: string
    answer_key_name?: string
    template_match_confidence?: number
  } | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState<OverrideHistoryResponse | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [pendingScores, setPendingScores] = useState<Record<number, number>>({})

  const setPendingScore = useCallback((qn: number, value: number | null) => {
    setPendingScores((prev) => {
      const next = { ...prev }
      if (value === null) delete next[qn]
      else next[qn] = value
      return next
    })
  }, [])

  const reloadResult = useCallback(async () => {
    if (!jobId || !studentId) return
    const res = await api.get<StudentResult>(`/results/${jobId}/student/${studentId}`)
    setResult(res.data)
  }, [jobId, studentId])

  useEffect(() => {
    if (!jobId || !studentId) return
    let cancelled = false
    setLoading(true)
    Promise.all([
      api.get<StudentResult>(`/results/${jobId}/student/${studentId}`),
      api.get<{ results: StudentResult[] }>(`/results/${jobId}`),
      api.get<{
        exam_title: string
        course: string
        answer_key_name?: string
        template_match_confidence?: number
      }>(`/results/${jobId}/report`).catch(() => null),
    ])
      .then(([res, listRes, reportRes]) => {
        if (cancelled) return
        setResult(res.data)
        setAllIds(listRes.data.results.map((r) => r.student_id))

        const examTitle = reportRes?.data?.exam_title ?? ''
        if (reportRes?.data) {
          const codeMatch = examTitle.match(/^([A-Z]{2,5}\d{2,4})/)
          const typeMatch = examTitle.match(/(Final|Vize|Midterm|B[uü]t[uü]nleme)/i)
          setExamMeta({
            course_code: codeMatch?.[1] ?? 'EXAM',
            course_name: reportRes.data.course ?? '',
            exam_type: typeMatch?.[0] ?? 'Final',
            exam_date: new Date().toISOString().split('T')[0],
            answer_key_name: reportRes.data.answer_key_name,
            template_match_confidence: reportRes.data.template_match_confidence,
          })
        }
        saveLastReviewed({
          jobId: jobId!, studentId: studentId!,
          examTitle: examTitle || 'Değerlendirme',
          studentName: res.data.student_name,
          ts: new Date().toISOString(),
        })

        const first = res.data.answers.find((a) => a.needs_review) ?? res.data.answers[0]
        if (first) {
          setActiveQn(first.question_number)
          setActivePage(first.bbox?.page ?? 1)
        }
      })
      .catch(() => setError(t('toast.scoreUpdateFailed')))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [jobId, studentId])

  const activeAnswer = useMemo(
    () => result?.answers.find((a) => a.question_number === activeQn) ?? null,
    [result, activeQn],
  )

  const pages = useMemo(
    () => Array.from(new Set((result?.answers ?? []).map((a) => a.bbox?.page ?? 1))).sort((a, b) => a - b),
    [result],
  )
  const totalPages = Math.max(1, pages.length)

  const selectQuestion = useCallback((qn: number) => {
    if (!result) return
    const a = result.answers.find((x) => x.question_number === qn)
    if (!a) return
    setActiveQn(qn)
    if (a.bbox?.page) setActivePage(a.bbox.page)
  }, [result])

  const currentStudentIdx = result ? allIds.indexOf(result.student_id) : -1
  const prevStudentId = currentStudentIdx > 0 ? allIds[currentStudentIdx - 1] : null
  const nextStudentId = currentStudentIdx >= 0 && currentStudentIdx < allIds.length - 1
    ? allIds[currentStudentIdx + 1] : null

  const overrideScore = useCallback(async (qn: number, newScore: number, reason: string) => {
    if (!jobId || !studentId) return false
    try {
      await api.post(`/results/${jobId}/student/${studentId}/override`, {
        question_number: qn, new_score: newScore, reason,
      })
      toast.success(t('toast.scoreUpdated'))
      await reloadResult()
      return true
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : t('toast.scoreUpdateFailed'))
      return false
    }
  }, [jobId, studentId, reloadResult, toast, t])

  /** Batch-save every pending score change with a shared reason. */
  const saveAllPending = useCallback(async (reason: string): Promise<boolean> => {
    if (!jobId || !studentId) return false
    const entries = Object.entries(pendingScores)
    if (entries.length === 0) return true
    try {
      await Promise.all(
        entries.map(([qnStr, newScore]) =>
          api.post(`/results/${jobId}/student/${studentId}/override`, {
            question_number: Number(qnStr),
            new_score: newScore,
            reason,
          }),
        ),
      )
      toast.success(t('toast.scoreUpdated'))
      setPendingScores({})
      await reloadResult()
      return true
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : t('toast.scoreUpdateFailed'))
      return false
    }
  }, [jobId, studentId, pendingScores, reloadResult, toast, t])

  const handleFlagSegmentation = useCallback(async (qn: number, reason: string) => {
    if (!jobId || !studentId) return false
    try {
      await api.post(`/results/${jobId}/student/${studentId}/flag-segmentation`, {
        question_number: qn, reason,
      })
      toast.success(t('toast.flagged'))
      await reloadResult()
      setHistory(null)
      return true
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : t('toast.flagFailed'))
      return false
    }
  }, [jobId, studentId, reloadResult, toast, t])

  const handleApprove = useCallback(async () => {
    if (!jobId || !studentId) return
    try {
      const res = await api.post<ApprovalResponse>(`/results/${jobId}/student/${studentId}/approve`)
      toast.success(t('toast.approved'))
      if (result) setResult({
        ...result,
        approved_at: res.data.approved_at,
        approved_by: res.data.approved_by,
        approved_by_email: res.data.approved_by_email,
      })
    } catch { toast.error(t('toast.approveFailed')) }
  }, [jobId, studentId, result, toast, t])

  const handleReopen = useCallback(async () => {
    if (!jobId || !studentId) return
    try {
      await api.post(`/results/${jobId}/student/${studentId}/reopen`)
      toast.success(t('toast.reopened'))
      await reloadResult()
    } catch { toast.error(t('toast.reopenFailed')) }
  }, [jobId, studentId, reloadResult, toast, t])

  const loadHistory = useCallback(async () => {
    if (!jobId || !studentId) return
    setHistoryLoading(true)
    try {
      const res = await api.get<OverrideHistoryResponse>(`/results/${jobId}/student/${studentId}/history`)
      setHistory(res.data)
    } finally {
      setHistoryLoading(false)
    }
  }, [jobId, studentId])

  const toggleHistory = useCallback(() => {
    setHistoryOpen((v) => {
      const next = !v
      if (next && !history) void loadHistory()
      return next
    })
  }, [history, loadHistory])

  if (loading) {
    return (
      <>
        <div className="p-10 text-center"><LoadingSpinner text={t('common.loading')} /></div>
      </>
    )
  }
  if (error || !result) {
    return (
      <>
        <div className="p-10 text-center">
          <p className="text-red-600">{error || '—'}</p>
          <button onClick={() => navigate(`/results/${jobId}`)} className="mt-4 text-primary-600 font-semibold">
            ← {t('common.back')}
          </button>
        </div>
      </>
    )
  }

  const isApproved = !!result.approved_at
  const questionsOnPage = result.answers.filter((a) => (a.bbox?.page ?? 1) === activePage) as AnswerDetail[]

  const liveScore = result.answers.reduce(
    (sum, a) => sum + (pendingScores[a.question_number] ?? a.score),
    0,
  )
  const liveMax = result.answers.reduce((sum, a) => sum + a.max_score, 0)
  const savedTotal = (result.mc_score ?? 0) + (result.open_score ?? 0)
  const hasPendingChanges = Math.abs(liveScore - savedTotal) > 0.01

  return (
    <>
      <SubStrip
        result={result} examMeta={examMeta}
        activePage={activePage} onPageChange={setActivePage} totalPages={totalPages}
        prevStudentId={prevStudentId} nextStudentId={nextStudentId}
        currentIdx={currentStudentIdx} totalStudents={allIds.length}
        jobId={jobId!} onApprove={handleApprove} onReopen={handleReopen}
        onToggleHistory={toggleHistory} historyOpen={historyOpen}
      />

      <div className="mx-auto max-w-[1600px] px-5 py-4">
        <div className="grid grid-cols-12 gap-4">
          {/* LEFT — scan */}
          <section className="col-span-12 lg:col-span-5 bg-white rounded-xl border border-slate-200 p-3 overflow-hidden">
            <div className="h-[calc(100vh-9.5rem)] overflow-y-auto flex justify-center">
              <div className="w-full max-w-xl">
                <ExamShapedScan
                  answers={questionsOnPage}
                  activeQNum={activeAnswer?.question_number ?? null}
                  onSelectQuestion={selectQuestion}
                  pageIndex={activePage}
                  totalPages={totalPages}
                  courseCode={examMeta?.course_code ?? 'EXAM'}
                  courseName={examMeta?.course_name ?? ''}
                  examType={examMeta?.exam_type ?? 'Final'}
                  examDate={examMeta?.exam_date}
                  studentNumber={result.student_id}
                  studentName={result.student_name}
                />
              </div>
            </div>
          </section>

          {/* MIDDLE — question list with editable points */}
          <section className="col-span-12 lg:col-span-3">
            <QuestionListWithEditablePoints
              answers={result.answers}
              activeQn={activeQn}
              onSelect={selectQuestion}
              onPointsChange={overrideScore}
              approved={isApproved}
              pendingScores={pendingScores}
              totalScore={liveScore}
              totalMaxPoints={liveMax}
              grade={result.grade}
              hasPendingChanges={hasPendingChanges}
              onSaveAllPending={saveAllPending}
            />
          </section>

          {/* RIGHT — deep-dive panel */}
          <section className="col-span-12 lg:col-span-4">
            {activeAnswer ? (
              <DeepDivePanel
                answer={activeAnswer}
                approved={isApproved}
                onScoreSubmit={(newScore, reason) =>
                  overrideScore(activeAnswer.question_number, newScore, reason)
                }
                onFlagSegmentation={(reason) =>
                  handleFlagSegmentation(activeAnswer.question_number, reason)
                }
                totalPages={totalPages}
                examMeta={examMeta}
                studentNumber={result.student_id}
                pendingScore={pendingScores[activeAnswer.question_number]}
                setPendingScore={setPendingScore}
              />
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-500">
                {t('workspace.selectQuestion')}
              </div>
            )}
          </section>
        </div>
      </div>

      {historyOpen && (
        <HistoryDrawer loading={historyLoading} history={history} onClose={() => setHistoryOpen(false)} />
      )}
    </>
  )
}
