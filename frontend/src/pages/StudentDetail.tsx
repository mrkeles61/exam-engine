/**
 * Teacher Review Workspace
 *
 * Single-screen review for one student's exam result. Four panels:
 *   A. Scan viewer (left)         — shows the student's answer sheet page with
 *                                    a bbox overlay for the currently active question.
 *   B. Question list (middle)     — every question with status chip:
 *                                    ✓ correct / ⚠ needs review / ✱ overridden / 🔒 approved-locked.
 *   C. Question detail (right)    — MC: selected vs correct + bubble fills.
 *                                    Open: student answer, rubric breakdown, AI reasoning.
 *   D. Override form (right bottom) — score input + required reason (≥10 chars) + apply.
 *
 * Keyboard shortcuts:
 *   j / ↓   next question
 *   k / ↑   previous question
 *   o       focus override reason
 *   Enter   (in override form) apply
 *   a       approve student (with confirm)
 *   h       toggle history drawer
 *   Shift+J next student    Shift+K previous student
 *
 * Multi-teacher hooks baked in:
 *   - override_history rows are stamped with current_user (backend).
 *   - approved_at / approved_by_email shown in header.
 *   - once approved, overrides return 409 unless the teacher clicks "Reopen".
 */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import type {
  AnswerDetail,
  StudentResult,
  OverrideHistoryResponse,
  ApprovalResponse,
} from '../types';
import { GradeBadge } from '../components/StatusBadge';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { handwritingStyle } from '../utils/handwriting';
import OCROutputCard from '../components/results/OCROutputCard';
import { saveLastReviewed } from '../utils/continueResume';

type LayoutMode = 'classic' | 'tabs' | 'split' | 'v4';

const LAYOUT_ORDER: LayoutMode[] = ['classic', 'tabs', 'split', 'v4'];
const LAYOUT_LABEL_KEYS: Record<LayoutMode, 'sd.layoutClassic' | 'sd.layoutTabs' | 'sd.layoutSplit' | 'sd.layoutV4'> = {
  classic: 'sd.layoutClassic',
  tabs: 'sd.layoutTabs',
  split: 'sd.layoutSplit',
  v4: 'sd.layoutV4',
};
import { Breadcrumbs } from '../components/Breadcrumbs';
import { ConfirmModal } from '../components/ConfirmModal';
import { useToast } from '../contexts/ToastContext';
import { useLang } from '../i18n';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const PROGRESS_COLOR = (pct: number) =>
  pct >= 70 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400';

const STATUS_COLOR = (status: 'pass' | 'partial' | 'fail') =>
  status === 'pass' ? 'text-emerald-600'
    : status === 'partial' ? 'text-amber-600'
    : 'text-red-600';

const STATUS_ICON = (status: 'pass' | 'partial' | 'fail') =>
  status === 'pass' ? 'check_circle' : status === 'partial' ? 'info' : 'cancel';

