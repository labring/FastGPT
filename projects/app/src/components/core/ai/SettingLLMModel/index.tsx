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
import { getLLMSupportParams } from '@fastgpt/global/core/ai/llm/utils';
import { filterModelMultimodalSettings } from './utils';
import { getModelInitializationValue } from '@/web/core/ai/model/selection';

type Props = {
  defaultData: SettingAIDataType;
  onChange: (e: SettingAIDataType) => void;
  bg?: string;
  /** 工作流包装器自行写入节点默认值时关闭，避免两个 effect 竞争初始化。 */
  autoInitializeModel?: boolean;
};

const SettingLLMModel = ({
  defaultData,
  onChange,
  autoInitializeModel = true,
  ...props
}: AIChatSettingsModalProps & Props) => {
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

  // 默认值必须写入表单；展示只读取当前值，不把临时计算结果传给选择器。
  useEffect(() => {
    if (!autoInitializeModel) return;
    const nextModelId = getModelInitializationValue({
      value: modelId,
      models: llmModelList,
      defaultModelId: defaultLLMModel
    });
    if (nextModelId && nextModelId !== modelId) {
      onChange({
        ...defaultData,
        modelId: nextModelId
      });
    }
  }, [autoInitializeModel, modelId, defaultData, defaultLLMModel, llmModelList, onChange]);

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
              const modelData = findClientModelByValue({ models: llmModelList, value: e });
              const settings = (() => {
                // 只清理有显式开关的工作流配置，隐藏配置的表单交给后端判断模型能力。
                if (
                  props.showMultimodalConfig === false ||
                  defaultData.aiChatVision === undefined ||
                  !modelData
                ) {
                  return defaultData;
                }
                return filterModelMultimodalSettings({
                  settings: defaultData,
                  support: getLLMSupportParams(modelData)
                });
              })();
              onChange({
                ...settings,
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
