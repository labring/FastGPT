import React from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalContentProps
} from '@chakra-ui/react';
import { DefaultTFuncReturn } from 'i18next';

interface Props extends ModalContentProps {
  showCloseBtn?: boolean;
  title?: any;
  isCentered?: boolean;
  isOpen: boolean;
  onClose: () => void;
}

const MyModal = ({
  isOpen,
  onClose,
  title,
  children,
  showCloseBtn = true,
  isCentered,
  w = 'auto',
  maxW = ['90vw', '600px'],
  ...props
}: Props) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} autoFocus={false} isCentered={isCentered}>
      <ModalOverlay />
      <ModalContent
        w={w}
        minW={['300px', '400px']}
        maxW={maxW}
        position={'relative'}
        overflow={'overlay'}
        {...props}
      >
        {!!title && <ModalHeader>{title}</ModalHeader>}
        {showCloseBtn && <ModalCloseButton />}
        {children}
      </ModalContent>
    </Modal>
  );
};

export default MyModal;
