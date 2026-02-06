import { useEffect, useRef } from 'react';

interface LogEntry {
    id: number;
    time: string;
    message: string;
    type: 'info' | 'success' | 'error' | 'warning';
}

export function LogViewer({ logs }: { logs: LogEntry[] }) {
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    const typeColors = {
        info: 'text-slate-400',
        success: 'text-emerald-400',
        error: 'text-red-400',
        warning: 'text-amber-400'
    };

    return (
        <div className="w-full h-48 bg-slate-950/50 rounded-lg border border-slate-800/50 p-3 overflow-y-auto font-mono text-xs">
            {logs.length === 0 && <div className="text-slate-600 text-center mt-10">System Ready. Waiting for interactions...</div>}
            {logs.map((log) => (
                <div key={log.id} className={`mb-1 ${typeColors[log.type]}`}>
                    <span className="opacity-50 mr-2">[{log.time}]</span>
                    <span>{log.message}</span>
                </div>
            ))}
            <div ref={bottomRef} />
        </div>
    );
}
