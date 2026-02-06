import React from 'react';
import { Loader2 } from 'lucide-react';

export function Card({ children, className = '' }: { children: React.ReactNode, className?: string }) {
    return <div className={`glass rounded-xl p-6 border border-slate-700/50 ${className}`}>{children}</div>;
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'success'; // 'success' should be in the interface
    loading?: boolean;
    icon?: React.ReactNode;
}

export function Button({ className = '', variant = 'primary', loading, icon, children, disabled, ...props }: ButtonProps) {
    const base = "relative px-5 py-2.5 rounded-lg font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-95";

    const variants = {
        primary: "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 border border-blue-400/20",
        secondary: "bg-slate-800/50 hover:bg-slate-700/50 text-slate-200 border border-slate-700 hover:border-slate-600",
        danger: "bg-red-600/90 hover:bg-red-500 text-white shadow-lg shadow-red-500/20 hover:shadow-red-500/40 border border-red-400/20",
        success: "bg-emerald-600/90 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 border border-emerald-400/20"
    };

    return (
        <button
            disabled={disabled || loading}
            className={`${base} ${variants[variant]} ${className}`}
            {...props}
        >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {!loading && icon}
            {children}
        </button>
    );
}

export function ProgressBar({ progress, label, status }: { progress: number, label?: string, status?: string }) {
    return (
        <div className="w-full space-y-2">
            <div className="flex justify-between text-sm text-slate-400">
                <span>{status || 'Idle'}</span>
                <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700/50">
                <div
                    className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-300 ease-out shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                    style={{ width: `${progress}%` }}
                />
            </div>
            {label && <p className="text-xs text-slate-500 text-center">{label}</p>}
        </div>
    );
}
