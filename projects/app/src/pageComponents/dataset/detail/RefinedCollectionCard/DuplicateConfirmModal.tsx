import React from 'react';
import { ModalBody, ModalFooter, Button, Box, HStack, VStack } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyModal from '@fastgpt/web/components/common/MyModal';

interface DuplicateConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  duplicateFiles: string[];
  onSkipDuplicates: () => void;
  onContinueUpload: () => void;
  onReplaceFiles: () => void;
}

const DuplicateConfirmModal: React.FC<DuplicateConfirmModalProps> = ({
  isOpen,
  onClose,
  duplicateFiles,
  onSkipDuplicates,
  onContinueUpload,
  onReplaceFiles
}) => {
  const { t } = useTranslation();

  return (
    <MyModal
      iconSrc="common/warn"
      iconColor={'yellow.600'}
      title={t('dataset:file_duplicate')}
      isOpen={isOpen}
      w={'400px'}
      onClose={onClose}
    >
      <ModalBody>
        <VStack spacing={3} alignItems="stretch">
          <Box fontSize={'14px'} lineHeight={'20px'} color={'myGray.900'}>
            {t('dataset:duplicate_files_exist')}
          </Box>
          <VStack spacing={1} alignItems="stretch">
            {duplicateFiles.map((fileName, index) => (
              <Box key={index} fontSize={'14px'} lineHeight={'20px'} color={'myGray.600'}>
                {fileName}
              </Box>
            ))}
          </VStack>
        </VStack>
      </ModalBody>
      <ModalFooter>
        <HStack spacing={3} w={'100%'} justifyContent={'flex-end'}>
          <Button variant="whiteBase" onClick={onSkipDuplicates}>
            {t('dataset:skip_duplicate_files')}
          </Button>
          <Button variant="whiteBase" onClick={onContinueUpload}>
            {t('dataset:continue_upload')}
          </Button>
          <Button variant="primary" onClick={onReplaceFiles}>
            {t('dataset:replace_duplicate_files')}
          </Button>
        </HStack>
      </ModalFooter>
    </MyModal>
  );
};

export default DuplicateConfirmModal;
