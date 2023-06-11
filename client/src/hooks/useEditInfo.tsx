import React, { useCallback, useRef } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  Input,
  useDisclosure,
  Button
} from '@chakra-ui/react';

export const useEditInfo = ({
  title,
  placeholder = ''
}: {
  title: string;
  placeholder?: string;
}) => {
  const { isOpen, onOpen, onClose } = useDisclosure();

  const inputRef = useRef<HTMLInputElement | null>(null);
  const onSuccessCb = useRef<(content: string) => void | Promise<void>>();
  const onErrorCb = useRef<(err: any) => void>();
  const defaultValue = useRef('');

  const onOpenModal = useCallback(
    ({
      defaultVal,
      onSuccess,
      onError
    }: {
      defaultVal: string;
      onSuccess: (content: string) => any;
      onError?: (err: any) => void;
    }) => {
      onOpen();
      onSuccessCb.current = onSuccess;
      onErrorCb.current = onError;
      defaultValue.current = defaultVal;
    },
    [onOpen]
  );

  const onclickConfirm = useCallback(async () => {
    if (!inputRef.current) return;
    try {
      const val = inputRef.current.value;
      await onSuccessCb.current?.(val);
      onClose();
    } catch (err) {
      onErrorCb.current?.(err);
    }
  }, [onClose]);

  // eslint-disable-next-line react/display-name
  const EditModal = useCallback(
    () => (
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{title}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Input
              ref={inputRef}
              defaultValue={defaultValue.current}
              placeholder={placeholder}
              autoFocus
              maxLength={20}
            />
          </ModalBody>
          <ModalFooter>
            <Button mr={3} variant={'base'} onClick={onClose}>
              取消
            </Button>
            <Button onClick={onclickConfirm}>确认</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    ),
    [isOpen, onClose, onclickConfirm, placeholder, title]
  );

  return {
    onOpenModal,
    EditModal
  };
};
