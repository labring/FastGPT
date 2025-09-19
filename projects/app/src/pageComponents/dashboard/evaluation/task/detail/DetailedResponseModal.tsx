import React from 'react';
import { useTranslation } from 'next-i18next';
import MyModal from '@fastgpt/web/components/common/MyModal';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getChatResData } from '@/web/core/chat/api';
import { ResponseBox } from '@/components/core/chat/components/WholeResponseModal';

interface DetailedResponseModalProps {
  isOpen: boolean;
  onClose: () => void;
  chatId?: string;
  dataId: string;
  appId: string;
  chatTime?: Date;
}

const DetailedResponseModal = ({
  isOpen,
  onClose,
  chatId,
  dataId,
  appId,
  chatTime = new Date()
}: DetailedResponseModalProps) => {
  const { t } = useTranslation();

  const { loading: isLoading, data: response } = useRequest2(
    () => getChatResData({ chatId, dataId, appId }),
    {
      manual: false,
      ready: isOpen && !!dataId && !!appId
    }
  );

  return (
    <MyModal
      isCentered
      isOpen={isOpen}
      onClose={onClose}
      h={['90vh', '80vh']}
      isLoading={isLoading}
      maxH={['90vh', '700px']}
      minW={['90vw', '880px']}
      iconSrc="/imgs/modal/wholeRecord.svg"
      title={t('common:core.chat.response.Complete Response')}
    >
      {!!response?.length ? (
        <ResponseBox response={response} dataId={dataId} chatTime={chatTime} />
      ) : (
        <EmptyTip text={t('chat:no_workflow_response')} />
      )}
    </MyModal>
  );
};

export default DetailedResponseModal;
