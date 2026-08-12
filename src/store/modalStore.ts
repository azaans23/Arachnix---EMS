export type ModalName =
  'registerEmployee' | 'employeeDetails' | 'createEmployee' | 'editEmployee' | null;

export interface ModalState {
  name: ModalName;
  data?: unknown;
}

type Listener = (state: ModalState) => void;

let currentModal: ModalState = { name: null };
const listeners = new Set<Listener>();

export const modalStore = {
  get: (): ModalState => currentModal,

  open: (name: ModalName, data?: unknown) => {
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
