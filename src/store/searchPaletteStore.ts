type Listener = (open: boolean) => void;

let isOpen = false;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((listener) => listener(isOpen));
}

export const searchPaletteStore = {
  get: (): boolean => isOpen,

  open: () => {
    if (isOpen) return;
    isOpen = true;
    emit();
  },

  close: () => {
    if (!isOpen) return;
    isOpen = false;
    emit();
  },

  toggle: () => {
    isOpen = !isOpen;
    emit();
  },

  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
