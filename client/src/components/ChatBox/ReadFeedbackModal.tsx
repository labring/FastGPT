import React from 'react';
import { ModalBody, ModalFooter, Button } from '@chakra-ui/react';
import MyModal from '../MyModal';
import { useRequest } from '@/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { userUpdateChatFeedback } from '@/api/chat';

const ReadFeedbackModal = ({
  chatItemId,
  content,
  isMarked,
  onMark,
  onSuccess,
  onClose
}: {
  chatItemId: string;
  content: string;
  isMarked: boolean;
  onMark: () => void;
  onSuccess: () => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();

  const { mutate, isLoading } = useRequest({
    mutationFn: async () => {
      return userUpdateChatFeedback({
        chatItemId,
        userFeedback: undefined
      });
    },
    onSuccess() {
      onSuccess();
    },
    errorToast: t('chat.Feedback Update Failed')
  });

  return (
    <MyModal isOpen={true} onClose={onClose} title={t('chat.Feedback Modal')}>
      <ModalBody>{content}</ModalBody>
      <ModalFooter>
        {!isMarked && (
          <Button variant={'base'} mr={2} onClick={onMark}>
            {t('chat.Feedback Mark')}
          </Button>
        )}
        <Button isLoading={isLoading} onClick={mutate}>
          {t('chat.Feedback Close')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default React.memo(ReadFeedbackModal);
