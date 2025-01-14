import React, { useMemo } from 'react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { LLMModelTypeEnum, llmModelTypeFilterMap } from '@fastgpt/global/core/ai/constants';
import { Box, css, HStack, IconButton, useDisclosure } from '@chakra-ui/react';
import type { SettingAIDataType } from '@fastgpt/global/core/app/type.d';
import AISettingModal, { AIChatSettingsModalProps } from '@/components/core/ai/AISettingModal';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useMount } from 'ahooks';
import AIModelSelector from '@/components/Select/AIModelSelector';

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
  // Set default model
  useMount(() => {
    if (!model && modelList.length > 0) {
      onChange({
        ...defaultData,
        model: modelList[0].model
      });
    }
  });

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
