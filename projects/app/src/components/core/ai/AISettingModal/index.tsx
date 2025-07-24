import React, { useMemo, useState } from 'react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import {
  Box,
  type BoxProps,
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
  type FlexProps,
  Input
} from '@chakra-ui/react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { SettingAIDataType } from '@fastgpt/global/core/app/type.d';
import { getDocPath } from '@/web/common/system/doc';
import AIModelSelector from '@/components/Select/AIModelSelector';
import { type LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { getWebLLMModel } from '@/web/common/system/utils';
import MyIcon from '@fastgpt/web/components/common/Icon';
import dynamic from 'next/dynamic';
import InputSlider from '@fastgpt/web/components/common/MySlider/InputSlider';
import MySelect from '@fastgpt/web/components/common/MySelect';
import JsonEditor from '@fastgpt/web/components/common/Textarea/JsonEditor';

const ModelPriceModal = dynamic(() =>
  import('@/components/core/ai/ModelTable').then((mod) => mod.ModelPriceModal)
);

const FlexItemStyles: FlexProps = {
  mt: 4,
  alignItems: 'center',
  h: '35px'
};
const LabelStyles: BoxProps = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  fontSize: 'sm',
  color: 'myGray.900',
  width: '9rem',
  mr: 5
};

export type AIChatSettingsModalProps = {};

