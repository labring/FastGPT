import React, { useMemo, useState } from 'react';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import {
  Box,
  Button,
  Flex,
  HStack,
  Switch,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Table,
  Input,
  VStack
} from '@chakra-ui/react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { SettingAIDataType } from '@fastgpt/global/core/app/type';
import { getDocPath } from '@/web/common/system/doc';
import AIModelSelector from '@/components/Select/AIModelSelector';
import { type LLMModelItemType } from '@fastgpt/global/core/ai/model.schema';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { PriceLine } from '../PriceTiersLabel';
import { getWebLLMModel } from '@/web/common/system/utils';
import MyIcon from '@fastgpt/web/components/common/Icon';
import dynamic from 'next/dynamic';
import InputSlider from '@fastgpt/web/components/common/MySlider/InputSlider';
import MySelect from '@fastgpt/web/components/common/MySelect';
import MultipleSelect from '@fastgpt/web/components/common/MySelect/MultipleSelect';
import JsonEditor from '@fastgpt/web/components/common/Textarea/JsonEditor';
import { getLLMSupportParams } from '@fastgpt/global/core/ai/llm/utils';
import { reasoningEffortList } from '@fastgpt/global/core/ai/constants';
import type { ReasoningEffort } from '@fastgpt/global/core/ai/llm/type';

type MultimodalValue =
  | NodeInputKeyEnum.aiChatVision
  | NodeInputKeyEnum.aiChatAudio
  | NodeInputKeyEnum.aiChatVideo;

const ModelPriceModal = dynamic(() =>
  import('@/components/core/ai/ModelTable').then((mod) => mod.ModelPriceModal)
);

const RIGHT_AREA_WIDTH = '320px';

const SectionCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <Box w="full" bg="white" border="1px solid" borderColor="myGray.200" borderRadius="md" p={4}>
    <VStack spacing={2.5} align="stretch">
      <Box
        fontSize="10px"
        fontWeight={500}
        color="myGray.400"
        letterSpacing="0.2px"
        lineHeight="14px"
      >
        {title}
      </Box>
      {children}
    </VStack>
  </Box>
);

const SettingRow = ({
  label,
  tip,
  switchControl,
  children
}: {
  label: React.ReactNode;
  tip?: string;
  switchControl?: React.ReactNode;
  children?: React.ReactNode;
}) => (
  <Flex w="full" alignItems="center" justifyContent="space-between" minH="45px">
    <HStack spacing={0.5} fontSize="sm" color="myGray.900" fontWeight={500}>
      <Box>{label}</Box>
      {tip && <QuestionTip label={tip} />}
    </HStack>
    <HStack spacing={4} w={RIGHT_AREA_WIDTH} justifyContent="flex-start">
      {switchControl}
      {children && (
        <Box flex="1 0 0" minW={0}>
          {children}
        </Box>
      )}
    </HStack>
  </Flex>
);

export type AIChatSettingsModalProps = {
  showMaxToken?: boolean;
  showTemperature?: boolean;
  showTopP?: boolean;
  showStopSign?: boolean;
  showResponseFormat?: boolean;
  showReasoning?: boolean;
  showMultimodalConfig?: boolean;
};

