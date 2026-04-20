import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { EvaluationJob, Exam, Stats } from '../types';
import { JobStatusBadge } from '../components/StatusBadge';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { useLang, type TranslationKey } from '../i18n';

function useCountUp(target: number, duration = 1200): number {
  const [count, setCount] = useState(0);
  const prevTarget = useRef(0);
  useEffect(() => {
    if (target === prevTarget.current) return;
    prevTarget.current = target;
    if (target === 0) { setCount(0); return; }
    const startTime = performance.now();
    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration]);
  return count;
}

const METRICS: { key: string; labelKey: TranslationKey; icon: string; accent: string; iconColor: string }[] = [
  { key: 'evals',    labelKey: 'dashboard.totalEvaluations',   icon: 'fact_check',    accent: 'border-primary-600', iconColor: 'text-primary-600/40' },
  { key: 'students', labelKey: 'dashboard.studentsEvaluated',  icon: 'group',         accent: 'border-emerald-500', iconColor: 'text-emerald-500/40' },
  { key: 'avg',      labelKey: 'dashboard.averageScore',       icon: 'trending_up',   accent: 'border-purple-500',  iconColor: 'text-purple-500/40' },
  { key: 'active',   labelKey: 'dashboard.activeJobs',         icon: 'rocket_launch', accent: 'border-amber-500',   iconColor: 'text-amber-500/40' },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { t, lang } = useLang();
  const [jobs, setJobs] = useState<EvaluationJob[]>([]);
  const [examMap, setExamMap] = useState<Record<string, Exam>>({});
  const [avgScore, setAvgScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { fetchDashboard(); }, []);

  const fetchDashboard = async () => {
    try {
      const jobsRes = await api.get<EvaluationJob[]>('/jobs');
      const allJobs = jobsRes.data;
      setJobs(allJobs);

      const recentJobs = allJobs.slice(0, 5);
      const uniqueExamIds = [...new Set(recentJobs.map((j) => j.exam_id))];
      const map: Record<string, Exam> = {};
      await Promise.all(
        uniqueExamIds.map(async (id) => {
          try { map[id] = (await api.get<Exam>(`/upload/${id}`)).data; } catch { /* deleted */ }
        }),
      );
      setExamMap(map);

      const latestComplete = allJobs.find((j) => j.status === 'complete');
      if (latestComplete) {
        try {
          const s = (await api.get<Stats>(`/results/${latestComplete.id}/stats`)).data;
          setAvgScore(s.average_pct);
        } catch { /* ignore */ }
      }
    } catch {
      setError(lang === 'tr'
        ? 'Pano verileri yüklenemedi. Sunucu çalışıyor mu?'
        : 'Failed to load dashboard data. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  const totalEvals = jobs.length;
  const studentsEvaluated = jobs.filter((j) => j.status === 'complete').reduce((s, j) => s + j.total_students, 0);
  const activeJobs = jobs.filter((j) => !['complete', 'failed'].includes(j.status)).length;
  const completedJobs = jobs.filter((j) => j.status === 'complete').length;
  const recentJobs = jobs.slice(0, 5);

  const countEvals = useCountUp(totalEvals);
  const countStudents = useCountUp(studentsEvaluated);
  const countActive = useCountUp(activeJobs);

  const metricValues: Record<string, { value: string | number; sub: string }> = {
    evals:    { value: countEvals,    sub: t('dashboard.academicYear', { year: new Date().getFullYear() }) },
    students: { value: countStudents, sub: t('dashboard.completedExams', { n: completedJobs }) },
    avg:      { value: avgScore !== null ? `${avgScore.toFixed(1)}%` : '—', sub: t('dashboard.latestExam') },
    active:   { value: countActive,   sub: activeJobs > 0 ? t('status.running') : t('dashboard.enginesIdle') },
  };

  if (loading) return <LoadingSpinner text={t('common.loading')} fullPage />;

  return (
    <div className="space-y-8 animate-fade-up pt-2">
      <div>
        <h1 className="page-title">{t('dashboard.title')}</h1>
        <p className="page-subtitle">{t('dashboard.subtitle')}</p>
      </div>

      {error && (
        <div className="flex items-start gap-2 px-4 py-3 bg-error-container rounded-xl">
          <span className="material-symbols-outlined text-error mt-0.5 text-base">warning</span>
          <p className="text-sm text-on-error-container">{error}</p>
        </div>
      )}

      {/* Metric Cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {METRICS.map((m) => {
          const v = metricValues[m.key];
          return (
            <div key={m.key} className={`bg-surface-container-lowest p-6 rounded-xl border-l-4 ${m.accent} shadow-card`}>
              <div className="flex justify-between items-start mb-2">
                <span className="label-xs">{t(m.labelKey)}</span>
                <span className={`material-symbols-outlined ${m.iconColor}`}>{m.icon}</span>
              </div>
              <span className="text-3xl font-semibold text-on-surface">{v.value}</span>
              <span className="block text-xs text-on-surface-variant mt-1">{v.sub}</span>
            </div>
          );
        })}
      </section>

      {/* Quick Actions */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <button
          onClick={() => navigate('/upload')}
          className="group flex items-center justify-between p-5 bg-gradient-to-br from-iku-red to-iku-red-dark
                     text-white rounded-xl shadow-lg transition-transform hover:scale-[1.02] active:scale-95"
        >
          <div className="flex items-center gap-4">
            <span className="material-symbols-outlined">cloud_upload</span>
            <span className="font-semibold">{t('dashboard.uploadExam')}</span>
          </div>
          <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">arrow_right_alt</span>
        </button>
        <button
          onClick={() => navigate('/exam-builder')}
          className="flex items-center gap-4 p-5 bg-surface-container-lowest border border-outline-variant/30 text-on-surface rounded-xl hover:bg-surface-container-low transition-colors"
        >
          <span className="material-symbols-outlined text-primary-600">assignment_add</span>
          <span className="font-semibold">{t('nav.examBuilder')}</span>
        </button>
        <button
          onClick={() => navigate('/jobs')}
          className="flex items-center gap-4 p-5 bg-surface-container-lowest border border-outline-variant/30 text-on-surface rounded-xl hover:bg-surface-container-low transition-colors"
        >
          <span className="material-symbols-outlined text-primary-600">visibility</span>
          <span className="font-semibold">{t('dashboard.viewEvaluations')}</span>
        </button>
      </section>

      {/* Recent Evaluations */}
      <section className="bg-surface-container-lowest rounded-xl overflow-hidden shadow-card">
        <div className="flex items-center justify-between p-6 border-b border-surface-variant/20">
          <h2 className="text-lg font-bold text-on-surface">{t('dashboard.recentEvaluations')}</h2>
          <button
            onClick={() => navigate('/jobs')}
            className="text-primary-600 text-sm font-semibold flex items-center gap-1 hover:underline"
          >
            {t('dashboard.viewAll')} <span className="material-symbols-outlined text-xs">arrow_forward</span>
          </button>
        </div>

        {recentJobs.length === 0 ? (
          <EmptyState
            title={lang === 'tr' ? 'Henüz değerlendirme yok' : 'No evaluations yet'}
            message={lang === 'tr' ? 'Bir sınav PDF\'i yükleyerek ilk değerlendirmenizi başlatın.' : 'Upload an exam PDF and start your first evaluation.'}
            icon="school"
            action={{ label: t('dashboard.uploadExam'), onClick: () => navigate('/upload') }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-container-low/50 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                  <th className="px-6 py-4">{t('dashboard.table.exam')}</th>
                  <th className="px-6 py-4">{t('dashboard.table.course')}</th>
                  <th className="px-6 py-4">{t('dashboard.table.date')}</th>
                  <th className="px-6 py-4 text-center">{t('dashboard.table.students')}</th>
                  <th className="px-6 py-4">{t('dashboard.table.status')}</th>
                  <th className="px-6 py-4 text-right">{t('dashboard.table.action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-variant/10">
                {recentJobs.map((job) => {
                  const exam = examMap[job.exam_id];
                  return (
                    <tr key={job.id} className="hover:bg-surface-container-low/30 transition-colors">
                      <td className="px-6 py-4 font-medium text-on-surface max-w-xs truncate">
                        {exam?.title ?? <span className="text-outline italic">—</span>}
                      </td>
                      <td className="px-6 py-4 text-on-surface-variant">{exam?.course_name ?? '—'}</td>
                      <td className="px-6 py-4 text-on-surface-variant text-sm">
                        {new Date(job.created_at).toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-US', {
                          day: '2-digit', month: 'short', year: 'numeric',
                        })}
                      </td>
                      <td className="px-6 py-4 text-center text-sm">
                        {job.status === 'complete' ? job.total_students : job.processed_students > 0 ? `${job.processed_students}...` : '—'}
                      </td>
                      <td className="px-6 py-4">
                        <JobStatusBadge status={job.status} />
                      </td>
                      <td className="px-6 py-4 text-right">
                        {job.status === 'complete' ? (
                          <button onClick={() => navigate(`/results/${job.id}`)} className="text-primary-600 hover:text-primary-800 text-sm font-medium">
                            {t('dashboard.table.details')}
                          </button>
                        ) : ['ocr_running', 'layout_running', 'eval_running'].includes(job.status) ? (
                          <button onClick={() => navigate(`/jobs`)} className="text-primary-600 hover:text-primary-800 text-sm font-medium">
                            {t('nav.evaluations')}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
