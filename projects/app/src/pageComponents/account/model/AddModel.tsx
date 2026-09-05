import type { AdminModelChannel } from '@fastgpt/global/openapi/admin/core/ai/model/api';
import {
  getAdminModelTemplates,
  postSystemModelsFromTemplates,
  postTestDraftModel
} from '@/web/core/ai/config';
import { defaultChannel } from '@/global/aiproxy/constants';
import {
  Box,
  Button,
  Checkbox,
  Flex,
  Grid,
  HStack,
  Radio,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  type BoxProps,
  type ButtonProps
} from '@chakra-ui/react';
import { ModelScopeEnum, modelTypeList, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { getErrText } from '@fastgpt/global/common/error/utils';
import type {
  SystemModelDataType,
  SystemModelDocumentDataType
} from '@fastgpt/global/core/ai/model.schema';
import type { ModelProviderItemType } from '@fastgpt/global/core/ai/provider';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import MyTag, { type ColorSchemaType } from '@fastgpt/web/components/common/Tag';
import Avatar from '@fastgpt/web/components/common/Avatar';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useStaticVirtualList } from '@fastgpt/web/hooks/useVirtualList';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import { useLockFn, useSet } from 'ahooks';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import ModelConfigForm, { type ModelConfigFormGetValues } from './ModelConfigForm';
import ModelChannelModal, { ModelChannelSelector } from './ModelChannelModal';
import ModelLinkedChannels from './ModelLinkedChannels';
import { prepareDraftSystemModelForTest, submitCreatedSystemModel } from './submit';
import ModelListFilters from '@/components/core/ai/ModelListFilters';
import ModelCapabilityTags from '@/components/core/ai/ModelCapabilityTags';
import TestModeBetaTag from '@/components/core/ai/TestModeBetaTag';

const EditChannelModal = dynamic(() => import('./Channel/EditChannelModal'), { ssr: false });

/**
 * 通过持久化字段白名单生成空白模型草稿。
 *
 * 默认模型只贡献同类型能力参数，实例身份字段（尤其 modelId）不会进入创建状态。
 */
export const createBlankSystemModelData = ({
  type,
  provider,
  defaultModel
}: {
  type: ModelTypeEnum;
  provider: string;
  defaultModel?: SystemModelDataType;
}): SystemModelDocumentDataType => {
  const base = {
    scope: ModelScopeEnum.system as ModelScopeEnum.system,
    provider,
    model: '',
    name: '',
    charsPointsPrice: 0,
    isActive: false
  };

  if (type === ModelTypeEnum.llm) {
    const typedDefault = defaultModel?.type === ModelTypeEnum.llm ? defaultModel : undefined;
    return {
      ...base,
      type,
      config: {
        maxContext: typedDefault?.config.maxContext ?? 32000,
        maxResponse: typedDefault?.config.maxResponse ?? 4000,
        quoteMaxToken: typedDefault?.config.quoteMaxToken ?? 20000,
        maxTemperature: typedDefault?.config.maxTemperature,
        vision: false,
        audio: false,
        video: false
      }
    };
  }
  if (type === ModelTypeEnum.embedding) {
    const typedDefault = defaultModel?.type === ModelTypeEnum.embedding ? defaultModel : undefined;
    return {
      ...base,
      type,
      config: {
        defaultToken: typedDefault?.config.defaultToken ?? 512,
        maxToken: typedDefault?.config.maxToken ?? 8192,
        weight: typedDefault?.config.weight ?? 0
      }
    };
  }
  if (type === ModelTypeEnum.tts) {
    const typedDefault = defaultModel?.type === ModelTypeEnum.tts ? defaultModel : undefined;
    return { ...base, type, config: { voices: typedDefault?.config.voices ?? [] } };
  }
  if (type === ModelTypeEnum.stt) return { ...base, type, config: {} };
  return { ...base, type: ModelTypeEnum.rerank, config: {} };
};

