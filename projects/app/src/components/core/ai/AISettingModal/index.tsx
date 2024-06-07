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
  const showMaxHistoriesSlider = watch('maxHistories') !== undefined;
  const selectedModel = llmModelList.find((item) => item.model === model) || llmModelList[0];

  const tokenLimit = useMemo(() => {
    return llmModelList.find((item) => item.model === model)?.maxResponse || 4096;
  }, [llmModelList, model]);

  const onChangeModel = (e: string) => {
    setValue('model', e);

    // update max tokens
    const modelData = llmModelList.find((item) => item.model === e);
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
    width: ['80px', '90px']
  };

  return (
    <MyModal
      isOpen
      iconSrc="/imgs/workflow/AI.png"
      onClose={onClose}
      title={
        <>
          {t('core.ai.AI settings')}
          {feConfigs?.docUrl && (
            <Link
              href={getDocPath('/docs/course/ai_settings/')}
              target={'_blank'}
              ml={1}
              textDecoration={'underline'}
              fontWeight={'normal'}
              fontSize={'md'}
            >
              {t('common.Read intro')}
            </Link>
          )}
        </>
      }
      w={'500px'}
    >
      <ModalBody overflowY={'auto'}>
        <Flex alignItems={'center'}>
          <Box {...LabelStyles} mr={2}>
            {t('core.ai.Model')}
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
          <Flex mt={8}>
            <Box {...LabelStyles} mr={2}>
              {t('core.ai.Ai point price')}
            </Box>
            <Box flex={1} ml={'10px'}>
              {t('support.wallet.Ai point every thousand tokens', {
                points: selectedModel?.charsPointsPrice || 0
              })}
            </Box>
          </Flex>
        )}
        <Flex mt={8}>
          <Box {...LabelStyles} mr={2}>
            {t('core.ai.Max context')}
          </Box>
          <Box flex={1} ml={'10px'}>
            {selectedModel?.maxContext || 4096}Tokens
          </Box>
        </Flex>
        <Flex mt={8}>
          <Box {...LabelStyles} mr={2}>
            {t('core.ai.Support tool')}
            <QuestionTip ml={1} label={t('core.module.template.AI support tool tip')} />
          </Box>
          <Box flex={1} ml={'10px'}>
            {selectedModel?.toolChoice || selectedModel?.functionCall ? '支持' : '不支持'}
          </Box>
        </Flex>
        <Flex mt={8}>
          <Box {...LabelStyles} mr={2}>
            {t('core.app.Temperature')}
          </Box>
          <Box flex={1} ml={'10px'}>
            <MySlider
              markList={[
                { label: t('core.app.deterministic'), value: 0 },
                { label: t('core.app.Random'), value: 10 }
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
        <Flex mt={8}>
          <Box {...LabelStyles} mr={2}>
            {t('core.app.Max tokens')}
          </Box>
          <Box flex={1} ml={'10px'}>
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
          <Flex mt={8}>
            <Box {...LabelStyles} mr={2}>
              {t('core.app.Max histories')}
            </Box>
            <Box flex={1} ml={'10px'}>
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
          <Flex mt={8} alignItems={'center'}>
            <Box {...LabelStyles}>
              {t('core.app.Ai response')}
              <QuestionTip
                ml={1}
                label={t('core.module.template.AI response switch tip')}
              ></QuestionTip>
            </Box>
            <Box flex={1} ml={'10px'}>
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
      </ModalBody>
      <ModalFooter>
        <Button variant={'whiteBase'} onClick={onClose}>
          {t('common.Close')}
        </Button>
        <Button ml={4} onClick={handleSubmit(onSuccess)}>
          {t('common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default AIChatSettingsModal;
