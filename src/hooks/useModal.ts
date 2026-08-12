import { useState, useEffect } from 'react';
import { modalStore, ModalName } from '@/store/modalStore';

export const useModal = () => {
  const [state, setState] = useState(modalStore.get());

  useEffect(() => {
    return modalStore.subscribe((newState) => {
      setState(newState);
    });
  }, []);

  return {
    isOpen: state.name !== null,
    activeModal: state.name,
    modalData: state.data,
    openModal: (name: ModalName, data?: unknown) => modalStore.open(name, data),
    closeModal: () => modalStore.close(),
  };
};
