import { useEffect, useRef, useState, useCallback } from 'react';
import { PipelineLog } from '../types';

const LEVEL_CLS: Record<string, string> = {
  info:    'text-gray-300',
  success: 'text-emerald-400',
  warning: 'text-amber-400',
  error:   'text-red-400',
};

const LEVEL_PREFIX: Record<string, string> = {
  info:    '  ',
  success: '✓ ',
  warning: '⚠ ',
  error:   '✕ ',
};

const STAGE_CLS: Record<string, string> = {
  ocr:        'text-sky-400',
  layout:     'text-violet-400',
  evaluation: 'text-emerald-400',
};

function formatTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

interface Props {
  jobId: string;
  /** If true, actively polls for new logs. Set false once job is complete/failed. */
  live: boolean;
}

export function LogTerminal({ jobId, live }: Props) {
  const [logs, setLogs] = useState<PipelineLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const afterRef = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      const token = localStorage.getItem('access_token');
      const url = afterRef.current
        ? `/api/jobs/${jobId}/logs?after=${encodeURIComponent(afterRef.current)}`
        : `/api/jobs/${jobId}/logs`;

      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return;
      const data: PipelineLog[] = await res.json();
      if (data.length === 0) return;

      setLogs(prev => [...prev, ...data]);
      afterRef.current = data[data.length - 1].timestamp;
    } catch {
      setError('Log bağlantısı kesildi');
    }
  }, [jobId]);

  // Initial load + polling
  useEffect(() => {
    afterRef.current = null;
    setLogs([]);
    setError(null);
    fetchLogs();

    if (live) {
      intervalRef.current = setInterval(fetchLogs, 2000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [jobId, live, fetchLogs]);

  // Stop polling when live turns false
  useEffect(() => {
    if (!live && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [live]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="rounded-lg overflow-hidden border border-gray-800 bg-gray-950 shadow-inner">
      {/* Terminal header bar */}
      <div className="flex items-center gap-1.5 px-3 py-2 bg-gray-900 border-b border-gray-800">
        <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
        <span className="ml-2 text-[10px] text-gray-500 font-mono">pipeline — {jobId.slice(0, 8)}</span>
        {live && (
          <span className="ml-auto flex items-center gap-1 text-[10px] text-emerald-400 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            canlı
          </span>
        )}
      </div>

      {/* Log output */}
      <div className="h-64 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-5 space-y-0.5">
        {logs.length === 0 && !error && (
          <p className="text-gray-600 italic">Loglar bekleniyor…</p>
        )}
        {error && (
          <p className="text-red-400">{error}</p>
        )}
        {logs.map(log => (
          <div key={log.id} className="flex gap-2 items-start">
            <span className="text-gray-600 shrink-0 select-none">{formatTime(log.timestamp)}</span>
            <span className={`shrink-0 select-none font-semibold ${STAGE_CLS[log.stage] ?? 'text-gray-500'}`}>
              [{log.stage.toUpperCase().slice(0, 4)}]
            </span>
            <span className={`break-words ${LEVEL_CLS[log.level] ?? 'text-gray-300'}`}>
              <span className="select-none">{LEVEL_PREFIX[log.level] ?? '  '}</span>
              {log.message}
              {log.student_name && (
                <span className="text-gray-500 ml-1">— {log.student_name}</span>
              )}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Footer count */}
      <div className="px-3 py-1 bg-gray-900 border-t border-gray-800 flex justify-between text-[10px] text-gray-600 font-mono">
        <span>{logs.length} satır</span>
        {!live && logs.length > 0 && <span>tamamlandı</span>}
      </div>
    </div>
  );
}
