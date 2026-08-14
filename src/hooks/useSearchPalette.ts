import { useEffect, useState } from 'react';
import { searchPaletteStore } from '@/store/searchPaletteStore';

export const useSearchPalette = () => {
  const [isOpen, setIsOpen] = useState(searchPaletteStore.get());

  useEffect(() => searchPaletteStore.subscribe(setIsOpen), []);

  return {
    isOpen,
    openSearch: () => searchPaletteStore.open(),
    closeSearch: () => searchPaletteStore.close(),
    toggleSearch: () => searchPaletteStore.toggle(),
  };
};
