import React from 'react';
import { ModalContentProps } from '@chakra-ui/react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyModal from '@fastgpt/web/components/common/MyModal';

export interface MyModalProps extends ModalContentProps {
  iconSrc?: string;
  title?: any;
  isCentered?: boolean;
  isOpen: boolean;
  onClose?: () => void;
}

const MyModal1 = ({
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
    <MyModal
      isOpen={isOpen}
      onClose={onClose}
      iconSrc={iconSrc}
      title={title}
      isCentered={isCentered}
      w={w}
      maxW={maxW}
      isPc={isPc}
      {...props}
    >
      {children}
    </MyModal>
  );
};

export default MyModal1;
