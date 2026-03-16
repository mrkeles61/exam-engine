interface Props {
  label: string;
  value: string | number;
  sub?: string;
  icon?: string;
  accent?: 'blue' | 'green' | 'yellow' | 'purple' | 'rose';
}

const accentMap: Record<string, { bg: string; text: string }> = {
  blue:   { bg: 'bg-primary-50',  text: 'text-primary-600' },
  green:  { bg: 'bg-emerald-50',  text: 'text-emerald-600' },
  yellow: { bg: 'bg-amber-50',    text: 'text-amber-600'   },
  purple: { bg: 'bg-violet-50',   text: 'text-violet-600'  },
  rose:   { bg: 'bg-rose-50',     text: 'text-rose-600'    },
};

export function MetricCard({ label, value, sub, icon, accent = 'blue' }: Props) {
  const { bg, text } = accentMap[accent] ?? accentMap.blue;

  return (
    <div className="card p-5 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="label-xs text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-900 font-jakarta mt-1 leading-tight">
          {value}
        </p>
        {sub && <p className="text-xs text-gray-500 mt-1 truncate">{sub}</p>}
      </div>
      {icon && (
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${bg} ${text}`}>
          {icon}
        </div>
      )}
    </div>
  );
}
