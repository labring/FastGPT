import React, { useRef } from 'react';
import { ModalFooter, ModalBody, Button } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import MyTextarea from '@/components/common/Textarea/MyTextarea';

interface ConfigPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultValue?: string;
  onSuccess: (content: string) => void | Promise<void>;
  onError?: (err: any) => void;
}

const ConfigPromptModal = ({
  isOpen,
  onClose,
  defaultValue = '',
  onSuccess,
  onError
}: ConfigPromptModalProps) => {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const onClickConfirm = async () => {
    if (!textareaRef.current) return;
    const val = textareaRef.current.value;

    try {
      await onSuccess(val);
      onClose();
    } catch (err) {
      onError?.(err);
    }
  };

  const { runAsync, loading } = useRequest2(onClickConfirm);

  return (
    <MyModal
      isOpen={isOpen}
      onClose={onClose}
      iconSrc="common/setting"
      iconColor="primary.600"
      title={t('dataset:config_prompt')}
      w={'700px'}
    >
      <ModalBody>
        <MyTextarea ref={textareaRef} defaultValue={defaultValue} h={'400px'} />
      </ModalBody>
      <ModalFooter>
        <Button mr={3} variant={'whiteBase'} onClick={onClose}>
          {t('common:Cancel')}
        </Button>
        <Button onClick={runAsync} isLoading={loading}>
          {t('common:Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default ConfigPromptModal;
