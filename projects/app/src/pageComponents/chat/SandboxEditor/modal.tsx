import MyModal from '@fastgpt/web/components/common/MyModal';
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
      title={'Files'}
      iconSrc="core/workflow/template/sandbox"
      isCentered
      w="100%"
      h="90vh"
      maxW={['90vw', '1000px']}
    >
      <SandboxEditor appId={appId} chatId={chatId} />
    </MyModal>
  );
};

export default SandboxEditorModal;
