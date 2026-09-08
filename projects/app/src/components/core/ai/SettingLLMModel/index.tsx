import AISettingModal, { type AIChatSettingsModalProps } from '@/components/core/ai/AISettingModal';
import AIModelSelector from '@/components/Select/AIModelSelector';
import { getModelDetail } from '@/web/core/ai/model/modelData';
import { Box, css, HStack, IconButton, useDisclosure } from '@chakra-ui/react';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { getLLMSupportParams } from '@fastgpt/global/core/ai/llm/utils';
import type { SettingAIDataType } from '@fastgpt/global/core/app/type';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import React, { useEffect, useRef } from 'react';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { filterModelMultimodalSettings } from './utils';

type Props = {
  defaultData: SettingAIDataType;
  onChange: (e: SettingAIDataType) => void;
  bg?: string;
};

const SettingLLMModel = ({ defaultData, onChange, ...props }: AIChatSettingsModalProps & Props) => {
  const { t } = useTranslation();
  const modelId = defaultData.modelId;
  const { toast } = useToast();
  const latestData = useRef(defaultData);
  const selectionRevision = useRef(0);
  useEffect(() => {
    latestData.current = defaultData;
  }, [defaultData]);
  useEffect(
    () => () => {
      selectionRevision.current++;
    },
    []
  );

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
            onChange={async (e) => {
              const revision = ++selectionRevision.current;
              const next = { ...defaultData, modelId: e };
              latestData.current = next;
              onChange(next);
              const modelData = await getModelDetail({
                modelId: e,
                modelType: ModelTypeEnum.llm
              }).catch(() => {
                if (selectionRevision.current === revision)
                  toast({ status: 'error', title: t('common:model_detail_load_failed') });
              });
              if (
                !modelData ||
                selectionRevision.current !== revision ||
                latestData.current.modelId !== e
              )
                return;
              const currentData = latestData.current;
              const settings = (() => {
                // 只清理有显式开关的工作流配置，隐藏配置的表单交给后端判断模型能力。
                if (
                  props.showMultimodalConfig === false ||
                  currentData.aiChatVision === undefined ||
                  !modelData
                ) {
                  return currentData;
                }
                return filterModelMultimodalSettings({
                  settings: currentData,
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
          defaultData={defaultData}
          {...props}
        />
      )}
    </Box>
  );
};

export default React.memo(SettingLLMModel);
