import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { StudentResult, AnswerDetail } from '../types';
import { GradeBadge } from '../components/StatusBadge';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { Breadcrumbs } from '../components/Breadcrumbs';

export default function StudentDetail() {
  const { jobId, studentId } = useParams<{ jobId: string; studentId: string }>();
  const navigate = useNavigate();

  const [result,  setResult]  = useState<StudentResult | null>(null);
  const [allIds,  setAllIds]  = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    if (!jobId || !studentId) return;
    setLoading(true);
    Promise.all([
      api.get<StudentResult>(`/results/${jobId}/student/${studentId}`),
      api.get<{ results: StudentResult[] }>(`/results/${jobId}`),
    ])
      .then(([res, listRes]) => {
        setResult(res.data);
        setAllIds(listRes.data.results.map((r) => r.student_id));
      })
      .catch(() => setError('Öğrenci detayı yüklenemedi.'))
      .finally(() => setLoading(false));
  }, [jobId, studentId]);

  if (loading) return <LoadingSpinner text="Yükleniyor…" fullPage />;

  if (error || !result) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate(`/results/${jobId}`)} className="btn-secondary">
          ← Sonuçlara dön
        </button>
        <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
          <span className="text-red-500">⚠</span>
          <p className="text-sm text-red-700">{error || 'Öğrenci bulunamadı.'}</p>
        </div>
      </div>
    );
  }

  const mcAnswers   = result.answers.filter((a) => a.question_type === 'mc');
  const openAnswers = result.answers.filter((a) => a.question_type === 'open');

  const currentIdx  = allIds.indexOf(studentId!);
  const prevId      = currentIdx > 0           ? allIds[currentIdx - 1] : null;
  const nextId      = currentIdx < allIds.length - 1 ? allIds[currentIdx + 1] : null;

  const totalPct = result.total_pct;
  const progressColor =
    totalPct >= 70 ? 'bg-emerald-500'
    : totalPct >= 50 ? 'bg-amber-400'
    : 'bg-red-400';

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Breadcrumbs */}
      <Breadcrumbs
        items={[
          { label: 'Pano',              to: '/' },
          { label: 'Değerlendirmeler',  to: '/jobs' },
          { label: 'Sonuçlar',          to: `/results/${jobId}` },
          { label: result.student_name },
        ]}
      />

      {/* Prev / Next navigation */}
      {allIds.length > 1 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate(`/results/${jobId}/student/${prevId}`)}
            disabled={!prevId}
            className="btn-secondary btn-sm disabled:opacity-30"
          >
            ← Önceki
          </button>
          <span className="text-xs text-gray-500">
            {currentIdx + 1} / {allIds.length}
          </span>
          <button
            onClick={() => navigate(`/results/${jobId}/student/${nextId}`)}
            disabled={!nextId}
            className="btn-secondary btn-sm disabled:opacity-30"
          >
            Sonraki →
          </button>
        </div>
      )}

      {/* Student header card */}
      <div className="card p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary-100 flex items-center
                            justify-center shrink-0">
              <span className="text-primary-700 font-bold text-2xl font-jakarta">
                {result.student_name.charAt(0)}
              </span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 font-jakarta">
                {result.student_name}
              </h1>
              <p className="text-sm text-gray-500 font-mono mt-0.5">{result.student_id}</p>
            </div>
          </div>
          <div className="text-right">
            <GradeBadge grade={result.grade} />
            <p className="text-3xl font-bold text-gray-900 font-jakarta mt-1.5">
              {result.total_pct.toFixed(1)}%
            </p>
            <p className="text-xs text-gray-400 mt-0.5">Genel puan</p>
          </div>
        </div>

        {/* Overall progress bar */}
        <div className="mt-5 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${progressColor}`}
            style={{ width: `${totalPct}%` }}
          />
        </div>

        {/* Score breakdown */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-5 border-t border-gray-100">
          <ScoreStat
            label="ÇS Puanı"
            value={`${result.mc_score}/${result.mc_total}`}
            pct={result.mc_total > 0 ? (result.mc_score / result.mc_total) * 100 : null}
          />
          <ScoreStat
            label="Açık Puan"
            value={`${result.open_score.toFixed(1)}/${result.open_total}`}
            pct={result.open_total > 0 ? (result.open_score / result.open_total) * 100 : null}
          />
          <ScoreStat
            label="ÇS Doğru"
            value={`${mcAnswers.filter((a) => a.is_correct).length} / ${mcAnswers.length}`}
          />
          <ScoreStat
            label="Açık Soru"
            value={openAnswers.length.toString()}
          />
        </div>
      </div>

      {/* Two-column answer detail */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT — Multiple Choice */}
        <div className="card">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 font-jakarta">
              Çoktan Seçmeli Cevaplar
              <span className="ml-2 text-xs font-normal text-gray-500">
                ({mcAnswers.length} soru)
              </span>
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              <span className="text-emerald-600 font-medium">
                {mcAnswers.filter((a) => a.is_correct).length} doğru
              </span>
              {' · '}
              <span className="text-red-500 font-medium">
                {mcAnswers.filter((a) => !a.is_correct).length} yanlış
              </span>
            </p>
          </div>
          {mcAnswers.length === 0 ? (
            <p className="px-5 py-8 text-sm text-gray-400 text-center">Çoktan seçmeli soru yok.</p>
          ) : (
            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-2">
              {mcAnswers.map((a) => <MCAnswerTile key={a.question_number} answer={a} />)}
            </div>
          )}
        </div>

        {/* RIGHT — Open-ended */}
        <div className="card">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 font-jakarta">
              Açık Uçlu Cevaplar
              <span className="ml-2 text-xs font-normal text-gray-500">
                ({openAnswers.length} soru)
              </span>
            </h2>
          </div>
          {openAnswers.length === 0 ? (
            <p className="px-5 py-8 text-sm text-gray-400 text-center">Açık uçlu soru yok.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {openAnswers.map((a) => <OpenAnswerBlock key={a.question_number} answer={a} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function ScoreStat({ label, value, pct }: { label: string; value: string; pct?: number | null }) {
  const color =
    pct == null ? '' :
    pct >= 70 ? 'bg-emerald-500' :
    pct >= 50 ? 'bg-amber-400'   : 'bg-red-400';

  return (
    <div className="text-center">
      <p className="label-xs text-gray-400">{label}</p>
      <p className="text-lg font-bold text-gray-900 font-jakarta mt-1">{value}</p>
      {pct != null && (
        <div className="mt-1.5 h-1 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${color} transition-all duration-700`}
               style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

function MCAnswerTile({ answer }: { answer: AnswerDetail }) {
  const correct = answer.is_correct;
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm
                  transition-colors ${
        correct
          ? 'bg-emerald-50 border-emerald-200'
          : 'bg-red-50 border-red-200'
      }`}
    >
      <span className="font-medium text-gray-400 text-xs w-6 shrink-0">
        Q{answer.question_number}
      </span>
      <span className={`font-bold text-base ${correct ? 'text-emerald-700' : 'text-red-600'}`}>
        {answer.student_answer ?? '?'}
      </span>
      <span className="ml-auto shrink-0">
        {correct ? (
          <span className="text-emerald-600 font-bold">✓</span>
        ) : (
          <span className="text-xs text-red-500 font-medium">
            ✗ {answer.correct_answer}
          </span>
        )}
      </span>
    </div>
  );
}

function OpenAnswerBlock({ answer }: { answer: AnswerDetail }) {
  const confidencePct = answer.confidence ? Math.round(answer.confidence * 100) : null;
  const scorePct = answer.max_score > 0 ? (answer.score / answer.max_score) * 100 : 0;

  const scoreColor =
    scorePct >= 70 ? { bg: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-500' }
    : scorePct >= 50 ? { bg: 'bg-amber-100 text-amber-700', bar: 'bg-amber-400' }
    : { bg: 'bg-red-100 text-red-700', bar: 'bg-red-400' };

  return (
    <div className="px-5 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="label-xs text-gray-500">
          Soru {answer.question_number}
        </span>
        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${scoreColor.bg}`}>
          {answer.score}/{answer.max_score}
        </span>
      </div>

      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${scoreColor.bar}`}
          style={{ width: `${scorePct}%` }}
        />
      </div>

      {answer.student_answer && (
        <div className="bg-gray-50 rounded-xl p-3">
          <p className="label-xs text-gray-500 mb-1">Öğrenci Cevabı</p>
          <p className="text-sm text-gray-700 leading-relaxed line-clamp-4">
            {answer.student_answer}
          </p>
        </div>
      )}

      {answer.correct_answer && (
        <div className="bg-primary-50 rounded-xl p-3">
          <p className="label-xs text-primary-500 mb-1">Rubrik / Beklenen</p>
          <p className="text-xs text-primary-700 leading-relaxed">{answer.correct_answer}</p>
        </div>
      )}

      {answer.feedback && (
        <div className="flex items-start gap-2">
          <span className="text-base shrink-0 mt-0.5">🤖</span>
          <div>
            <p className="label-xs text-gray-400 mb-0.5">Yapay Zeka Geri Bildirimi</p>
            <p className="text-sm text-gray-600 italic leading-relaxed">"{answer.feedback}"</p>
          </div>
        </div>
      )}

      {confidencePct !== null && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 shrink-0">Güven:</span>
          <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-400 rounded-full transition-all duration-700"
              style={{ width: `${confidencePct}%` }}
            />
          </div>
          <span className="text-xs text-gray-500 shrink-0">{confidencePct}%</span>
        </div>
      )}
    </div>
  );
}
