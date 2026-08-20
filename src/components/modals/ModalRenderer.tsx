'use client';

import { useModal } from '@/hooks/useModal';
import RegisterEmployeeModal from './RegisterEmployeeModal';
import EmployeeCreateModal from './EmployeeCreateModal';
import type { SheetUser } from '@/types/employee';

type ModalPayload = {
  user?: SheetUser;
  onSuccess?: () => void;
};

function asPayload(data: unknown): ModalPayload {
  if (!data || typeof data !== 'object') return {};
  const record = data as Record<string, unknown>;
  return {
    user: record.user as SheetUser | undefined,
    onSuccess: typeof record.onSuccess === 'function' ? (record.onSuccess as () => void) : undefined,
  };
}

export default function ModalRenderer() {
  const { activeModal, closeModal, modalData } = useModal();

  if (!activeModal) return null;

  const payload = asPayload(modalData);

  switch (activeModal) {
    case 'registerEmployee':
      if (!payload.user) return null;
      return (
        <RegisterEmployeeModal
          user={payload.user}
          onClose={closeModal}
          onSuccess={payload.onSuccess || (() => {})}
        />
      );
    case 'createEmployee':
      return <EmployeeCreateModal onClose={closeModal} onSuccess={payload.onSuccess} />;
    case 'editEmployee':
      return (
        <EmployeeCreateModal
          user={payload.user}
          onClose={closeModal}
          onSuccess={payload.onSuccess}
        />
      );
    default:
      return null;
  }
}
