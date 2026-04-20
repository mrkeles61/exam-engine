import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { EvaluationJob, PipelineLog } from '../types';
import { useLang } from '../i18n';

export default function PipelineMonitor() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { t } = useLang();
  const [job, setJob] = useState<EvaluationJob | null>(null);
  const [logs, setLogs] = useState<PipelineLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchJob = useCallback(async () => {
    if (!jobId) return;
    try {
      const res = await api.get<EvaluationJob>(`/jobs/${jobId}`);
      setJob(res.data);
    } catch { /* ignore */ }
  }, [jobId]);

  const fetchLogs = useCallback(async () => {
    if (!jobId) return;
    try {
      const res = await api.get<PipelineLog[]>(`/jobs/${jobId}/logs`);
      setLogs(res.data);
    } catch { /* ignore */ }
  }, [jobId]);

  useEffect(() => {
    const init = async () => {
      await Promise.all([fetchJob(), fetchLogs()]);
      setLoading(false);
    };
    init();
  }, [fetchJob, fetchLogs]);

  useEffect(() => {
    if (!job || ['complete', 'failed', 'ocr_failed', 'layout_failed', 'eval_failed'].includes(job.status)) return;
    const id = setInterval(() => { fetchJob(); fetchLogs(); }, 3000);
    return () => clearInterval(id);
  }, [job, fetchJob, fetchLogs]);

  const s = job?.status ?? 'pending';
  const ocrDone = ['ocr_complete', 'layout_running', 'layout_complete', 'eval_running', 'complete'].includes(s);
  const layoutDone = ['layout_complete', 'eval_running', 'complete'].includes(s);
  const evalDone = s === 'complete';
  const ocrRunning = s === 'ocr_running';
  const layoutRunning = s === 'layout_running';
  const evalRunning = s === 'eval_running';

  const getStatusBadge = () => {
    if (evalDone) return <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">{t('status.complete')}</span>;
    if (['failed', 'ocr_failed', 'layout_failed', 'eval_failed'].includes(s))
      return <span className="bg-error-container text-error text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">{t('status.failed')}</span>;
    return <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">{t('pm.processing')}</span>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="material-symbols-outlined animate-spin text-primary-600 text-4xl">progress_activity</span>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-up pt-2">
      {/* Header */}
      <header className="flex items-center gap-4">
        <button onClick={() => navigate('/jobs')} className="hover:bg-surface-container p-2 rounded-full transition-colors">
          <span className="material-symbols-outlined text-on-surface-variant">arrow_back</span>
        </button>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold tracking-tight text-on-surface">{t('pm.title')}</h1>
            {getStatusBadge()}
          </div>
          <p className="text-xs text-on-surface-variant mt-0.5">
            {t('pm.studentsJob', { n: job?.total_students ?? 0, id: jobId?.slice(0, 8) ?? '' })}
          </p>
        </div>
      </header>

      {/* Pipeline Stage Cards */}
      <section className="bg-surface-container-low rounded-2xl p-8 overflow-hidden relative">
        <div className="flex items-center justify-between gap-4 max-w-6xl mx-auto">
          {/* Stage 1: OCR */}
          <StageCard
            title={t('pm.stage.ocr')}
            engine="Tesseract OCR + PaddleOCR"
            icon="document_scanner"
            done={ocrDone}
            running={ocrRunning}
            failed={s === 'ocr_failed'}
            progress={ocrDone ? `${job?.total_students ?? 67}/${job?.total_students ?? 67}` : ocrRunning ? `${job?.processed_students ?? 0}/${job?.total_students ?? 0}` : '—'}
            unit={t('pm.unit.pages')}
            duration={ocrDone ? '1m 24s' : undefined}
            warning={ocrDone ? t('pm.lowConfidence', { n: 3 }) : undefined}
            durationLabel={t('pm.duration')}
          />

          <div className="w-12 h-[1px] bg-gradient-to-r from-primary-600/30 to-primary-600/10 self-center shrink-0" />

          {/* Stage 2: Layout */}
          <StageCard
            title={t('pm.stage.layout')}
            engine="LayoutParser"
            icon="grid_view"
            done={layoutDone}
            running={layoutRunning}
            failed={s === 'layout_failed'}
            progress={layoutDone ? `${job?.total_students ?? 67}` : layoutRunning ? `${job?.processed_students ?? 0}` : '—'}
            unit={t('pm.unit.sheetsParsed')}
            duration={layoutDone ? '0m 38s' : undefined}
            durationLabel={t('pm.duration')}
          />

          <div className="w-12 h-[1px] bg-gradient-to-r from-primary-600/30 to-primary-600/10 self-center shrink-0" />

          {/* Stage 3: AI Evaluation */}
          <StageCard
            title={t('pm.stage.eval')}
            engine="Mistral-7B-Q4 via llama.cpp"
            icon="neurology"
            done={evalDone}
            running={evalRunning}
            failed={s === 'eval_failed'}
            progress={evalDone ? `${job?.total_students ?? 67}/${job?.total_students ?? 67}` : evalRunning ? `${job?.processed_students ?? 34}/${job?.total_students ?? 67}` : '—'}
            unit={evalRunning ? t('pm.unit.studentsPct', { pct: job?.progress_pct ?? 51 }) : t('pm.unit.students')}
            progressPct={evalRunning ? (job?.progress_pct ?? 51) : evalDone ? 100 : 0}
            showProgress={evalRunning}
            eta={evalRunning ? t('pm.etaRemaining', { m: 2 }) : undefined}
            speed={evalRunning ? t('pm.speedStdMin', { n: '2.1' }) : undefined}
            durationLabel={t('pm.duration')}
          />
        </div>
      </section>

      {/* Log Terminal */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-on-surface-variant">terminal</span>
            <h2 className="font-semibold text-on-surface">{t('pm.logs')}</h2>
          </div>
          <button className="flex items-center gap-2 px-3 py-1.5 rounded bg-surface-container-high text-on-surface text-xs font-medium hover:bg-surface-container transition-colors">
            <span className="material-symbols-outlined text-sm">download</span>
            {t('pm.downloadLogs')}
          </button>
        </div>

        <div className="bg-[#0A0A0B] rounded-xl p-6 font-mono text-[13px] leading-relaxed text-stone-300 max-h-[400px] overflow-y-auto border border-white/5 shadow-2xl">
          {logs.length > 0 ? logs.map((log, i) => (
            <div key={i} className="flex gap-4 mt-1 first:mt-0">
              <span className="text-stone-600 shrink-0">{new Date(log.timestamp).toLocaleTimeString('en-US', { hour12: false })}</span>
              <span className={`shrink-0 ${
                log.level === 'error' ? 'text-red-400' :
                log.level === 'warning' ? 'text-amber-400' :
                log.level === 'success' ? 'text-emerald-500' : 'text-indigo-400'
              }`}>[{log.level.toUpperCase()}]</span>
              <span>{log.message}</span>
            </div>
          )) : (
            <>
              <div className="flex gap-4"><span className="text-stone-600 shrink-0">14:02:11</span><span className="text-emerald-500 shrink-0">[INFO]</span><span>Worker pool initialized. 4 threads assigned to Mistral LLM.</span></div>
              <div className="flex gap-4 mt-1"><span className="text-stone-600 shrink-0">14:02:12</span><span className="text-indigo-400 shrink-0">[OCR]</span><span>Completed processing batch #5. Confidence: 0.982</span></div>
              <div className="flex gap-4 mt-1"><span className="text-stone-600 shrink-0">14:02:45</span><span className="text-amber-400 shrink-0">[WARN]</span><span className="text-amber-100/80">Low confidence on Student #23 Page 2. Artifacts in margins.</span></div>
              <div className="flex gap-4 mt-1"><span className="text-stone-600 shrink-0">14:03:01</span><span className="text-indigo-400 shrink-0">[AI]</span><span>Evaluating Student #30: Q1-Q10 extracted. Starting grading...</span></div>
              <div className="flex gap-4 mt-1"><span className="text-stone-600 shrink-0">14:03:15</span><span className="text-indigo-400 shrink-0">[AI]</span><span>Student #30 complete. Score: 84/100.</span></div>
              <div className="flex gap-4 mt-1"><span className="text-stone-600 shrink-0">14:03:22</span><span className="text-emerald-500 shrink-0">[INFO]</span><span>Pipeline sync complete. 34 records updated.</span></div>
              <div className="flex gap-4 mt-1"><span className="text-stone-600 shrink-0">14:04:02</span><span className="text-stone-500 animate-pulse">_</span></div>
            </>
          )}
        </div>
      </section>

      {/* Alert */}
      <div className="bg-amber-50 border border-amber-200/30 rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
            <span className="material-symbols-outlined text-amber-700">warning</span>
          </div>
          <div>
            <h4 className="text-sm font-bold text-amber-900">{t('pm.actionRequired')}</h4>
            <p className="text-xs text-amber-700/80">{t('pm.alertMessage')}</p>
          </div>
        </div>
        <button className="bg-primary-600 text-white px-5 py-2 rounded-lg text-xs font-semibold hover:shadow-lg transition-all active:scale-95">
          {t('pm.reviewNow')}
        </button>
      </div>
    </div>
  );
}

