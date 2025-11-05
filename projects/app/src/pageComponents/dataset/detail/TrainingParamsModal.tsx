import React, { useState } from 'react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import {
  Box,
  Button,
  ModalBody,
  ModalFooter,
  HStack,
  Checkbox,
  Grid,
  useDisclosure
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import ConfigPromptModal from '@/pageComponents/dataset/detail/ConfigPromptModal';

interface AdjustTrainingParamsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (params: {
    autoIndexes: boolean;
    hypeIndexes: boolean;
    small2bigIndexes: boolean;
  }) => void;
  defaultValues?: {
    autoIndexes?: boolean;
    hypeIndexes?: boolean;
    small2bigIndexes?: boolean;
  };
}

const AdjustTrainingParamsModal = ({
  isOpen,
  onClose,
  onConfirm,
  defaultValues = {}
}: AdjustTrainingParamsModalProps) => {
  const { t, i18n } = useTranslation();
  const { feConfigs } = useSystemStore();

  // Index enhance states
  const [autoIndexes, setAutoIndexes] = useState(defaultValues.autoIndexes ?? false);
  const [hypeIndexes, setHypeIndexes] = useState(defaultValues.hypeIndexes ?? false);
  const [small2bigIndexes, setSmall2bigIndexes] = useState(defaultValues.small2bigIndexes ?? false);

  // Config prompt modal
  const {
    isOpen: isOpenConfigPrompt,
    onOpen: onOpenConfigPrompt,
    onClose: onCloseConfigPrompt
  } = useDisclosure();
  const [currentPromptType, setCurrentPromptType] = useState<string>('');

  const handleOpenConfigPrompt = (type: string) => {
    setCurrentPromptType(type);
    onOpenConfigPrompt();
  };

  const handleSavePrompt = async (content: string) => {
    // TODO: 后续联调补充保存逻辑
    console.log('Save prompt:', currentPromptType, content);
  };

  const handleConfirm = () => {
    onConfirm({
      autoIndexes,
      hypeIndexes,
      small2bigIndexes
    });
    onClose();
  };

  return (
    <>
      <MyModal
        iconSrc="common/settingLight"
        iconColor={'primary.600'}
        title={t('dataset:retain_collection')}
        isOpen={isOpen}
        onClose={onClose}
        w={'500px'}
        h={'auto'}
      >
        <ModalBody py={6} px={8}>
          <Box fontSize={'sm'} fontWeight={500} color={'myGray.900'}>
            <Box mb={3}>{t('dataset:enhanced_indexes')}</Box>
            <Grid
              gridTemplateColumns={i18n.language === 'en' ? '1fr' : '1fr 1fr'}
              rowGap={[1, 4]}
              columnGap={[3, 7]}
            >
              <HStack flex={'1'} spacing={1}>
                <MyTooltip label={!feConfigs?.isPlus ? t('common:commercial_function_tip') : ''}>
                  <Checkbox
                    isDisabled={!feConfigs?.isPlus}
                    isChecked={autoIndexes}
                    onChange={(e) => setAutoIndexes(e.target.checked)}
                  >
                    <FormLabel>{t('dataset:auto_indexes')}</FormLabel>
                  </Checkbox>
                </MyTooltip>
                <QuestionTip label={t('dataset:auto_indexes_tips')} />
                <MyTooltip label={t('dataset:config_prompt')}>
                  <MyIcon
                    name={'common/settingLight'}
                    w={'16px'}
                    cursor={'pointer'}
                    color={'myGray.500'}
                    _hover={{ color: 'primary.500' }}
                    onClick={() => handleOpenConfigPrompt('autoIndexes')}
                  />
                </MyTooltip>
              </HStack>
              <HStack flex={'1'} spacing={1}>
                <MyTooltip label={!feConfigs?.isPlus ? t('common:commercial_function_tip') : ''}>
                  <Checkbox
                    isDisabled={!feConfigs?.isPlus}
                    isChecked={hypeIndexes}
                    onChange={(e) => setHypeIndexes(e.target.checked)}
                  >
                    <FormLabel>{t('dataset:hype_enhanced_index')}</FormLabel>
                  </Checkbox>
                </MyTooltip>
                <QuestionTip label={t('dataset:hype_enhanced_index_tips')} />
                <MyTooltip label={t('dataset:config_prompt')}>
                  <MyIcon
                    name={'common/settingLight'}
                    w={'16px'}
                    cursor={'pointer'}
                    color={'myGray.500'}
                    _hover={{ color: 'primary.500' }}
                    onClick={() => handleOpenConfigPrompt('hypeIndexes')}
                  />
                </MyTooltip>
              </HStack>
              <HStack flex={'1'} spacing={1}>
                <MyTooltip label={!feConfigs?.isPlus ? t('common:commercial_function_tip') : ''}>
                  <Checkbox
                    isDisabled={!feConfigs?.isPlus}
                    isChecked={small2bigIndexes}
                    onChange={(e) => setSmall2bigIndexes(e.target.checked)}
                  >
                    <FormLabel>{t('dataset:small2big_enhanced_index')}</FormLabel>
                  </Checkbox>
                </MyTooltip>
                <QuestionTip label={t('dataset:small2big_enhanced_index_tips')} />
                <MyTooltip label={t('dataset:config_prompt')}>
                  <MyIcon
                    name={'common/settingLight'}
                    w={'16px'}
                    cursor={'pointer'}
                    color={'myGray.500'}
                    _hover={{ color: 'primary.500' }}
                    onClick={() => handleOpenConfigPrompt('small2bigIndexes')}
                  />
                </MyTooltip>
              </HStack>
            </Grid>
          </Box>
        </ModalBody>
        <ModalFooter>
          <Button variant="whiteBase" mr={2} onClick={onClose}>
            {t('common:Cancel')}
          </Button>
          <Button onClick={handleConfirm}>{t('common:Confirm')}</Button>
        </ModalFooter>
      </MyModal>

      {/* Config Prompt Modal */}
      {isOpenConfigPrompt && (
        <ConfigPromptModal
          isOpen={isOpenConfigPrompt}
          onClose={onCloseConfigPrompt}
          defaultValue=""
          onSuccess={handleSavePrompt}
        />
      )}
    </>
  );
};

export default AdjustTrainingParamsModal;
