import React from 'react';
import MyModal from '@/components/MyModal';
import { ModalBody } from '@chakra-ui/react';

export type PreviewRawTextProps = {
  icon: string;
  title: string;
  rawText: string;
};

const PreviewRawText = ({
  icon,
  title,
  rawText,
  onClose
}: PreviewRawTextProps & {
  onClose: () => void;
}) => {
  return (
    <MyModal isOpen onClose={onClose} iconSrc={icon} title={title}>
      <ModalBody whiteSpace={'pre-wrap'} overflowY={'auto'}>
        {rawText}
      </ModalBody>
    </MyModal>
  );
};

export default PreviewRawText;