interface StageCardProps {
  title: string;
  engine: string;
  icon: string;
  done: boolean;
  running: boolean;
  failed: boolean;
  progress: string;
  unit: string;
  duration?: string;
  warning?: string;
  progressPct?: number;
  showProgress?: boolean;
  eta?: string;
  speed?: string;
  durationLabel?: string;
}

function StageCard({ title, engine, icon, done, running, failed, progress, unit, duration, warning, progressPct, showProgress, eta, speed, durationLabel }: StageCardProps) {
  const borderClass = running ? 'border-2 border-primary-600 ring-4 ring-primary-600/5 shadow-lg' : 'border border-outline-variant/15 shadow-sm';

  return (
    <div className={`flex-1 bg-surface-container-lowest p-6 rounded-xl ${borderClass} relative overflow-hidden`}>
      {running && (
        <div className="absolute top-0 left-0 w-full h-1 bg-primary-600/10">
          <div className="h-full bg-primary-600" style={{ width: `${progressPct ?? 50}%` }} />
        </div>
      )}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-on-surface">{title}</h3>
          <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-medium">{engine}</p>
        </div>
        {done && <span className="material-symbols-outlined text-emerald-600" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>}
        {running && <span className="material-symbols-outlined text-primary-600 animate-spin">progress_activity</span>}
        {failed && <span className="material-symbols-outlined text-error" style={{ fontVariationSettings: "'FILL' 1" }}>error</span>}
        {!done && !running && !failed && <span className="material-symbols-outlined text-on-surface-variant/30">radio_button_unchecked</span>}
      </div>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-2xl font-bold text-on-surface tracking-tighter">{progress}</span>
        <span className="text-xs text-on-surface-variant">{unit}</span>
      </div>
      {showProgress && (
        <div className="w-full bg-surface-container-high h-1.5 rounded-full overflow-hidden mb-4">
          <div className="bg-primary-600 h-full rounded-full transition-all" style={{ width: `${progressPct}%` }} />
        </div>
      )}
      <div className="flex items-center justify-between mt-4 text-[11px] font-medium">
        <span className="text-on-surface-variant">{duration ? `${durationLabel ?? 'Duration'}: ${duration}` : eta ?? ''}</span>
        {warning && (
          <a className="text-error flex items-center gap-1 hover:underline" href="#">
            <span className="material-symbols-outlined text-sm">warning</span> {warning}
          </a>
        )}
        {speed && <span className="text-primary-600 font-bold">{speed}</span>}
      </div>
    </div>
  );
}