const AIChatSettingsModal = ({
  onClose,
  onSuccess,
  defaultData,
  llmModels = [],
  showMaxToken = true,
  showTemperature = true,
  showTopP = true,
  showStopSign = true,
  showResponseFormat = true,
  showReasoning = true,
  showMultimodalConfig = true
}: AIChatSettingsModalProps & {
  onClose: () => void;
  onSuccess: (e: SettingAIDataType) => void;
  defaultData: SettingAIDataType;
  llmModels: LLMModelItemType[];
}) => {
  const { t } = useTranslation();
  const [refresh, setRefresh] = useState(false);
  const { feConfigs } = useSystemStore();

  const { handleSubmit, getValues, setValue, watch, register } = useForm<SettingAIDataType>({
    defaultValues: defaultData
  });
  const model = watch('model');
  const reasoning = watch(NodeInputKeyEnum.aiChatReasoning);
  const reasoningEffort = watch(NodeInputKeyEnum.aiChatReasoningEffort);
  const showResponseAnswerText = watch(NodeInputKeyEnum.aiChatIsResponseText) !== undefined;
  const showMultimodalSetting =
    showMultimodalConfig && watch(NodeInputKeyEnum.aiChatVision) !== undefined;
  const showMaxHistoriesSlider = watch('maxHistories') !== undefined;

  const maxToken = watch('maxToken');
  const temperature = watch('temperature');
  const useVision = watch('aiChatVision');
  const useAudio = watch(NodeInputKeyEnum.aiChatAudio);
  const useVideo = watch(NodeInputKeyEnum.aiChatVideo);
  const extractFiles = watch(NodeInputKeyEnum.aiChatExtractFiles);

  const data = useMemo(() => {
    const modelData = getWebLLMModel(model);
    const support = getLLMSupportParams(modelData);

    return {
      selectedModel: modelData,
      supportParams: support
    };
  }, [model]);
  const selectedModel = data.selectedModel;
  const supportParams = data.supportParams;
  const multimodalOptions = useMemo(
    () =>
      [
        supportParams.vision && {
          label: t('app:llm_multimodal_image'),
          value: NodeInputKeyEnum.aiChatVision
        },
        supportParams.audio && {
          label: t('app:llm_multimodal_audio'),
          value: NodeInputKeyEnum.aiChatAudio
        },
        supportParams.video && {
          label: t('app:llm_multimodal_video'),
          value: NodeInputKeyEnum.aiChatVideo
        }
      ].filter(Boolean) as {
        label: string;
        value: MultimodalValue;
      }[],
    [supportParams.audio, supportParams.video, supportParams.vision, t]
  );
  const singleMultimodalOption = multimodalOptions[0];
  const multimodalSettingLabel =
    multimodalOptions.length === 1 &&
    singleMultimodalOption?.value === NodeInputKeyEnum.aiChatVision
      ? t('app:llm_use_vision')
      : t('app:llm_use_multimodal');
  const selectedMultimodalValues = [
    useVision && supportParams.vision && NodeInputKeyEnum.aiChatVision,
    useAudio && supportParams.audio && NodeInputKeyEnum.aiChatAudio,
    useVideo && supportParams.video && NodeInputKeyEnum.aiChatVideo
  ].filter(Boolean) as MultimodalValue[];
  const showAdvancedConfig =
    (supportParams.temperature && showTemperature) ||
    (supportParams.topP && showTopP) ||
    (supportParams.stop && showStopSign) ||
    (supportParams.responseFormat && showResponseFormat);
  const showExtractFilesSetting = showMultimodalSetting && supportParams.multimodal;

  const onChangeMultimodalValues = (values: MultimodalValue[]) => {
    setValue(NodeInputKeyEnum.aiChatVision, values.includes(NodeInputKeyEnum.aiChatVision));
    setValue(NodeInputKeyEnum.aiChatAudio, values.includes(NodeInputKeyEnum.aiChatAudio));
    setValue(NodeInputKeyEnum.aiChatVideo, values.includes(NodeInputKeyEnum.aiChatVideo));
  };

  const topP = watch(NodeInputKeyEnum.aiChatTopP);
  const stopSign = watch(NodeInputKeyEnum.aiChatStopSign);
  const responseFormat = watch(NodeInputKeyEnum.aiChatResponseFormat);
  const jsonSchema = watch(NodeInputKeyEnum.aiChatJsonSchema);

  const tokenLimit = useMemo(() => {
    return selectedModel?.maxResponse || 4096;
  }, [selectedModel?.maxResponse]);

  const onChangeModel = (e: string) => {
    setValue('model', e);

    const modelData = getWebLLMModel(e);
    if (modelData) {
      setValue('maxToken', modelData.maxResponse / 2);
      if (showMultimodalSetting) {
        const support = getLLMSupportParams(modelData);
        onChangeMultimodalValues(
          [
            !!getValues(NodeInputKeyEnum.aiChatVision) &&
              support.vision &&
              NodeInputKeyEnum.aiChatVision,
            !!getValues(NodeInputKeyEnum.aiChatAudio) &&
              support.audio &&
              NodeInputKeyEnum.aiChatAudio,
            !!getValues(NodeInputKeyEnum.aiChatVideo) &&
              support.video &&
              NodeInputKeyEnum.aiChatVideo
          ].filter(Boolean) as MultimodalValue[]
        );
      }
    }

    setRefresh(!refresh);
  };

  const showReasoningSection = supportParams.reasoning && showReasoning;

  return (
    <MyModal
      isOpen
      onClose={onClose}
      title={
        <HStack>
          <Box>{t('app:ai_settings')}</Box>
          {feConfigs?.docUrl && (
            <MyIcon
              name="book"
              color={'primary.600'}
              w={'24px'}
              cursor={'pointer'}
              onClick={() => {
                window.open(getDocPath('/guide/build/general/ai_settings'), '_blank');
              }}
            />
          )}
        </HStack>
      }
      w={'580px'}
      maxW={'90vw'}
      footer={
        <>
          <Button variant={'whiteBase'} onClick={onClose}>
            {t('common:Close')}
          </Button>
          <Button onClick={handleSubmit(onSuccess)}>{t('common:Confirm')}</Button>
        </>
      }
    >
      <VStack spacing={4} align="stretch">
        {/* 基础配置 */}
        <SectionCard title={t('app:ai_setting_basic_config')}>
          <SettingRow label={t('common:core.ai.Model')}>
            <AIModelSelector
              width={'100%'}
              h={'36px'}
              value={model}
              list={llmModels.map((item) => ({
                value: item.model,
                label: item.name
              }))}
              onChange={onChangeModel}
            />
          </SettingRow>

          <TableContainer borderRadius={'sm'} borderWidth={'1px'} borderColor={'myGray.200'}>
            <Table variant={'bordered'}>
              <Thead>
                <Tr>
                  <Th>
                    <HStack spacing={1}>
                      <Box>{t('app:ai_point_price')}</Box>
                      <ModelPriceModal>
                        {({ onOpen }) => (
                          <QuestionTip label={t('app:look_ai_point_price')} onClick={onOpen} />
                        )}
                      </ModelPriceModal>
                    </HStack>
                  </Th>
                  <Th>{t('common:core.ai.Max context')}</Th>
                  <Th>
                    <HStack spacing={1}>
                      <Box>{t('common:core.ai.Support tool')}</Box>
                      <QuestionTip label={t('common:core.module.template.AI support tool tip')} />
                    </HStack>
                  </Th>
                </Tr>
              </Thead>
              <Tbody>
                <Tr>
                  <Td>
                    {!!selectedModel && (
                      <PriceLine
                        config={selectedModel}
                        unitLabel={t('common:support.wallet.subscription.point') + ' / 1K Tokens'}
                        priceKey={'input'}
                        fontSize={'mini'}
                      />
                    )}
                  </Td>
                  <Td rowSpan={2}>{Math.round((selectedModel?.maxContext || 4096) / 1000)}K</Td>
                  <Td rowSpan={2}>
                    {selectedModel?.toolChoice || selectedModel?.functionCall
                      ? t('common:support')
                      : t('common:not_support')}
                  </Td>
                </Tr>
                <Tr>
                  <Td>
                    {!!selectedModel && (
                      <PriceLine
                        config={selectedModel}
                        unitLabel={t('common:support.wallet.subscription.point') + ' / 1K Tokens'}
                        priceKey={'output'}
                        fontSize={'mini'}
                      />
                    )}
                  </Td>
                </Tr>
              </Tbody>
            </Table>
          </TableContainer>

            {showMaxHistoriesSlider && (
              <SettingRow
                label={t('app:max_histories_number')}
                tip={t('app:max_histories_number_tip')}
              >
                <Box ml={'52px'}>
                  <InputSlider
                    min={0}
                    max={30}
                    step={1}
                    value={getValues('maxHistories') ?? 6}
                    inputVariant={'whiteOutline'}
                    onChange={(e) => {
                      setValue('maxHistories', e);
                      setRefresh(!refresh);
                    }}
                  />
                </Box>
              </SettingRow>
            )}
            {showMaxToken && (
              <SettingRow
                label={t('app:max_tokens')}
                switchControl={
                  <Switch
                    isChecked={maxToken !== undefined}
                    onChange={(e) => {
                      setValue('maxToken', e.target.checked ? tokenLimit / 2 : undefined);
                    }}
                  />
                }
              >
                <InputSlider
                  min={0}
                  max={tokenLimit}
                  step={200}
                  inputVariant={'whiteOutline'}
                  isDisabled={maxToken === undefined}
                  value={maxToken}
                  onChange={(val) => {
                    setValue(NodeInputKeyEnum.aiChatMaxToken, val);
                    setRefresh(!refresh);
                  }}
                />
              </SettingRow>
            )}
            {showMultimodalSetting && (
              <SettingRow
                label={t('app:llm_use_multimodal')}
                switchControl={
                  !supportParams.multimodal ? (
                    <Box fontSize={'sm'} color={'myGray.500'}>
                      {t('app:llm_not_support_multimodal')}
                    </Box>
                  ) : multimodalOptions.length === 1 && singleMultimodalOption ? (
                    <Switch
                      isChecked={selectedMultimodalValues.length > 0}
                      onChange={(e) => {
                        onChangeMultimodalValues(
                          e.target.checked ? [singleMultimodalOption.value] : []
                        );
                      }}
                    />
                  ) : undefined
                }
              >
                {supportParams.multimodal && multimodalOptions.length > 1 && (
                  <MultipleSelect
                    h={'36px'}
                    value={selectedMultimodalValues}
                    list={multimodalOptions}
                    placeholder={t('app:llm_multimodal_select_placeholder')}
                    onSelect={onChangeMultimodalValues}
                  />
                )}
              </SettingRow>
            )}
            {showExtractFilesSetting && (
              <SettingRow
                label={t('app:extract_chat_files')}
                tip={t('app:extract_chat_files_tip')}
                switchControl={
                  <Switch
                    isChecked={!!extractFiles}
                    onChange={(e) => {
                      setValue(NodeInputKeyEnum.aiChatExtractFiles, e.target.checked);
                    }}
                  />
                }
              />
            )}
            {showResponseAnswerText && (
              <SettingRow
                label={t('app:hide_response')}
                tip={t('app:hide_response_tip')}
                switchControl={
                  <Switch
                    isChecked={!getValues(NodeInputKeyEnum.aiChatIsResponseText)}
                    onChange={(e) => {
                      setValue(NodeInputKeyEnum.aiChatIsResponseText, !e.target.checked);
                      setRefresh((state) => !state);
                    }}
                  />
                }
              />
            )}
          </SectionCard>

        {/* 思考配置 */}
        {showReasoningSection && (
          <SectionCard title={t('app:ai_setting_reasoning_config')}>
            <SettingRow
              label={t('app:reasoning_effort')}
              tip={t('app:ai_setting_reasoning_config_tip')}
            >
              {supportParams.reasoningEffort ? (
                <MySelect<ReasoningEffort>
                  h={'36px'}
                  list={reasoningEffortList.map((item) => ({
                    label: t(item.label),
                    value: item.value
                  }))}
                  value={reasoningEffort ?? null}
                  onChange={(e) => {
                    setValue(NodeInputKeyEnum.aiChatReasoningEffort, e);
                  }}
                />
              ) : (
                <Box fontSize={'sm'} color={'myGray.900'}>
                  {t('app:reasoning_effort_unsupported')}
                </Box>
              )}
            </SettingRow>
            {reasoningEffort !== 'none' && (
              <SettingRow
                label={t('app:reasoning_response')}
                switchControl={
                  <Switch
                    isChecked={!reasoning}
                    onChange={(e) => {
                      setValue(NodeInputKeyEnum.aiChatReasoning, !e.target.checked);
                    }}
                  />
                }
              />
            )}
          </SectionCard>
        )}

        {/* 高级配置 */}
        {showAdvancedConfig && (
          <SectionCard title={t('app:ai_setting_advanced_config')}>
            {supportParams.temperature && showTemperature && (
              <SettingRow
                label={t('app:temperature')}
                tip={t('app:temperature_tip')}
                switchControl={
                  <Switch
                    isChecked={temperature !== undefined}
                    onChange={(e) => {
                      setValue('temperature', e.target.checked ? 0 : undefined);
                    }}
                  />
                }
              >
                <InputSlider
                  min={0}
                  max={10}
                  step={1}
                  value={temperature}
                  inputVariant={'whiteOutline'}
                  isDisabled={temperature === undefined}
                  onChange={(e) => {
                    setValue(NodeInputKeyEnum.aiChatTemperature, e);
                    setRefresh(!refresh);
                  }}
                />
              </SettingRow>
            )}
            {supportParams.topP && showTopP && (
              <SettingRow
                label="Top_p"
                tip={t('app:show_top_p_tip')}
                switchControl={
                  <Switch
                    isChecked={topP !== undefined}
                    onChange={(e) => {
                      setValue(NodeInputKeyEnum.aiChatTopP, e.target.checked ? 1 : undefined);
                    }}
                  />
                }
              >
                <InputSlider
                  min={0}
                  max={1}
                  step={0.1}
                  value={topP}
                  inputVariant={'whiteOutline'}
                  isDisabled={topP === undefined}
                  onChange={(e) => {
                    setValue(NodeInputKeyEnum.aiChatTopP, e);
                    setRefresh(!refresh);
                  }}
                />
              </SettingRow>
            )}
            {showStopSign && supportParams.stop && (
              <SettingRow
                label={t('app:stop_sign')}
                switchControl={
                  <Switch
                    isChecked={stopSign !== undefined}
                    onChange={(e) => {
                      setValue(NodeInputKeyEnum.aiChatStopSign, e.target.checked ? '' : undefined);
                    }}
                  />
                }
              >
                <Input
                  isDisabled={stopSign === undefined}
                  h={'36px'}
                  {...register(NodeInputKeyEnum.aiChatStopSign)}
                  placeholder={t('app:stop_sign_placeholder')}
                />
              </SettingRow>
            )}
            {showResponseFormat && supportParams.responseFormat && (
              <SettingRow
                label={t('app:response_format')}
                switchControl={
                  <Switch
                    isChecked={responseFormat !== undefined}
                    onChange={(e) => {
                      setValue(
                        NodeInputKeyEnum.aiChatResponseFormat,
                        e.target.checked ? selectedModel?.responseFormatList?.[0] : undefined
                      );
                    }}
                  />
                }
              >
                <MySelect<string>
                  isDisabled={responseFormat === undefined}
                  placeholder={t('app:response_format_placeholder')}
                  h={'36px'}
                  list={selectedModel.responseFormatList!.map((item) => ({
                    value: item,
                    label: item
                  }))}
                  value={responseFormat}
                  onChange={(e) => {
                    setValue(NodeInputKeyEnum.aiChatResponseFormat, e);
                  }}
                />
              </SettingRow>
            )}
            {showResponseFormat && responseFormat === 'json_schema' && (
              <Box w="full" pt={2}>
                <HStack spacing={1} fontSize="sm" color="myGray.900" fontWeight={500} mb={2}>
                  <Box>JSON Schema</Box>
                  <QuestionTip label={t('app:json_schema_tip')} />
                </HStack>
                <JsonEditor
                  value={jsonSchema || ''}
                  onChange={(e) => {
                    setValue(NodeInputKeyEnum.aiChatJsonSchema, e);
                  }}
                  bg={'myGray.25'}
                />
              </Box>
            )}
          </SectionCard>
        )}
      </VStack>
    </MyModal>
  );
};

export default AIChatSettingsModal;
