import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import React from 'react';
import { Box } from '@chakra-ui/react';
import type { Props as EditorProps } from './Editor';
import SandboxEditor from './Editor';
import { useTranslation } from 'next-i18next';

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
      h={'85vh'}
      closeOnOverlayClick={false}
    >
      <Box
        flex={1}
        minH={0}
        display={'flex'}
        flexDirection={'column'}
        bg={'white'}
        borderRadius={'md'}
        border={'1px solid'}
        borderColor={'myGray.200'}
        overflow={'hidden'}
      >
        <SandboxEditor {...props} />
      </Box>
    </MyModal>
  );
};

export default SandboxEditorModal;
