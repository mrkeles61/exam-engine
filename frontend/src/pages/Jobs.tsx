import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { EvaluationJob, Exam, JobStatus } from '../types';
import { JobStatusBadge } from '../components/StatusBadge';
import { PipelineProgress } from '../components/PipelineProgress';
import { LogTerminal } from '../components/LogTerminal';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { DemoBanner } from '../components/DemoBanner';

interface JobWithExam { job: EvaluationJob; exam: Exam | null }

const TERMINAL_STATUSES: JobStatus[] = ['complete', 'ocr_failed', 'layout_failed', 'eval_failed', 'failed'];
const FAILED_STATUSES: JobStatus[] = ['ocr_failed', 'layout_failed', 'eval_failed', 'failed'];

function isTerminal(status: JobStatus) { return TERMINAL_STATUSES.includes(status); }
function isFailed(status: JobStatus)   { return FAILED_STATUSES.includes(status); }

export default function Jobs() {
  const navigate = useNavigate();
  const [items,   setItems]   = useState<JobWithExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const fetchJobs = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const jobs = (await api.get<EvaluationJob[]>('/jobs')).data;

      const uniqueExamIds = [...new Set(jobs.map((j) => j.exam_id))];
      const examMap: Record<string, Exam> = {};
      await Promise.all(
        uniqueExamIds.map(async (id) => {
          try { examMap[id] = (await api.get<Exam>(`/upload/${id}`)).data; } catch { /* deleted */ }
        }),
      );

      setItems(jobs.map((job) => ({ job, exam: examMap[job.exam_id] ?? null })));
      setError('');
    } catch {
      setError('İşler yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRetry = useCallback(async (jobId: string) => {
    try {
      await api.post(`/jobs/${jobId}/retry`);
      await fetchJobs(false);
    } catch { /* status updates via polling */ }
  }, [fetchJobs]);

  useEffect(() => { fetchJobs(true); }, [fetchJobs]);

  useEffect(() => {
    const hasActive = items.some(({ job }) => !isTerminal(job.status));
    if (!hasActive) return;
    const id = setInterval(() => fetchJobs(false), 3000);
    return () => clearInterval(id);
  }, [items, fetchJobs]);

  if (loading) return <LoadingSpinner text="İşler yükleniyor…" fullPage />;

  const hasActive = items.some(({ job }) => !isTerminal(job.status));
  const hasSeedData = items.every(({ job }) => isTerminal(job.status));

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Değerlendirmeler</h1>
          <p className="page-subtitle flex items-center gap-2">
            {hasActive ? (
              <>
                <span className="inline-block w-2 h-2 rounded-full bg-primary-500 animate-pulse" />
                Her 3 saniyede bir otomatik güncelleniyor
              </>
            ) : (
              'Tüm işler tamamlandı veya başarısız oldu'
            )}
          </p>
        </div>
        <button onClick={() => navigate('/upload')} className="btn-primary shrink-0">
          + Yeni Değerlendirme
        </button>
      </div>

      {/* Demo banner for seed data */}
      {hasSeedData && items.length > 0 && <DemoBanner />}

      {error && (
        <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
          <span className="text-red-500">⚠</span>
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          title="Henüz iş yok"
          message="İlk değerlendirme pipeline'ını başlatmak için sınav yükleyin."
          icon="⚙️"
          action={{ label: 'Sınav Yükle', onClick: () => navigate('/upload') }}
        />
      ) : (
        <div className="space-y-4">
          {items.map(({ job, exam }) => (
            <JobCard
              key={job.id}
              job={job}
              exam={exam}
              onViewResults={() => navigate(`/results/${job.id}`)}
              onRetry={handleRetry}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Job Card ────────────────────────────────────────────────────────────────

interface JobCardProps {
  job: EvaluationJob;
  exam: Exam | null;
  onViewResults: () => void;
  onRetry: (jobId: string) => void;
}

function JobCard({ job, exam, onViewResults, onRetry }: JobCardProps) {
  const [showLogs, setShowLogs] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const dateStr = new Date(job.created_at).toLocaleDateString('tr-TR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const live = !isTerminal(job.status);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await onRetry(job.id);
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="card p-5 space-y-4 hover:shadow-md transition-shadow">
      {/* Top row */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-900 font-jakarta truncate">
            {exam?.title ?? <span className="text-gray-400 italic">İsimsiz Sınav</span>}
          </h3>
          <div className="flex items-center gap-2.5 mt-1 flex-wrap">
            {exam?.course_name && (
              <span className="text-sm text-gray-500">{exam.course_name}</span>
            )}
            <span className="text-gray-300 hidden sm:inline">·</span>
            <span className="text-xs text-gray-400">{dateStr}</span>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {job.total_students > 0 && (
            <span className="text-xs text-gray-500 hidden sm:block">
              {job.status === 'complete'
                ? `${job.total_students} öğrenci`
                : `${job.processed_students} / ${job.total_students} öğrenci`}
            </span>
          )}
          <JobStatusBadge status={job.status} />
        </div>
      </div>

      {/* Pipeline progress */}
      <PipelineProgress
        status={job.status}
        progressPct={job.progress_pct}
        progressDetail={job.progress_detail}
      />

      {/* Error message */}
      {isFailed(job.status) && job.error_message && (
        <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          <span className="font-semibold">Hata: </span>{job.error_message}
        </div>
      )}

      {/* Log terminal */}
      {showLogs && (
        <LogTerminal jobId={job.id} live={live} />
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-1 border-t border-gray-50">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 font-mono">{job.id.split('-')[0]}…</span>
          <button
            onClick={() => setShowLogs(v => !v)}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors px-1.5 py-0.5 rounded hover:bg-gray-100"
          >
            {showLogs ? 'Logları Gizle' : 'Logları Gör'}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {isFailed(job.status) && (
            <button
              onClick={handleRetry}
              disabled={retrying}
              className="btn-secondary btn-sm flex items-center gap-1.5 disabled:opacity-60"
            >
              {retrying ? (
                <>
                  <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                  Yeniden…
                </>
              ) : (
                <>↺ Yeniden Dene</>
              )}
            </button>
          )}
          {job.status === 'complete' && (
            <button onClick={onViewResults} className="btn-primary btn-sm">
              Sonuçları Gör →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
