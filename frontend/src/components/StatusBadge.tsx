import { JobStatus } from '../types';

// Turkish labels for job statuses
const jobStatusConfig: Record<JobStatus, { label: string; cls: string; dot: boolean }> = {
  pending:         { label: 'Bekliyor',          cls: 'bg-gray-100 text-gray-600',           dot: false },
  ocr_running:     { label: 'OCR',               cls: 'bg-amber-100 text-amber-700',          dot: true  },
  ocr_complete:    { label: 'OCR Tamam',         cls: 'bg-teal-100 text-teal-700',            dot: false },
  ocr_failed:      { label: 'OCR Başarısız',     cls: 'bg-red-100 text-red-700',              dot: false },
  layout_running:  { label: 'Düzen Analizi',     cls: 'bg-amber-100 text-amber-700',          dot: true  },
  layout_complete: { label: 'Düzen Tamam',       cls: 'bg-teal-100 text-teal-700',            dot: false },
  layout_failed:   { label: 'Düzen Başarısız',   cls: 'bg-red-100 text-red-700',              dot: false },
  eval_running:    { label: 'Değerlendiriliyor', cls: 'bg-primary-100 text-primary-700',      dot: true  },
  complete:        { label: 'Tamamlandı',        cls: 'bg-emerald-100 text-emerald-700',      dot: false },
  eval_failed:     { label: 'Değ. Başarısız',    cls: 'bg-red-100 text-red-700',              dot: false },
  failed:          { label: 'Başarısız',         cls: 'bg-red-100 text-red-700',              dot: false },
};

function gradeClass(grade: string): string {
  if (['AA', 'BA'].includes(grade)) return 'bg-emerald-100 text-emerald-700';
  if (['BB', 'CB'].includes(grade)) return 'bg-primary-100 text-primary-700';
  if (['CC', 'DC'].includes(grade)) return 'bg-amber-100 text-amber-700';
  if (grade === 'DD')               return 'bg-orange-100 text-orange-700';
  return 'bg-red-100 text-red-700'; // FF
}

interface JobBadgeProps { status: JobStatus }

export function JobStatusBadge({ status }: JobBadgeProps) {
  const { label, cls, dot } = jobStatusConfig[status] ?? {
    label: status, cls: 'bg-gray-100 text-gray-600', dot: false,
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {dot && (
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
      )}
      {label}
    </span>
  );
}

interface GradeBadgeProps { grade: string }

export function GradeBadge({ grade }: GradeBadgeProps) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${gradeClass(grade)}`}>
      {grade}
    </span>
  );
}
