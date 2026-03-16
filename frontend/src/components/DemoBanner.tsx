interface DemoBannerProps {
  message?: string;
}

export function DemoBanner({
  message = 'Bu sayfadaki veriler demo verileridir. Gerçek sınav sonuçlarını görmek için bir değerlendirme başlatın.',
}: DemoBannerProps) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800">
      <span className="text-base mt-0.5 shrink-0">⚡</span>
      <p className="text-sm leading-relaxed">{message}</p>
    </div>
  );
}
