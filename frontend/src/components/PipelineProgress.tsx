import { JobStatus } from '../types';
import { useLang, type TranslationKey } from '../i18n';

interface Stage { label: string; labelKey: TranslationKey }

const STAGES: Stage[] = [
  { label: 'Upload',     labelKey: 'pipeline.stageUpload'     },
  { label: 'OCR',        labelKey: 'pipeline.stageOcr'        },
  { label: 'Layout',     labelKey: 'pipeline.stageLayout'     },
  { label: 'Evaluation', labelKey: 'pipeline.stageEvaluation' },
  { label: 'Done',       labelKey: 'pipeline.stageDone'       },
];

function getActiveStage(status: JobStatus): number {
  const map: Record<JobStatus, number> = {
    pending:         1,
    ocr_running:     1,
    ocr_complete:    2,
    ocr_failed:      1,
    layout_running:  2,
    layout_complete: 3,
    layout_failed:   2,
    eval_running:    3,
    complete:        5,
    eval_failed:     3,
    failed:          1,
  };
  return map[status] ?? 0;
}

function getFailedStage(status: JobStatus): number {
  if (status === 'ocr_failed') return 1;
  if (status === 'layout_failed') return 2;
  if (status === 'eval_failed') return 3;
  if (status === 'failed') return 1;
  return -1;
}

const FAILED_STATUSES: JobStatus[] = ['ocr_failed', 'layout_failed', 'eval_failed', 'failed'];

type StageState = 'complete' | 'active' | 'pending' | 'error';

function stageState(idx: number, status: JobStatus): StageState {
  if (FAILED_STATUSES.includes(status)) {
    const failedAt = getFailedStage(status);
    if (idx < failedAt) return 'complete';
    if (idx === failedAt) return 'error';
    return 'pending';
  }
  const active = getActiveStage(status);
  if (active === 5)     return 'complete';
  if (idx < active)     return 'complete';
  if (idx === active)   return 'active';
  return 'pending';
}

// SVG icons for each stage
function StageIcon({ stage, state }: { stage: string; state: StageState }) {
  if (state === 'complete') {
    return (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  if (state === 'error') {
    return <span className="text-xs font-bold">✕</span>;
  }
  const icons: Record<string, JSX.Element> = {
    Upload: (
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
      </svg>
    ),
    OCR: (
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    Layout: (
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
      </svg>
    ),
    Evaluation: (
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    Done: (
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
      </svg>
    ),
  };
  return icons[stage] ?? <span className="text-xs">{stage[0]}</span>;
}

const dotStyles: Record<StageState, string> = {
  complete: 'bg-emerald-500 text-white ring-2 ring-emerald-100',
  active:   'bg-primary-600 text-white ring-4 ring-primary-100 animate-pulse',
  pending:  'bg-gray-100 text-gray-400',
  error:    'bg-red-100 text-red-600 ring-2 ring-red-50',
};

const labelStyles: Record<StageState, string> = {
  complete: 'text-emerald-700 font-medium',
  active:   'text-primary-700 font-semibold',
  pending:  'text-gray-400',
  error:    'text-red-500',
};

const connectorStyles: Record<string, string> = {
  done:    'bg-emerald-400',
  active:  'bg-gradient-to-r from-emerald-400 to-primary-300',
  pending: 'bg-gray-200',
};

interface Props {
  status: JobStatus;
  progressPct: number;
  progressDetail: string;
}

export function PipelineProgress({ status, progressPct, progressDetail }: Props) {
  const { t } = useLang();
  const RUNNING: JobStatus[] = ['ocr_running', 'layout_running', 'eval_running'];
  const isActive = RUNNING.includes(status);

  return (
    <div className="space-y-3">
      {/* Stage indicators */}
      <div className="flex items-center">
        {STAGES.map((stage, idx) => {
          const state  = stageState(idx, status);
          const nextState = idx < STAGES.length - 1 ? stageState(idx + 1, status) : null;

          let connCls = 'pending';
          if (nextState === 'complete') connCls = 'done';
          else if (nextState === 'active') connCls = 'active';

          return (
            <div key={stage.label} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1 shrink-0">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center
                              transition-all duration-300 ${dotStyles[state]}`}
                >
                  <StageIcon stage={stage.label} state={state} />
                </div>
                <span className={`text-[9px] leading-tight hidden sm:block text-center
                                  ${labelStyles[state]}`}>
                  {t(stage.labelKey)}
                </span>
              </div>
              {idx < STAGES.length - 1 && (
                <div
                  className={`h-0.5 flex-1 mx-1.5 rounded transition-colors duration-500
                              ${connectorStyles[connCls]}`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      {isActive && (
        <div className="space-y-1.5">
          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-500 rounded-full transition-all duration-700 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-xs text-gray-500">{progressDetail}</p>
        </div>
      )}

      {/* Failed */}
      {FAILED_STATUSES.includes(status) && (
        <p className="text-xs text-red-600 font-medium flex items-center gap-1.5">
          <span>⚠</span> {t('pipeline.failed')}
        </p>
      )}
    </div>
  );
}
