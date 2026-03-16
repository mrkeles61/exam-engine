import { useState, useEffect, FormEvent } from 'react';
import api from '../api/client';
import { AnswerKey } from '../types';
import { useToast } from '../contexts/ToastContext';

type Template = 'mc40' | 'mixed' | 'custom';

interface CustomConfig {
  mcCount:     number;
  mcPoints:    number;
  openCount:   number;
  openPoints:  number;
}

interface Props {
  editKey?: AnswerKey | null;
  onClose:  () => void;
  onSaved:  (key: AnswerKey) => void;
}

const MC_CYCLE = ['A', 'B', 'C', 'D'];

function buildMcQuestions(count: number, pointsEach: number, startNum = 1) {
  return Array.from({ length: count }, (_, i) => ({
    number:         startNum + i,
    type:           'mc',
    correct_answer: MC_CYCLE[i % 4],
    rubric:         null,
    points:         pointsEach,
  }));
}

function buildOpenQuestions(count: number, pointsEach: number, startNum: number) {
  const rubrics = [
    'Nesne yönelimli programlamanın 4 temel ilkesini açıklayın.',
    'Veri yapısı seçiminin algoritma karmaşıklığına etkisini örneklerle anlatın.',
    'REST API HTTP metodlarını ve yaygın durum kodlarını açıklayın.',
    'Yazılım test süreçlerini ve türlerini açıklayın.',
    'Veritabanı normalleştirme kavramını açıklayın.',
  ];
  return Array.from({ length: count }, (_, i) => ({
    number:         startNum + i,
    type:           'open',
    correct_answer: null,
    rubric:         rubrics[i % rubrics.length],
    points:         pointsEach,
  }));
}

export function AnswerKeyModal({ editKey, onClose, onSaved }: Props) {
  const { success, error: toastError } = useToast();

  const [name,       setName]       = useState('');
  const [course,     setCourse]     = useState('');
  const [template,   setTemplate]   = useState<Template>('mc40');
  const [custom,     setCustom]     = useState<CustomConfig>({
    mcCount: 40, mcPoints: 2.5, openCount: 3, openPoints: 10,
  });
  const [saving, setSaving] = useState(false);

  // Pre-fill when editing
  useEffect(() => {
    if (editKey) {
      setName(editKey.name);
      setCourse(editKey.course_name);
      // Detect template from question count
      const mc   = editKey.questions.filter((q) => q.type === 'mc').length;
      const open = editKey.questions.filter((q) => q.type === 'open').length;
      if (mc === 40 && open === 0)  setTemplate('mc40');
      else if (mc === 40 && open === 3) setTemplate('mixed');
      else {
        setTemplate('custom');
        setCustom({
          mcCount:    mc,
          mcPoints:   editKey.questions.find((q) => q.type === 'mc')?.points ?? 2.5,
          openCount:  open,
          openPoints: editKey.questions.find((q) => q.type === 'open')?.points ?? 10,
        });
      }
    }
  }, [editKey]);

  const buildQuestions = () => {
    if (template === 'mc40')  return buildMcQuestions(40, 2.5);
    if (template === 'mixed') return [...buildMcQuestions(40, 2.5), ...buildOpenQuestions(3, 10, 41)];
    // custom
    const mcQ   = buildMcQuestions(custom.mcCount, custom.mcPoints);
    const openQ = buildOpenQuestions(custom.openCount, custom.openPoints, custom.mcCount + 1);
    return [...mcQ, ...openQ];
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim())   return;
    if (!course.trim()) return;

    setSaving(true);
    try {
      const payload = {
        name:        name.trim(),
        course_name: course.trim(),
        questions:   buildQuestions(),
      };

      let saved: AnswerKey;
      if (editKey) {
        const res = await api.put<AnswerKey>(`/answer-keys/${editKey.id}`, payload);
        saved = res.data;
        success('Cevap anahtarı güncellendi.');
      } else {
        const res = await api.post<AnswerKey>('/answer-keys', payload);
        saved = res.data;
        success('Cevap anahtarı oluşturuldu.');
      }
      onSaved(saved);
    } catch {
      toastError('Kayıt sırasında bir hata oluştu.');
    } finally {
      setSaving(false);
    }
  };

  const totalPoints = (() => {
    if (template === 'mc40')  return 40 * 2.5;
    if (template === 'mixed') return 40 * 2.5 + 3 * 10;
    return custom.mcCount * custom.mcPoints + custom.openCount * custom.openPoints;
  })();

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 font-jakarta">
            {editKey ? 'Cevap Anahtarını Düzenle' : 'Yeni Cevap Anahtarı'}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400
                       hover:bg-gray-100 hover:text-gray-600 transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* Name */}
          <div>
            <label className="label">Cevap Anahtarı Adı</label>
            <input
              type="text"
              className="input"
              placeholder="ör. BM301 2024 Ara Sınav Cevap Anahtarı"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          {/* Course */}
          <div>
            <label className="label">Ders Adı</label>
            <input
              type="text"
              className="input"
              placeholder="ör. BM301 Algoritmalar"
              value={course}
              onChange={(e) => setCourse(e.target.value)}
              required
            />
          </div>

          {/* Template */}
          <div>
            <label className="label">Soru Şablonu</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: 'mc40',  label: 'Sadece ÇS', sub: '40 soru · 100p' },
                { value: 'mixed', label: 'Karma',     sub: '40 ÇS + 3 Açık' },
                { value: 'custom',label: 'Özel',      sub: 'Kendi ayarın'   },
              ] as { value: Template; label: string; sub: string }[]).map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTemplate(t.value)}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 text-sm
                              font-medium transition-all duration-150
                              ${template === t.value
                                ? 'border-primary-600 bg-primary-50 text-primary-700'
                                : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                >
                  <span className="font-semibold">{t.label}</span>
                  <span className="text-xs mt-0.5 opacity-70">{t.sub}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Custom config */}
          {template === 'custom' && (
            <div className="bg-gray-50 rounded-xl p-4 space-y-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Özel Yapılandırma
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">ÇS Soru Sayısı</label>
                  <input
                    type="number" min={0} max={200}
                    className="input"
                    value={custom.mcCount}
                    onChange={(e) => setCustom((p) => ({ ...p, mcCount: +e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label">ÇS Puan / Soru</label>
                  <input
                    type="number" min={0.1} max={100} step={0.5}
                    className="input"
                    value={custom.mcPoints}
                    onChange={(e) => setCustom((p) => ({ ...p, mcPoints: +e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label">Açık Soru Sayısı</label>
                  <input
                    type="number" min={0} max={20}
                    className="input"
                    value={custom.openCount}
                    onChange={(e) => setCustom((p) => ({ ...p, openCount: +e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label">Açık Puan / Soru</label>
                  <input
                    type="number" min={1} max={100} step={1}
                    className="input"
                    value={custom.openPoints}
                    onChange={(e) => setCustom((p) => ({ ...p, openPoints: +e.target.value }))}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="flex items-center gap-2 px-4 py-3 bg-primary-50 rounded-xl text-sm text-primary-700">
            <span className="font-semibold">Toplam puan:</span>
            <span>{totalPoints}</span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Kaydediliyor…
                </>
              ) : (
                editKey ? 'Güncelle' : 'Oluştur'
              )}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">
              İptal
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
