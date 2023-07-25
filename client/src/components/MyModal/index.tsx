import React from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalProps
} from '@chakra-ui/react';

interface Props extends ModalProps {
  showCloseBtn?: boolean;
  title?: string;
}

const MyModal = ({ isOpen, onClose, title, children, showCloseBtn = true, ...props }: Props) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} autoFocus={false} {...props}>
      <ModalOverlay />
      <ModalContent>
        {!!title && <ModalHeader>{title}</ModalHeader>}
        {showCloseBtn && <ModalCloseButton />}
        {children}
      </ModalContent>
    </Modal>
  );
};

export default MyModal;
