import { useState, useEffect } from 'react';
import api from '../api/client';
import { AnswerKey } from '../types';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { AnswerKeyModal } from '../components/AnswerKeyModal';
import { useToast } from '../contexts/ToastContext';

export default function AnswerKeys() {
  const { success, error: toastError } = useToast();

  const [keys,      setKeys]     = useState<AnswerKey[]>([]);
  const [loading,   setLoading]  = useState(true);
  const [editKey,   setEditKey]  = useState<AnswerKey | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [deleting,  setDeleting] = useState<string | null>(null);

  const fetchKeys = async () => {
    setLoading(true);
    try {
      const res = await api.get<AnswerKey[]>('/answer-keys');
      setKeys(res.data);
    } catch {
      toastError('Cevap anahtarları yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchKeys(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Bu cevap anahtarını silmek istediğinizden emin misiniz?')) return;
    setDeleting(id);
    try {
      await api.delete(`/answer-keys/${id}`);
      setKeys((prev) => prev.filter((k) => k.id !== id));
      success('Cevap anahtarı silindi.');
    } catch {
      toastError('Silme işlemi başarısız oldu.');
    } finally {
      setDeleting(null);
    }
  };

  const handleEdit = (key: AnswerKey) => {
    setEditKey(key);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditKey(null);
  };

  const handleSaved = (saved: AnswerKey) => {
    setKeys((prev) => {
      const idx = prev.findIndex((k) => k.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [saved, ...prev];
    });
    handleCloseModal();
  };

  if (loading) return <LoadingSpinner text="Cevap anahtarları yükleniyor…" fullPage />;

  return (
    <>
      <div className="space-y-7 animate-fade-up">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="page-title">Cevap Anahtarları</h1>
            <p className="page-subtitle">Sınav değerlendirme anahtarlarını yönetin</p>
          </div>
          <button
            onClick={() => { setEditKey(null); setShowModal(true); }}
            className="btn-primary shrink-0"
          >
            + Yeni Cevap Anahtarı
          </button>
        </div>

        {/* List */}
        {keys.length === 0 ? (
          <EmptyState
            title="Henüz cevap anahtarı yok"
            message="İlk cevap anahtarını oluşturmak için butona tıklayın."
            icon="🔑"
            action={{
              label: 'Cevap Anahtarı Oluştur',
              onClick: () => { setEditKey(null); setShowModal(true); },
            }}
          />
        ) : (
          <div className="space-y-3">
            {keys.map((key) => {
              const mcCount   = key.questions.filter((q) => q.type === 'mc').length;
              const openCount = key.questions.filter((q) => q.type === 'open').length;
              const totalPts  = key.questions.reduce((s, q) => s + q.points, 0);

              return (
                <div
                  key={key.id}
                  className="card p-5 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="w-9 h-9 bg-primary-50 rounded-xl flex items-center
                                        justify-center text-lg shrink-0">🔑</div>
                        <div className="min-w-0">
                          <h3 className="font-semibold text-gray-900 font-jakarta truncate">
                            {key.name}
                          </h3>
                          <p className="text-sm text-gray-500 mt-0.5">{key.course_name}</p>
                        </div>
                      </div>

                      {/* Stats row */}
                      <div className="flex items-center gap-4 mt-3 ml-12 flex-wrap">
                        {mcCount > 0 && (
                          <div className="flex items-center gap-1.5 text-xs text-gray-600">
                            <span className="w-2 h-2 bg-primary-400 rounded-full" />
                            {mcCount} ÇS soru
                          </div>
                        )}
                        {openCount > 0 && (
                          <div className="flex items-center gap-1.5 text-xs text-gray-600">
                            <span className="w-2 h-2 bg-emerald-400 rounded-full" />
                            {openCount} açık soru
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 text-xs text-gray-600">
                          <span className="w-2 h-2 bg-amber-400 rounded-full" />
                          {totalPts} toplam puan
                        </div>
                        <span className="text-xs text-gray-400">
                          {new Date(key.created_at).toLocaleDateString('tr-TR', {
                            day: '2-digit', month: 'short', year: 'numeric',
                          })}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleEdit(key)}
                        className="btn-secondary btn-sm"
                      >
                        Düzenle
                      </button>
                      <button
                        onClick={() => handleDelete(key.id)}
                        disabled={deleting === key.id}
                        className="btn-danger btn-sm"
                      >
                        {deleting === key.id ? (
                          <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                        ) : 'Sil'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <AnswerKeyModal
          editKey={editKey}
          onClose={handleCloseModal}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}
