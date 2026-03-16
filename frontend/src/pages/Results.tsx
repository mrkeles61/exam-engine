import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { StudentResult, Stats } from '../types';
import { MetricCard } from '../components/MetricCard';
import { GradeBadge } from '../components/StatusBadge';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { DemoBanner } from '../components/DemoBanner';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { useToast } from '../contexts/ToastContext';

const GRADE_ORDER = ['AA', 'BA', 'BB', 'CB', 'CC', 'DC', 'DD', 'FF'];

const gradeBarColor: Record<string, string> = {
  AA: 'bg-emerald-500', BA: 'bg-emerald-400',
  BB: 'bg-primary-500', CB: 'bg-primary-400',
  CC: 'bg-amber-500',   DC: 'bg-amber-400',
  DD: 'bg-orange-500',  FF: 'bg-red-500',
};

export default function Results() {
  const { jobId }  = useParams<{ jobId: string }>();
  const navigate   = useNavigate();
  const { error: toastError } = useToast();

  const [results,   setResults]   = useState<StudentResult[]>([]);
  const [stats,     setStats]     = useState<Stats | null>(null);
  const [search,    setSearch]    = useState('');
  const [sortCol,   setSortCol]   = useState<'name' | 'total_pct' | 'mc_score' | 'open_score'>('total_pct');
  const [sortDir,   setSortDir]   = useState<'asc' | 'desc'>('desc');
  const [loading,   setLoading]   = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error,     setError]     = useState('');

  useEffect(() => { if (jobId) fetchData(); }, [jobId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resultsRes, statsRes] = await Promise.all([
        api.get<{ results: StudentResult[]; total: number }>(`/results/${jobId}`),
        api.get<Stats>(`/results/${jobId}/stats`),
      ]);
      setResults(resultsRes.data.results);
      setStats(statsRes.data);
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Sonuçlar yüklenemedi.';
      setError(detail);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(col); setSortDir('desc'); }
  };

  const filtered = useMemo(() => {
    let rows = results;
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) => r.student_id.toLowerCase().includes(q) || r.student_name.toLowerCase().includes(q),
      );
    }
    return [...rows].sort((a, b) => {
      let av: number | string, bv: number | string;
      if (sortCol === 'name')       { av = a.student_name; bv = b.student_name; }
      else if (sortCol === 'total_pct') { av = a.total_pct; bv = b.total_pct; }
      else if (sortCol === 'mc_score')  { av = a.mc_score;  bv = b.mc_score;  }
      else                              { av = a.open_score; bv = b.open_score; }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [results, search, sortCol, sortDir]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await api.get(`/results/${jobId}/export`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data as BlobPart]));
      const a   = document.createElement('a');
      a.href = url;
      a.download = `sonuclar_${jobId}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toastError('CSV dışa aktarımı başarısız oldu.');
    } finally {
      setExporting(false);
    }
  };

  const SortIcon = ({ col }: { col: typeof sortCol }) => {
    if (sortCol !== col) return <span className="opacity-30 ml-1">↕</span>;
    return <span className="ml-1 text-primary-600">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  if (loading) return <LoadingSpinner text="Sonuçlar yükleniyor…" fullPage />;

  if (error) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate('/jobs')} className="btn-secondary">← İşlere dön</button>
        <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
          <span className="text-red-500">⚠</span>
          <p className="text-sm text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  const maxGradeCount = stats
    ? Math.max(...GRADE_ORDER.map((g) => stats.grade_distribution[g] ?? 0), 1)
    : 1;

  return (
    <div className="space-y-7 animate-fade-up">
      {/* Breadcrumbs */}
      <Breadcrumbs
        items={[
          { label: 'Pano', to: '/' },
          { label: 'Değerlendirmeler', to: '/jobs' },
          { label: 'Sonuçlar' },
        ]}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Değerlendirme Sonuçları</h1>
          <p className="text-xs text-gray-400 font-mono mt-1">{jobId}</p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="btn-secondary shrink-0"
        >
          {exporting ? (
            <><LoadingSpinner size="sm" text="" /> Aktarılıyor…</>
          ) : (
            <>⬇ CSV İndir</>
          )}
        </button>
      </div>

      {/* Demo banner */}
      <DemoBanner />

      {/* Metric cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Ortalama Puan"
            value={`${stats.average_pct.toFixed(1)}%`}
            sub={`${stats.total_students} öğrenci`}
            icon="📊" accent="blue"
          />
          <MetricCard
            label="En Yüksek Puan"
            value={`${stats.highest_pct.toFixed(1)}%`}
            icon="🏆" accent="green"
          />
          <MetricCard
            label="En Düşük Puan"
            value={`${stats.lowest_pct.toFixed(1)}%`}
            icon="📉" accent="yellow"
          />
          <MetricCard
            label="Standart Sapma"
            value={`±${stats.std_deviation.toFixed(1)}%`}
            sub={`${stats.passing_rate.toFixed(0)}% geçti`}
            icon="📐" accent="purple"
          />
        </div>
      )}

      {/* Grade distribution bar chart */}
      {stats && (
        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 font-jakarta mb-4">Not Dağılımı</h3>
          <div className="flex items-end gap-3 h-28">
            {GRADE_ORDER.map((grade) => {
              const count = stats.grade_distribution[grade] ?? 0;
              const heightPct = count > 0 ? Math.max((count / maxGradeCount) * 100, 8) : 0;
              const color = gradeBarColor[grade] ?? 'bg-gray-400';
              return (
                <div key={grade} className="flex-1 flex flex-col items-center gap-1.5">
                  {count > 0 && (
                    <span className="text-xs font-semibold text-gray-600">{count}</span>
                  )}
                  <div className="w-full rounded-t-lg overflow-hidden"
                       style={{ height: '80px', display: 'flex', alignItems: 'flex-end' }}>
                    <div
                      className={`w-full rounded-t-lg transition-all duration-700 ${
                        count > 0 ? color : 'bg-gray-100'
                      }`}
                      style={{ height: `${heightPct}%` }}
                    />
                  </div>
                  <GradeBadge grade={grade} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Results table */}
      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between
                        px-5 py-4 border-b border-gray-100 gap-3">
          <h2 className="font-semibold text-gray-900 font-jakarta shrink-0">
            Öğrenciler ({filtered.length})
          </h2>
          <input
            type="text"
            className="input max-w-xs text-sm"
            placeholder="Ad veya numara ile ara…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title={search ? 'Eşleşen öğrenci yok' : 'Sonuç yok'}
            message={search ? 'Arama teriminizi değiştirmeyi deneyin.' : 'Bu iş için öğrenci sonucu bulunamadı.'}
            icon="🔍"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th w-10">#</th>
                  <th className="table-th">Öğrenci No</th>
                  <th
                    className="table-th cursor-pointer hover:text-gray-700 select-none"
                    onClick={() => handleSort('name')}
                  >
                    Ad Soyad <SortIcon col="name" />
                  </th>
                  <th
                    className="table-th cursor-pointer hover:text-gray-700 select-none"
                    onClick={() => handleSort('mc_score')}
                  >
                    ÇS Puanı <SortIcon col="mc_score" />
                  </th>
                  <th
                    className="table-th cursor-pointer hover:text-gray-700 select-none"
                    onClick={() => handleSort('open_score')}
                  >
                    Açık Puan <SortIcon col="open_score" />
                  </th>
                  <th
                    className="table-th cursor-pointer hover:text-gray-700 select-none"
                    onClick={() => handleSort('total_pct')}
                  >
                    Toplam % <SortIcon col="total_pct" />
                  </th>
                  <th className="table-th">Not</th>
                  <th className="table-th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((r, idx) => (
                  <tr
                    key={r.id}
                    className="hover:bg-primary-50/30 cursor-pointer transition-colors"
                    onClick={() => navigate(`/results/${jobId}/student/${r.student_id}`)}
                  >
                    <td className="table-td text-gray-400 text-xs">{idx + 1}</td>
                    <td className="table-td font-mono text-xs text-gray-600">{r.student_id}</td>
                    <td className="table-td font-medium text-gray-900">{r.student_name}</td>
                    <td className="table-td">
                      {r.mc_total > 0
                        ? <span className="text-gray-700">{r.mc_score}/{r.mc_total}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="table-td">
                      {r.open_total > 0
                        ? <span className="text-gray-700">{r.open_score.toFixed(1)}/{r.open_total}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="table-td">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden hidden sm:block">
                          <div
                            className={`h-full rounded-full ${
                              r.total_pct >= 70 ? 'bg-emerald-500'
                              : r.total_pct >= 50 ? 'bg-amber-400'
                              : 'bg-red-400'
                            }`}
                            style={{ width: `${r.total_pct}%` }}
                          />
                        </div>
                        <span className="font-semibold text-gray-800">
                          {r.total_pct.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="table-td"><GradeBadge grade={r.grade} /></td>
                    <td className="table-td">
                      <span className="text-xs text-primary-500 font-medium">Detay →</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
