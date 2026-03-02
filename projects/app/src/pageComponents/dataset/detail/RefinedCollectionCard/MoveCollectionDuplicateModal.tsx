import React from 'react';
import { ModalBody, ModalFooter, Button, Box, HStack, VStack } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyModal from '@fastgpt/web/components/common/MyModal';

interface MoveCollectionDuplicateModalProps {
  isOpen: boolean;
  onClose: () => void;
  duplicateFiles: string[];
  onSkip: () => void;
  onContinueMove: () => void;
  onReplaceFiles: () => void;
}

const MoveCollectionDuplicateModal: React.FC<MoveCollectionDuplicateModalProps> = ({
  isOpen,
  onClose,
  duplicateFiles,
  onSkip,
  onContinueMove,
  onReplaceFiles
}) => {
  const { t } = useTranslation();

  return (
    <MyModal
      iconSrc="common/warn"
      iconColor={'yellow.600'}
      title={t('dataset:move_file_duplicate')}
      isOpen={isOpen}
      w={'400px'}
      onClose={onClose}
    >
      <ModalBody>
        <VStack spacing={3} alignItems="stretch">
          <Box fontSize={'14px'} lineHeight={'20px'} color={'myGray.900'}>
            {t('dataset:move_duplicate_files_exist')}
          </Box>
        </VStack>
      </ModalBody>
      <ModalFooter>
        <HStack spacing={3} w={'100%'} justifyContent={'flex-end'}>
          <Button variant="whiteBase" onClick={onSkip}>
            {t('dataset:skip_move')}
          </Button>
          <Button variant="whiteBase" onClick={onContinueMove}>
            {t('dataset:continue_move')}
          </Button>
          <Button variant="primary" onClick={onReplaceFiles}>
            {t('dataset:replace_duplicate_files')}
          </Button>
        </HStack>
      </ModalFooter>
    </MyModal>
  );
};

export default MoveCollectionDuplicateModal;
