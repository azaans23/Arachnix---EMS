'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import ModalRenderer from '@/components/modals/ModalRenderer';
import SessionGuard from '@/components/session/SessionGuard';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { Toaster } from '@/components/ui/sonner';
import { installSessionFetchInterceptor } from '@/lib/session-fetch';

export default function Providers({ children }: { children: React.ReactNode }) {
  // Installed during render so it is in place before any child page fetches.
  useState(installSessionFetchInterceptor);

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
          },
        },
      })
  );

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster />
        <ModalRenderer />
        <SessionGuard />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
