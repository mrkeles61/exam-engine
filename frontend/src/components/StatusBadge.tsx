import { JobStatus } from '../types';

const jobStatusConfig: Record<JobStatus, { label: string; cls: string; dot: boolean }> = {
  pending:         { label: 'PENDING',   cls: 'bg-surface-container-high text-on-surface-variant', dot: false },
  ocr_running:     { label: 'OCR',       cls: 'bg-amber-50 text-amber-700',         dot: true  },
  ocr_complete:    { label: 'OCR DONE',  cls: 'bg-emerald-50 text-emerald-700',     dot: false },
  ocr_failed:      { label: 'OCR FAIL',  cls: 'bg-error-container text-error',      dot: false },
  layout_running:  { label: 'LAYOUT',    cls: 'bg-amber-50 text-amber-700',         dot: true  },
  layout_complete: { label: 'LAYOUT OK', cls: 'bg-emerald-50 text-emerald-700',     dot: false },
  layout_failed:   { label: 'LAYOUT FAIL', cls: 'bg-error-container text-error',    dot: false },
  eval_running:    { label: 'RUNNING',   cls: 'bg-amber-50 text-amber-700',         dot: true  },
  complete:        { label: 'COMPLETE',  cls: 'bg-emerald-50 text-emerald-700',     dot: false },
  eval_failed:     { label: 'EVAL FAIL', cls: 'bg-error-container text-error',      dot: false },
  failed:          { label: 'FAILED',    cls: 'bg-error-container text-error',       dot: false },
};

function gradeClass(grade: string): string {
  if (['AA', 'BA'].includes(grade)) return 'bg-emerald-50 text-emerald-700';
  if (['BB', 'CB'].includes(grade)) return 'bg-primary-100 text-primary-700';
  if (['CC', 'DC'].includes(grade)) return 'bg-amber-50 text-amber-700';
  if (grade === 'DD')               return 'bg-orange-100 text-orange-700';
  return 'bg-error-container text-error';
}

interface JobBadgeProps { status: JobStatus }

export function JobStatusBadge({ status }: JobBadgeProps) {
  const { label, cls, dot } = jobStatusConfig[status] ?? {
    label: status, cls: 'bg-surface-container-high text-on-surface-variant', dot: false,
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold ${cls}`}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
      {label}
    </span>
  );
}

interface GradeBadgeProps { grade: string }

export function GradeBadge({ grade }: GradeBadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold ${gradeClass(grade)}`}>
      {grade}
    </span>
  );
}
