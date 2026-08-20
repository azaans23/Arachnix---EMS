'use client';

import { CircleCheck, Info, Loader2, OctagonX, TriangleAlert } from 'lucide-react';
import type { CSSProperties } from 'react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { useTheme } from '@/components/theme/ThemeProvider';

/**
 * shadcn/ui Sonner toaster — themed with Arachnix CSS tokens, bottom-right.
 */
export function Toaster({ ...props }: ToasterProps) {
  const { theme } = useTheme();

  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      className="toaster group"
      icons={{
        success: <CircleCheck className="size-4" />,
        info: <Info className="size-4" />,
        warning: <TriangleAlert className="size-4" />,
        error: <OctagonX className="size-4" />,
        loading: <Loader2 className="size-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-surface group-[.toaster]:text-ink group-[.toaster]:border-border group-[.toaster]:shadow-panel',
          description: 'group-[.toast]:text-muted',
          actionButton: 'group-[.toast]:bg-accent group-[.toast]:text-accent-fg',
          cancelButton: 'group-[.toast]:bg-canvas group-[.toast]:text-muted',
          success: 'group-[.toaster]:border-border',
          error: 'group-[.toaster]:border-danger-border',
        },
      }}
      style={
        {
          '--normal-bg': 'var(--surface)',
          '--normal-text': 'var(--ink)',
          '--normal-border': 'var(--border)',
          '--success-bg': 'var(--surface)',
          '--success-text': 'var(--ink)',
          '--success-border': 'var(--border)',
          '--error-bg': 'var(--danger-bg)',
          '--error-text': 'var(--danger)',
          '--error-border': 'var(--danger-border)',
          '--border-radius': '0.5rem',
        } as CSSProperties
      }
      {...props}
    />
  );
}
