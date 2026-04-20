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
import { useLang } from '../i18n';

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
  const { t } = useLang();

  const [results,   setResults]   = useState<StudentResult[]>([]);
  const [stats,     setStats]     = useState<Stats | null>(null);
  const [search,    setSearch]    = useState('');
  const [sortCol,   setSortCol]   = useState<'name' | 'total_pct' | 'mc_score' | 'open_score'>('total_pct');
  const [sortDir,   setSortDir]   = useState<'asc' | 'desc'>('desc');
  const [loading,   setLoading]   = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error,     setError]     = useState('');
  const [gradeFilter, setGradeFilter] = useState<string | null>(null);

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
        t('results.loadFailed');
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
    if (gradeFilter) {
      rows = rows.filter((r) => r.grade === gradeFilter);
    }
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
  }, [results, search, sortCol, sortDir, gradeFilter]);

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
      toastError(t('results.exportFailed'));
    } finally {
      setExporting(false);
    }
  };

  const SortIcon = ({ col }: { col: typeof sortCol }) => {
    if (sortCol !== col) return <span className="opacity-30 ml-1">↕</span>;
    return <span className="ml-1 text-primary-600">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  if (loading) return <LoadingSpinner text={t('results.loading')} fullPage />;

  if (error) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate('/jobs')} className="btn-secondary">{t('results.backToJobs')}</button>
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
  const totalGrades = stats
    ? GRADE_ORDER.reduce((s, g) => s + (stats.grade_distribution[g] ?? 0), 0)
    : 0;

  const classAvg = stats?.average_pct ?? 0;

  return (
    <div className="space-y-7 animate-fade-up">
      {/* Breadcrumbs */}
      <Breadcrumbs
        items={[
          { label: t('nav.dashboard'), to: '/' },
          { label: t('nav.evaluations'), to: '/jobs' },
          { label: t('results.crumb') },
        ]}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="page-title">{t('results.title')}</h1>
          <p className="text-xs text-gray-400 font-mono mt-1">{jobId}</p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="btn-secondary shrink-0"
        >
          {exporting ? (
            <><LoadingSpinner size="sm" text="" /> {t('results.exporting')}</>
          ) : (
            <>{t('results.exportCsv')}</>
          )}
        </button>
      </div>

      {/* Demo banner */}
      <DemoBanner />

      {/* Metric cards — wrapped with tactile hover */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="hover:-translate-y-0.5 hover:shadow-lg transition-all rounded-xl">
            <MetricCard
              label={t('results.metric.average')}
              value={`${stats.average_pct.toFixed(1)}%`}
              sub={t('results.studentsCount', { n: stats.total_students })}
              icon="📊" accent="blue"
            />
          </div>
          <div className="hover:-translate-y-0.5 hover:shadow-lg transition-all rounded-xl">
            <MetricCard
              label={t('results.metric.highest')}
              value={`${stats.highest_pct.toFixed(1)}%`}
              icon="🏆" accent="green"
            />
          </div>
          <div className="hover:-translate-y-0.5 hover:shadow-lg transition-all rounded-xl">
            <MetricCard
              label={t('results.metric.lowest')}
              value={`${stats.lowest_pct.toFixed(1)}%`}
              icon="📉" accent="yellow"
            />
          </div>
          <div className="hover:-translate-y-0.5 hover:shadow-lg transition-all rounded-xl">
            <MetricCard
              label={t('results.metric.stdDev')}
              value={`±${stats.std_deviation.toFixed(1)}%`}
              sub={t('results.passedPct', { n: stats.passing_rate.toFixed(0) })}
              icon="📐" accent="purple"
            />
          </div>
        </div>
      )}

      {/* Grade distribution bar chart — interactive */}
      {stats && (
        <div className="card p-5 hover:shadow-md transition-shadow">
          <h3 className="font-semibold text-gray-900 font-jakarta mb-4">{t('results.gradeDistribution')}</h3>
          <div className="flex items-end gap-3 h-32">
            {GRADE_ORDER.map((grade) => {
              const count = stats.grade_distribution[grade] ?? 0;
              const heightPct = count > 0 ? Math.max((count / maxGradeCount) * 100, 8) : 0;
              const color = gradeBarColor[grade] ?? 'bg-gray-400';
              const pct = totalGrades > 0 ? ((count / totalGrades) * 100).toFixed(1) : '0.0';
              const isActive = gradeFilter === grade;
              return (
                <div
                  key={grade}
                  className="group relative flex-1 flex flex-col items-center gap-1.5 cursor-pointer"
                  onClick={() => setGradeFilter(isActive ? null : grade)}
                >
                  {/* Tooltip */}
                  <div className="pointer-events-none absolute bottom-full mb-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-20 whitespace-nowrap">
                    <div className="bg-gray-900 text-white text-[11px] font-medium px-2.5 py-1.5 rounded-lg shadow-lg">
                      {t('results.tooltip.gradeStudents', { count, pct })}
                    </div>
                  </div>
                  {count > 0 && (
                    <span className="text-xs font-semibold text-gray-600">{count}</span>
                  )}
                  <div className="w-full rounded-t-lg overflow-hidden"
                       style={{ height: '80px', display: 'flex', alignItems: 'flex-end' }}>
                    <div
                      className={`w-full rounded-t-lg transition-all duration-200 ${
                        count > 0 ? color : 'bg-gray-100'
                      } group-hover:brightness-110 ${isActive ? 'ring-2 ring-primary-500 ring-offset-1' : ''}`}
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

      {/* Filter pill */}
      {gradeFilter && (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 bg-primary-50 text-primary-700 border border-primary-200 text-xs font-medium px-3 py-1.5 rounded-full">
            <span>{t('results.filter.label')}: {gradeFilter}</span>
            <button
              onClick={() => setGradeFilter(null)}
              className="text-primary-600 hover:text-primary-900 underline"
            >
              {t('results.filter.clear')}
            </button>
          </span>
          <span className="text-xs text-gray-500">
            {t('results.studentsCount', { n: filtered.length })}
          </span>
        </div>
      )}

      {/* Results table */}
      <div className="card hover:shadow-md transition-shadow">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between
                        px-5 py-4 border-b border-gray-100 gap-3">
          <h2 className="font-semibold text-gray-900 font-jakarta shrink-0">
            {t('results.studentsHeader', { n: filtered.length })}
          </h2>
          <input
            type="text"
            className="input max-w-xs text-sm"
            placeholder={t('results.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title={search ? t('results.empty.noMatch') : t('results.empty.none')}
            message={search ? t('results.empty.tryDiffQuery') : t('results.empty.noStudents')}
            icon="🔍"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th w-10">#</th>
                  <th className="table-th">{t('workspace.studentNumber')}</th>
                  <th
                    className="table-th cursor-pointer hover:text-primary-600 transition-colors select-none"
                    onClick={() => handleSort('name')}
                  >
                    {t('results.col.name')} <SortIcon col="name" />
                  </th>
                  <th
                    className="table-th cursor-pointer hover:text-primary-600 transition-colors select-none"
                    onClick={() => handleSort('mc_score')}
                  >
                    {t('results.col.mcScore')} <SortIcon col="mc_score" />
                  </th>
                  <th
                    className="table-th cursor-pointer hover:text-primary-600 transition-colors select-none"
                    onClick={() => handleSort('open_score')}
                  >
                    {t('results.col.openScore')} <SortIcon col="open_score" />
                  </th>
                  <th
                    className="table-th cursor-pointer hover:text-primary-600 transition-colors select-none"
                    onClick={() => handleSort('total_pct')}
                  >
                    {t('results.col.totalPct')} <SortIcon col="total_pct" />
                  </th>
                  <th className="table-th">{t('results.col.grade')}</th>
                  <th className="table-th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((r, idx) => {
                  const delta = r.total_pct - classAvg;
                  const deltaAbs = Math.abs(delta).toFixed(1);
                  const cmpKey = delta > 0.05
                    ? 'results.compareAvg.above'
                    : delta < -0.05
                      ? 'results.compareAvg.below'
                      : 'results.compareAvg.equal';
                  const cmpText = t(cmpKey as 'results.compareAvg.above', { delta: deltaAbs });
                  return (
                    <tr
                      key={r.id}
                      className="hover:bg-primary-50/40 cursor-pointer transition-colors"
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
                        <div className="group relative flex items-center gap-2">
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
                          {/* Compare vs class average tooltip */}
                          <div className="pointer-events-none absolute left-0 top-full mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-20 whitespace-nowrap">
                            <div className={`text-[10px] font-medium px-2 py-1 rounded shadow-lg ${
                              delta > 0.05 ? 'bg-emerald-600 text-white'
                              : delta < -0.05 ? 'bg-red-600 text-white'
                              : 'bg-gray-700 text-white'
                            }`}>
                              {cmpText}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="table-td"><GradeBadge grade={r.grade} /></td>
                      <td className="table-td">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/results/${jobId}/student/${r.student_id}`);
                          }}
                          className="text-xs text-primary-500 hover:text-primary-700 font-medium transition-colors"
                        >
                          {t('results.detailArrow')}
                        </button>
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
