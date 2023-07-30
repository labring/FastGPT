import React from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalContentProps,
  Box
} from '@chakra-ui/react';

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
        display={'flex'}
        flexDirection={'column'}
        w={w}
        minW={['90vw', '400px']}
        maxW={maxW}
        position={'relative'}
        maxH={'90vh'}
        {...props}
      >
        {!!title && <ModalHeader>{title}</ModalHeader>}
        <Box overflow={'overlay'} h={'100%'}>
          {showCloseBtn && <ModalCloseButton />}
          {children}
        </Box>
      </ModalContent>
    </Modal>
  );
};

export default MyModal;
