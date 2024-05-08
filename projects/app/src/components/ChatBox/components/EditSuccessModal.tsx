import React, { useState } from 'react';
import {
  Flex,
  Text,
  Image,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  HStack,
  VStack,
  CloseButton
} from '@chakra-ui/react';
import { transform } from 'lodash';

const EditSuccessModal = ({ onClose }: { onClose: () => void }) => {
  return (
    <Modal isOpen={true} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent w="80vw">
        <ModalBody>
          <VStack h="50.67vw" spacing={3} justifyContent={'center'}>
            <Image
              boxSize="26vw"
              objectFit="cover"
              src={'/imgs/dataset/thx-callback.gif'}
              alt={''}
              fallbackSrc={'/imgs/errImg.png'}
            ></Image>
            <Text fontSize={'4vw'} color={'#2F6DFE'} fontWeight={800}>
              感谢您的共建！
            </Text>
            <Text fontSize={'3.47vw'} color={'#333'}>
              您的修改如经采用，将进入知识库存储~
            </Text>
          </VStack>
          <CloseButton
            size="lg"
            color={'#fff'}
            css={{
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)',
              bottom: '-13vw'
            }}
            onClick={onClose}
          />
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default React.memo(EditSuccessModal);
