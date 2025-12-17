import React from 'react';
import { useTranslation } from 'next-i18next';
import MyModal from '@fastgpt/web/components/common/MyModal';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getChatResData } from '@/web/core/chat/api';
import { ResponseBox } from './WholeResponseModal';

interface StandaloneResponseModalProps {
  isOpen: boolean;
  onClose: () => void;
  dataId: string;
  appId: string;
  chatId?: string;
  chatTime?: Date;
  outLinkAuthData?: any;
}

const StandaloneResponseModal = ({
  isOpen,
  onClose,
  dataId,
  appId,
  chatId,
  chatTime = new Date(),
  outLinkAuthData = {}
}: StandaloneResponseModalProps) => {
  const { t } = useTranslation();
  console.log({
    chatId,
    dataId,
    appId,
    ...outLinkAuthData
  });
  const { loading: isLoading, data: response } = useRequest2(
    () =>
      getChatResData({
        chatId,
        dataId,
        appId,
        ...outLinkAuthData
      }),
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
      title={<React.Fragment>{t('common:core.chat.response.Complete Response')}</React.Fragment>}
    >
      {!!response?.length ? (
        <ResponseBox
          response={response}
          dataId={dataId}
          chatTime={chatTime}
          appId={appId}
          chatId={chatId}
        />
      ) : (
        <EmptyTip text={t('chat:no_workflow_response')} />
      )}
    </MyModal>
  );
};

export default StandaloneResponseModal;
