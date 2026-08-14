'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { searchPaletteStore } from '@/store/searchPaletteStore';

/**
 * Search is a floating palette over the current page. This route only exists so
 * old links keep working: it returns to the dashboard and opens the palette.
 */
export default function SearchRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard');
    searchPaletteStore.open();
  }, [router]);

  return null;
}
