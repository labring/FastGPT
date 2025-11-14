import React from 'react';
import MyEditor, { type Props as EditorProps } from './Editor';
import { Button, ModalBody, ModalFooter, useDisclosure } from '@chakra-ui/react';
import MyModal from '../../MyModal';
import { useTranslation } from 'next-i18next';

type Props = Omit<EditorProps, 'resize'> & { language?: string };
function getLanguage(language: string | undefined): string {
  let fullName: string;
  switch (language) {
    case 'py':
      fullName = 'python';
      break;
    case 'js':
      fullName = 'typescript';
      break;
    default:
      fullName = `typescript`;
      break;
  }
  return fullName;
}

const CodeEditor = (props: Props) => {
  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { language, ...otherProps } = props;
  const fullName = getLanguage(language);
  return (
    <>
      <MyEditor {...props} resize onOpenModal={onOpen} language={fullName} />
      <MyModal
        isOpen={isOpen}
        onClose={onClose}
        iconSrc="modal/edit"
        title={t('common:code_editor')}
        w={'full'}
        h={'85vh'}
        isCentered
      >
        <ModalBody flex={'1 0 0'} overflow={'auto'}>
          <MyEditor {...props} bg={'myGray.50'} height={'100%'} language={fullName} />
        </ModalBody>
        <ModalFooter>
          <Button mr={2} onClick={onClose} px={6}>
            {t('common:Confirm')}
          </Button>
        </ModalFooter>
      </MyModal>
    </>
  );
};

export default React.memo(CodeEditor);
