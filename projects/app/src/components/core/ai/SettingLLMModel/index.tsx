import React, { useEffect, useMemo } from 'react';
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

type Props = {
  defaultData: SettingAIDataType;
  onChange: (e: SettingAIDataType) => void;
  bg?: string;
  valueField?: 'modelId' | 'model';
};

const SettingLLMModel = ({
  defaultData,
  onChange,
  valueField = 'modelId',
  ...props
}: AIChatSettingsModalProps & Props) => {
  const { t } = useTranslation();
  const { llmModelList } = useUserModelLists();

  const model = defaultData.model;

  const { modelList, defaultLLMModel } = useMemoEnhance(() => {
    const getValue = (item: { model: string; modelId?: string }) =>
      valueField === 'modelId' ? item.modelId : item.model;
    const defaultModelData = getWebDefaultLLMModel(llmModelList);
    return {
      modelList: llmModelList,
      defaultLLMModel: defaultModelData ? getValue(defaultModelData) : undefined
    };
  }, [llmModelList, valueField]);

  const selectedModelData = llmModelList.find((item) =>
    valueField === 'modelId' ? item.modelId === model : item.model === model
  );

  // 只在新建场景没有 value 时设置默认模型；已有异常 value 必须保留给选择器展示错误。
  useEffect(() => {
    if (!model && defaultLLMModel) {
      onChange({
        ...defaultData,
        model: defaultLLMModel
      });
    }
  }, [model, defaultData, defaultLLMModel]);

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
            valueField={valueField}
            w={'100%'}
            value={model}
            onChange={(e) => {
              onChange({
                ...defaultData,
                model: e
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
            const selected = llmModelList.find((item) => item.model === e.model);
            onChange({
              ...e,
              model: valueField === 'modelId' ? selected?.modelId || model : e.model
            });
            onCloseAIChatSetting();
          }}
          defaultData={{ ...defaultData, model: selectedModelData?.model || defaultData.model }}
          llmModels={modelList}
          {...props}
        />
      )}
    </Box>
  );
};

export default React.memo(SettingLLMModel);
