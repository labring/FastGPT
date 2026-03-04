import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import React from 'react';
import SandboxEditor from './Editor';
import { useTranslation } from 'next-i18next';

type Props = {
  onClose: () => void;
  appId: string;
  chatId: string;
};

const SandboxEditorModal = ({ onClose, appId, chatId }: Props) => {
  const { t } = useTranslation();

  return (
    <MyModal
      isOpen
      onClose={onClose}
      title={t('chat:sandbox_files')}
      isCentered
      size="lg"
      h={'80vh'}
    >
      <SandboxEditor appId={appId} chatId={chatId} />
    </MyModal>
  );
};

export default SandboxEditorModal;