export const AddModelButton = ({
  onCreateFromBlank,
  onCreateFromTemplate,
  buttonBoxProps,
  ...props
}: {
  onCreateFromBlank: () => void;
  onCreateFromTemplate?: () => void;
  buttonBoxProps?: BoxProps;
} & ButtonProps) => {
  const { t } = useClientTranslation('config_model');

  return (
    <MyMenu
      trigger="hover"
      size="sm"
      buttonBoxProps={{
        ...buttonBoxProps,
        pointerEvents: props.isDisabled ? 'none' : buttonBoxProps?.pointerEvents
      }}
      Button={<Button {...props}>{t('config_model:create_model')}</Button>}
      menuList={[
        {
          children: [
            ...(onCreateFromTemplate
              ? [
                  {
                    label: t('config_model:create_from_template'),
                    onClick: onCreateFromTemplate
                  }
                ]
              : []),
            {
              label: t('config_model:create_from_blank'),
              onClick: onCreateFromBlank
            }
          ]
        }
      ]}
    />
  );
};

const createFormId = 'system-model-create-form';

const modelTypeTagLabelMap: Record<ModelTypeEnum, string> = {
  [ModelTypeEnum.llm]: 'LLM',
  [ModelTypeEnum.embedding]: 'Embedding',
  [ModelTypeEnum.tts]: 'TTS',
  [ModelTypeEnum.stt]: 'STT',
  [ModelTypeEnum.rerank]: 'Rerank'
};

const modelTypeTagColorMap: Record<ModelTypeEnum, ColorSchemaType> = {
  [ModelTypeEnum.llm]: 'blue',
  [ModelTypeEnum.embedding]: 'yellow',
  [ModelTypeEnum.tts]: 'green',
  [ModelTypeEnum.stt]: 'purple',
  [ModelTypeEnum.rerank]: 'red'
};

const TemplateTableColumns = () => (
  <colgroup>
    <col style={{ width: '96px' }} />
    <col />
    <col style={{ width: '180px' }} />
  </colgroup>
);

const modelTypeDescriptionKeyMap: Record<ModelTypeEnum, string> = {
  [ModelTypeEnum.llm]: 'config_model:model_type_description.llm',
  [ModelTypeEnum.embedding]: 'config_model:model_type_description.embedding',
  [ModelTypeEnum.tts]: 'config_model:model_type_description.tts',
  [ModelTypeEnum.stt]: 'config_model:model_type_description.stt',
  [ModelTypeEnum.rerank]: 'config_model:model_type_description.rerank'
};

/** 模型类型选择内容不持有弹窗状态，供空白新增流程嵌入稳定的 Modal 外壳。 */
const ModelTypeSelector = ({
  value,
  onChange
}: {
  value: ModelTypeEnum;
  onChange: (type: ModelTypeEnum) => void;
}) => {
  const { t } = useClientTranslation('config_model');

  return (
    <Grid templateColumns={['1fr', 'repeat(2, 1fr)']} gap={3}>
      {[
        [ModelTypeEnum.llm, t('common:model.type.chat')],
        [ModelTypeEnum.embedding, t('common:model.type.embedding')],
        [ModelTypeEnum.tts, t('common:model.type.tts')],
        [ModelTypeEnum.stt, t('common:model.type.stt')],
        [ModelTypeEnum.rerank, t('common:model.type.reRank')]
      ].map(([type, label]) => (
        <Flex
          key={type}
          borderWidth="1px"
          borderColor={value === type ? 'primary.600' : 'myGray.200'}
          borderRadius="md"
          px={4}
          py={3}
          minH="64px"
          alignItems="flex-start"
          cursor="pointer"
          boxShadow={value === type ? '0 0 0 2.4px rgba(51, 112, 255, 0.15)' : undefined}
          onClick={() => onChange(type as ModelTypeEnum)}
        >
          <Radio isChecked={value === type} pointerEvents="none" mr={2} mt="1px" />
          <Box minW={0} fontSize="xs" lineHeight="16px">
            <Box>{label}</Box>
            <Box mt={2} color="myGray.500">
              {t(modelTypeDescriptionKeyMap[type as ModelTypeEnum] as any)}
            </Box>
          </Box>
          <MyTag ml="auto" flexShrink={0} colorSchema="blue">
            {modelTypeTagLabelMap[type as ModelTypeEnum]}
          </MyTag>
        </Flex>
      ))}
    </Grid>
  );
};

