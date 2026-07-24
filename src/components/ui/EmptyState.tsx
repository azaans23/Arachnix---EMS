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
  actionIcon
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 bg-pure-white border border-subtle-stone rounded-xl shadow-sm text-center px-4 animate-fade-in-up">
      {/* Icon container */}
      <div className="w-16 h-16 rounded-full bg-cream flex items-center justify-center mb-4 text-muted-clay/65 border border-subtle-stone/30">
        {icon}
      </div>
      
      {/* Title */}
      <h3 className="text-lg font-bold text-deep-ink">{title}</h3>
      
      {/* Description */}
      <p className="text-muted-clay/60 text-sm max-w-sm mt-2 leading-relaxed">
        {description}
      </p>
      
      {/* Action Button */}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-6 text-sm text-terracotta hover:text-terracotta-hover font-semibold transition-colors flex items-center gap-1.5 cursor-pointer bg-cream/40 border border-subtle-stone/60 px-4 py-2 rounded-lg hover:bg-cream hover:shadow-sm"
        >
          {actionIcon}
          {actionLabel}
        </button>
      )}
    </div>
  );
}
