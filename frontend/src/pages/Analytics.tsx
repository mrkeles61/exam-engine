import { useState, useEffect, useMemo } from 'react';
import api from '../api/client';
import { EvaluationJob, Exam, Stats, StudentResult } from '../types';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { useLang } from '../i18n';

const GRADE_ORDER = ['AA', 'BA', 'BB', 'CB', 'CC', 'DC', 'DD', 'FF'];
const gradeColor: Record<string, string> = {
  AA: 'bg-emerald-500', BA: 'bg-emerald-400', BB: 'bg-primary-500', CB: 'bg-primary-400',
  CC: 'bg-amber-500', DC: 'bg-amber-400', DD: 'bg-orange-500', FF: 'bg-red-500',
};
const gradeTextColor: Record<string, string> = {
  AA: 'text-emerald-700', BA: 'text-emerald-600', BB: 'text-primary-700', CB: 'text-primary-600',
  CC: 'text-amber-700', DC: 'text-amber-600', DD: 'text-orange-700', FF: 'text-red-700',
};

interface JobWithExam extends EvaluationJob {
  examTitle?: string;
  courseName?: string;
}

type ActiveFilter =
  | { kind: 'bucket'; bucket: number }
  | { kind: 'grade'; grade: string }
  | null;

export default function Analytics() {
  const { t } = useLang();
  const [jobs, setJobs] = useState<JobWithExam[]>([]);
  const [selectedJobId, setSelectedJobId] = useState('__all__');
  const [statsMap, setStatsMap] = useState<Record<string, Stats>>({});
  const [resultsMap, setResultsMap] = useState<Record<string, StudentResult[]>>({});
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>(null);
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const jobsRes = await api.get<EvaluationJob[]>('/jobs');
        const completed = jobsRes.data.filter((j) => j.status === 'complete');
        const enriched: JobWithExam[] = await Promise.all(
          completed.map(async (j) => {
            try {
              const exam = (await api.get<Exam>(`/upload/${j.exam_id}`)).data;
              return { ...j, examTitle: exam.title, courseName: exam.course_name };
            } catch {
              return { ...j, examTitle: t('analytics.unnamedExam'), courseName: t('analytics.unknownCourse') };
            }
          }),
        );
        setJobs(enriched);

        const sMap: Record<string, Stats> = {};
        const rMap: Record<string, StudentResult[]> = {};
        await Promise.all(
          enriched.map(async (j) => {
            try {
              const [sRes, rRes] = await Promise.all([
                api.get<Stats>(`/results/${j.id}/stats`),
                api.get<{ results: StudentResult[]; total: number }>(`/results/${j.id}`),
              ]);
              sMap[j.id] = sRes.data;
              rMap[j.id] = rRes.data.results;
            } catch { /* skip */ }
          }),
        );
        setStatsMap(sMap);
        setResultsMap(rMap);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  // Reset filters when the selected job changes
  useEffect(() => {
    setActiveFilter(null);
    setExpandedQuestion(null);
  }, [selectedJobId]);

  // Unfiltered stats/results
  const { stats, results: baseResults } = useMemo(() => {
    if (selectedJobId === '__all__') {
      const allResults = Object.values(resultsMap).flat();
      const allStats = Object.values(statsMap);
      if (allStats.length === 0) return { stats: null, results: [] };

      const totalStudents = allResults.length;
      const avgPct = totalStudents > 0 ? allResults.reduce((s, r) => s + r.total_pct, 0) / totalStudents : 0;
      const highest = totalStudents > 0 ? Math.max(...allResults.map((r) => r.total_pct)) : 0;
      const lowest = totalStudents > 0 ? Math.min(...allResults.map((r) => r.total_pct)) : 0;
      const variance = totalStudents > 0 ? allResults.reduce((s, r) => s + Math.pow(r.total_pct - avgPct, 2), 0) / totalStudents : 0;
      const stdDev = Math.sqrt(variance);
      const passingCount = allResults.filter((r) => r.total_pct >= 50).length;

      const gradeDist: Record<string, number> = {};
      GRADE_ORDER.forEach((g) => { gradeDist[g] = 0; });
      allResults.forEach((r) => { gradeDist[r.grade] = (gradeDist[r.grade] ?? 0) + 1; });

      const aggregated: Stats = {
        job_id: '__all__',
        total_students: totalStudents,
        average_pct: avgPct,
        highest_pct: highest,
        lowest_pct: lowest,
        std_deviation: stdDev,
        grade_distribution: gradeDist,
        passing_rate: totalStudents > 0 ? (passingCount / totalStudents) * 100 : 0,
      };
      return { stats: aggregated, results: allResults };
    }
    return { stats: statsMap[selectedJobId] ?? null, results: resultsMap[selectedJobId] ?? [] };
  }, [selectedJobId, statsMap, resultsMap]);

  // Histogram from ALL base results (always unfiltered — it's what we filter by)
  const histogram = useMemo(() => {
    const buckets = new Array(10).fill(0);
    baseResults.forEach((r) => {
      const idx = Math.min(Math.floor(r.total_pct / 10), 9);
      buckets[idx]++;
    });
    return buckets;
  }, [baseResults]);

  // Apply active filter for the downstream charts
  const results = useMemo(() => {
    if (!activeFilter) return baseResults;
    if (activeFilter.kind === 'bucket') {
      const lo = activeFilter.bucket * 10;
      const hi = activeFilter.bucket === 9 ? 101 : (activeFilter.bucket + 1) * 10;
      return baseResults.filter((r) => r.total_pct >= lo && r.total_pct < hi);
    }
    return baseResults.filter((r) => r.grade === activeFilter.grade);
  }, [baseResults, activeFilter]);

  // Question difficulty + correct counts per question
  const questionDifficulty = useMemo(() => {
    if (results.length === 0) return [];
    const qMap: Record<string, {
      total: number; count: number; type: string;
      correctCount: number; n: number; strugglingIds: { id: string; name: string; pct: number }[];
    }> = {};
    results.forEach((r) => {
      (r.answers ?? []).forEach((a) => {
        const key = `Q${a.question_number}`;
        if (!qMap[key]) {
          qMap[key] = {
            total: 0, count: 0,
            type: a.question_type === 'mc' ? 'MC' : 'Open',
            correctCount: 0, n: 0,
            strugglingIds: [],
          };
        }
        const pct = a.max_score > 0 ? (a.score / a.max_score) * 100 : 0;
        qMap[key].total += pct;
        qMap[key].count++;
        qMap[key].n++;
        if (pct >= 70) qMap[key].correctCount++;
        if (pct < 50) {
          qMap[key].strugglingIds.push({
            id: r.student_id,
            name: r.student_name,
            pct: Math.round(pct),
          });
        }
      });
    });
    return Object.entries(qMap)
      .map(([id, d]) => ({
        id,
        type: d.type,
        avg: Math.round(d.total / d.count),
        correctCount: d.correctCount,
        n: d.n,
        struggling: d.strugglingIds,
      }))
      .sort((a, b) => a.avg - b.avg);
  }, [results]);

  if (loading) return <LoadingSpinner text={t('analytics.loading')} fullPage />;

  const totalGraded = stats ? Object.values(stats.grade_distribution).reduce((a, b) => a + b, 0) : 0;
  const totalAll = baseResults.length;
  const selectedLabel = selectedJobId === '__all__'
    ? t('analytics.allCourses')
    : (jobs.find((j) => j.id === selectedJobId)?.examTitle ?? selectedJobId.slice(0, 8));

  // Filtered grade distribution (reflects active filter)
  const gradeDistFiltered: Record<string, number> = {};
  GRADE_ORDER.forEach((g) => { gradeDistFiltered[g] = 0; });
  results.forEach((r) => { gradeDistFiltered[r.grade] = (gradeDistFiltered[r.grade] ?? 0) + 1; });
  const totalFilteredGraded = Object.values(gradeDistFiltered).reduce((a, b) => a + b, 0);

  const filterLabel = activeFilter
    ? activeFilter.kind === 'bucket'
      ? `${activeFilter.bucket * 10}-${(activeFilter.bucket + 1) * 10}%`
      : activeFilter.grade
    : '';

  return (
    <div className="space-y-8 animate-fade-up pt-2">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="page-title">{t('analytics.title')}</h1>
          <p className="page-subtitle">{t('analytics.subtitle')}</p>
        </div>
        <select
          className="input max-w-xs"
          value={selectedJobId}
          onChange={(e) => setSelectedJobId(e.target.value)}
        >
          <option value="__all__">{t('analytics.allCoursesOption', { n: jobs.reduce((s, j) => s + j.total_students, 0) })}</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.examTitle || j.id.slice(0, 8)} — {j.courseName || t('analytics.unknown')} ({t('analytics.studentsCount', { n: j.total_students })})
            </option>
          ))}
          {jobs.length === 0 && <option value="" disabled>{t('analytics.noCompleted')}</option>}
        </select>
      </div>

      {stats && (
        <>
          {/* Metric Cards */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { label: t('analytics.totalStudents'), value: stats.total_students, icon: 'group', accent: 'border-primary-600', ic: 'text-primary-600/40' },
              { label: t('analytics.classAverage'), value: `${stats.average_pct.toFixed(1)}%`, icon: 'trending_up', accent: 'border-emerald-500', ic: 'text-emerald-500/40' },
              { label: t('analytics.passRate'), value: `${stats.passing_rate.toFixed(0)}%`, icon: 'school', accent: 'border-amber-500', ic: 'text-amber-500/40' },
              { label: t('analytics.stdDev'), value: `\u00B1${stats.std_deviation.toFixed(1)}%`, icon: 'query_stats', accent: 'border-purple-500', ic: 'text-purple-500/40' },
            ].map((m) => (
              <div
                key={m.label}
                className={`bg-surface-container-lowest p-6 rounded-xl border-l-4 ${m.accent} shadow-card hover:-translate-y-0.5 hover:shadow-lg transition-all cursor-default`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="label-xs">{m.label}</span>
                  <span className={`material-symbols-outlined ${m.ic}`}>{m.icon}</span>
                </div>
                <span className="text-3xl font-semibold text-on-surface">{m.value}</span>
              </div>
            ))}
          </section>

          {/* Score Distribution Histogram */}
          <section className="bg-surface-container-lowest rounded-xl p-6 shadow-card hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-1">
              <h3 className="font-semibold text-on-surface">{t('analytics.scoreDistribution')}</h3>
              <span className="text-[10px] text-on-surface-variant italic">{t('analytics.clickHintBucket')}</span>
            </div>
            <p className="text-xs text-on-surface-variant mb-6">
              n={stats.total_students} &middot; {t('analytics.mean')}: {stats.average_pct.toFixed(1)}% &middot; &sigma;: {stats.std_deviation.toFixed(1)}%
              {selectedJobId !== '__all__' && <> &middot; {selectedLabel}</>}
            </p>
            {(() => {
              const maxBucket = Math.max(...histogram, 1);
              return (
                <div className="flex items-end gap-2" style={{ height: 200 }}>
                  {histogram.map((count, i) => {
                    const heightPx = maxBucket > 0 ? Math.max((count / maxBucket) * 140, count > 0 ? 6 : 2) : 2;
                    const range = `${i * 10}-${(i + 1) * 10}%`;
                    const color = i < 3 ? 'bg-red-400' : i < 7 ? 'bg-primary-500' : 'bg-emerald-500';
                    const pct = totalAll > 0 ? ((count / totalAll) * 100).toFixed(1) : '0.0';
                    const isActive = activeFilter?.kind === 'bucket' && activeFilter.bucket === i;
                    return (
                      <div
                        key={i}
                        className="flex-1 flex flex-col items-center justify-end h-full group relative cursor-pointer"
                        onClick={() => {
                          if (isActive) setActiveFilter(null);
                          else setActiveFilter({ kind: 'bucket', bucket: i });
                        }}
                      >
                        {/* Tooltip */}
                        <div className="pointer-events-none absolute bottom-full mb-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-20 whitespace-nowrap">
                          <div className="bg-gray-900 text-white text-[11px] font-medium px-2.5 py-1.5 rounded-lg shadow-lg">
                            {t('analytics.tooltip.studentsInRange', { count, range, pct })}
                          </div>
                        </div>
                        <span className="text-[10px] text-on-surface-variant font-medium mb-1">{count}</span>
                        <div
                          className={`w-full rounded-t transition-all duration-200 ${count > 0 ? color : 'bg-surface-container-high'} group-hover:brightness-110 ${isActive ? 'ring-2 ring-primary-500 ring-offset-1' : ''}`}
                          style={{ height: heightPx, transform: `translateY(0)` }}
                        />
                        <div className="w-full h-0 group-hover:h-[6px] transition-all duration-200" />
                        <span className="text-[9px] text-on-surface-variant mt-1.5">{range}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </section>

          {/* Filter pill */}
          {activeFilter && (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-2 bg-primary-50 text-primary-700 border border-primary-200 text-xs font-medium px-3 py-1.5 rounded-full">
                <span>{t('analytics.filter.label')}: {filterLabel}</span>
                <button
                  onClick={() => setActiveFilter(null)}
                  className="text-primary-600 hover:text-primary-900 underline"
                >
                  {t('analytics.filter.clear')}
                </button>
              </span>
              <span className="text-xs text-on-surface-variant">
                {t('analytics.studentsCount', { n: results.length })}
              </span>
            </div>
          )}

          {/* Question Difficulty */}
          {questionDifficulty.length > 0 && (
            <section className="bg-surface-container-lowest rounded-xl p-6 shadow-card hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-6">
                <h3 className="font-semibold text-on-surface">{t('analytics.questionDifficulty')}</h3>
                <span className="text-[10px] text-on-surface-variant italic">{t('analytics.clickHintQuestion')}</span>
              </div>
              <div className="space-y-2">
                {questionDifficulty.map((q) => {
                  const qNum = q.id.replace(/^Q/, '');
                  const isExpanded = expandedQuestion === q.id;
                  return (
                    <div key={q.id} className="group">
                      <div
                        className="flex items-center gap-4 py-2 px-2 -mx-2 rounded-lg hover:bg-surface-container-low hover:translate-x-1 transition-all duration-150 cursor-pointer relative"
                        onClick={() => setExpandedQuestion(isExpanded ? null : q.id)}
                      >
                        {/* Tooltip */}
                        <div className="pointer-events-none absolute -top-8 left-20 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-20 whitespace-nowrap">
                          <div className="bg-gray-900 text-white text-[11px] font-medium px-2.5 py-1.5 rounded-lg shadow-lg">
                            {t('analytics.tooltip.questionStats', {
                              n: qNum, type: q.type, correct: q.correctCount, total: q.n, avg: q.avg,
                            })}
                          </div>
                        </div>
                        <span className="text-xs font-medium text-on-surface-variant w-20 shrink-0 flex items-center gap-1">
                          <span className={`material-symbols-outlined text-[14px] transition-transform ${isExpanded ? 'rotate-90' : ''}`}>chevron_right</span>
                          {q.id} ({q.type})
                        </span>
                        <div className="flex-1 h-6 bg-surface-container-low rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${q.avg < 40 ? 'bg-red-500' : q.avg < 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                            style={{ width: `${q.avg}%` }}
                          />
                        </div>
                        <span className={`text-xs font-bold w-10 text-right ${q.avg < 40 ? 'text-red-600' : q.avg < 70 ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {q.avg}%
                        </span>
                      </div>
                      {isExpanded && (
                        <div className="mt-1 mb-2 ml-24 border-l-2 border-primary-200 pl-4 py-2">
                          <p className="text-[11px] uppercase tracking-wider text-on-surface-variant font-semibold mb-2">
                            {t('analytics.questionStruggling')}
                          </p>
                          {q.struggling.length === 0 ? (
                            <p className="text-xs text-on-surface-variant italic">{t('analytics.noStruggling')}</p>
                          ) : (
                            <div className="overflow-y-auto" style={{ maxHeight: 200 }}>
                              <ul className="space-y-1">
                                {q.struggling.map((s) => (
                                  <li key={s.id} className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-surface-container-low">
                                    <span className="text-on-surface">
                                      <span className="font-mono text-on-surface-variant mr-2">{s.id}</span>
                                      {s.name}
                                    </span>
                                    <span className="font-semibold text-red-600">{s.pct}%</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* AI Insights */}
          <section className="bg-primary-50 rounded-xl p-6 shadow-card border border-primary-100 hover:shadow-lg transition-shadow">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-primary-600">auto_awesome</span>
              </div>
              <div>
                <h3 className="font-semibold text-primary-900">{t('analytics.aiInsights')}</h3>
                <p className="text-[10px] text-primary-600 uppercase tracking-wider font-medium">{t('analytics.generatedBy')}</p>
              </div>
            </div>
            <blockquote className="text-sm leading-relaxed text-primary-900/80 space-y-2 mb-4">
              <p className="font-medium">{selectedJobId !== '__all__' ? t('analytics.keyFindingsFor', { label: selectedLabel }) : t('analytics.keyFindingsAll')}</p>
              <ul className="space-y-1 text-xs">
                {stats.average_pct < 50 && (
                  <li className="group flex items-start gap-2 px-2 py-1 -mx-2 rounded transition-colors hover:bg-primary-100/50">
                    <span className="material-symbols-outlined text-[14px] text-primary-500 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">info</span>
                    <span className="flex-1">{t('analytics.insight.belowPassing', { pct: stats.average_pct.toFixed(1) })}</span>
                  </li>
                )}
                {stats.passing_rate < 60 && (
                  <li className="group flex items-start gap-2 px-2 py-1 -mx-2 rounded transition-colors hover:bg-primary-100/50">
                    <span className="material-symbols-outlined text-[14px] text-primary-500 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">info</span>
                    <span className="flex-1">{t('analytics.insight.lowPassRate', { pct: stats.passing_rate.toFixed(0) })}</span>
                  </li>
                )}
                {stats.std_deviation > 20 && (
                  <li className="group flex items-start gap-2 px-2 py-1 -mx-2 rounded transition-colors hover:bg-primary-100/50">
                    <span className="material-symbols-outlined text-[14px] text-primary-500 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">info</span>
                    <span className="flex-1">{t('analytics.insight.highVariance', { sigma: stats.std_deviation.toFixed(1) })}</span>
                  </li>
                )}
                {stats.std_deviation < 5 && stats.total_students > 5 && (
                  <li className="group flex items-start gap-2 px-2 py-1 -mx-2 rounded transition-colors hover:bg-primary-100/50">
                    <span className="material-symbols-outlined text-[14px] text-primary-500 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">info</span>
                    <span className="flex-1">{t('analytics.insight.lowVariance', { sigma: stats.std_deviation.toFixed(1) })}</span>
                  </li>
                )}
                <li className="group flex items-start gap-2 px-2 py-1 -mx-2 rounded transition-colors hover:bg-primary-100/50">
                  <span className="material-symbols-outlined text-[14px] text-primary-500 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">info</span>
                  <span className="flex-1">{t('analytics.insight.belowPassCount', { n: Math.round(stats.total_students * (1 - stats.passing_rate / 100)) })}</span>
                </li>
                {questionDifficulty.length > 0 && questionDifficulty[0].avg < 40 && (
                  <li className="group flex items-start gap-2 px-2 py-1 -mx-2 rounded transition-colors hover:bg-primary-100/50">
                    <span className="material-symbols-outlined text-[14px] text-primary-500 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">info</span>
                    <span className="flex-1">{t('analytics.insight.hardestQuestion', { id: questionDifficulty[0].id, avg: questionDifficulty[0].avg })}</span>
                  </li>
                )}
              </ul>
            </blockquote>
            <button className="text-xs font-semibold text-primary-600 hover:text-primary-800 flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">refresh</span> {t('analytics.regenerate')}
            </button>
          </section>

          {/* Grade Distribution */}
          <section className="bg-surface-container-lowest rounded-xl p-6 shadow-card hover:shadow-md transition-shadow">
            <h3 className="font-semibold text-on-surface mb-6">{t('analytics.gradeDistribution')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-3">
                {GRADE_ORDER.map((grade) => {
                  const count = gradeDistFiltered[grade] ?? 0;
                  const maxCount = Math.max(...GRADE_ORDER.map((g) => gradeDistFiltered[g] ?? 0), 1);
                  const barPct = count > 0 ? Math.max((count / maxCount) * 100, 8) : 0;
                  const pct = totalFilteredGraded > 0 ? ((count / totalFilteredGraded) * 100).toFixed(1) : '0.0';
                  const isActive = activeFilter?.kind === 'grade' && activeFilter.grade === grade;
                  return (
                    <div
                      key={grade}
                      className="group relative flex items-center gap-3 cursor-pointer py-1 px-2 -mx-2 rounded-lg hover:bg-surface-container-low transition-colors"
                      onClick={() => {
                        if (isActive) setActiveFilter(null);
                        else setActiveFilter({ kind: 'grade', grade });
                      }}
                    >
                      {/* Tooltip */}
                      <div className="pointer-events-none absolute -top-8 left-12 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-20 whitespace-nowrap">
                        <div className="bg-gray-900 text-white text-[11px] font-medium px-2.5 py-1.5 rounded-lg shadow-lg">
                          {t('analytics.tooltip.gradeStudents', { count, pct })}
                        </div>
                      </div>
                      <span className={`text-xs font-bold w-8 ${gradeTextColor[grade] ?? 'text-on-surface-variant'}`}>{grade}</span>
                      <div className="flex-1 h-5 bg-surface-container-low rounded-full overflow-hidden">
                        {count > 0 && (
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${gradeColor[grade] ?? 'bg-gray-400'} group-hover:brightness-110 ${isActive ? 'ring-2 ring-primary-500' : ''}`}
                            style={{ width: `${barPct}%` }}
                          />
                        )}
                      </div>
                      <span className="text-xs text-on-surface-variant w-8 text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
              <div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest border-b border-surface-variant/20">
                      <th className="py-2 text-left">{t('analytics.col.grade')}</th>
                      <th className="py-2 text-right">{t('analytics.col.count')}</th>
                      <th className="py-2 text-right">{t('analytics.col.percentage')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-variant/10">
                    {GRADE_ORDER.map((grade) => {
                      const count = activeFilter ? (gradeDistFiltered[grade] ?? 0) : (stats.grade_distribution[grade] ?? 0);
                      const denom = activeFilter ? totalFilteredGraded : totalGraded;
                      const pct = denom > 0 ? ((count / denom) * 100).toFixed(1) : '0.0';
                      return (
                        <tr key={grade} className="hover:bg-surface-container-low transition-colors">
                          <td className={`py-2 font-bold ${gradeTextColor[grade]}`}>{grade}</td>
                          <td className="py-2 text-right text-on-surface">{count}</td>
                          <td className="py-2 text-right text-on-surface-variant">{pct}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      )}

      {!stats && jobs.length === 0 && (
        <div className="text-center py-16">
          <span className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-4 block">analytics</span>
          <p className="text-on-surface-variant">{t('analytics.emptyHint')}</p>
        </div>
      )}
    </div>
  );
}
