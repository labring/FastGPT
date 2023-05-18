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
        <ModalHeader>wx交流群</ModalHeader>
        <ModalCloseButton />
        <ModalBody textAlign={'center'}>
          <Image
            style={{ margin: 'auto' }}
            src={'https://otnvvf-imgs.oss.laf.run/wx300.png'}
            width={'200px'}
            height={'200px'}
            alt=""
          />
          <Box mt={2}>
            微信号:
            <Box as={'span'} userSelect={'all'}>
              fastgpt123
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
