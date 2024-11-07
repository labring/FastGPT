import React, { useCallback, useRef } from 'react';
import { ModalFooter, ModalBody, Input, useDisclosure, Button, Box } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useTranslation } from 'next-i18next';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';

export const useEditTitle = ({
  title,
  tip,
  placeholder = '',
  canEmpty = true,
  valueRule
}: {
  title: string;
  tip?: string;
  placeholder?: string;
  canEmpty?: boolean;
  valueRule?: (val: string) => string | void;
}) => {
  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();

  const inputRef = useRef<HTMLInputElement | null>(null);
  const onSuccessCb = useRef<(content: string) => void | Promise<void>>();
  const onErrorCb = useRef<(err: any) => void>();
  const { toast } = useToast();
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
    if (!inputRef.current || !onSuccessCb.current) return;
    const val = inputRef.current.value;

    if (!canEmpty && !val) {
      inputRef.current.focus();
      return;
    }

    if (valueRule) {
      const result = valueRule(val);
      if (result) {
        return toast({
          status: 'warning',
          title: result
        });
      }
    }

    try {
      await onSuccessCb.current(val);

      onClose();
    } catch (err) {
      onErrorCb.current?.(err);
    }
  }, [canEmpty, onClose, toast, valueRule]);

  // eslint-disable-next-line react/display-name
  const EditModal = useCallback(
    ({
      maxLength = 50,
      iconSrc = 'modal/edit',
      closeBtnText = t('common:common.Close')
    }: {
      maxLength?: number;
      iconSrc?: string;
      closeBtnText?: string;
    }) => {
      const { runAsync, loading } = useRequest2(onclickConfirm);

      return (
        <MyModal isOpen={isOpen} onClose={onClose} iconSrc={iconSrc} title={title} maxW={'500px'}>
          <ModalBody>
            {!!tip && (
              <Box mb={2} color={'myGray.500'} fontSize={'sm'}>
                {tip}
              </Box>
            )}

            <Input
              ref={inputRef}
              defaultValue={defaultValue.current}
              placeholder={placeholder}
              autoFocus
              maxLength={maxLength}
            />
          </ModalBody>
          <ModalFooter>
            {!!closeBtnText && (
              <Button mr={3} variant={'whiteBase'} onClick={onClose}>
                {closeBtnText}
              </Button>
            )}
            <Button onClick={runAsync} isLoading={loading}>
              {t('common:common.Confirm')}
            </Button>
          </ModalFooter>
        </MyModal>
      );
    },
    [isOpen, onClose, onclickConfirm, placeholder, t, tip, title]
  );

  return {
    onOpenModal,
    EditModal
  };
};
