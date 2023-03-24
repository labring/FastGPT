import React, { useState } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  Button,
  Input
} from '@chakra-ui/react';
import { postData } from '@/api/data';
import { useMutation } from '@tanstack/react-query';

const CreateDataModal = ({
  onClose,
  onSuccess
}: {
  onClose: () => void;
  onSuccess: () => void;
}) => {
  const [inputVal, setInputVal] = useState('');

  const { isLoading, mutate } = useMutation({
    mutationFn: (name: string) => postData(name),
    onSuccess() {
      onSuccess();
      onClose();
    }
  });

  return (
    <Modal isOpen={true} onClose={onClose}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>创建数据集</ModalHeader>
        <ModalCloseButton />

        <ModalBody display={'flex'}>
          <Input
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder={'数据集名称'}
          ></Input>
        </ModalBody>
        <ModalFooter>
          <Button colorScheme={'gray'} onClick={onClose}>
            取消
          </Button>
          <Button
            ml={3}
            isDisabled={inputVal === ''}
            isLoading={isLoading}
            onClick={() => mutate(inputVal)}
          >
            确认
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default CreateDataModal;
