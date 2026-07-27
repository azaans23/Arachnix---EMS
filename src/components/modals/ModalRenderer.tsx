'use client';

import { useModal } from '@/hooks/useModal';
import RegisterEmployeeModal from './RegisterEmployeeModal';
import EmployeeDetailsModal from './EmployeeDetailsModal';
import EmployeeCreateModal from './EmployeeCreateModal';

export default function ModalRenderer() {
  const { activeModal, closeModal, modalData } = useModal();

  if (!activeModal) return null;

  switch (activeModal) {
    case 'registerEmployee':
      return (
        <RegisterEmployeeModal
          user={modalData?.user}
          onClose={closeModal}
          onSuccess={modalData?.onSuccess}
        />
      );
    case 'employeeDetails':
      return (
        <EmployeeDetailsModal
          user={modalData?.user}
          onClose={closeModal}
          onSuccess={modalData?.onSuccess}
        />
      );
    case 'createEmployee':
      return <EmployeeCreateModal onClose={closeModal} onSuccess={modalData?.onSuccess} />;
    default:
      return null;
  }
}
