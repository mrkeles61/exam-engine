interface Props {
  title: string;
  message: string;
  icon?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ title, message, icon = '📋', action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
      <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center text-3xl
                      ring-4 ring-gray-50">
        {icon}
      </div>
      <div>
        <h3 className="font-semibold text-gray-800 font-jakarta">{title}</h3>
        <p className="text-sm text-gray-500 mt-1 max-w-xs leading-relaxed">{message}</p>
      </div>
      {action && (
        <button onClick={action.onClick} className="btn-primary mt-1">
          {action.label}
        </button>
      )}
    </div>
  );
}
