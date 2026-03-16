import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { EvaluationJob, Exam, Stats } from '../types';
import { MetricCard } from '../components/MetricCard';
import { JobStatusBadge } from '../components/StatusBadge';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';

// Simple count-up hook
function useCountUp(target: number, duration = 1200): number {
  const [count, setCount] = useState(0);
  const prevTarget = useRef(0);

  useEffect(() => {
    if (target === prevTarget.current) return;
    prevTarget.current = target;
    if (target === 0) { setCount(0); return; }

    let start = 0;
    const startTime = performance.now();
    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setCount(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    return () => { start = target; };
  }, [target, duration]);

  return count;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [jobs,    setJobs]    = useState<EvaluationJob[]>([]);
  const [examMap, setExamMap] = useState<Record<string, Exam>>({});
  const [avgScore, setAvgScore] = useState<number | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  useEffect(() => { fetchDashboard(); }, []);

  const fetchDashboard = async () => {
    try {
      const jobsRes = await api.get<EvaluationJob[]>('/jobs');
      const allJobs = jobsRes.data;
      setJobs(allJobs);

      const recentJobs    = allJobs.slice(0, 5);
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
      setError('Dashboard verileri yüklenemedi. Backend çalışıyor mu?');
    } finally {
      setLoading(false);
    }
  };

  const totalEvals       = jobs.length;
  const studentsEvaluated = jobs
    .filter((j) => j.status === 'complete')
    .reduce((s, j) => s + j.total_students, 0);
  const activeJobs   = jobs.filter((j) => !['complete', 'failed'].includes(j.status)).length;
  const completedJobs = jobs.filter((j) => j.status === 'complete').length;
  const recentJobs   = jobs.slice(0, 5);

  // Animated counts
  const countEvals    = useCountUp(totalEvals);
  const countStudents = useCountUp(studentsEvaluated);
  const countActive   = useCountUp(activeJobs);

  if (loading) return <LoadingSpinner text="Yükleniyor…" fullPage />;

  return (
    <div className="space-y-8 animate-fade-up">
      {/* Page header */}
      <div className="page-header">
        <h1 className="page-title">Pano</h1>
        <p className="page-subtitle">Tüm değerlendirmeler ve aktivitelere genel bakış</p>
      </div>

      {error && (
        <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
          <span className="text-red-500 mt-0.5">⚠</span>
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Toplam Değerlendirme"
          value={countEvals}
          icon="📄"
          accent="blue"
        />
        <MetricCard
          label="Değerlendirilen Öğrenci"
          value={countStudents}
          sub={`${completedJobs} tamamlanan sınav`}
          icon="👥"
          accent="green"
        />
        <MetricCard
          label="Ortalama Puan"
          value={avgScore !== null ? `${avgScore.toFixed(1)}%` : '—'}
          sub="Son sınav"
          icon="📊"
          accent="purple"
        />
        <MetricCard
          label="Aktif İşler"
          value={countActive}
          sub={activeJobs > 0 ? 'Devam ediyor' : 'Tümü boşta'}
          icon="⚙️"
          accent="yellow"
        />
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: 'Sınav Yükle',          icon: '📤', to: '/upload',       color: 'bg-primary-600 hover:bg-primary-700 text-white' },
          { label: 'Cevap Anahtarı Oluştur', icon: '🔑', to: '/answer-keys', color: 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200' },
          { label: 'İşleri Görüntüle',     icon: '📋', to: '/jobs',         color: 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200' },
        ].map((q) => (
          <button
            key={q.to}
            onClick={() => navigate(q.to)}
            className={`flex items-center gap-3 px-4 py-3.5 rounded-xl font-medium text-sm
                        shadow-card transition-all duration-150 ${q.color}`}
          >
            <span className="text-xl">{q.icon}</span>
            <span>{q.label}</span>
            <span className="ml-auto opacity-60">→</span>
          </button>
        ))}
      </div>

      {/* Recent evaluations */}
      <div className="card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 font-jakarta">Son Değerlendirmeler</h2>
          <button
            onClick={() => navigate('/jobs')}
            className="text-xs text-primary-600 hover:text-primary-700 font-medium transition-colors"
          >
            Tümünü gör →
          </button>
        </div>

        {recentJobs.length === 0 ? (
          <EmptyState
            title="Henüz değerlendirme yok"
            message="Sınav PDF'i yükleyin ve ilk değerlendirmeyi başlatın."
            icon="🎓"
            action={{ label: 'Sınav Yükle', onClick: () => navigate('/upload') }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th">Sınav</th>
                  <th className="table-th">Ders</th>
                  <th className="table-th">Tarih</th>
                  <th className="table-th">Öğrenci</th>
                  <th className="table-th">Durum</th>
                  <th className="table-th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentJobs.map((job) => {
                  const exam = examMap[job.exam_id];
                  return (
                    <tr key={job.id} className="hover:bg-primary-50/30 transition-colors">
                      <td className="table-td font-medium text-gray-900 max-w-xs truncate">
                        {exam?.title ?? <span className="text-gray-400 italic">İsimsiz</span>}
                      </td>
                      <td className="table-td text-gray-500">{exam?.course_name ?? '—'}</td>
                      <td className="table-td text-gray-500">
                        {new Date(job.created_at).toLocaleDateString('tr-TR', {
                          day: '2-digit', month: 'short', year: 'numeric',
                        })}
                      </td>
                      <td className="table-td">
                        {job.status === 'complete'
                          ? `${job.total_students} öğrenci`
                          : job.processed_students > 0
                          ? `${job.processed_students}…`
                          : '—'}
                      </td>
                      <td className="table-td">
                        <JobStatusBadge status={job.status} />
                      </td>
                      <td className="table-td">
                        {job.status === 'complete' && (
                          <button
                            onClick={() => navigate(`/results/${job.id}`)}
                            className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                          >
                            Sonuçlar →
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
