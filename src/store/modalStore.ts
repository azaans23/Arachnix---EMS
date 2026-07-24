export type ModalName = 'registerEmployee' | null;

export interface ModalState {
  name: ModalName;
  data?: any;
}

type Listener = (state: ModalState) => void;

let currentModal: ModalState = { name: null };
const listeners = new Set<Listener>();

export const modalStore = {
  get: (): ModalState => currentModal,
  
  open: (name: ModalName, data?: any) => {
    currentModal = { name, data };
    listeners.forEach((listener) => listener(currentModal));
  },
  
  close: () => {
    currentModal = { name: null };
    listeners.forEach((listener) => listener(currentModal));
  },
  
  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
