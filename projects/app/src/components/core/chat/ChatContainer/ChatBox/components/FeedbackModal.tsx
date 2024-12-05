import React, { useRef } from 'react';
import { ModalBody, Textarea, ModalFooter, Button } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { updateChatUserFeedback } from '@/web/core/chat/api';
import { useContextSelector } from 'use-context-selector';
import { ChatBoxContext } from '../Provider';

const FeedbackModal = ({
  appId,
  chatId,
  dataId,
  onSuccess,
  onClose
}: {
  appId: string;
  chatId: string;
  dataId: string;
  onSuccess: (e: string) => void;
  onClose: () => void;
}) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  const { t } = useTranslation();
  const outLinkAuthData = useContextSelector(ChatBoxContext, (v) => v.outLinkAuthData);

  const { mutate, isLoading } = useRequest({
    mutationFn: async () => {
      const val = ref.current?.value || t('common:core.chat.feedback.No Content');
      return updateChatUserFeedback({
        appId,
        chatId,
        dataId,
        userBadFeedback: val,
        ...outLinkAuthData
      });
    },
    onSuccess() {
      onSuccess(ref.current?.value || t('common:core.chat.feedback.No Content'));
    },
    successToast: t('common:core.chat.Feedback Success'),
    errorToast: t('common:core.chat.Feedback Failed')
  });

  return (
    <MyModal
      isOpen={true}
      onClose={onClose}
      iconSrc="/imgs/modal/badAnswer.svg"
      title={t('common:core.chat.Feedback Modal')}
    >
      <ModalBody>
        <Textarea ref={ref} rows={10} placeholder={t('common:core.chat.Feedback Modal Tip')} />
      </ModalBody>
      <ModalFooter>
        <Button variant={'whiteBase'} mr={2} onClick={onClose}>
          {t('common:common.Close')}
        </Button>
        <Button isLoading={isLoading} onClick={mutate}>
          {t('common:core.chat.Feedback Submit')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default FeedbackModal;
