import React, { useRef } from 'react';
import { ModalBody, Textarea, ModalFooter, Button } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { updateChatUserFeedback } from '@/web/core/chat/api';

const FeedbackModal = ({
  appId,
  chatId,
  chatItemId,
  teamId,
  teamToken,
  shareId,
  outLinkUid,
  onSuccess,
  onClose
}: {
  appId: string;
  chatId: string;
  chatItemId: string;
  shareId?: string;
  teamId?: string;
  teamToken?: string;
  outLinkUid?: string;
  onSuccess: (e: string) => void;
  onClose: () => void;
}) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  const { t } = useTranslation();

  const { mutate, isLoading } = useRequest({
    mutationFn: async () => {
      const val = ref.current?.value || t('core.chat.feedback.No Content');
      return updateChatUserFeedback({
        appId,
        chatId,
        chatItemId,
        shareId,
        teamId,
        teamToken,
        outLinkUid,
        userBadFeedback: val
      });
    },
    onSuccess() {
      onSuccess(ref.current?.value || t('core.chat.feedback.No Content'));
    },
    successToast: t('core.chat.Feedback Success'),
    errorToast: t('core.chat.Feedback Failed')
  });

  return (
    <MyModal
      isOpen={true}
      onClose={onClose}
      iconSrc="/imgs/modal/badAnswer.svg"
      title={t('core.chat.Feedback Modal')}
    >
      <ModalBody>
        <Textarea ref={ref} rows={10} placeholder={t('core.chat.Feedback Modal Tip')} />
      </ModalBody>
      <ModalFooter>
        <Button variant={'whiteBase'} mr={2} onClick={onClose}>
          {t('common.Close')}
        </Button>
        <Button isLoading={isLoading} onClick={mutate}>
          {t('core.chat.Feedback Submit')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default FeedbackModal;
