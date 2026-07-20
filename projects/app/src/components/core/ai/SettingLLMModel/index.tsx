import React from 'react';
import { Box, css, HStack, IconButton, useDisclosure } from '@chakra-ui/react';
import type { SettingAIDataType } from '@fastgpt/global/core/app/type';
import AISettingModal, { type AIChatSettingsModalProps } from '@/components/core/ai/AISettingModal';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import AIModelSelector from '@/components/Select/AIModelSelector';

type Props = {
  defaultData: SettingAIDataType;
  onChange: (e: SettingAIDataType) => void;
  bg?: string;
  resourceContext?: { appId?: string; datasetId?: string };
};

const SettingLLMModel = ({ defaultData, onChange, ...props }: AIChatSettingsModalProps & Props) => {
  const { t } = useTranslation();

  const model = defaultData.modelId;

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
            type={'llm'}
            {...props}
            w={'100%'}
            value={model}
            resourceContext={props.resourceContext}
            autoSelectDefault
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
          {...props}
        />
      )}
    </Box>
  );
};

export default React.memo(SettingLLMModel);