const AIChatSettingsModal = ({
  onClose,
  onSuccess,
  defaultData,
  llmModels = []
}: AIChatSettingsModalProps & {
  onClose: () => void;
  onSuccess: (e: SettingAIDataType) => void;
  defaultData: SettingAIDataType;
  llmModels: LLMModelItemType[];
}) => {
  const { t } = useTranslation();
  const [refresh, setRefresh] = useState(false);
  const { feConfigs } = useSystemStore();

  const { handleSubmit, getValues, setValue, watch, register } = useForm({
    defaultValues: defaultData
  });
  const model = watch('model');
  const reasoning = watch(NodeInputKeyEnum.aiChatReasoning);
  const showResponseAnswerText = watch(NodeInputKeyEnum.aiChatIsResponseText) !== undefined;
  const showVisionSwitch = watch(NodeInputKeyEnum.aiChatVision) !== undefined;
  const showMaxHistoriesSlider = watch('maxHistories') !== undefined;

  const maxToken = watch('maxToken');
  const temperature = watch('temperature');
  const useVision = watch('aiChatVision');

  const selectedModel = useMemo(() => {
    return getWebLLMModel(model);
  }, [model]);
  const llmSupportVision = !!selectedModel?.vision;
  const llmSupportTemperature = typeof selectedModel?.maxTemperature === 'number';
  const llmSupportReasoning = !!selectedModel?.reasoning;

  const topP = watch(NodeInputKeyEnum.aiChatTopP);
  const llmSupportTopP = !!selectedModel?.showTopP;

  const stopSign = watch(NodeInputKeyEnum.aiChatStopSign);
  const llmSupportStopSign = !!selectedModel?.showStopSign;

  const responseFormat = watch(NodeInputKeyEnum.aiChatResponseFormat);
  const jsonSchema = watch(NodeInputKeyEnum.aiChatJsonSchema);
  const llmSupportResponseFormat =
    !!selectedModel?.responseFormatList && selectedModel?.responseFormatList.length > 0;

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
                window.open(getDocPath('/docs/introduction/guide/course/ai_settings/'), '_blank');
              }}
            />
          )}
        </HStack>
      }
      w={'500px'}
    >
      <ModalBody overflowY={'auto'} overflowX={'hidden'}>
        <Flex alignItems={'center'}>
          <Box {...LabelStyles} w={'5rem'}>
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
              onChange={onChangeModel}
            />
          </Box>
        </Flex>

        <TableContainer
          my={4}
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
                    <ModelPriceModal>
                      {({ onOpen }) => (
                        <QuestionTip label={t('app:look_ai_point_price')} onClick={onOpen} />
                      )}
                    </ModelPriceModal>
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
                  {typeof selectedModel?.inputPrice === 'number' ? (
                    <>
                      <Box>
                        {t('common:support.wallet.Ai point every thousand tokens_input', {
                          points: selectedModel?.inputPrice || 0
                        })}
                      </Box>
                      <Box>
                        {t('common:support.wallet.Ai point every thousand tokens_output', {
                          points: selectedModel?.outputPrice || 0
                        })}
                      </Box>
                    </>
                  ) : (
                    <>
                      {t('common:support.wallet.Ai point every thousand tokens', {
                        points: selectedModel?.charsPointsPrice || 0
                      })}
                    </>
                  )}
                </Td>

                <Td pt={0} pb={2}>
                  {Math.round((selectedModel?.maxContext || 4096) / 1000)}K
                </Td>
                <Td pt={0} pb={2}>
                  {selectedModel?.toolChoice || selectedModel?.functionCall
                    ? t('common:support')
                    : t('common:not_support')}
                </Td>
              </Tr>
            </Tbody>
          </Table>
        </TableContainer>

        {showMaxHistoriesSlider && (
          <Flex {...FlexItemStyles}>
            <Box {...LabelStyles}>
              <Flex alignItems={'center'}>
                <Box>{t('app:max_histories_number')}</Box>
                <QuestionTip label={t('app:max_histories_number_tip')} />
              </Flex>
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
        <Flex {...FlexItemStyles}>
          <Box {...LabelStyles}>
            <Box>{t('app:max_tokens')}</Box>
            <Switch
              isChecked={maxToken !== undefined}
              size={'sm'}
              onChange={(e) => {
                setValue('maxToken', e.target.checked ? tokenLimit / 2 : undefined);
              }}
            />
          </Box>
          <Box flex={'1 0 0'}>
            <InputSlider
              min={0}
              max={tokenLimit}
              step={200}
              isDisabled={maxToken === undefined}
              value={maxToken}
              onChange={(val) => {
                setValue(NodeInputKeyEnum.aiChatMaxToken, val);
                setRefresh(!refresh);
              }}
            />
          </Box>
        </Flex>
        {llmSupportTemperature && (
          <Flex {...FlexItemStyles}>
            <Box {...LabelStyles}>
              <Flex alignItems={'center'}>
                {t('app:temperature')}
                <QuestionTip label={t('app:temperature_tip')} />
              </Flex>
              <Switch
                isChecked={temperature !== undefined}
                size={'sm'}
                onChange={(e) => {
                  setValue('temperature', e.target.checked ? 0 : undefined);
                }}
              />
            </Box>
            <Box flex={'1 0 0'}>
              <InputSlider
                min={0}
                max={10}
                step={1}
                value={temperature}
                isDisabled={temperature === undefined}
                onChange={(e) => {
                  setValue(NodeInputKeyEnum.aiChatTemperature, e);
                  setRefresh(!refresh);
                }}
              />
            </Box>
          </Flex>
        )}
        {llmSupportTopP && (
          <Flex {...FlexItemStyles}>
            <Box {...LabelStyles}>
              <Flex alignItems={'center'}>
                <Box mr={0.5}>Top_p</Box>
                <QuestionTip label={t('app:show_top_p_tip')} />
              </Flex>
              <Switch
                isChecked={topP !== undefined}
                size={'sm'}
                onChange={(e) => {
                  setValue(NodeInputKeyEnum.aiChatTopP, e.target.checked ? 1 : undefined);
                }}
              />
            </Box>
            <Box flex={'1 0 0'}>
              <InputSlider
                min={0}
                max={1}
                step={0.1}
                value={topP}
                isDisabled={topP === undefined}
                onChange={(e) => {
                  setValue(NodeInputKeyEnum.aiChatTopP, e);
                  setRefresh(!refresh);
                }}
              />
            </Box>
          </Flex>
        )}
        {llmSupportStopSign && (
          <Flex {...FlexItemStyles}>
            <Box {...LabelStyles}>
              <Flex alignItems={'center'}>
                <Box mr={0.5}>{t('app:stop_sign')}</Box>
              </Flex>
              <Switch
                isChecked={stopSign !== undefined}
                size={'sm'}
                onChange={(e) => {
                  setValue(NodeInputKeyEnum.aiChatStopSign, e.target.checked ? '' : undefined);
                }}
              />
            </Box>
            <Box flex={'1 0 0'}>
              <Input
                isDisabled={stopSign === undefined}
                size={'sm'}
                {...register(NodeInputKeyEnum.aiChatStopSign)}
                placeholder={t('app:stop_sign_placeholder')}
                bg={'myGray.25'}
              />
            </Box>
          </Flex>
        )}
        {llmSupportResponseFormat && selectedModel?.responseFormatList && (
          <Flex {...FlexItemStyles}>
            <Box {...LabelStyles}>
              <Flex alignItems={'center'}>{t('app:response_format')}</Flex>
              <Switch
                isChecked={responseFormat !== undefined}
                size={'sm'}
                onChange={(e) => {
                  setValue(
                    NodeInputKeyEnum.aiChatResponseFormat,
                    e.target.checked ? selectedModel?.responseFormatList?.[0] : undefined
                  );
                }}
              />
            </Box>
            <Box flex={'1 0 0'}>
              <MySelect<string>
                isDisabled={responseFormat === undefined}
                size={'sm'}
                bg={'myGray.25'}
                list={selectedModel.responseFormatList.map((item) => ({
                  value: item,
                  label: item
                }))}
                value={responseFormat}
                onChange={(e) => {
                  setValue(NodeInputKeyEnum.aiChatResponseFormat, e);
                }}
              />
            </Box>
          </Flex>
        )}
        {/* Json schema */}
        {responseFormat === 'json_schema' && (
          <Flex {...FlexItemStyles} h="auto">
            <Box {...LabelStyles}>
              <Flex alignItems={'center'}>JSON Schema</Flex>
            </Box>
            <Box flex={'1 0 0'}>
              <JsonEditor
                value={jsonSchema || ''}
                onChange={(e) => {
                  setValue(NodeInputKeyEnum.aiChatJsonSchema, e);
                }}
                bg={'myGray.25'}
              />
            </Box>
          </Flex>
        )}
        {llmSupportReasoning && (
          <Flex {...FlexItemStyles} h={'25px'}>
            <Box {...LabelStyles}>
              <Flex alignItems={'center'}>{t('app:reasoning_response')}</Flex>
              <Switch
                isChecked={reasoning || false}
                size={'sm'}
                onChange={(e) => {
                  const value = e.target.checked;
                  setValue(NodeInputKeyEnum.aiChatReasoning, value);
                }}
              />
            </Box>
          </Flex>
        )}
        {showVisionSwitch && (
          <Flex {...FlexItemStyles} h={'25px'}>
            <Box {...LabelStyles} w={llmSupportVision ? '9rem' : 'auto'}>
              <Flex alignItems={'center'}>
                {t('app:llm_use_vision')}
                <QuestionTip ml={1} label={t('app:llm_use_vision_tip')}></QuestionTip>
              </Flex>
              {llmSupportVision ? (
                <Switch
                  isChecked={useVision}
                  size={'sm'}
                  onChange={(e) => {
                    const value = e.target.checked;
                    setValue(NodeInputKeyEnum.aiChatVision, value);
                  }}
                />
              ) : (
                <Box ml={3} fontSize={'sm'} color={'myGray.500'}>
                  {t('app:llm_not_support_vision')}
                </Box>
              )}
            </Box>
          </Flex>
        )}
        {showResponseAnswerText && (
          <Flex {...FlexItemStyles} h={'25px'}>
            <Box {...LabelStyles}>
              <Flex alignItems={'center'}>
                {t('app:stream_response')}
                <QuestionTip ml={1} label={t('app:stream_response_tip')}></QuestionTip>
              </Flex>
              <Switch
                isChecked={getValues(NodeInputKeyEnum.aiChatIsResponseText)}
                size={'sm'}
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
          {t('common:Close')}
        </Button>
        <Button ml={4} onClick={handleSubmit(onSuccess)}>
          {t('common:Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default AIChatSettingsModal;
