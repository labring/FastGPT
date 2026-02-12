import React, { useEffect, useMemo } from 'react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { LLMModelTypeEnum, llmModelTypeFilterMap } from '@fastgpt/global/core/ai/constants';
import { Box, css, HStack, IconButton, useDisclosure } from '@chakra-ui/react';
import type { SettingAIDataType } from '@fastgpt/global/core/app/type';
import AISettingModal, { type AIChatSettingsModalProps } from '@/components/core/ai/AISettingModal';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import AIModelSelector from '@/components/Select/AIModelSelector';
import { getWebDefaultLLMModel } from '@/web/common/system/utils';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { useLatest } from 'ahooks';

type Props = {
  defaultModel?: string;
  llmModelType?: `${LLMModelTypeEnum}`;
  defaultData: SettingAIDataType;
  onChange: (e: SettingAIDataType) => void;
  bg?: string;
};

const SettingLLMModel = ({
  defaultModel,
  llmModelType = LLMModelTypeEnum.all,
  defaultData,
  onChange,
  ...props
}: AIChatSettingsModalProps & Props) => {
  const { t } = useTranslation();
  const { llmModelList } = useSystemStore();

  const model = defaultData.model;

  const { modelSet, modelList } = useMemoEnhance(() => {
    const modelSet = new Set<string>();
    const modelList = llmModelList.filter((modelData) => {
      if (!llmModelType) {
        modelSet.add(modelData.model);
        return true;
      }
      const filterField = llmModelTypeFilterMap[llmModelType];
      if (!filterField) {
        modelSet.add(modelData.model);
        return true;
      }
      // @ts-ignore
      if (!!modelData[filterField]) {
        modelSet.add(modelData.model);
        return true;
      }
      return false;
    });

    return {
      modelList,
      modelSet
    };
  }, [llmModelList, llmModelType]);

  // Set default model
  const lastDefaultModel = useLatest(defaultModel);
  useEffect(() => {
    if (!modelSet.has(model)) {
      const defaultLLM = lastDefaultModel.current || getWebDefaultLLMModel(modelList).model;
      if (defaultLLM) {
        onChange({
          ...defaultData,
          model: defaultLLM
        });
      }
    }
  }, [modelList, model, defaultData]);

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
            w={'100%'}
            value={model}
            list={llmModelList.map((item) => ({
              value: item.model,
              label: item.name
            }))}
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
            onChange(e);
            onCloseAIChatSetting();
          }}
          defaultData={defaultData}
          llmModels={modelList}
          {...props}
        />
      )}
    </Box>
  );
};

export default React.memo(SettingLLMModel);
