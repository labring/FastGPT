import React, { useCallback, useEffect, useMemo } from 'react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { LLMModelTypeEnum, llmModelTypeFilterMap } from '@fastgpt/global/core/ai/constants';
import { Box, css, HStack, IconButton, useDisclosure } from '@chakra-ui/react';
import type { SettingAIDataType } from '@fastgpt/global/core/app/type.d';
import AISettingModal, { AIChatSettingsModalProps } from '@/components/core/ai/AISettingModal';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import AIModelSelector from '@/components/Select/AIModelSelector';
import { getWebDefaultModel } from '@/web/common/system/utils';

type Props = {
  llmModelType?: `${LLMModelTypeEnum}`;
  defaultData: SettingAIDataType;
  onChange: (e: SettingAIDataType) => void;
  bg?: string;
};

const SettingLLMModel = ({
  llmModelType = LLMModelTypeEnum.all,
  defaultData,
  onChange,
  ...props
}: AIChatSettingsModalProps & Props) => {
  const { t } = useTranslation();
  const { llmModelList } = useSystemStore();

  const model = defaultData.model;

  const modelList = useMemo(
    () =>
      llmModelList.filter((modelData) => {
        if (!llmModelType) return true;
        const filterField = llmModelTypeFilterMap[llmModelType];
        if (!filterField) return true;
        //@ts-ignore
        return !!modelData[filterField];
      }),
    [llmModelList, llmModelType]
  );
  const defaultModel = useMemo(() => {
    return getWebDefaultModel(modelList).model;
  }, [modelList]);

  const onChangeModelData = useCallback(
    (e: SettingAIDataType, refreshReasoning = true) => {
      const modelData = llmModelList.find((item) => item.model === e.model)!;
      if (modelData) {
        if (modelData.reasoning !== true) {
          e.aiChatReasoning = false;
        } else if (refreshReasoning) {
          e.aiChatReasoning = true;
        }
        onChange(e);
      }
    },
    [onChange, llmModelList]
  );

  // Set default model
  useEffect(() => {
    if (!modelList.find((item) => item.model === model) && !!defaultModel) {
      onChangeModelData(
        {
          ...defaultData,
          model: defaultModel
        },
        true
      );
    }
  }, [modelList, model, defaultModel, onChangeModelData]);

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
            w={'100%'}
            value={model}
            list={llmModelList.map((item) => ({
              value: item.model,
              label: item.name
            }))}
            onchange={(e) => {
              onChangeModelData(
                {
                  ...defaultData,
                  model: e
                },
                true
              );
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
            onChangeModelData(e, false);
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
