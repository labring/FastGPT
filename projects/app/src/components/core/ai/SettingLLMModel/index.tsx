import React, { useEffect, useMemo } from 'react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { Box, css, HStack, IconButton, useDisclosure } from '@chakra-ui/react';
import type { SettingAIDataType } from '@fastgpt/global/core/app/type';
import AISettingModal, { type AIChatSettingsModalProps } from '@/components/core/ai/AISettingModal';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import AIModelSelector from '@/components/Select/AIModelSelector';
import { getWebDefaultLLMModel } from '@/web/common/system/utils';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';

type Props = {
  defaultData: SettingAIDataType;
  onChange: (e: SettingAIDataType) => void;
  bg?: string;
};

const SettingLLMModel = ({ defaultData, onChange, ...props }: AIChatSettingsModalProps & Props) => {
  const { t } = useTranslation();
  const { llmModelList } = useSystemStore();

  const modelId = defaultData.modelId;

  const { modelSet, modelList, defaultLLMModel } = useMemoEnhance(() => {
    const modelSet = new Set<string>(llmModelList.map((item) => item.id));
    return {
      modelList: llmModelList,
      modelSet,
      defaultLLMModel: getWebDefaultLLMModel(llmModelList)?.id
    };
  }, [llmModelList]);

  // Reset undefined model
  useEffect(() => {
    if (modelId) {
      if (modelSet.size > 0 && !modelSet.has(modelId) && defaultLLMModel) {
        onChange({
          ...defaultData,
          modelId: defaultLLMModel
        });
      }
    } else if (defaultLLMModel) {
      onChange({
        ...defaultData,
        modelId: defaultLLMModel
      });
    }
  }, [modelId, defaultData, modelSet, defaultLLMModel]);

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
            value={modelId}
            list={llmModelList.map((item) => ({
              value: item.id,
              label: item.name
            }))}
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
          defaultData={defaultData}
          llmModels={modelList}
          {...props}
        />
      )}
    </Box>
  );
};

export default React.memo(SettingLLMModel);
