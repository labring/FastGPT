import React, { useCallback, useRef } from 'react';
import { Input, useDisclosure, Button } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useTranslation } from 'next-i18next';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';

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

  const EditModal = useCallback(
    ({
      maxLength = 50,
      closeBtnText = t('common:Close'),
      size = 'md'
    }: {
      maxLength?: number;
      closeBtnText?: string;
      size?: 'sm' | 'md' | 'lg' | 'xl';
    }) => {
      const { runAsync, loading } = useRequest(onclickConfirm);

      return (
        <MyModal
          isOpen={isOpen}
          onClose={onClose}
          title={title}
          size={size}
          footer={
            <>
              {!!closeBtnText && (
                <Button variant={'whiteBase'} onClick={onClose}>
                  {closeBtnText}
                </Button>
              )}
              <Button onClick={runAsync} isLoading={loading}>
                {t('common:Confirm')}
              </Button>
            </>
          }
        >
          {!!tip && <FormLabel mb={2}>{tip}</FormLabel>}

          <Input
            ref={inputRef}
            defaultValue={defaultValue.current}
            placeholder={placeholder}
            autoFocus
            maxLength={maxLength}
          />
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