const formatTime = (iso: string) => {
  try {
    const d = new Date(iso);
    return d.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function ReviewWorkspace() {
  const { jobId, studentId, layout: layoutParam } = useParams<{ jobId: string; studentId: string; layout?: string }>();
  const layout: LayoutMode =
    layoutParam === 'tabs' ? 'tabs' :
    layoutParam === 'split' ? 'split' :
    'classic';
  const navigate = useNavigate();
  const toast = useToast();
  const { t } = useLang();

  const [result, setResult] = useState<StudentResult | null>(null);
  const [allIds, setAllIds] = useState<string[]>([]);
  const [activeQn, setActiveQn] = useState<number | null>(null);
  const [activePage, setActivePage] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [examMeta, setExamMeta] = useState<{
    course_code: string;
    course_name: string;
    exam_type: string;
    exam_date: string;
  } | null>(null);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<OverrideHistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [approveConfirm, setApproveConfirm] = useState<{ riskyCount: number } | null>(null);

  const reasonRef = useRef<HTMLTextAreaElement | null>(null);

  // ── Load result + sibling IDs ─────────────────────────────────────────
  useEffect(() => {
    if (!jobId || !studentId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.get<StudentResult>(`/results/${jobId}/student/${studentId}`),
      api.get<{ results: StudentResult[] }>(`/results/${jobId}`),
      api.get<{ exam_title: string; course: string }>(`/results/${jobId}/report`).catch(() => null),
    ])
      .then(([res, listRes, reportRes]) => {
        if (cancelled) return;
        setResult(res.data);
        setAllIds(listRes.data.results.map((r) => r.student_id));

        // Derive exam meta from the report (for ExamShapedScan header)
        const examTitle = reportRes?.data?.exam_title ?? '';
        if (reportRes?.data) {
          const title = examTitle;
          const codeMatch = title.match(/^([A-Z]{2,5}\d{2,4})/);
          const typeMatch = title.match(/(Final|Vize|Midterm|B[uü]t[uü]nleme)/i);
          setExamMeta({
            course_code: codeMatch?.[1] ?? 'EXAM',
            course_name: reportRes.data.course ?? '',
            exam_type: (typeMatch?.[0] ?? 'Final'),
            exam_date: new Date().toISOString().split('T')[0],
          });
        }

        // Remember this student for "Continue where you left off"
        saveLastReviewed({
          jobId: jobId!,
          studentId: studentId!,
          examTitle: examTitle || 'Değerlendirme',
          studentName: res.data.student_name,
          ts: new Date().toISOString(),
        });

        // Auto-select first question needing review, else first question
        const first = res.data.answers.find((a) => a.needs_review) ?? res.data.answers[0];
        if (first) {
          setActiveQn(first.question_number);
          setActivePage(first.bbox?.page ?? 1);
        }
      })
      .catch(() => setError(t('sd.loadFailed')))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [jobId, studentId]);

  // ── Prev/next student navigation ──────────────────────────────────────
  const currentStudentIdx = result ? allIds.indexOf(result.student_id) : -1;
  const prevStudentId = currentStudentIdx > 0 ? allIds[currentStudentIdx - 1] : null;
  const nextStudentId = currentStudentIdx >= 0 && currentStudentIdx < allIds.length - 1
    ? allIds[currentStudentIdx + 1] : null;

  const goToStudent = useCallback((sid: string | null) => {
    if (sid) navigate(`/results/${jobId}/student/${sid}`);
  }, [navigate, jobId]);

  // ── Active question & sibling navigation ──────────────────────────────
  const activeAnswer = useMemo(
    () => result?.answers.find((a) => a.question_number === activeQn) ?? null,
    [result, activeQn],
  );

  const selectQuestion = useCallback((qn: number) => {
    if (!result) return;
    const a = result.answers.find((x) => x.question_number === qn);
    if (!a) return;
    setActiveQn(qn);
    if (a.bbox?.page) setActivePage(a.bbox.page);
  }, [result]);

  const stepQuestion = useCallback((delta: 1 | -1) => {
    if (!result || activeQn == null) return;
    const sorted = [...result.answers].sort((a, b) => a.question_number - b.question_number);
    const idx = sorted.findIndex((a) => a.question_number === activeQn);
    const next = sorted[idx + delta];
    if (next) selectQuestion(next.question_number);
  }, [result, activeQn, selectQuestion]);

  // ── Reload result (after override / approve / reopen) ─────────────────
  const reloadResult = useCallback(async () => {
    if (!jobId || !studentId) return;
    const res = await api.get<StudentResult>(`/results/${jobId}/student/${studentId}`);
    setResult(res.data);
    // Refresh history if the drawer is open
    if (historyOpen) await loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, studentId, historyOpen]);

  const loadHistory = useCallback(async () => {
    if (!jobId || !studentId) return;
    setHistoryLoading(true);
    try {
      const res = await api.get<OverrideHistoryResponse>(
        `/results/${jobId}/student/${studentId}/history`,
      );
      setHistory(res.data);
    } finally {
      setHistoryLoading(false);
    }
  }, [jobId, studentId]);

  const toggleHistory = useCallback(() => {
    setHistoryOpen((v) => {
      const next = !v;
      if (next && !history) void loadHistory();
      return next;
    });
  }, [history, loadHistory]);

  // ── Approve / Reopen ──────────────────────────────────────────────────
  const isApproved = !!result?.approved_at;

  const performApprove = useCallback(async () => {
    if (!jobId || !studentId) return;
    try {
      const res = await api.post<ApprovalResponse>(
        `/results/${jobId}/student/${studentId}/approve`,
      );
      toast.success(t('toast.approved'));
      if (result) {
        setResult({
          ...result,
          approved_at: res.data.approved_at,
          approved_by: res.data.approved_by,
          approved_by_email: res.data.approved_by_email,
        });
      }
    } catch {
      toast.error(t('toast.approveFailed'));
    }
  }, [jobId, studentId, result, toast, t]);

  const handleApprove = useCallback(() => {
    const risky = (result?.answers ?? []).filter((a) => a.needs_review && !a.override_applied);
    if (risky.length > 0) {
      setApproveConfirm({ riskyCount: risky.length });
      return;
    }
    void performApprove();
  }, [result, performApprove]);

  const handleReopen = async () => {
    if (!jobId || !studentId) return;
    try {
      await api.post(`/results/${jobId}/student/${studentId}/reopen`);
      toast.success(t('toast.reopened'));
      await reloadResult();
    } catch {
      toast.error(t('toast.reopenFailed'));
    }
  };

  // ── Keyboard shortcuts ────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore when typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      if (e.shiftKey && (e.key === 'J' || e.key === 'j')) { goToStudent(nextStudentId); e.preventDefault(); return; }
      if (e.shiftKey && (e.key === 'K' || e.key === 'k')) { goToStudent(prevStudentId); e.preventDefault(); return; }
      switch (e.key) {
        case 'j': case 'ArrowDown': stepQuestion(1); e.preventDefault(); break;
        case 'k': case 'ArrowUp':   stepQuestion(-1); e.preventDefault(); break;
        case 'o': reasonRef.current?.focus(); e.preventDefault(); break;
        case 'a':
          if (isApproved) void handleReopen();
          else void handleApprove();
          e.preventDefault();
          break;
        case 'h': toggleHistory(); e.preventDefault(); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepQuestion, goToStudent, nextStudentId, prevStudentId, isApproved, toggleHistory]);

  // ── Loading / error ──────────────────────────────────────────────────
  if (loading) return <LoadingSpinner text={t('common.loading')} fullPage />;

  if (error || !result) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate(`/results/${jobId}`)} className="btn-secondary">
          ← {t('sd.backToResults')}
        </button>
        <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
          <span className="text-red-500">⚠</span>
          <p className="text-sm text-red-700">{error || t('sd.studentNotFound')}</p>
        </div>
      </div>
    );
  }

  // Compute pages present (from bboxes)
  const pages = Array.from(
    new Set(result.answers.map((a) => a.bbox?.page).filter((p): p is number => !!p)),
  ).sort((a, b) => a - b);
  const totalPages = Math.max(1, pages.length);
  const currentPageIdx = Math.max(0, pages.indexOf(activePage));

  const questionsOnPage = result.answers.filter((a) => (a.bbox?.page ?? 1) === activePage);

  // ── Main layout ──────────────────────────────────────────────────────
  return (
    <div className="space-y-4 animate-fade-up">
      <Breadcrumbs
        items={[
          { label: t('nav.dashboard'), to: '/' },
          { label: t('nav.evaluations'), to: '/jobs' },
          { label: t('sd.results'), to: `/results/${jobId}` },
          { label: result.student_name },
        ]}
      />

      {/* ── Header bar ─────────────────────────────────────────────── */}
      <HeaderBar
        result={result}
        currentIdx={currentStudentIdx}
        totalStudents={allIds.length}
        prevStudentId={prevStudentId}
        nextStudentId={nextStudentId}
        onPrev={() => goToStudent(prevStudentId)}
        onNext={() => goToStudent(nextStudentId)}
        onApprove={handleApprove}
        onReopen={handleReopen}
        onToggleHistory={toggleHistory}
        historyOpen={historyOpen}
      />

      {/* ── Main grid — 3 layout modes ─────────────────────────────── */}
      {layout === 'tabs' ? (
        <div className="grid grid-cols-12 gap-4 items-start">
          <section className="col-span-12 lg:col-span-5 card overflow-hidden">
            <ScanViewer activePage={activePage} onPageChange={setActivePage}
              currentPageIdx={currentPageIdx} totalPages={totalPages}
              questionsOnPage={questionsOnPage} activeAnswer={activeAnswer}
              onSelectQuestion={selectQuestion} examMeta={examMeta}
              studentNumber={result.student_id} />
          </section>
          <section className="col-span-12 lg:col-span-2 card">
            <QuestionList answers={result.answers} activeQn={activeQn}
              onSelect={selectQuestion} result={result} />
          </section>
          <section className="col-span-12 lg:col-span-5">
            {activeAnswer ? (
              <TabbedDetailPanel
                answer={activeAnswer}
                approved={isApproved}
                onRemapped={reloadResult}
                reasonRef={reasonRef}
                onApplied={reloadResult}
                jobId={jobId!}
                studentId={studentId!}
              />
            ) : (
              <div className="card p-6 text-center text-sm text-gray-500">
                {t('workspace.selectQuestion')}
              </div>
            )}
          </section>
        </div>
      ) : layout === 'split' ? (
        <div className="space-y-4">
          {/* Row 1: Scan | Answer comparison */}
          <div className="grid grid-cols-12 gap-4 items-start">
            <section className="col-span-12 lg:col-span-7 card overflow-hidden">
              <ScanViewer activePage={activePage} onPageChange={setActivePage}
                currentPageIdx={currentPageIdx} totalPages={totalPages}
                questionsOnPage={questionsOnPage} activeAnswer={activeAnswer}
                onSelectQuestion={selectQuestion} examMeta={examMeta}
                studentNumber={result.student_id} />
            </section>
            <section className="col-span-12 lg:col-span-5">
              {activeAnswer ? (
                <QuestionDetail answer={activeAnswer} approved={isApproved}
                  onRemapped={reloadResult} jobId={jobId!} studentId={studentId!} />
              ) : null}
            </section>
          </div>
          {/* Row 2: OCR output | Override + question-chip strip */}
          <div className="grid grid-cols-12 gap-4 items-start">
            <section className="col-span-12 lg:col-span-7 space-y-4">
              {activeAnswer && <OCROutputCard answer={activeAnswer} />}
              <div className="card p-3">
                <p className="label-xs text-gray-500 mb-2">{t('sd.questionStrip')}</p>
                <QuestionChipStrip answers={result.answers} activeQn={activeQn}
                  onSelect={selectQuestion} />
              </div>
            </section>
            <section className="col-span-12 lg:col-span-5">
              {activeAnswer && (
                <OverrideForm
                  key={`${activeAnswer.question_number}-${activeAnswer.score}`}
                  answer={activeAnswer} approved={isApproved}
                  reasonRef={reasonRef} onApplied={reloadResult}
                  jobId={jobId!} studentId={studentId!}
                />
              )}
            </section>
          </div>
        </div>
      ) : (
        /* Classic layout (default) — refined with OCR card + more breathing room */
        <div className="grid grid-cols-12 gap-4 items-start">
          <section className="col-span-12 lg:col-span-5 card overflow-hidden">
            <ScanViewer activePage={activePage} onPageChange={setActivePage}
              currentPageIdx={currentPageIdx} totalPages={totalPages}
              questionsOnPage={questionsOnPage} activeAnswer={activeAnswer}
              onSelectQuestion={selectQuestion} examMeta={examMeta}
              studentNumber={result.student_id} />
          </section>
          <section className="col-span-12 lg:col-span-3 card">
            <QuestionList answers={result.answers} activeQn={activeQn}
              onSelect={selectQuestion} result={result} />
          </section>
          <section className="col-span-12 lg:col-span-4 space-y-4">
            {activeAnswer ? (
              <>
                <QuestionDetail
                  answer={activeAnswer}
                  approved={isApproved}
                  onRemapped={reloadResult}
                  jobId={jobId!}
                  studentId={studentId!}
                />
                <OCROutputCard answer={activeAnswer} compact />
                <OverrideForm
                  key={`${activeAnswer.question_number}-${activeAnswer.score}`}
                  answer={activeAnswer}
                  approved={isApproved}
                  reasonRef={reasonRef}
                  onApplied={reloadResult}
                  jobId={jobId!}
                  studentId={studentId!}
                />
              </>
            ) : (
              <div className="card p-6 text-center text-sm text-gray-500">
                {t('workspace.selectQuestion')}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ── History drawer ────────────────────────────────────────── */}
      {historyOpen && (
        <HistoryDrawer
          loading={historyLoading}
          history={history}
          onClose={() => setHistoryOpen(false)}
        />
      )}

      {/* ── Approve confirmation modal ────────────────────────────── */}
      <ConfirmModal
        open={approveConfirm !== null}
        variant="warning"
        title={t('sd.approveConfirmTitle')}
        message={
          <>
            <strong className="text-gray-900">{approveConfirm?.riskyCount ?? 0}</strong>{' '}
            {t('sd.approveConfirmBody')}
          </>
        }
        details={[
          t('sd.approveDetail1'),
          t('sd.approveDetail2'),
          t('sd.approveDetail3'),
        ]}
        confirmLabel={t('sd.approveAnyway')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => { setApproveConfirm(null); void performApprove(); }}
        onCancel={() => setApproveConfirm(null)}
      />

      {/* ── Keyboard shortcut hint ────────────────────────────────── */}
      <KeyboardHint />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout switcher — pill with 3 workspace layout modes
// ---------------------------------------------------------------------------
function LayoutSwitcher() {
  const { jobId, studentId, layout } = useParams<{ jobId: string; studentId: string; layout?: string }>();
  const navigate = useNavigate();
  const { t } = useLang();
  const current: LayoutMode =
    layout === 'tabs' ? 'tabs' :
    layout === 'split' ? 'split' :
    'classic';
  const go = (next: LayoutMode) => {
    const base = `/results/${jobId}/student/${studentId}`;
    navigate(next === 'classic' ? base : `${base}/${next}`);
  };
  return (
    <div className="inline-flex rounded-lg bg-gray-100 p-0.5" role="tablist" title={t('sd.layoutSwitcherTitle')}>
      {LAYOUT_ORDER.map((mode) => (
        <button
          key={mode}
          onClick={() => go(mode)}
          className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors ${
            current === mode
              ? 'bg-white text-primary-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          {t(LAYOUT_LABEL_KEYS[mode])}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header bar
// ---------------------------------------------------------------------------
function HeaderBar({
  result, currentIdx, totalStudents, prevStudentId, nextStudentId,
  onPrev, onNext, onApprove, onReopen, onToggleHistory, historyOpen,
}: {
  result: StudentResult;
  currentIdx: number;
  totalStudents: number;
  prevStudentId: string | null;
  nextStudentId: string | null;
  onPrev: () => void;
  onNext: () => void;
  onApprove: () => void;
  onReopen: () => void;
  onToggleHistory: () => void;
  historyOpen: boolean;
}) {
  const { t } = useLang();
  const progressPct = totalStudents > 0
    ? Math.round(((currentIdx + 1) / totalStudents) * 100)
    : 0;
  const totalPct = result.total_pct;
  const isApproved = !!result.approved_at;

  return (
    <div className="card p-4 lg:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        {/* Left: identity + score */}
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center
                          justify-center shrink-0">
            <span className="text-primary-700 font-bold text-xl font-jakarta">
              {result.student_name.charAt(0)}
            </span>
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-gray-900 font-jakarta truncate">
              {result.student_name}
            </h1>
            <p className="text-xs text-gray-500 font-mono">{result.student_id}</p>
          </div>
          <div className="hidden md:flex items-center gap-3 pl-4 ml-2 border-l border-gray-100">
            <div>
              <p className="label-xs text-gray-400">{t('sd.total')}</p>
              <p className="text-xl font-bold text-gray-900 font-jakarta">
                {totalPct.toFixed(1)}%
              </p>
            </div>
            <GradeBadge grade={result.grade} />
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {isApproved ? (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border
                            border-emerald-200 rounded-lg">
              <span className="material-symbols-outlined text-emerald-600 text-lg">
                verified
              </span>
              <div className="text-xs leading-tight">
                <p className="font-semibold text-emerald-700">{t('sd.approvedBadge')}</p>
                <p className="text-emerald-600/80 text-[10px]">
                  {result.approved_by_email ?? '—'}
                  {result.approved_at && ` · ${formatTime(result.approved_at)}`}
                </p>
              </div>
            </div>
          ) : null}

          <LayoutSwitcher />

          <button
            onClick={onToggleHistory}
            className={`btn-secondary btn-sm ${historyOpen ? 'bg-primary-50 text-primary-700' : ''}`}
            title={t('sd.historyTitle')}
          >
            <span className="material-symbols-outlined text-base">history</span>
            {t('common.history')}
          </button>

          {isApproved ? (
            <button onClick={onReopen} className="btn-secondary btn-sm" title={t('sd.reopenTitle')}>
              <span className="material-symbols-outlined text-base">lock_open</span>
              {t('common.reopen')}
            </button>
          ) : (
            <button onClick={onApprove} className="btn-primary btn-sm" title={t('sd.approveTitle')}>
              <span className="material-symbols-outlined text-base">check_circle</span>
              {t('common.approve')}
            </button>
          )}

          <div className="flex items-center gap-1 pl-2 ml-1 border-l border-gray-100">
            <button
              onClick={onPrev}
              disabled={!prevStudentId}
              className="btn-secondary btn-sm disabled:opacity-30"
              title={t('sd.prevStudentTitle')}
            >
              ←
            </button>
            <span className="text-xs text-gray-500 tabular-nums px-1 w-12 text-center">
              {currentIdx + 1} / {totalStudents}
            </span>
            <button
              onClick={onNext}
              disabled={!nextStudentId}
              className="btn-secondary btn-sm disabled:opacity-30"
              title={t('sd.nextStudentTitle')}
            >
              →
            </button>
          </div>
        </div>
      </div>

      {/* Progress bar: student review progress */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="label-xs text-gray-400">
            {t('sd.studentProgress', { current: currentIdx + 1, total: totalStudents })}
          </span>
          <span className="text-[10px] font-bold text-gray-500">{progressPct}%</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-primary-600 transition-all duration-500"
               style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {/* Score breakdown row */}
      <div className="grid grid-cols-4 gap-3 mt-4 pt-4 border-t border-gray-100">
        <Stat label={t('sd.statMcScore')} value={`${result.mc_score}/${result.mc_total}`}
              pct={result.mc_total > 0 ? (result.mc_score / result.mc_total) * 100 : null} />
        <Stat label={t('sd.statOpenScore')} value={`${result.open_score.toFixed(1)}/${result.open_total}`}
              pct={result.open_total > 0 ? (result.open_score / result.open_total) * 100 : null} />
        <Stat label={t('sd.statTotalPct')} value={`${totalPct.toFixed(1)}%`} pct={totalPct} />
        <Stat label={t('sd.statReview')}
              value={result.answers.filter((a) => a.needs_review).length.toString()}
              accent={result.answers.some((a) => a.needs_review) ? 'warn' : 'ok'} />
      </div>
    </div>
  );
}

function Stat({ label, value, pct, accent }: {
  label: string;
  value: string;
  pct?: number | null;
  accent?: 'warn' | 'ok';
}) {
  return (
    <div>
      <p className="label-xs text-gray-400">{label}</p>
      <p className={`text-base font-bold font-jakarta mt-0.5 ${
        accent === 'warn' ? 'text-amber-600' : 'text-gray-900'
      }`}>{value}</p>
      {pct != null && (
        <div className="mt-1 h-1 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${PROGRESS_COLOR(pct)}`}
               style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel A — Scan Viewer (mock page with bbox overlays)
// ---------------------------------------------------------------------------
function ScanViewer({
  activePage, onPageChange, currentPageIdx, totalPages,
  questionsOnPage, activeAnswer, onSelectQuestion,
  examMeta, studentNumber,
}: {
  activePage: number;
  onPageChange: (p: number) => void;
  currentPageIdx: number;
  totalPages: number;
  questionsOnPage: AnswerDetail[];
  activeAnswer: AnswerDetail | null;
  onSelectQuestion: (qn: number) => void;
  examMeta: {
    course_code: string;
    course_name: string;
    exam_type: string;
    exam_date: string;
  } | null;
  studentNumber?: string;
}) {
  const { t } = useLang();
  const goPrev = () => onPageChange(activePage - 1);
  const goNext = () => onPageChange(activePage + 1);
  const disablePrev = currentPageIdx <= 0;
  const disableNext = currentPageIdx >= totalPages - 1;

  // Average OCR confidence on this page (across questions)
  const avgConf = questionsOnPage.length
    ? questionsOnPage.reduce((s, a) => s + (a.ocr_confidence ?? 0), 0) / questionsOnPage.length
    : 0;
  const avgConfPct = Math.round(avgConf * 100);

  return (
    <div className="flex flex-col h-[calc(100vh-14rem)] min-h-[480px]">
      {/* Toolbar */}
      <div className="px-4 h-10 flex items-center justify-between bg-white border-b
                      border-outline-variant/10 shrink-0">
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-600">
          <span className="material-symbols-outlined text-base">description</span>
          {t('sd.studentPaper')}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={goPrev} disabled={disablePrev}
                  className="p-1 hover:bg-gray-100 rounded disabled:opacity-30">
            <span className="material-symbols-outlined text-base">chevron_left</span>
          </button>
          <span className="text-xs font-semibold tabular-nums">
            {t('workspace.page')} {activePage}
            <span className="text-gray-400 font-normal"> / {totalPages}</span>
          </span>
          <button onClick={goNext} disabled={disableNext}
                  className="p-1 hover:bg-gray-100 rounded disabled:opacity-30">
            <span className="material-symbols-outlined text-base">chevron_right</span>
          </button>
        </div>
      </div>

      {/* Page canvas — lightweight placeholder (the visual scan viewer is
          supplied by an optional module that isn't part of this build). */}
      <div className="flex-1 overflow-auto bg-slate-200/40 p-4 flex items-center justify-center">
        <div className="w-full max-w-lg rounded-xl border border-dashed border-slate-300 bg-white/70 p-10 text-center shadow-sm">
          <span className="material-symbols-outlined text-4xl text-slate-400">description</span>
          <p className="mt-3 text-sm font-semibold text-slate-700">
            {examMeta?.course_code ? `${examMeta.course_code} — ` : ''}
            {examMeta?.exam_type ?? 'Exam'} · Page {activePage} / {totalPages}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Student {studentNumber ?? '—'} · {questionsOnPage.length} question{questionsOnPage.length === 1 ? '' : 's'} on this page
          </p>
        </div>
      </div>

      {/* Footer — OCR confidence for this page */}
      <div className="px-4 h-10 flex items-center justify-between bg-white border-t
                      border-outline-variant/10 shrink-0">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            avgConfPct >= 90 ? 'bg-emerald-500' : avgConfPct >= 80 ? 'bg-amber-400' : 'bg-red-400'
          }`} />
          <span className="text-[10px] font-bold tracking-widest uppercase text-gray-600">
            {t('sd.ocrConfidence')}: {avgConfPct}%
          </span>
        </div>
        <span className="text-[10px] text-gray-400">
          {t('sd.questionsOnPage', { n: questionsOnPage.length })}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel B — Question List
// ---------------------------------------------------------------------------
function QuestionList({
  answers, activeQn, onSelect, result,
}: {
  answers: AnswerDetail[];
  activeQn: number | null;
  onSelect: (qn: number) => void;
  result: StudentResult;
}) {
  const { t } = useLang();
  const mc = answers.filter((a) => a.question_type === 'mc');
  const open = answers.filter((a) => a.question_type === 'open');

  return (
    <div className="flex flex-col h-[calc(100vh-14rem)] min-h-[480px]">
      <div className="px-4 py-3 border-b border-gray-100 shrink-0">
        <h3 className="font-semibold text-gray-900 font-jakarta text-sm">{t('workspace.questions')}</h3>
        <p className="text-[10px] text-gray-500 mt-0.5">
          {t('sd.questionTypesCount', { mc: mc.length, open: open.length })}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {mc.length > 0 && (
          <>
            <SectionLabel>{t('qtype.mc')}</SectionLabel>
            <div className="grid grid-cols-4 gap-1.5 p-1">
              {mc.map((a) => (
                <QuestionChip
                  key={a.question_number}
                  answer={a}
                  active={a.question_number === activeQn}
                  locked={!!result.approved_at}
                  onClick={() => onSelect(a.question_number)}
                />
              ))}
            </div>
          </>
        )}

        {open.length > 0 && (
          <>
            <SectionLabel className="mt-3">{t('qtype.open')}</SectionLabel>
            <div className="space-y-1">
              {open.map((a) => (
                <QuestionRow
                  key={a.question_number}
                  answer={a}
                  active={a.question_number === activeQn}
                  locked={!!result.approved_at}
                  onClick={() => onSelect(a.question_number)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`px-2 py-1 text-[9px] font-bold tracking-widest uppercase text-gray-400 ${className}`}>
      {children}
    </p>
  );
}

function statusDotCls(a: AnswerDetail): string {
  if (a.override_applied) return 'bg-amber-400';
  if (a.needs_review) return 'bg-amber-300';
  if (a.question_type === 'mc') return a.is_correct ? 'bg-emerald-500' : 'bg-red-400';
  // open-ended: colour by score ratio
  const ratio = a.max_score > 0 ? a.score / a.max_score : 0;
  return ratio >= 0.7 ? 'bg-emerald-500' : ratio >= 0.4 ? 'bg-amber-400' : 'bg-red-400';
}

function QuestionChip({ answer, active, locked, onClick }: {
  answer: AnswerDetail;
  active: boolean;
  locked: boolean;
  onClick: () => void;
}) {
  const { t } = useLang();
  const base = active
    ? 'bg-primary-600 text-white ring-2 ring-primary-400'
    : answer.is_correct
      ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
      : 'bg-red-50 text-red-700 hover:bg-red-100';
  return (
    <button
      onClick={onClick}
      className={`relative h-10 flex flex-col items-center justify-center rounded-md
                  text-[11px] font-bold transition-all ${base}`}
      title={`Q${answer.question_number}${answer.needs_review ? ` (${t('sd.reviewHint')})` : ''}`}
    >
      <span>Q{answer.question_number}</span>
      <span className="text-[9px] opacity-80 font-mono">
        {answer.student_answer ?? '?'}
      </span>
      {answer.needs_review && !active && (
        <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-400 rounded-full
                         ring-2 ring-white" />
      )}
      {answer.override_applied && (
        <span className="absolute -bottom-1 -right-1 text-[9px]">✱</span>
      )}
      {locked && (
        <span className="absolute -top-1 -left-1 text-[9px]">🔒</span>
      )}
    </button>
  );
}

function QuestionRow({ answer, active, locked, onClick }: {
  answer: AnswerDetail;
  active: boolean;
  locked: boolean;
  onClick: () => void;
}) {
  const ratio = answer.max_score > 0 ? (answer.score / answer.max_score) * 100 : 0;
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2 py-2 rounded-md text-left
                  transition-colors ${
        active ? 'bg-primary-50 ring-1 ring-primary-200' : 'hover:bg-gray-50'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDotCls(answer)}`} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-gray-900 truncate">
          Q{answer.question_number}
          {answer.label && <span className="text-gray-500 font-normal ml-1">· {answer.label}</span>}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] font-bold text-gray-600 font-jakarta">
            {answer.score}/{answer.max_score}
          </span>
          <div className="flex-1 h-0.5 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full ${PROGRESS_COLOR(ratio)}`} style={{ width: `${ratio}%` }} />
          </div>
        </div>
      </div>
      {answer.override_applied && <span className="text-[10px] text-amber-600">✱</span>}
      {locked && <span className="text-[10px]">🔒</span>}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Panel C — Question Detail
// ---------------------------------------------------------------------------
function QuestionDetail({
  answer, approved, onRemapped, jobId, studentId,
}: {
  answer: AnswerDetail;
  approved: boolean;
  onRemapped: () => Promise<void> | void;
  jobId: string;
  studentId: string;
}) {
  const { t } = useLang();
  const isMC = answer.question_type === 'mc';
  const ratio = answer.max_score > 0 ? (answer.score / answer.max_score) * 100 : 0;
  const [remapOpen, setRemapOpen] = useState(false);

  return (
    <div className="card p-5 space-y-4">
      {/* Title row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
            {isMC ? t('qtype.mc') : t('qtype.open')}
          </p>
          <h3 className="font-semibold text-gray-900 font-jakarta">
            {t('workspace.question')} {answer.question_number}
            {answer.label && <span className="text-gray-500 font-normal ml-2">· {answer.label}</span>}
          </h3>
        </div>
        <div className="text-right shrink-0">
          <span className={`text-lg font-bold font-jakarta ${
            ratio >= 70 ? 'text-emerald-600' : ratio >= 40 ? 'text-amber-600' : 'text-red-600'
          }`}>
            {answer.score}/{answer.max_score}
          </span>
          {answer.override_applied && (
            <p className="text-[10px] font-bold text-amber-600 mt-0.5">✱ {t('status.edited')}</p>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${PROGRESS_COLOR(ratio)} transition-all duration-500`}
             style={{ width: `${ratio}%` }} />
      </div>

      {/* MC body */}
      {isMC && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className={`p-3 rounded-lg border relative ${
              answer.is_correct
                ? 'bg-emerald-50 border-emerald-200'
                : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase text-gray-500">{t('sd.studentLabel')}</p>
                {!approved && (
                  <button
                    onClick={() => setRemapOpen((v) => !v)}
                    className="text-[10px] font-semibold text-primary-600 hover:text-primary-700
                               flex items-center gap-0.5"
                    title={t('sd.remapTitle')}
                  >
                    <span className="material-symbols-outlined text-sm">edit</span>
                    {t('sd.fixAction')}
                  </button>
                )}
              </div>
              <p className={`text-2xl font-bold mt-1 ${
                answer.is_correct ? 'text-emerald-700' : 'text-red-700'
              }`}>
                {answer.student_answer ?? '—'}
              </p>
            </div>
            <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50">
              <p className="text-[10px] font-bold uppercase text-emerald-600">{t('sd.correct')}</p>
              <p className="text-2xl font-bold text-emerald-700 mt-1">
                {answer.correct_answer ?? '—'}
              </p>
            </div>
          </div>

          {remapOpen && !approved && (
            <RemapPopover
              answer={answer}
              jobId={jobId}
              studentId={studentId}
              onClose={() => setRemapOpen(false)}
              onRemapped={async () => {
                setRemapOpen(false);
                await onRemapped();
              }}
            />
          )}

          {/* Bubble fills */}
          {answer.bubble_fills && (
            <div>
              <p className="label-xs text-gray-400 mb-2">{t('sd.bubbleFills')}</p>
              <div className="space-y-1.5">
                {Object.entries(answer.bubble_fills).map(([opt, fill]) => {
                  const fillPct = Math.round(fill * 100);
                  const isSelected = opt === answer.student_answer;
                  const isCorrect = opt === answer.correct_answer;
                  return (
                    <div key={opt} className="flex items-center gap-2">
                      <span className={`text-xs font-bold font-mono w-4 ${
                        isCorrect ? 'text-emerald-600' : 'text-gray-500'
                      }`}>{opt}</span>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-500 ${
                            isSelected
                              ? (isCorrect ? 'bg-emerald-500' : 'bg-red-400')
                              : 'bg-gray-300'
                          }`}
                          style={{ width: `${fillPct}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-gray-500 w-8 text-right">
                        {fillPct}%
                      </span>
                      {isSelected && (
                        <span className="text-[9px] font-bold text-primary-600">
                          {t('sd.selectedLower')}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Open-ended body */}
      {!isMC && (
        <>
          {answer.student_answer && (
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="label-xs text-gray-500 mb-1">{t('workspace.studentAnswer')}</p>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                {answer.student_answer}
              </p>
            </div>
          )}

          {answer.correct_answer && (
            <div className="bg-primary-50 rounded-lg p-3 border border-primary-100">
              <p className="label-xs text-primary-600 mb-1">{t('sd.rubricExpected')}</p>
              <p className="text-xs text-primary-800 leading-relaxed">
                {answer.correct_answer}
              </p>
            </div>
          )}

          {answer.rubric_breakdown && answer.rubric_breakdown.length > 0 && (
            <div className="bg-white rounded-lg p-3 border border-gray-100">
              <p className="label-xs text-gray-500 mb-2">{t('sd.rubricDetail')}</p>
              <div className="space-y-1.5">
                {answer.rubric_breakdown.map((r, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`material-symbols-outlined text-base ${STATUS_COLOR(r.status)}`}>
                        {STATUS_ICON(r.status)}
                      </span>
                      <span className="text-xs text-gray-700 truncate">{r.label}</span>
                    </div>
                    <span className={`text-xs font-bold font-jakarta ${STATUS_COLOR(r.status)}`}>
                      {r.score}/{r.max_score}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {answer.ai_reasoning && (
            <div className="bg-iku-red/5 rounded-lg p-3 border-l-2 border-iku-red/40">
              <p className="label-xs text-iku-red mb-1 flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">auto_awesome</span>
                {t('workspace.aiReasoning')}
                {answer.model_used && (
                  <span className="ml-auto text-[9px] font-normal text-iku-red/70">
                    {answer.model_used}
                  </span>
                )}
              </p>
              <p className="text-xs text-iku-black/90 leading-relaxed italic">
                "{answer.ai_reasoning}"
              </p>
            </div>
          )}
        </>
      )}

      {/* Confidence bars */}
      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
        <ConfidenceBar label="OCR" value={answer.ocr_confidence} />
        <ConfidenceBar label={isMC ? t('sd.bubble') : t('sd.model')} value={answer.confidence} />
      </div>

      {answer.needs_review && (
        <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border
                        border-amber-200 rounded-lg">
          <span className="material-symbols-outlined text-amber-600 text-lg shrink-0">warning</span>
          <p className="text-xs text-amber-800">
            {t('sd.needsReviewHint')}
          </p>
        </div>
      )}
    </div>
  );
}

function ConfidenceBar({ label, value }: { label: string; value: number | null }) {
  if (value == null) return (
    <div>
      <p className="label-xs text-gray-400">{label}</p>
      <p className="text-xs text-gray-300">—</p>
    </div>
  );
  const pct = Math.round(value * 100);
  const barCls = pct >= 90 ? 'bg-emerald-500' : pct >= 80 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="label-xs text-gray-400">{label}</p>
        <span className="text-[10px] font-bold text-gray-600 font-mono">{pct}%</span>
      </div>
      <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${barCls} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel D — Override Form
// ---------------------------------------------------------------------------
function OverrideForm({
  answer, approved, reasonRef, onApplied, jobId, studentId,
}: {
  answer: AnswerDetail;
  approved: boolean;
  reasonRef: React.MutableRefObject<HTMLTextAreaElement | null>;
  onApplied: () => Promise<void> | void;
  jobId: string;
  studentId: string;
}) {
  const [score, setScore] = useState<string>(answer.score.toString());
  const [reason, setReason] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();
  const { t } = useLang();

  useEffect(() => {
    setScore(answer.score.toString());
    setReason('');
  }, [answer.question_number, answer.score]);

  const scoreNum = parseFloat(score);
  const changed = !Number.isNaN(scoreNum) && scoreNum !== answer.score;
  const reasonOk = reason.trim().length >= 10;
  const withinBounds = !Number.isNaN(scoreNum) && scoreNum >= 0 && scoreNum <= answer.max_score;
  const canApply = changed && reasonOk && withinBounds && !approved && !submitting;

  const apply = async () => {
    if (!canApply) return;
    setSubmitting(true);
    try {
      await api.post(`/results/${jobId}/student/${studentId}/override`, {
        question_number: answer.question_number,
        new_score: scoreNum,
        reason: reason.trim(),
      });
      toast.success(t('sd.questionUpdated', { n: answer.question_number }));
      await onApplied();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail ?? t('sd.overrideFailed');
      toast.error(typeof detail === 'string' ? detail : t('sd.overrideFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const delta = changed ? scoreNum - answer.score : 0;

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-gray-900 font-jakarta text-sm">
          {t('sd.editScore')}
        </h4>
        {approved && (
          <span className="badge bg-emerald-50 text-emerald-700">
            <span className="material-symbols-outlined text-sm">lock</span>
            {t('sd.locked')}
          </span>
        )}
      </div>

      {approved && (
        <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
          {t('sd.lockedBody')}
        </p>
      )}

      <div className="flex items-center gap-3">
        <div className="flex-1">
          <label className="label-xs text-gray-400">{t('sd.newScore')}</label>
          <div className="flex items-center gap-2 mt-1">
            <input
              type="number"
              step="0.5"
              min="0"
              max={answer.max_score}
              value={score}
              onChange={(e) => setScore(e.target.value)}
              disabled={approved}
              className="input py-2 px-3 text-base font-bold font-jakarta w-24 text-center"
            />
            <span className="text-sm font-semibold text-gray-400">
              / {answer.max_score}
            </span>
            {changed && !approved && (
              <span className={`text-xs font-bold font-jakarta ${
                delta > 0 ? 'text-emerald-600' : 'text-red-600'
              }`}>
                {delta > 0 ? '+' : ''}{delta.toFixed(1)}
              </span>
            )}
          </div>
        </div>
      </div>

      <div>
        <label className="label-xs text-gray-400 flex items-center justify-between">
          <span>{t('workspace.reasonMin', { n: 10 })}</span>
          <span className={`font-mono ${
            reasonOk ? 'text-emerald-600' : 'text-gray-400'
          }`}>
            {reason.trim().length}/10
          </span>
        </label>
        <textarea
          ref={reasonRef}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void apply();
            }
          }}
          disabled={approved}
          rows={3}
          placeholder={t('sd.overridePlaceholder')}
          className="input mt-1 text-sm leading-relaxed"
        />
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <p className="text-[10px] text-gray-400">
          {t('sd.overrideHint')}
        </p>
        <button
          onClick={apply}
          disabled={!canApply}
          className="btn-primary btn-sm"
        >
          {submitting ? (
            <><LoadingSpinner size="sm" text="" /> {t('sd.applying')}</>
          ) : (
            <>
              <span className="material-symbols-outlined text-base">check</span>
              {t('common.apply')}
            </>
          )}
        </button>
      </div>

      {!withinBounds && changed && (
        <p className="text-xs text-red-600">
          {t('sd.scoreRange', { max: answer.max_score })}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// History drawer
// ---------------------------------------------------------------------------
function HistoryDrawer({
  loading, history, onClose,
}: {
  loading: boolean;
  history: OverrideHistoryResponse | null;
  onClose: () => void;
}) {
  const { t } = useLang();
  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" />
      <div
        className="relative bg-white w-full max-w-md h-full shadow-2xl overflow-y-auto
                   animate-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4
                        flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 font-jakarta">
              {t('history.title')}
            </h3>
            <p className="text-[10px] text-gray-500">
              {history ? t('sd.historyRecords', { n: history.total }) : ''}
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost btn-sm">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-4 space-y-3">
          {loading ? (
            <LoadingSpinner text={t('common.loading')} />
          ) : !history || history.total === 0 ? (
            <div className="text-center py-12 text-sm text-gray-400">
              {t('history.empty')}
            </div>
          ) : (
            history.history.map((h) => {
              const delta = h.new_score - h.previous_score;
              return (
                <div key={h.id} className="border border-gray-100 rounded-lg p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-900">
                      {h.question_number === 0 ? t('history.bulk') : `${t('workspace.question')} ${h.question_number}`}
                    </span>
                    <span className="text-[10px] font-mono text-gray-500">
                      {formatTime(h.overridden_at)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-gray-500 line-through">{h.previous_score}</span>
                    <span className="text-gray-400">→</span>
                    <span className="font-bold text-gray-900">{h.new_score}</span>
                    <span className={`font-bold ${delta > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      ({delta > 0 ? '+' : ''}{delta.toFixed(1)})
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 italic">"{h.reason}"</p>
                  {h.overridden_by_email && (
                    <p className="text-[10px] text-gray-400">
                      — {h.overridden_by_email}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Remap popover — correct OCR'd student_answer letter for MC questions
// ---------------------------------------------------------------------------
function RemapPopover({
  answer, jobId, studentId, onClose, onRemapped,
}: {
  answer: AnswerDetail;
  jobId: string;
  studentId: string;
  onClose: () => void;
  onRemapped: () => Promise<void> | void;
}) {
  const toast = useToast();
  const { t } = useLang();
  const [selected, setSelected] = useState<string>(answer.student_answer ?? '');
  const [reason, setReason] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  // Options from bubble_fills keys if present, else default A-D
  const options = answer.bubble_fills
    ? Object.keys(answer.bubble_fills)
    : ['A', 'B', 'C', 'D'];

  const changed = selected !== (answer.student_answer ?? '');
  const reasonOk = reason.trim().length >= 10;
  const canApply = changed && reasonOk && !submitting && !!selected;

  const apply = async () => {
    if (!canApply) return;
    setSubmitting(true);
    try {
      await api.post(`/results/${jobId}/student/${studentId}/remap`, {
        question_number: answer.question_number,
        new_student_answer: selected,
        reason: reason.trim(),
      });
      toast.success(t('sd.remapSuccess', { n: answer.question_number, letter: selected }));
      await onRemapped();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail ?? t('sd.remapFailed');
      toast.error(typeof detail === 'string' ? detail : t('sd.remapFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-primary-50/60 border border-primary-200 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold text-primary-700 flex items-center gap-1">
            <span className="material-symbols-outlined text-sm">tune</span>
            {t('sd.remapTitleFull')}
          </p>
          <p className="text-[10px] text-primary-600/80 mt-0.5">
            {t('sd.remapBody')}
          </p>
        </div>
        <button onClick={onClose} className="text-primary-500 hover:text-primary-700">
          <span className="material-symbols-outlined text-base">close</span>
        </button>
      </div>

      {/* Letter picker with bubble fill hints */}
      <div className="grid grid-cols-4 gap-1.5">
        {options.map((opt) => {
          const fill = answer.bubble_fills?.[opt] ?? null;
          const fillPct = fill != null ? Math.round(fill * 100) : null;
          const isSelected = selected === opt;
          const isCorrect = opt === answer.correct_answer;
          return (
            <button
              key={opt}
              onClick={() => setSelected(opt)}
              className={`relative flex flex-col items-center py-2 rounded-md border-2
                          transition-all ${
                isSelected
                  ? 'bg-primary-600 text-white border-primary-600 shadow-md'
                  : 'bg-white border-gray-200 hover:border-primary-300'
              }`}
            >
              <span className={`text-lg font-bold font-jakarta ${
                isSelected ? 'text-white' : isCorrect ? 'text-emerald-600' : 'text-gray-700'
              }`}>{opt}</span>
              {fillPct != null && (
                <span className={`text-[9px] font-mono mt-0.5 ${
                  isSelected ? 'text-primary-100' : 'text-gray-400'
                }`}>
                  {fillPct}%
                </span>
              )}
              {isCorrect && !isSelected && (
                <span className="absolute -top-1 -right-1 text-[9px] bg-emerald-500
                                 text-white rounded-full px-1 font-bold">✓</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Reason */}
      <div>
        <label className="label-xs text-primary-700 flex items-center justify-between">
          <span>{t('workspace.reasonMin', { n: 10 })}</span>
          <span className={`font-mono ${reasonOk ? 'text-emerald-600' : 'text-gray-400'}`}>
            {reason.trim().length}/10
          </span>
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void apply();
            }
          }}
          rows={2}
          placeholder={t('sd.remapReasonPlaceholder')}
          className="input mt-1 text-xs leading-relaxed"
        />
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <p className="text-[10px] text-primary-600/70">
          {t('sd.ctrlEnterHint')}
        </p>
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary btn-sm">
            {t('common.cancel')}
          </button>
          <button onClick={apply} disabled={!canApply} className="btn-primary btn-sm">
            {submitting ? (
              <><LoadingSpinner size="sm" text="" /> {t('sd.applying')}</>
            ) : (
              <>
                <span className="material-symbols-outlined text-base">check</span>
                {t('sd.fixAction')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Keyboard shortcut hint (bottom-left floating pill)
// ---------------------------------------------------------------------------
function KeyboardHint() {
  const [open, setOpen] = useState(false);
  const { t } = useLang();
  return (
    <div className="fixed bottom-4 left-4 z-30">
      {open ? (
        <div className="bg-gray-900 text-white rounded-lg shadow-xl p-4 text-xs space-y-1
                        animate-fade-up max-w-xs">
          <div className="flex items-center justify-between mb-2">
            <p className="font-bold tracking-wide">{t('sd.shortcutsTitle')}</p>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-white">
              ×
            </button>
          </div>
          <Shortcut k="j / ↓" label={t('sd.shortcutNextQ')} />
          <Shortcut k="k / ↑" label={t('sd.shortcutPrevQ')} />
          <Shortcut k="Shift+J" label={t('sd.shortcutNextStudent')} />
          <Shortcut k="Shift+K" label={t('sd.shortcutPrevStudent')} />
          <Shortcut k="o" label={t('sd.shortcutFocusReason')} />
          <Shortcut k="Ctrl+Enter" label={t('sd.shortcutApply')} />
          <Shortcut k="a" label={t('sd.shortcutApproveToggle')} />
          <Shortcut k="h" label={t('sd.shortcutHistory')} />
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="bg-gray-900 text-white rounded-full px-3 py-1.5 text-[10px]
                     font-bold tracking-wide shadow-lg hover:bg-gray-800 flex items-center gap-1.5"
        >
          <span className="material-symbols-outlined text-sm">keyboard</span>
          {t('sd.shortcutsShort')}
        </button>
      )}
    </div>
  );
}

function Shortcut({ k, label }: { k: string; label: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-gray-300">{label}</span>
      <code className="bg-gray-700 text-gray-100 px-1.5 py-0.5 rounded font-mono text-[10px]">
        {k}
      </code>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TabbedDetailPanel — Layout 2 ("Sekmeli") right-side panel
// ---------------------------------------------------------------------------
type DetailTab = 'answer' | 'ocr' | 'ai' | 'override';

function TabbedDetailPanel({
  answer, approved, onRemapped, reasonRef, onApplied, jobId, studentId,
}: {
  answer: AnswerDetail;
  approved: boolean;
  onRemapped: () => Promise<void> | void;
  reasonRef: React.MutableRefObject<HTMLTextAreaElement | null>;
  onApplied: () => Promise<void> | void;
  jobId: string;
  studentId: string;
}) {
  const { t } = useLang();
  const [tab, setTab] = useState<DetailTab>('answer');

  const tabs: { id: DetailTab; label: string; icon: string; badge?: number }[] = [
    { id: 'answer', label: t('sd.tabAnswer'), icon: 'question_answer' },
    { id: 'ocr', label: 'OCR', icon: 'scanner' },
    { id: 'ai', label: 'AI', icon: 'auto_awesome' },
    { id: 'override', label: t('common.edit'), icon: 'edit' },
  ];

  return (
    <div className="card">
      {/* Tab strip */}
      <div className="flex border-b border-gray-100 bg-surface-container-low/50">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold
                        transition-colors border-b-2 ${
              tab === t.id
                ? 'border-primary-500 text-primary-700 bg-white'
                : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-white/60'
            }`}
          >
            <span className="material-symbols-outlined text-base">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Active panel */}
      <div className="p-4">
        {tab === 'answer' && (
          <QuestionDetail
            answer={answer} approved={approved}
            onRemapped={onRemapped} jobId={jobId} studentId={studentId}
          />
        )}
        {tab === 'ocr' && (
          <OCROutputCard answer={answer} />
        )}
        {tab === 'ai' && (
          <div className="space-y-3">
            {answer.ai_reasoning ? (
              <div className="bg-iku-red/5 rounded-lg p-4 border-l-4 border-iku-red/60">
                <p className="text-[10px] font-bold uppercase tracking-widest text-iku-red mb-2 flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">auto_awesome</span>
                  {t('workspace.aiReasoning')}
                  {answer.model_used && (
                    <span className="ml-auto text-[9px] font-normal text-iku-red/70">
                      {answer.model_used}
                    </span>
                  )}
                </p>
                <p className="text-sm text-iku-black/90 leading-relaxed italic">
                  "{answer.ai_reasoning}"
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-6">
                {t('sd.noAiReasoning')}
              </p>
            )}
            {answer.rubric_breakdown && answer.rubric_breakdown.length > 0 && (
              <div className="bg-white rounded-lg p-3 border border-gray-200">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">
                  {t('sd.rubricDetail')}
                </p>
                <div className="space-y-1.5">
                  {answer.rubric_breakdown.map((r, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`material-symbols-outlined text-base ${STATUS_COLOR(r.status)}`}>
                          {STATUS_ICON(r.status)}
                        </span>
                        <span className="text-xs text-gray-700 truncate">{r.label}</span>
                      </div>
                      <span className={`text-xs font-bold font-jakarta ${STATUS_COLOR(r.status)}`}>
                        {r.score}/{r.max_score}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {tab === 'override' && (
          <OverrideForm
            key={`${answer.question_number}-${answer.score}`}
            answer={answer}
            approved={approved}
            reasonRef={reasonRef}
            onApplied={onApplied}
            jobId={jobId}
            studentId={studentId}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// QuestionChipStrip — Layout 3 horizontal strip of question chips
// ---------------------------------------------------------------------------
function QuestionChipStrip({
  answers, activeQn, onSelect,
}: {
  answers: AnswerDetail[];
  activeQn: number | null;
  onSelect: (qn: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {[...answers].sort((a, b) => a.question_number - b.question_number).map((a) => {
        const active = a.question_number === activeQn;
        const ratio = a.max_score > 0 ? a.score / a.max_score : 0;
        const baseCls = active
          ? 'bg-primary-600 text-white ring-2 ring-primary-300'
          : a.override_applied
            ? 'bg-teal-50 text-teal-700 border border-teal-300'
            : a.needs_review
              ? 'bg-amber-50 text-amber-700 border border-amber-300'
              : ratio >= 0.7
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : ratio >= 0.4
                  ? 'bg-slate-100 text-slate-700 border border-slate-200'
                  : 'bg-red-50 text-red-700 border border-red-200';
        return (
          <button
            key={a.question_number}
            onClick={() => onSelect(a.question_number)}
            className={`h-9 px-2 min-w-[2.5rem] rounded-md text-[11px] font-bold transition-colors ${baseCls}`}
            title={`Q${a.question_number} — ${a.score}/${a.max_score}`}
          >
            Q{a.question_number}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mock scan content blocks — rendered inside each question's bbox on the page
// ---------------------------------------------------------------------------

/** MC question: printed question + option rows with bubble fills. */
function MCBlock({ answer }: { answer: AnswerDetail }) {
  const options = answer.option_texts ?? { A: '', B: '', C: '', D: '' };
  const fills = answer.bubble_fills ?? {};
  return (
    <div className="absolute inset-0 px-2 py-1 overflow-hidden text-[9px] leading-tight font-sans text-slate-900">
      <div className="flex gap-1 items-start">
        <span className="font-bold text-slate-700 shrink-0">{answer.question_number}.</span>
        <p className="line-clamp-2 text-slate-800">{answer.question_text ?? ''}</p>
      </div>
      <div className="mt-0.5 pl-3 space-y-[1px]">
        {Object.entries(options).map(([letter, text]) => {
          const darkness = fills[letter] ?? 0;
          const filled = darkness > 0.5;
          return (
            <div key={letter} className="flex items-center gap-1.5">
              <span
                className={`inline-block w-2 h-2 rounded-full border border-slate-700 shrink-0 ${
                  filled ? 'bg-slate-900' : 'bg-white'
                }`}
              />
              <span className="text-slate-700 truncate">{letter}) {text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Fill-in-the-blank: printed template with handwritten blanks inlined. */
function FillBlock({ answer }: { answer: AnswerDetail }) {
  const template = answer.fill_template ?? '';
  const blanks = answer.fill_blanks ?? {};
  const hw = handwritingStyle(answer.handwriting_seed);
  // Split on "___" and weave in handwritten blanks
  const chunks = template.split(/___/);
  return (
    <div className="absolute inset-0 p-2 overflow-hidden text-[10px] leading-snug font-sans text-slate-900">
      <div className="flex gap-1 items-start">
        <span className="font-bold text-slate-700 shrink-0">{answer.question_number}.</span>
        <div className="text-slate-800 leading-[1.6]">
          {chunks.map((chunk, i) => (
            <span key={i}>
              {chunk}
              {i < chunks.length - 1 && (
                <span
                  className={`inline-block mx-0.5 px-1 border-b border-slate-600 ${hw.fontClass} ${hw.colorClass}`}
                  style={{
                    fontSize: `${hw.fontSizePx}px`,
                    transform: `rotate(${hw.jitter(i).rotation}deg) translateX(${hw.jitter(i).xOffset}px)`,
                    display: 'inline-block',
                    minWidth: '60px',
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
    </div>
  );
}

/** Open-ended: printed question header + handwritten answer in the ruled area. */
function OpenBlock({ answer }: { answer: AnswerDetail }) {
  const hw = handwritingStyle(answer.handwriting_seed);
  const handwritten = answer.handwritten_answer ?? '';
  // Split into rough lines for a per-line wobble effect
  const lines = handwritten.split(/\n+/).flatMap((p, pi) =>
    p.match(/.{1,48}(\s|$)/g) || [p] // crude line-wrap
  );
  return (
    <div className="absolute inset-0 p-3 overflow-hidden font-sans text-slate-900">
      {/* Printed question (compact) */}
      {answer.question_text && (
        <div className="flex gap-1 items-start mb-2 text-[10px] leading-tight">
          <span className="font-bold text-slate-700 shrink-0">{answer.question_number}.</span>
          <p className="text-slate-800 line-clamp-2">{answer.question_text}</p>
        </div>
      )}
      {/* Handwritten answer in ruled area */}
      <div
        className={`${hw.fontClass} ${hw.colorClass} relative`}
        style={{
          fontSize: `${hw.fontSizePx + 2}px`,
          lineHeight: '1.8',
          transform: `rotate(${hw.rotationDeg}deg)`,
          transformOrigin: 'top left',
        }}
      >
        {/* Faux ruled lines */}
        <div className="absolute inset-0 opacity-30 pointer-events-none"
             style={{
               backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0, transparent 23px, #cbd5e1 23px, #cbd5e1 24px)',
             }} />
        {/* Lines of handwriting with small per-line jitter */}
        <div className="relative">
          {lines.slice(0, 14).map((line, i) => {
            const j = hw.jitter(i + 1);
            return (
              <div
                key={i}
                style={{
                  transform: `rotate(${j.rotation}deg) translateX(${j.xOffset}px)`,
                  marginBottom: '0',
                }}
              >
                {line}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
