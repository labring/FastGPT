import React from 'react';
import MyEditor, { type Props as EditorProps } from './Editor';
import { Button, ModalBody, ModalFooter, useDisclosure } from '@chakra-ui/react';
import MyModal from '../../MyModal';
import { useTranslation } from 'next-i18next';

type Props = Omit<EditorProps, 'resize'> & {};

const CodeEditor = (props: Props) => {
  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();

  return (
    <>
      <MyEditor {...props} resize onOpenModal={onOpen} />
      <MyModal
        isOpen={isOpen}
        onClose={onClose}
        iconSrc="modal/edit"
        title={t('common:code_editor')}
        w={'full'}
      >
        <ModalBody>
          <MyEditor {...props} bg={'myGray.50'} defaultHeight={600} />
        </ModalBody>
        <ModalFooter>
          <Button mr={2} onClick={onClose} px={6}>
            {t('common:common.Confirm')}
          </Button>
        </ModalFooter>
      </MyModal>
    </>
  );
};

export default React.memo(CodeEditor);
