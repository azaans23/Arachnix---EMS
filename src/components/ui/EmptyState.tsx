import React from 'react';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  actionIcon?: React.ReactNode;
}

export default function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  actionIcon,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface px-4 py-16 text-center animate-fade-in-up">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-canvas text-muted">
        {icon}
      </div>
      <h3 className="text-base font-semibold tracking-tight text-ink">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">{description}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-6 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-ink transition-colors duration-200 hover:border-ink/25 hover:bg-canvas"
        >
          {actionIcon}
          {actionLabel}
        </button>
      )}
    </div>
  );
}
