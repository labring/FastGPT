import React from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalBody,
  ModalCloseButton,
  ModalHeader,
  Box,
  useTheme
} from '@chakra-ui/react';
import { ChatItemType } from '@/types/chat';

const ContextModal = ({
  context = [],
  onClose
}: {
  context: ChatItemType[];
  onClose: () => void;
}) => {
  const theme = useTheme();

  return (
    <>
      <Modal isOpen={true} onClose={onClose}>
        <ModalOverlay />
        <ModalContent
          position={'relative'}
          maxW={'min(90vw, 700px)'}
          h={'80vh'}
          overflow={'overlay'}
        >
          <ModalHeader>完整对话记录({context.length}条)</ModalHeader>
          <ModalCloseButton />
          <ModalBody pt={0} whiteSpace={'pre-wrap'} textAlign={'justify'} fontSize={'sm'}>
            {context.map((item, i) => (
              <Box
                key={i}
                p={2}
                borderRadius={'lg'}
                border={theme.borders.base}
                _notLast={{ mb: 2 }}
                position={'relative'}
              >
                <Box fontWeight={'bold'}>{item.obj}</Box>
                <Box>{item.value}</Box>
              </Box>
            ))}
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
};

export default ContextModal;
