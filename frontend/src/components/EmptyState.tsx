import { useLang } from '../i18n';

interface Props {
  title?: string;
  message?: string;
  icon?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ title, message, icon = 'description', action }: Props) {
  const { t } = useLang();
  const resolvedTitle = title ?? t('ui.emptyTitle');
  const resolvedMessage = message ?? t('ui.emptyMessage');
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
      <div className="w-16 h-16 bg-surface-container-low rounded-2xl flex items-center justify-center ring-4 ring-surface-container">
        <span className="material-symbols-outlined text-3xl text-on-surface-variant/40">{icon}</span>
      </div>
      <div>
        <h3 className="font-semibold text-on-surface">{resolvedTitle}</h3>
        <p className="text-sm text-on-surface-variant mt-1 max-w-xs leading-relaxed">{resolvedMessage}</p>
      </div>
      {action && (
        <button onClick={action.onClick} className="btn-primary mt-1">
          {action.label}
        </button>
      )}
    </div>
  );
}
