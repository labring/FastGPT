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
  Image
} from '@chakra-ui/react';

const WxConcat = ({ onClose }: { onClose: () => void }) => {
  return (
    <Modal isOpen={true} onClose={onClose}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>联系方式-wx</ModalHeader>
        <ModalCloseButton />
        <ModalBody textAlign={'center'}>
          {/* <Image
            style={{ margin: 'auto' }}
            src={'https://otnvvf-imgs.oss.laf.run/wx300.jpg'}
            width={'200px'}
            height={'200px'}
            alt=""
          /> */}

          <a
            href="https://docs.qq.com/doc/DUlJ3UWJqZW5hZnVJ?u=b9dbb458934d4d13a01cf31ebfd0d472"
            target="_blank"
            rel="noopener noreferrer"
          >
            点击打开文档查看联系方式
          </a>
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
