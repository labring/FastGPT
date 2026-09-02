import React, { useEffect } from 'react';
import { useUserModelLists } from '@/web/core/ai/model/useUserModelLists';
import { Box, css, HStack, IconButton, useDisclosure } from '@chakra-ui/react';
import type { SettingAIDataType } from '@fastgpt/global/core/app/type';
import AISettingModal, { type AIChatSettingsModalProps } from '@/components/core/ai/AISettingModal';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import AIModelSelector from '@/components/Select/AIModelSelector';
import { getWebDefaultLLMModel } from '@/web/common/system/utils';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { findClientModelByValue } from '@/web/core/ai/model/modelReference';

type Props = {
  defaultData: SettingAIDataType;
  onChange: (e: SettingAIDataType) => void;
  bg?: string;
};

const SettingLLMModel = ({ defaultData, onChange, ...props }: AIChatSettingsModalProps & Props) => {
  const { t } = useTranslation();
  const { llmModelList } = useUserModelLists();

  const modelId = defaultData.modelId;

  const { modelList, defaultLLMModel } = useMemoEnhance(() => {
    const defaultModelData = getWebDefaultLLMModel(llmModelList);
    return {
      modelList: llmModelList,
      defaultLLMModel: defaultModelData?.modelId
    };
  }, [llmModelList]);

  const selectedModelData = findClientModelByValue({ models: llmModelList, value: modelId });

  // 只在新建场景没有 value 时设置默认模型；已有异常 value 必须保留给选择器展示错误。
  useEffect(() => {
    if (modelId === undefined && defaultLLMModel) {
      onChange({
        ...defaultData,
        modelId: defaultLLMModel
      });
    }
  }, [modelId, defaultData, defaultLLMModel]);

  const {
    isOpen: isOpenAIChatSetting,
    onOpen: onOpenAIChatSetting,
    onClose: onCloseAIChatSetting
  } = useDisclosure();

  return (
    <Box
      css={css({
        span: {
          display: 'block'
        }
      })}
      position={'relative'}
    >
      <HStack spacing={1}>
        <Box flex={'1 0 0'}>
          <AIModelSelector
            {...props}
            modelType={ModelTypeEnum.llm}
            w={'100%'}
            value={modelId}
            onChange={(e) => {
              onChange({
                ...defaultData,
                modelId: e
              });
            }}
          />
        </Box>
        <MyTooltip label={t('app:config_ai_model_params')}>
          <IconButton
            variant={'transparentBase'}
            icon={<MyIcon name="common/settingLight" w={'1.2rem'} />}
            aria-label={''}
            size={'mdSquare'}
            onClick={onOpenAIChatSetting}
          />
        </MyTooltip>
      </HStack>
      {isOpenAIChatSetting && (
        <AISettingModal
          onClose={onCloseAIChatSetting}
          onSuccess={(e) => {
            onChange(e);
            onCloseAIChatSetting();
          }}
          defaultData={{ ...defaultData, modelId: selectedModelData?.modelId ?? modelId }}
          llmModels={modelList}
          {...props}
        />
      )}
    </Box>
  );
};

export default React.memo(SettingLLMModel);
