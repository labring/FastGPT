import { useState } from 'react';
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

// 常量定义
const PROMPT_TYPES = {
  AUTO_INDEXES: 'autoIndexes',
  HYPE_INDEXES: 'hypeIndexes'
} as const;

type PromptType = (typeof PROMPT_TYPES)[keyof typeof PROMPT_TYPES];

interface TrainingParams {
  autoIndexes: boolean;
  hypeIndexes: boolean;
  small2bigIndexes: boolean;
  hypeIndexPrompt?: string;
  autoIndexesPrompt?: string;
}

interface AdjustTrainingParamsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (params: TrainingParams) => void;
  defaultValues?: Partial<TrainingParams>;
  isLoading?: boolean;
}

const AdjustTrainingParamsModal = ({
  isOpen,
  onClose,
  onConfirm,
  defaultValues = {},
  isLoading = false
}: AdjustTrainingParamsModalProps) => {
  const { t, i18n } = useTranslation();
  const { feConfigs } = useSystemStore();

  // 索引状态管理
  const [indexes, setIndexes] = useState({
    autoIndexes: defaultValues.autoIndexes ?? false,
    hypeIndexes: defaultValues.hypeIndexes ?? false,
    small2bigIndexes: defaultValues.small2bigIndexes ?? false
  });

  // Prompt 状态管理
  const [prompts, setPrompts] = useState({
    hypeIndexPrompt: defaultValues.hypeIndexPrompt ?? '',
    autoIndexesPrompt: defaultValues.autoIndexesPrompt ?? ''
  });

  // Config prompt modal 状态
  const {
    isOpen: isOpenConfigPrompt,
    onOpen: onOpenConfigPrompt,
    onClose: onCloseConfigPrompt
  } = useDisclosure();

  const [currentPromptType, setCurrentPromptType] = useState<PromptType | ''>('');
  const [currentPromptValue, setCurrentPromptValue] = useState<string>('');

  // 获取当前 prompt 值的映射
  const getPromptValue = (type: PromptType): string => {
    switch (type) {
      case PROMPT_TYPES.AUTO_INDEXES:
        return prompts.autoIndexesPrompt;
      case PROMPT_TYPES.HYPE_INDEXES:
        return prompts.hypeIndexPrompt;
      default:
        return '';
    }
  };

  // 保存 prompt 值的映射
  const savePromptValue = (type: PromptType, content: string): void => {
    switch (type) {
      case PROMPT_TYPES.AUTO_INDEXES:
        setPrompts((prev) => ({ ...prev, autoIndexesPrompt: content }));
        break;
      case PROMPT_TYPES.HYPE_INDEXES:
        setPrompts((prev) => ({ ...prev, hypeIndexPrompt: content }));
        break;
    }
  };

  // 打开配置 prompt 弹窗
  const handleOpenConfigPrompt = (type: PromptType) => {
    setCurrentPromptType(type);
    setCurrentPromptValue(getPromptValue(type));
    onOpenConfigPrompt();
  };

  // 保存 prompt
  const handleSavePrompt = (content: string) => {
    if (currentPromptType) {
      savePromptValue(currentPromptType, content);
    }
  };

  // 处理索引状态变更
  const handleIndexChange = (indexType: keyof typeof indexes, checked: boolean) => {
    setIndexes((prev) => ({ ...prev, [indexType]: checked }));
  };

  // 确认提交
  const handleConfirm = () => {
    onConfirm({
      ...indexes,
      ...prompts
    });
    onClose();
  };

  // 渲染索引选项
  const renderIndexOption = (
    type: keyof typeof indexes,
    labelKey: string,
    tipKey: string,
    promptType?: PromptType
  ) => (
    <HStack flex={'1'} spacing={1}>
      <MyTooltip label={!feConfigs?.isPlus ? t('common:commercial_function_tip') : ''}>
        <Checkbox
          isDisabled={!feConfigs?.isPlus}
          isChecked={indexes[type]}
          onChange={(e) => handleIndexChange(type, e.target.checked)}
        >
          <FormLabel>{t(labelKey)}</FormLabel>
        </Checkbox>
      </MyTooltip>
      <QuestionTip label={t(tipKey)} />
      {promptType && (
        <MyTooltip label={t('dataset:config_prompt')}>
          <MyIcon
            name={'common/settingLight'}
            w={'16px'}
            cursor={feConfigs?.isPlus ? 'pointer' : 'not-allowed'}
            color={feConfigs?.isPlus ? 'myGray.500' : 'myGray.300'}
            _hover={{ color: feConfigs?.isPlus ? 'primary.500' : 'myGray.300' }}
            onClick={() => feConfigs?.isPlus && handleOpenConfigPrompt(promptType)}
          />
        </MyTooltip>
      )}
    </HStack>
  );

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
              {renderIndexOption(
                'autoIndexes',
                'dataset:auto_indexes',
                'dataset:auto_indexes_tips',
                PROMPT_TYPES.AUTO_INDEXES
              )}
              {renderIndexOption(
                'hypeIndexes',
                'dataset:hype_enhanced_index',
                'dataset:hype_enhanced_index_tips',
                PROMPT_TYPES.HYPE_INDEXES
              )}
              {renderIndexOption(
                'small2bigIndexes',
                'dataset:segment_enhanced_index',
                'dataset:segment_enhanced_index_tips'
              )}
            </Grid>
          </Box>
        </ModalBody>
        <ModalFooter>
          <Button variant="whiteBase" mr={2} onClick={onClose}>
            {t('common:Cancel')}
          </Button>
          <Button onClick={handleConfirm} isLoading={isLoading}>
            {t('common:Confirm')}
          </Button>
        </ModalFooter>
      </MyModal>

      {/* Config Prompt Modal */}
      {isOpenConfigPrompt && (
        <ConfigPromptModal
          isOpen={isOpenConfigPrompt}
          onClose={onCloseConfigPrompt}
          defaultValue={currentPromptValue}
          onConfirm={handleSavePrompt}
        />
      )}
    </>
  );
};

export default AdjustTrainingParamsModal;
