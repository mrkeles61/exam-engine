import { useLang } from '../i18n';

interface Props {
  text?: string;
  size?: 'sm' | 'md' | 'lg';
  fullPage?: boolean;
}

export function LoadingSpinner({ text, size = 'md', fullPage = false }: Props) {
  const { t } = useLang();
  const sizeMap = { sm: 'w-4 h-4', md: 'w-7 h-7', lg: 'w-10 h-10' };
  const resolvedText = text ?? t('common.loading');

  const spinner = (
    <div className="flex flex-col items-center justify-center gap-3">
      <div
        className={`${sizeMap[size]} border-[3px] border-primary-100 border-t-primary-600
                    rounded-full animate-spin`}
      />
      {resolvedText && <p className="text-sm text-gray-500">{resolvedText}</p>}
    </div>
  );

  if (fullPage) {
    return (
      <div className="flex items-center justify-center h-64">
        {spinner}
      </div>
    );
  }

  return spinner;
}
