import React from 'react';
import { ModalBody, ModalFooter, Button, Box, HStack, VStack } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';

export interface Md5DuplicateItem {
  existingFileName: string;
  newFileName: string;
  type?: 'batch' | 'dataset';
}

interface Md5DuplicateModalProps {
  isOpen: boolean;
  onClose: () => void;
  md5DuplicateFiles: Md5DuplicateItem[];
  /** 确认后回调：过滤掉重复文件，继续上传剩余文件 */
  onConfirm: () => void;
}

const Md5DuplicateModal: React.FC<Md5DuplicateModalProps> = ({
  isOpen,
  onClose,
  md5DuplicateFiles,
  onConfirm
}) => {
  const { t } = useTranslation();

  return (
    <MyModal
      iconSrc="common/warn"
      iconColor={'yellow.600'}
      title={t('dataset:file_duplicate')}
      isOpen={isOpen}
      w={'480px'}
      onClose={onClose}
    >
      <ModalBody>
        <VStack p={2} spacing={3} alignItems="stretch">
          <Box fontSize={'14px'} lineHeight={'20px'} color={'myGray.900'}>
            {t('dataset:md5_duplicate_files_exist')}
          </Box>
          <VStack spacing={0} alignItems="stretch">
            {md5DuplicateFiles.map((item, index) => (
              <HStack
                key={index}
                spacing={0}
                alignItems="center"
                h={'38px'}
                borderBottom={'1px solid #EDF2F7'}
              >
                <HStack
                  flex={1}
                  overflow="hidden"
                  spacing={'8px'}
                  alignItems="center"
                  px={'8px'}
                  py={'4px'}
                >
                  <MyTooltip label={item.existingFileName}>
                    <Box
                      flex={1}
                      fontSize={'14px'}
                      color={'myGray.550'}
                      lineHeight={'1.6'}
                      noOfLines={1}
                    >
                      {item.existingFileName}
                    </Box>
                  </MyTooltip>
                  <Box
                    fontSize={'11px'}
                    px={'8px'}
                    py={'4px'}
                    borderRadius={'33px'}
                    lineHeight={1}
                    bg={item.type === 'dataset' ? '#F0F4FF' : '#FFFAEB'}
                    color={item.type === 'dataset' ? 'blue.600' : 'orange.600'}
                    flexShrink={0}
                  >
                    {item.type === 'dataset' ? t('dataset:existing_file') : t('dataset:new_upload')}
                  </Box>
                </HStack>
                <HStack
                  flex={1}
                  overflow="hidden"
                  spacing={'8px'}
                  alignItems="center"
                  px={'8px'}
                  py={'4px'}
                >
                  <MyTooltip label={item.newFileName}>
                    <Box
                      flex={1}
                      fontSize={'14px'}
                      color={'myGray.550'}
                      lineHeight={'1.6'}
                      noOfLines={1}
                    >
                      {item.newFileName}
                    </Box>
                  </MyTooltip>
                  <Box
                    fontSize={'11px'}
                    px={'8px'}
                    py={'4px'}
                    borderRadius={'33px'}
                    lineHeight={1}
                    bg={'#FFFAEB'}
                    color={'orange.600'}
                    flexShrink={0}
                  >
                    {t('dataset:new_upload')}
                  </Box>
                </HStack>
              </HStack>
            ))}
          </VStack>
        </VStack>
      </ModalBody>
      <ModalFooter>
        <HStack spacing={3} w={'100%'} justifyContent={'flex-end'}>
          <Button variant="whitePrimary" onClick={onConfirm}>
            {t('dataset:md5_duplicate_confirm')}
          </Button>
        </HStack>
      </ModalFooter>
    </MyModal>
  );
};

export default Md5DuplicateModal;
