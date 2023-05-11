import React from 'react';
import {
  Box,
  Button,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  useColorModeValue,
  Image
} from '@chakra-ui/react';

const WxConcat = ({ onClose }: { onClose: () => void }) => {
  return (
    <Modal isOpen={true} onClose={onClose}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>QQ频道</ModalHeader>
        <ModalCloseButton />
        <ModalBody textAlign={'center'}>
          <Image
            style={{ margin: 'auto' }}
            src={'/imgs/wx300.jpg'}
            width={'200px'}
            height={'200px'}
            alt=""
          />
          <Box mt={2}>
            QQ频道号:
            <Box as={'span'} userSelect={'all'}>
            4lu816ki1o
            </Box>
          </Box>
        </ModalBody>

        <ModalFooter>
          <Button variant={'outline'} onClick={onClose}>
            关闭
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default WxConcat;
