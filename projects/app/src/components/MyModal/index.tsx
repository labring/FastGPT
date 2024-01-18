import React from 'react';
import { ModalContentProps } from '@chakra-ui/react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import CustomModal from '@fastgpt/web/components/common/MyModal';

export interface MyModalProps extends ModalContentProps {
  iconSrc?: string;
  title?: any;
  isCentered?: boolean;
  isOpen: boolean;
  onClose?: () => void;
}

const MyModal = ({
  isOpen,
  onClose,
  iconSrc,
  title,
  children,
  isCentered,
  w = 'auto',
  maxW = ['90vw', '600px'],
  ...props
}: MyModalProps) => {
  const { isPc } = useSystemStore();
  return (
    <CustomModal
      isOpen={isOpen}
      onClose={onClose}
      iconSrc={iconSrc}
      title={title}
      isCentered={isPc ? isCentered : true}
      w={w}
      maxW={maxW}
      {...props}
    >
      {children}
    </CustomModal>
  );
};

export default MyModal;
