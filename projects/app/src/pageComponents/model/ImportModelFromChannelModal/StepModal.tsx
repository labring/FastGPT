import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import type { ReactNode } from 'react';

const StepModal = ({
  isOpen,
  title,
  onClose,
  footer,
  children,
  height
}: {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
  height?: string;
}) =>
  isOpen ? (
    <MyModal
      isOpen
      onClose={onClose}
      title={title}
      w="1080px"
      h={height ?? 'min(760px, calc(100vh - 32px))'}
      maxW="calc(100vw - 24px)"
      bodyStyles={{ overflow: 'hidden' }}
      footer={footer}
    >
      {children}
    </MyModal>
  ) : null;

export default StepModal;