/**
 * 空白新建模型的两步控制器。
 *
 * 类型选择和参数表单共享同一个 Modal，创建状态只包含持久化字段，不持有或发送 modelId。
 */
export const BlankModelCreateModal = ({
  createModelData,
  providers,
  channels,
  onSuccess,
  onClose
}: {
  createModelData: (type: ModelTypeEnum) => SystemModelDocumentDataType;
  providers: ModelProviderItemType[];
  channels: AdminModelChannel[];
  onSuccess: () => unknown | Promise<unknown>;
  onClose: () => void;
}) => {
  const { t } = useClientTranslation('config_model');
  const { toast } = useToast();
  const router = useRouter();
  const [step, setStep] = useState<'type' | 'config'>('type');
  const [selectedType, setSelectedType] = useState<ModelTypeEnum>(ModelTypeEnum.llm);
  const [submitting, setSubmitting] = useState(false);
  const [testingChannelIds, testingChannelIdsDispatch] = useSet<number>();
  const [selectedChannelIds, setSelectedChannelIds] = useState<Set<number>>(new Set());
  const [showAssociateChannel, setShowAssociateChannel] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [draftModel, setDraftModel] = useState('');
  const modelFormGetValuesRef = useRef<ModelConfigFormGetValues | null>(null);
  const modelData = useMemo(() => createModelData(selectedType), [createModelData, selectedType]);

  const handleTestModelChannel = async (channelId: number) => {
    const draftModelData = modelFormGetValuesRef.current?.() ?? modelData;
    const testModelData = prepareDraftSystemModelForTest(draftModelData);
    const model = testModelData.model;
    if (!model) {
      toast({
        status: 'warning',
        title: t('config_model:fill_model_id_before_test')
      });
      return;
    }
    if (testModelData.type === ModelTypeEnum.tts && testModelData.config.voices.length === 0) {
      toast({
        status: 'warning',
        title: t('config_model:fill_voice_before_test')
      });
      return;
    }

    const channelName = channels.find((channel) => channel.id === channelId)?.name ?? '';
    testingChannelIdsDispatch.add(channelId);
    try {
      await postTestDraftModel({
        channelId,
        modelData: testModelData
      });
      toast({
        status: 'success',
        title: t('config_model:model_channel_test_success', { model, channel: channelName })
      });
    } catch (error) {
      toast({
        status: 'error',
        title: t('config_model:model_channel_test_failed', {
          model,
          channel: channelName,
          reason: getErrText(error)
        })
      });
    } finally {
      testingChannelIdsDispatch.remove(channelId);
    }
  };

  const goToChannelManagement = () => {
    onClose();
    void router.push(
      {
        pathname: router.pathname,
        query: { ...router.query, modelTab: 'channel' }
      },
      undefined,
      { shallow: true }
    );
  };

  return (
    <>
      <MyModal
        title={
          step === 'type' ? t('config_model:select_model_type') : t('config_model:create_model')
        }
        isOpen
        onClose={onClose}
        size="lg"
        h={step === 'config' ? '660px' : 'auto'}
        footerStyles={{ display: 'flex', w: 'full' }}
        footer={
          step === 'type' ? (
            <>
              <Button variant="whiteBase" size="md" onClick={onClose}>
                {t('common:Cancel')}
              </Button>
              <Button size="md" onClick={() => setStep('config')}>
                {t('config_model:next_step')}
              </Button>
            </>
          ) : (
            <>
              <Button variant="whiteBase" size="md" onClick={onClose}>
                {t('common:Cancel')}
              </Button>
              <Button size="md" type="submit" form={createFormId} isLoading={submitting}>
                {t('common:Confirm')}
              </Button>
            </>
          )
        }
      >
        {step === 'type' ? (
          <ModelTypeSelector value={selectedType} onChange={setSelectedType} />
        ) : (
          <ModelConfigForm
            getValuesRef={modelFormGetValuesRef}
            formId={createFormId}
            modelData={modelData}
            providers={providers}
            onModelChange={setDraftModel}
            channelSection={{
              title: t('config_model:associated_channels', {
                count: channels.filter((channel) => selectedChannelIds.has(channel.id)).length
              }),
              content: (
                <ModelLinkedChannels
                  channels={channels}
                  selectedIds={selectedChannelIds}
                  onCreate={() => setShowCreateChannel(true)}
                  onAssociate={() => setShowAssociateChannel(true)}
                  onManage={goToChannelManagement}
                  onTest={(channelId) => void handleTestModelChannel(channelId)}
                  testingChannelIds={testingChannelIds}
                  onRemove={(channelId) =>
                    setSelectedChannelIds((current) => {
                      const next = new Set(current);
                      next.delete(channelId);
                      return next;
                    })
                  }
                />
              )
            }}
            onSubmittingChange={setSubmitting}
            onSuccess={() => {
              onClose();
              void Promise.resolve(onSuccess()).catch(() => {});
            }}
            onSubmit={async (data) => {
              await submitCreatedSystemModel({
                modelData: data,
                channelIds: [...selectedChannelIds]
              });
            }}
          />
        )}
      </MyModal>

      {showAssociateChannel && (
        <ModelChannelModal
          models={[
            {
              model: draftModel,
              modelData: {
                ...modelData,
                model: draftModel,
                name: draftModel || modelData.name
              }
            }
          ]}
          channels={channels}
          selectedChannelIds={[...selectedChannelIds]}
          showCurrentModel={false}
          showTest={false}
          onConfirm={(channelIds) => {
            setSelectedChannelIds(new Set(channelIds));
            setShowAssociateChannel(false);
          }}
          onClose={() => setShowAssociateChannel(false)}
        />
      )}

      {showCreateChannel && (
        <EditChannelModal
          defaultConfig={{ ...defaultChannel, models: [] }}
          fixedModel={{
            model: draftModel.trim() || t('config_model:model_pending_creation')
          }}
          allowEmptyModels
          onSuccess={async (createdChannelId) => {
            if (createdChannelId !== undefined) {
              setSelectedChannelIds((current) => new Set([...current, createdChannelId]));
            }
            // 渠道已经创建成功，列表刷新失败不能把写入结果误报为创建失败。
            await Promise.resolve(onSuccess()).catch(() => {});
          }}
          onClose={() => setShowCreateChannel(false)}
        />
      )}
    </>
  );
};

