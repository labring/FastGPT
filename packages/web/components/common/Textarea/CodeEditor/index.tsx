import React from 'react';
import MyEditor, { type Props as EditorProps } from './Editor';
import { Button, useDisclosure } from '@chakra-ui/react';
import MyModal from '../../../v2/common/MyModal';
import { useTranslation } from 'next-i18next';

type Props = Omit<EditorProps, 'resize'> & {
  language?: string;
  resize?: boolean;
};
function getLanguage(language: string | undefined): string {
  let fullName: string;
  switch (language) {
    case 'py':
      fullName = 'python';
      break;
    case 'js':
      fullName = 'javascript';
      break;
    case 'sh':
    case 'shell':
    case 'bash':
      fullName = 'shell';
      break;
    default:
      fullName = `javascript`;
      break;
  }
  return fullName;
}

const CodeEditor = ({ resize = true, ...props }: Props) => {
  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const fullName = getLanguage(props.language);
  return (
    <>
      <MyEditor {...props} resize={resize} onOpenModal={onOpen} language={fullName} />
      <MyModal
        isOpen={isOpen}
        onClose={onClose}
        title={t('common:code_editor')}
        size={'md'}
        h={'85vh'}
        isCentered
        bodyStyles={{ flex: '1 0 0', minH: 0, overflow: 'auto' }}
        footer={<Button onClick={onClose}>{t('common:Confirm')}</Button>}
      >
        <MyEditor {...props} bg={'myGray.50'} height={'100%'} language={fullName} />
      </MyModal>
    </>
  );
};

export default React.memo(CodeEditor);
