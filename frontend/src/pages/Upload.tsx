import { useState, useEffect, useRef, DragEvent, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { AnswerKey, Exam, EvaluationJob, ExamType, JobStatus } from '../types';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { AnswerKeyModal } from '../components/AnswerKeyModal';
import { LogTerminal } from '../components/LogTerminal';
import { JobStatusBadge } from '../components/StatusBadge';
import { useToast } from '../contexts/ToastContext';

const EXAM_TYPE_OPTIONS: { value: ExamType; label: string }[] = [
  { value: 'mc',    label: 'Sadece Çoktan Seçmeli' },
  { value: 'open',  label: 'Sadece Açık Uçlu' },
  { value: 'mixed', label: 'Karma (ÇS + Açık Uçlu)' },
];

const TERMINAL_STATUSES: JobStatus[] = ['complete', 'ocr_failed', 'layout_failed', 'eval_failed', 'failed'];

function isTerminal(s: JobStatus) { return TERMINAL_STATUSES.includes(s); }

export default function Upload() {
  const navigate   = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();

  // Form state
  const [file,         setFile]         = useState<File | null>(null);
  const [title,        setTitle]        = useState('');
  const [courseName,   setCourseName]   = useState('');
  const [examType,     setExamType]     = useState<ExamType>('mixed');
  const [answerKeyId,  setAnswerKeyId]  = useState('');
  const [answerKeys,   setAnswerKeys]   = useState<AnswerKey[]>([]);
  const [isDragging,   setIsDragging]   = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [error,        setError]        = useState('');
  const [showAKModal,  setShowAKModal]  = useState(false);
  const [manualMode,   setManualMode]   = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Manual mode: created job state
  const [createdJob,   setCreatedJob]   = useState<EvaluationJob | null>(null);
  const [stageLoading, setStageLoading] = useState<string | null>(null);

  const loadKeys = () => {
    api.get<AnswerKey[]>('/answer-keys')
      .then((res) => setAnswerKeys(res.data))
      .catch(() => setAnswerKeys([]));
  };

  useEffect(() => { loadKeys(); }, []);

  // Poll job status in manual mode
  const pollJob = useCallback(async (jobId: string) => {
    try {
      const res = await api.get<EvaluationJob>(`/jobs/${jobId}`);
      setCreatedJob(res.data);
      return res.data;
    } catch { return null; }
  }, []);

  useEffect(() => {
    if (!createdJob || isTerminal(createdJob.status)) return;
    const id = setInterval(() => pollJob(createdJob.id), 2000);
    return () => clearInterval(id);
  }, [createdJob, pollJob]);

  // Drag & drop
  const onDragOver  = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);
  const onDrop      = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped?.type === 'application/pdf') { setFile(dropped); setError(''); }
    else setError('Yalnızca PDF dosyaları kabul edilmektedir.');
  };
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (picked?.type === 'application/pdf') { setFile(picked); setError(''); }
    else if (picked) setError('Yalnızca PDF dosyaları kabul edilmektedir.');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file)              { setError('Lütfen bir PDF dosyası seçin.');   return; }
    if (!title.trim())      { setError('Lütfen sınav başlığı girin.');     return; }
    if (!courseName.trim()) { setError('Lütfen ders adı girin.');          return; }

    setSubmitting(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file',        file);
      formData.append('title',       title.trim());
      formData.append('course_name', courseName.trim());
      formData.append('exam_type',   examType);
      const uploadRes = await api.post<Exam>('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const evalRes = await api.post<EvaluationJob>('/evaluate', {
        exam_id: uploadRes.data.id,
        ...(answerKeyId ? { answer_key_id: answerKeyId } : {}),
      });

      if (manualMode) {
        // Stay on page, show manual controls
        setCreatedJob(evalRes.data);
        toastSuccess('Sınav yüklendi — aşamaları manuel olarak çalıştırın.');
      } else {
        toastSuccess('Değerlendirme başlatıldı!');
        navigate('/jobs');
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Yükleme başarısız. Lütfen tekrar deneyin.';
      setError(msg);
      toastError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const runStage = async (stage: 'ocr' | 'layout' | 'evaluate') => {
    if (!createdJob) return;
    setStageLoading(stage);
    try {
      await api.post(`/jobs/${createdJob.id}/stage/${stage}`);
      await pollJob(createdJob.id);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Aşama başlatılamadı.';
      toastError(msg);
    } finally {
      setStageLoading(null);
    }
  };

  const fileSizeMB = file ? (file.size / 1024 / 1024).toFixed(1) : null;

  // ── Manual stage control panel ───────────────────────────────────────────
  if (createdJob) {
    const s = createdJob.status;
    const ocrDone    = ['ocr_complete','layout_running','layout_complete','eval_running','complete'].includes(s);
    const layoutDone = ['layout_complete','eval_running','complete'].includes(s);
    const done       = s === 'complete';

    const canOcr    = s === 'pending' || s === 'ocr_failed';
    const canLayout = s === 'ocr_complete' || s === 'layout_failed';
    const canEval   = s === 'layout_complete' || s === 'eval_failed';
    const isRunning = ['ocr_running','layout_running','eval_running'].includes(s);
    const live      = !isTerminal(s);

    return (
      <div className="max-w-2xl mx-auto space-y-6 animate-fade-up">
        <div className="page-header">
          <h1 className="page-title">Manuel Mod</h1>
          <p className="page-subtitle">Her pipeline aşamasını ayrı ayrı çalıştırın.</p>
        </div>

        {/* Job info bar */}
        <div className="card p-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 truncate">{title}</p>
            <p className="text-xs text-gray-500 font-mono mt-0.5">{createdJob.id.slice(0, 8)}…</p>
          </div>
          <JobStatusBadge status={createdJob.status} />
        </div>

        {/* Stage control buttons */}
        <div className="card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Pipeline Aşamaları</h2>

          <div className="space-y-3">
            <StageButton
              label="1. OCR — Metin Çıkarımı"
              icon="🔍"
              done={ocrDone}
              canRun={canOcr}
              running={s === 'ocr_running' || stageLoading === 'ocr'}
              failed={s === 'ocr_failed'}
              onRun={() => runStage('ocr')}
            />
            <StageButton
              label="2. Düzen Analizi"
              icon="📐"
              done={layoutDone}
              canRun={canLayout}
              running={s === 'layout_running' || stageLoading === 'layout'}
              failed={s === 'layout_failed'}
              onRun={() => runStage('layout')}
            />
            <StageButton
              label="3. Değerlendirme"
              icon="🎯"
              done={done}
              canRun={canEval}
              running={s === 'eval_running' || stageLoading === 'evaluate'}
              failed={s === 'eval_failed'}
              onRun={() => runStage('evaluate')}
            />
          </div>

          {isRunning && (
            <p className="text-xs text-primary-600 flex items-center gap-1.5 animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-500" />
              Aşama çalışıyor…
            </p>
          )}
        </div>

        {/* Log terminal */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700">Pipeline Logları</h2>
          <LogTerminal jobId={createdJob.id} live={live} />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/jobs')} className="btn-primary">
            {done ? 'Sonuçlara Git →' : 'İşler Sayfasına Git →'}
          </button>
          {done && (
            <button
              onClick={() => navigate(`/results/${createdJob.id}`)}
              className="btn-secondary"
            >
              Sonuçları Gör
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Upload form ──────────────────────────────────────────────────────────
  return (
    <>
      <div className="max-w-2xl mx-auto space-y-7 animate-fade-up">
        {/* Header */}
        <div className="page-header">
          <h1 className="page-title">Sınav Yükle</h1>
          <p className="page-subtitle">
            Taranmış sınav PDF'ini yükleyin ve değerlendirme ayarlarını yapılandırın.
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
            <span className="text-red-500 mt-0.5 shrink-0">⚠</span>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Drop zone */}
          <div>
            <p className="label">Sınav PDF'i</p>
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-2xl p-12 text-center
                          cursor-pointer transition-all duration-200 ${
                isDragging
                  ? 'border-primary-500 bg-primary-50'
                  : file
                  ? 'border-emerald-400 bg-emerald-50'
                  : 'border-gray-200 bg-white hover:border-primary-300 hover:bg-primary-50/30'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={onFileChange}
              />
              {file ? (
                <div className="space-y-2">
                  <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center
                                  justify-center mx-auto text-2xl">📄</div>
                  <p className="font-semibold text-gray-900">{file.name}</p>
                  <p className="text-xs text-gray-500">{fileSizeMB} MB · PDF yüklenmeye hazır</p>
                  <button
                    type="button"
                    className="text-xs text-red-500 hover:text-red-700 hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                  >
                    Dosyayı kaldır
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center
                                  justify-center mx-auto">
                    <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24"
                         stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round"
                            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-700">
                      PDF'i buraya sürükleyin veya seçmek için tıklayın
                    </p>
                    <p className="text-xs text-gray-400 mt-1">Yalnızca PDF · Maks. 50 MB</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Form fields */}
          <div className="card p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Sınav Başlığı</label>
                <input
                  type="text" className="input"
                  placeholder="ör. BM301 2024 Ara Sınavı"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label">Ders Adı</label>
                <input
                  type="text" className="input"
                  placeholder="ör. BM301 Algoritmalar"
                  value={courseName}
                  onChange={(e) => setCourseName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Sınav Türü</label>
                <select
                  className="input"
                  value={examType}
                  onChange={(e) => setExamType(e.target.value as ExamType)}
                >
                  {EXAM_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="label mb-0">Cevap Anahtarı (opsiyonel)</label>
                  <button
                    type="button"
                    onClick={() => setShowAKModal(true)}
                    className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                  >
                    + Yeni
                  </button>
                </div>
                <select
                  className="input"
                  value={answerKeyId}
                  onChange={(e) => setAnswerKeyId(e.target.value)}
                >
                  <option value="">— Cevap anahtarı seçin —</option>
                  {answerKeys.map((ak) => (
                    <option key={ak.id} value={ak.id}>{ak.name}</option>
                  ))}
                </select>
                {answerKeys.length === 0 && (
                  <p className="text-xs text-gray-400 mt-1">
                    Cevap anahtarı bulunamadı. Motor varsayılan puanlama kullanacak.
                  </p>
                )}
              </div>
            </div>

            {/* Manuel Mod toggle */}
            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <div>
                <p className="text-sm font-medium text-gray-700">Manuel Mod</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Her pipeline aşamasını kendiniz başlatın
                </p>
              </div>
              <button
                type="button"
                onClick={() => setManualMode(v => !v)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors
                            focus:outline-none ${manualMode ? 'bg-primary-600' : 'bg-gray-200'}`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow
                              transition-transform ${manualMode ? 'translate-x-[18px]' : 'translate-x-0.5'}`}
                />
              </button>
            </div>
          </div>

          {/* Submit */}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting || !file}
              className="btn-primary"
            >
              {submitting ? (
                <>
                  <LoadingSpinner size="sm" text="" />
                  Yükleniyor…
                </>
              ) : manualMode ? (
                <>📤 Yükle ve Manuel Başlat</>
              ) : (
                <><span>🚀</span> Değerlendirmeyi Başlat</>
              )}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => navigate('/')}
            >
              İptal
            </button>
          </div>
        </form>
      </div>

      {/* Answer Key Modal */}
      {showAKModal && (
        <AnswerKeyModal
          onClose={() => setShowAKModal(false)}
          onSaved={(newKey) => {
            loadKeys();
            setAnswerKeyId(newKey.id);
            setShowAKModal(false);
          }}
        />
      )}
    </>
  );
}

// ── Stage button ─────────────────────────────────────────────────────────────

interface StageButtonProps {
  label: string;
  icon: string;
  done: boolean;
  canRun: boolean;
  running: boolean;
  failed: boolean;
  onRun: () => void;
}

function StageButton({ label, icon, done, canRun, running, failed, onRun }: StageButtonProps) {
  let stateCls = 'bg-gray-50 border-gray-200 text-gray-400';
  let statusNode: React.ReactNode = <span className="text-gray-300">●</span>;

  if (done) {
    stateCls = 'bg-emerald-50 border-emerald-200 text-gray-700';
    statusNode = <span className="text-emerald-500 font-bold">✓</span>;
  } else if (running) {
    stateCls = 'bg-primary-50 border-primary-200 text-primary-700';
    statusNode = (
      <span className="w-3.5 h-3.5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin block" />
    );
  } else if (failed) {
    stateCls = 'bg-red-50 border-red-200 text-red-700';
    statusNode = <span className="text-red-500 font-bold">✕</span>;
  } else if (canRun) {
    stateCls = 'bg-white border-gray-200 text-gray-700 hover:border-primary-300 hover:bg-primary-50/30';
    statusNode = <span className="text-gray-300">○</span>;
  }

  return (
    <div className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${stateCls}`}>
      <div className="flex items-center gap-3">
        <span className="text-lg">{icon}</span>
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="w-4 h-4 flex items-center justify-center">{statusNode}</div>
        {(canRun || failed) && !running && (
          <button
            onClick={onRun}
            className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-primary-600 text-white
                       hover:bg-primary-700 transition-colors"
          >
            {failed ? '↺ Tekrar' : 'Çalıştır'}
          </button>
        )}
      </div>
    </div>
  );
}
