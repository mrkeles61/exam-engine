import { useLang } from '../i18n';

interface DemoBannerProps {
  message?: string;
}

export function DemoBanner({ message }: DemoBannerProps) {
  const { t } = useLang();
  const resolvedMessage = message ?? t('ui.demoBanner');
  return (
    <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800">
      <span className="text-base mt-0.5 shrink-0">⚡</span>
      <p className="text-sm leading-relaxed">{resolvedMessage}</p>
    </div>
  );
}
