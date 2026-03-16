interface SkeletonProps {
  className?: string;
  lines?: number;
}

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-gray-200 rounded-lg ${className}`} />
  );
}

export function SkeletonText({ lines = 3 }: SkeletonProps) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className={`h-4 ${i === lines - 1 ? 'w-3/4' : 'w-full'}`}
        />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="card p-5 space-y-4 animate-pulse">
      <div className="flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="card overflow-hidden animate-pulse">
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-100">
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="divide-y divide-gray-50">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="px-4 py-3 flex items-center gap-4">
            <Skeleton className="h-4 w-6" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-40 flex-1" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
