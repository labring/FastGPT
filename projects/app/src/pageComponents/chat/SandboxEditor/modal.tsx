import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import React from 'react';
import type { Props as EditorProps } from './Editor';
import SandboxEditor from './Editor';
import { useTranslation } from 'next-i18next';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';

type Props = EditorProps & {
  onClose: () => void;
};

const SandboxEditorModal = ({ onClose, ...props }: Props) => {
  const { t } = useTranslation();

  return (
    <MyModal
      isOpen
      onClose={onClose}
      title={t('chat:sandbox_files')}
      isCentered
      size="lg"
      h={'80vh'}
      closeOnOverlayClick={false}
    >
      <SandboxEditor {...props} />
    </MyModal>
  );
};

export default SandboxEditorModal;
