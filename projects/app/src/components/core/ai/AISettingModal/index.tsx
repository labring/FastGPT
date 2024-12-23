import React, { useMemo, useState } from 'react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import {
  Box,
  BoxProps,
  Button,
  Flex,
  HStack,
  ModalBody,
  ModalFooter,
  Switch,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Table,
  useDisclosure
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
import MyIcon from '@fastgpt/web/components/common/Icon';
import dynamic from 'next/dynamic';
import InputSlider from '@fastgpt/web/components/common/MySlider/InputSlider';

const AiPointsModal = dynamic(() =>
  import('@/pages/price/components/Points').then((mod) => mod.AiPointsModal)
);

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
  const { feConfigs } = useSystemStore();

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
    width: '7rem'
  };

  const {
    isOpen: isOpenAiPointsModal,
    onClose: onCloseAiPointsModal,
    onOpen: onOpenAiPointsModal
  } = useDisclosure();

  return (
    <MyModal
      isOpen
      iconSrc="/imgs/workflow/AI.png"
      onClose={onClose}
      title={
        <HStack>
          <Box>{t('app:ai_settings')}</Box>
          {feConfigs?.docUrl && (
            <MyIcon
              name="book"
              color={'primary.600'}
              w={'1rem'}
              cursor={'pointer'}
              onClick={() => {
                window.open(getDocPath('/docs/guide/course/ai_settings/'), '_blank');
              }}
            />
          )}
        </HStack>
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

        <TableContainer
          my={5}
          bg={'primary.50'}
          borderRadius={'lg'}
          borderWidth={'1px'}
          borderColor={'primary.1'}
        >
          <Table fontSize={'xs'} overflow={'overlay'}>
            <Thead>
              <Tr bg={'transparent !important'} color={'myGray.600'}>
                <Th fontSize={'mini'} pb={2}>
                  <HStack spacing={1}>
                    <Box> {t('app:ai_point_price')}</Box>
                    <QuestionTip
                      label={t('app:look_ai_point_price')}
                      onClick={onOpenAiPointsModal}
                    />
                  </HStack>
                </Th>
                <Th fontSize={'mini'} pb={2}>
                  {t('common:core.ai.Max context')}
                </Th>
                <Th fontSize={'mini'} pb={2}>
                  <HStack spacing={1}>
                    <Box>{t('common:core.ai.Support tool')}</Box>
                    <QuestionTip label={t('common:core.module.template.AI support tool tip')} />
                  </HStack>
                </Th>
              </Tr>
            </Thead>
            <Tbody>
              <Tr color={'myGray.900'}>
                <Td pt={0} pb={2}>
                  {t('common:support.wallet.Ai point every thousand tokens', {
                    points: selectedModel?.charsPointsPrice || 0
                  })}
                </Td>
                <Td pt={0} pb={2}>
                  {Math.round((selectedModel?.maxContext || 4096) / 1000)}K
                </Td>
                <Td pt={0} pb={2}>
                  {selectedModel?.toolChoice || selectedModel?.functionCall
                    ? t('common:common.support')
                    : t('common:common.not_support')}
                </Td>
              </Tr>
            </Tbody>
          </Table>
        </TableContainer>

        <Flex>
          <Box {...LabelStyles} mr={2}>
            {t('common:core.app.Temperature')}
          </Box>
          <Box flex={'1 0 0'}>
            <InputSlider
              min={0}
              max={10}
              step={1}
              value={getValues(NodeInputKeyEnum.aiChatTemperature)}
              onChange={(e) => {
                setValue(NodeInputKeyEnum.aiChatTemperature, e);
                setRefresh(!refresh);
              }}
            />
          </Box>
        </Flex>
        <Flex mt={5}>
          <Box {...LabelStyles} mr={2}>
            {t('common:core.app.Max tokens')}
          </Box>
          <Box flex={'1 0 0'}>
            <InputSlider
              min={100}
              max={tokenLimit}
              step={200}
              value={getValues(NodeInputKeyEnum.aiChatMaxToken)}
              onChange={(val) => {
                setValue(NodeInputKeyEnum.aiChatMaxToken, val);
                setRefresh(!refresh);
              }}
            />
          </Box>
        </Flex>
        {showMaxHistoriesSlider && (
          <Flex mt={5}>
            <Box {...LabelStyles} mr={2}>
              {t('app:max_histories_number')}
            </Box>
            <Box flex={'1 0 0'}>
              <InputSlider
                min={0}
                max={30}
                step={1}
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
          <Flex mt={5} alignItems={'center'}>
            <Box {...LabelStyles}>
              {t('app:stream_response')}
              <QuestionTip ml={1} label={t('app:stream_response_tip')}></QuestionTip>
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
          <Flex mt={5} alignItems={'center'}>
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

      {isOpenAiPointsModal && <AiPointsModal onClose={onCloseAiPointsModal} />}
    </MyModal>
  );
};

export default AIChatSettingsModal;
