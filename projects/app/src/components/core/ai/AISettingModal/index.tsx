import React, { useMemo, useState } from 'react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import {
  Box,
  BoxProps,
  Button,
  Flex,
  Link,
  ModalBody,
  ModalFooter,
  Switch
} from '@chakra-ui/react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MySlider from '@/components/Slider';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { SettingAIDataType } from '@fastgpt/global/core/app/type.d';
import { getDocPath } from '@/web/common/system/doc';
import AIModelSelector from '@/components/Select/AIModelSelector';
import { LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { getWebLLMModel } from '@/web/common/system/utils';

const AIChatSettingsModal = ({
  onClose,
  onSuccess,
  defaultData,
  llmModels = []
}: {
  onClose: () => void;
  onSuccess: (e: SettingAIDataType) => void;
  defaultData: SettingAIDataType;
  llmModels?: LLMModelItemType[];
}) => {
  const { t } = useTranslation();
  const [refresh, setRefresh] = useState(false);
  const { feConfigs, llmModelList } = useSystemStore();

  const { handleSubmit, getValues, setValue, watch } = useForm({
    defaultValues: defaultData
  });
  const model = watch('model');
  const showResponseAnswerText = watch(NodeInputKeyEnum.aiChatIsResponseText) !== undefined;
  const showVisionSwitch = watch(NodeInputKeyEnum.aiChatVision) !== undefined;
  const showMaxHistoriesSlider = watch('maxHistories') !== undefined;
  const useVision = watch('aiChatVision');
  const selectedModel = getWebLLMModel(model);
  const llmSupportVision = !!selectedModel?.vision;

  const tokenLimit = useMemo(() => {
    return selectedModel?.maxResponse || 4096;
  }, [selectedModel?.maxResponse]);

  const onChangeModel = (e: string) => {
    setValue('model', e);

    // update max tokens
    const modelData = getWebLLMModel(e);
    if (modelData) {
      setValue('maxToken', modelData.maxResponse / 2);
    }

    setRefresh(!refresh);
  };

  const LabelStyles: BoxProps = {
    display: 'flex',
    alignItems: 'center',
    fontSize: 'sm',
    color: 'myGray.900',
    width: ['6rem', '8rem']
  };

  return (
    <MyModal
      isOpen
      iconSrc="/imgs/workflow/AI.png"
      onClose={onClose}
      title={
        <>
          {t('common:core.ai.AI settings')}
          {feConfigs?.docUrl && (
            <Link
              href={getDocPath('/docs/guide/course/ai_settings/')}
              target={'_blank'}
              ml={1}
              textDecoration={'underline'}
              fontWeight={'normal'}
              fontSize={'md'}
            >
              {t('common:common.Read intro')}
            </Link>
          )}
        </>
      }
      w={'500px'}
    >
      <ModalBody overflowY={'auto'}>
        <Flex alignItems={'center'}>
          <Box {...LabelStyles} mr={2}>
            {t('common:core.ai.Model')}
          </Box>
          <Box flex={'1 0 0'}>
            <AIModelSelector
              width={'100%'}
              value={model}
              list={llmModels.map((item) => ({
                value: item.model,
                label: item.name
              }))}
              onchange={onChangeModel}
            />
          </Box>
        </Flex>
        {feConfigs && (
          <Flex mt={6}>
            <Box {...LabelStyles} mr={2}>
              {t('common:core.ai.Ai point price')}
            </Box>
            <Box flex={1}>
              {t('common:support.wallet.Ai point every thousand tokens', {
                points: selectedModel?.charsPointsPrice || 0
              })}
            </Box>
          </Flex>
        )}
        <Flex mt={6}>
          <Box {...LabelStyles} mr={2}>
            {t('common:core.ai.Max context')}
          </Box>
          <Box flex={1}>{selectedModel?.maxContext || 4096}Tokens</Box>
        </Flex>
        <Flex mt={6}>
          <Box {...LabelStyles} mr={2}>
            {t('common:core.ai.Support tool')}
            <QuestionTip ml={1} label={t('common:core.module.template.AI support tool tip')} />
          </Box>
          <Box flex={1}>
            {selectedModel?.toolChoice || selectedModel?.functionCall
              ? t('common:common.support')
              : t('common:common.not_support')}
          </Box>
        </Flex>
        <Flex mt={6}>
          <Box {...LabelStyles} mr={2}>
            {t('common:core.app.Temperature')}
          </Box>
          <Box flex={1} ml={1}>
            <MySlider
              markList={[
                { label: t('common:core.app.deterministic'), value: 0 },
                { label: t('common:core.app.Random'), value: 10 }
              ]}
              width={'95%'}
              min={0}
              max={10}
              value={getValues(NodeInputKeyEnum.aiChatTemperature)}
              onChange={(e) => {
                setValue(NodeInputKeyEnum.aiChatTemperature, e);
                setRefresh(!refresh);
              }}
            />
          </Box>
        </Flex>
        <Flex mt={6}>
          <Box {...LabelStyles} mr={2}>
            {t('common:core.app.Max tokens')}
          </Box>
          <Box flex={1}>
            <MySlider
              markList={[
                { label: '100', value: 100 },
                { label: `${tokenLimit}`, value: tokenLimit }
              ]}
              width={'95%'}
              min={100}
              max={tokenLimit}
              step={50}
              value={getValues(NodeInputKeyEnum.aiChatMaxToken)}
              onChange={(val) => {
                setValue(NodeInputKeyEnum.aiChatMaxToken, val);
                setRefresh(!refresh);
              }}
            />
          </Box>
        </Flex>
        {showMaxHistoriesSlider && (
          <Flex mt={6}>
            <Box {...LabelStyles} mr={2}>
              {t('common:core.app.Max histories')}
            </Box>
            <Box flex={1}>
              <MySlider
                markList={[
                  { label: 0, value: 0 },
                  { label: 30, value: 30 }
                ]}
                width={'95%'}
                min={0}
                max={30}
                value={getValues('maxHistories') ?? 6}
                onChange={(e) => {
                  setValue('maxHistories', e);
                  setRefresh(!refresh);
                }}
              />
            </Box>
          </Flex>
        )}
        {showResponseAnswerText && (
          <Flex mt={6} alignItems={'center'}>
            <Box {...LabelStyles}>
              {t('common:core.app.Ai response')}
              <QuestionTip
                ml={1}
                label={t('common:core.module.template.AI response switch tip')}
              ></QuestionTip>
            </Box>
            <Box flex={1}>
              <Switch
                isChecked={getValues(NodeInputKeyEnum.aiChatIsResponseText)}
                onChange={(e) => {
                  const value = e.target.checked;
                  setValue(NodeInputKeyEnum.aiChatIsResponseText, value);
                  setRefresh((state) => !state);
                }}
              />
            </Box>
          </Flex>
        )}
        {showVisionSwitch && (
          <Flex mt={6} alignItems={'center'}>
            <Box {...LabelStyles}>
              {t('app:llm_use_vision')}
              <QuestionTip ml={1} label={t('app:llm_use_vision_tip')}></QuestionTip>
            </Box>
            <Box flex={1}>
              {llmSupportVision ? (
                <Switch
                  isChecked={useVision}
                  onChange={(e) => {
                    const value = e.target.checked;
                    setValue(NodeInputKeyEnum.aiChatVision, value);
                  }}
                />
              ) : (
                <Box fontSize={'sm'} color={'myGray.500'}>
                  {t('app:llm_not_support_vision')}
                </Box>
              )}
            </Box>
          </Flex>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant={'whiteBase'} onClick={onClose}>
          {t('common:common.Close')}
        </Button>
        <Button ml={4} onClick={handleSubmit(onSuccess)}>
          {t('common:common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default AIChatSettingsModal;
