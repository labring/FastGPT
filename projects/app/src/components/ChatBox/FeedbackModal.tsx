import React, { useRef } from 'react';
import { ModalBody, Textarea, ModalFooter, Button } from '@chakra-ui/react';
import MyModal from '../MyModal';
import { useRequest } from '@/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { userUpdateChatFeedback } from '@/api/chat';

const FeedbackModal = ({
  chatItemId,
  onSuccess,
  onClose
}: {
  chatItemId: string;
  onSuccess: (e: string) => void;
  onClose: () => void;
}) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  const { t } = useTranslation();

  const { mutate, isLoading } = useRequest({
    mutationFn: async () => {
      const val = ref.current?.value || 'N/A';
      return userUpdateChatFeedback({
        chatItemId,
        userFeedback: val
      });
    },
    onSuccess() {
      onSuccess(ref.current?.value || 'N/A');
    },
    successToast: t('chat.Feedback Success'),
    errorToast: t('chat.Feedback Failed')
  });

  return (
    <MyModal isOpen={true} onClose={onClose} title={t('chat.Feedback Modal')}>
      <ModalBody>
        <Textarea
          ref={ref}
          rows={10}
          placeholder={t('chat.Feedback Modal Tip') || 'chat.Feedback Modal Tip'}
        />
      </ModalBody>
      <ModalFooter>
        <Button variant={'base'} mr={2} onClick={onClose}>
          {t('Cancel')}
        </Button>
        <Button isLoading={isLoading} onClick={mutate}>
          {t('chat.Feedback Submit')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default FeedbackModal;