const TemplateCreateModal = ({
  installedModels,
  channels,
  onClose,
  onSuccess
}: {
  installedModels: SystemModelDataType[];
  channels: AdminModelChannel[];
  onClose: () => void;
  onSuccess: () => Promise<void>;
}) => {
  const { t, i18n } = useClientTranslation('config_model');
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [providerFilter, setProviderFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<ModelTypeEnum | ''>('');
  const [templateSearch, setTemplateSearch] = useState('');
  const [selectedChannelIds, setSelectedChannelIds] = useState<number[]>([]);
  const {
    data,
    error,
    loading,
    runAsync: refreshTemplates
  } = useRequest(getAdminModelTemplates, { manual: false, errorToast: '' });

  const installedModelNames = useMemo(
    () => new Set(installedModels.map((model) => model.model)),
    [installedModels]
  );
  const availableTemplates = useMemo(() => {
    const modelNames = new Set<string>();

    return (data?.models ?? []).filter((model) => {
      if (installedModelNames.has(model.model) || modelNames.has(model.model)) return false;
      modelNames.add(model.model);
      return true;
    });
  }, [data?.models, installedModelNames]);
  const templates = useMemo(() => {
    const search = templateSearch.trim().toLowerCase();
    return availableTemplates.filter(
      (model) =>
        (!providerFilter || model.provider === providerFilter) &&
        (!typeFilter || model.type === typeFilter) &&
        (!search ||
          model.name.toLowerCase().includes(search) ||
          model.model.toLowerCase().includes(search))
    );
  }, [availableTemplates, providerFilter, templateSearch, typeFilter]);
  const {
    containerRef: templateListContainerRef,
    virtualDataList: virtualTemplates,
    topPlaceholderHeight: templateTopPlaceholderHeight,
    bottomPlaceholderHeight: templateBottomPlaceholderHeight,
    scrollToTop: scrollTemplateListToTop
  } = useStaticVirtualList({
    data: templates,
    itemHeight: 80,
    overscan: 6
  });
  useEffect(() => {
    scrollTemplateListToTop();
  }, [providerFilter, scrollTemplateListToTop, templateSearch, typeFilter]);
  const selectedTemplates = availableTemplates.filter((model) =>
    selectedKeys.has(`${model.type}:${model.model}`)
  );
  const providerMap = useMemo(
    () => new Map((data?.providers ?? []).map((provider) => [provider.provider, provider])),
    [data?.providers]
  );
  const filterProviders = useMemo(
    () =>
      (data?.providers ?? []).map((provider, index) => ({
        id: provider.provider,
        name: parseI18nString(provider.value, i18n.language),
        avatar: provider.avatar,
        order: index
      })),
    [data?.providers, i18n.language]
  );
  const visibleTemplateKeys = templates.map((model) => `${model.type}:${model.model}`);
  const isAllVisibleSelected =
    visibleTemplateKeys.length > 0 && visibleTemplateKeys.every((key) => selectedKeys.has(key));
  const toggleSelectAllVisible = () => {
    setSelectedKeys((previous) => {
      const next = new Set(previous);
      visibleTemplateKeys.forEach((key) =>
        isAllVisibleSelected ? next.delete(key) : next.add(key)
      );
      return next;
    });
  };

  const { runAsync: createModelsRequest, loading: creatingModels } = useRequest(
    () =>
      postSystemModelsFromTemplates({
        templates: selectedTemplates.map(({ type, model }) => ({ type, model })),
        channelIds: selectedChannelIds
      }),
    {
      onSuccess: () => {
        onClose();
        void onSuccess().catch(() => {});
      },
      successToast: t('common:Success')
    }
  );
  const createModels = useLockFn(createModelsRequest);

  const toggleKey = (key: string) => {
    setSelectedKeys((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <MyModal
      isOpen
      onClose={onClose}
      title={
        step === 1
          ? t('config_model:select_model_template')
          : t('config_model:configure_model_channels')
      }
      w="820px"
      h="612px"
      maxW="calc(100vw - 32px)"
      bodyStyles={{ overflow: 'hidden' }}
      footer={
        step === 1 ? (
          <>
            <Button variant="whiteBase" onClick={onClose}>
              {t('common:Cancel')}
            </Button>
            <Button isDisabled={selectedKeys.size === 0} onClick={() => setStep(2)}>
              {t('config_model:next_step')}
            </Button>
          </>
        ) : (
          <>
            <Button variant="whiteBase" onClick={() => setStep(1)}>
              {t('config_model:previous_step')}
            </Button>
            <Button isLoading={creatingModels} onClick={createModels}>
              {t('common:Confirm')}
            </Button>
          </>
        )
      }
    >
      {step === 1 ? (
        <MyBox isLoading={loading} flex="1 1 0" minH={0}>
          {error && !data ? (
            <EmptyTip
              py={10}
              text={
                <Flex direction="column" alignItems="center" gap={3}>
                  <Box>{t('config_model:template_load_failed')}</Box>
                  <Button size="sm" variant="whiteBase" onClick={() => void refreshTemplates()}>
                    {t('config_model:retry')}
                  </Button>
                </Flex>
              }
            />
          ) : (
            <Flex direction="column" h="100%" minH={0}>
              <ModelListFilters
                providers={filterProviders}
                models={availableTemplates}
                provider={providerFilter}
                onProviderChange={setProviderFilter}
                modelType={typeFilter}
                onModelTypeChange={setTypeFilter}
                search={templateSearch}
                onSearchChange={setTemplateSearch}
              />
              <Flex
                borderWidth="1px"
                borderColor="myGray.200"
                borderRadius="12px"
                overflow="hidden"
                direction="column"
                flex="1 1 0"
                minH={0}
                mt={4}
              >
                <Table w="100%" size="sm" sx={{ tableLayout: 'fixed' }}>
                  <TemplateTableColumns />
                  <Thead>
                    <Tr h="40px" bg="myGray.100">
                      <Th px={3}>
                        <HStack spacing={2}>
                          <Checkbox
                            isChecked={isAllVisibleSelected}
                            isIndeterminate={
                              !isAllVisibleSelected &&
                              visibleTemplateKeys.some((key) => selectedKeys.has(key))
                            }
                            onChange={toggleSelectAllVisible}
                          />
                          <Box>{t('common:Select_all')}</Box>
                        </HStack>
                      </Th>
                      <Th px={4}>{t('config_model:model.model_id')}</Th>
                      <Th px={4}>{t('common:model.model_type')}</Th>
                    </Tr>
                  </Thead>
                </Table>
                <TableContainer
                  ref={templateListContainerRef}
                  flex="1 1 0"
                  minH={0}
                  overflowY="auto"
                >
                  <Table w="100%" size="sm" sx={{ tableLayout: 'fixed' }}>
                    <TemplateTableColumns />
                    <Tbody>
                      {templateTopPlaceholderHeight > 0 && (
                        <Tr h={`${templateTopPlaceholderHeight}px`} aria-hidden>
                          <Td
                            colSpan={3}
                            h={`${templateTopPlaceholderHeight}px`}
                            p={0}
                            border={0}
                          />
                        </Tr>
                      )}
                      {virtualTemplates.map(({ data: model }) => {
                        const key = `${model.type}:${model.model}`;
                        const typeLabel = modelTypeList.find(
                          (item) => item.value === model.type
                        )?.label;
                        const provider = providerMap.get(model.provider);
                        const contextToken =
                          model.type === ModelTypeEnum.llm
                            ? model.config.maxContext
                            : model.type === ModelTypeEnum.embedding ||
                                model.type === ModelTypeEnum.rerank
                              ? model.config.maxToken
                              : undefined;
                        return (
                          <Tr
                            key={key}
                            h="80px"
                            cursor="pointer"
                            _hover={{ bg: 'myGray.25' }}
                            onClick={() => toggleKey(key)}
                          >
                            <Td px={3}>
                              <Checkbox isChecked={selectedKeys.has(key)} pointerEvents="none" />
                            </Td>
                            <Td px={4} fontSize="sm">
                              <HStack>
                                <Avatar src={provider?.avatar} w="1.2rem" borderRadius="50%" />
                                <Flex alignItems="center" gap={1} minW={0}>
                                  <Box color="myGray.900" fontWeight="500" noOfLines={1}>
                                    {model.model}
                                  </Box>
                                  {model.testMode && <TestModeBetaTag />}
                                </Flex>
                              </HStack>
                              <ModelCapabilityTags
                                mt={2}
                                contextToken={contextToken}
                                showVision={
                                  (model.type === ModelTypeEnum.llm ||
                                    model.type === ModelTypeEnum.embedding) &&
                                  !!model.config.vision
                                }
                                showVideo={model.type === ModelTypeEnum.llm && !!model.config.video}
                                showAudio={model.type === ModelTypeEnum.llm && !!model.config.audio}
                                showReasoning={
                                  model.type === ModelTypeEnum.llm && !!model.config.reasoning
                                }
                              />
                            </Td>
                            <Td px={4}>
                              <MyTag
                                type="borderFill"
                                colorSchema={modelTypeTagColorMap[model.type]}
                                py={0.5}
                              >
                                {typeLabel ? t(typeLabel) : model.type}
                              </MyTag>
                            </Td>
                          </Tr>
                        );
                      })}
                      {templateBottomPlaceholderHeight > 0 && (
                        <Tr h={`${templateBottomPlaceholderHeight}px`} aria-hidden>
                          <Td
                            colSpan={3}
                            h={`${templateBottomPlaceholderHeight}px`}
                            p={0}
                            border={0}
                          />
                        </Tr>
                      )}
                      {!loading && templates.length === 0 && (
                        <Tr>
                          <Td colSpan={3} border={0}>
                            <EmptyTip py={8} text={t('config_model:no_available_templates')} />
                          </Td>
                        </Tr>
                      )}
                    </Tbody>
                  </Table>
                </TableContainer>
              </Flex>
            </Flex>
          )}
        </MyBox>
      ) : (
        <ModelChannelSelector
          models={selectedTemplates.map((model) => ({
            model: model.model,
            modelData: model,
            avatar: providerMap.get(model.provider)?.avatar
          }))}
          channels={channels}
          selectedChannelIds={selectedChannelIds}
          onChange={setSelectedChannelIds}
          showCurrentModel={false}
          showSelectedModelCount
          showTest={false}
        />
      )}
    </MyModal>
  );
};

/** 聚合“从模板新建”和“从空白新建”的完整添加模型交互。 */
const AddModel = ({
  installedModels,
  defaultModels,
  channels,
  providers,
  defaultProvider,
  onSuccess,
  buttonBoxProps,
  ...buttonProps
}: {
  installedModels: SystemModelDataType[];
  defaultModels?: Partial<Record<ModelTypeEnum, SystemModelDataType>>;
  channels: AdminModelChannel[];
  providers: ModelProviderItemType[];
  defaultProvider: string;
  onSuccess: () => Promise<void>;
  buttonBoxProps?: BoxProps;
} & ButtonProps) => {
  const [showBlankCreate, setShowBlankCreate] = useState(false);
  const [showTemplateCreate, setShowTemplateCreate] = useState(false);
  const getBlankModelData = useCallback(
    (type: ModelTypeEnum) =>
      createBlankSystemModelData({
        type,
        provider: defaultModels?.[type]?.provider ?? defaultProvider,
        defaultModel: defaultModels?.[type] ?? installedModels.find((model) => model.type === type)
      }),
    [defaultModels, defaultProvider, installedModels]
  );

  return (
    <>
      <AddModelButton
        {...buttonProps}
        buttonBoxProps={buttonBoxProps}
        onCreateFromBlank={() => setShowBlankCreate(true)}
        onCreateFromTemplate={() => setShowTemplateCreate(true)}
      />
      {showBlankCreate && (
        <BlankModelCreateModal
          createModelData={getBlankModelData}
          providers={providers}
          channels={channels}
          onClose={() => setShowBlankCreate(false)}
          onSuccess={onSuccess}
        />
      )}
      {showTemplateCreate && (
        <TemplateCreateModal
          installedModels={installedModels}
          channels={channels}
          onClose={() => setShowTemplateCreate(false)}
          onSuccess={onSuccess}
        />
      )}
    </>
  );
};

export default AddModel;
