import {
  Box,
  Flex,
  Grid,
  HStack,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Switch,
  ModalBody,
  ModalFooter,
  Button,
  useDisclosure
} from '@chakra-ui/react';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import React, { useCallback, useMemo, useState } from 'react';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { modelTypeList, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import dynamic from 'next/dynamic';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import {
  deleteSystemModel,
  getModelConfigJson,
  getSystemModelDetail,
  getAdminModelConfig,
  getTestModel,
  putSystemModel,
  putUpdateDefaultModels
} from '@/web/core/ai/config';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { type SystemModelDataType } from '@fastgpt/global/core/ai/model.schema';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import JsonEditor from '@fastgpt/web/components/common/Textarea/JsonEditor';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { putUpdateWithJson } from '@/web/core/ai/config';
import CopyBox from '@fastgpt/web/components/common/String/CopyBox';
import MyIcon from '@fastgpt/web/components/common/Icon';
import AIModelSelector from '@/components/Select/AIModelSelector';
import MyDivider from '@fastgpt/web/components/common/MyDivider';
import { AddModelButton } from './AddModelBox';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import PriceTiersLabel from '@/components/core/ai/PriceTiersLabel';
import TestModeBetaTag from '@/components/core/ai/TestModeBetaTag';
import ModelCapabilityTags from '@/components/core/ai/ModelCapabilityTags';
import { accountContentScrollStyles, accountPageRootStyles } from '@/pageComponents/account/styles';
import ModelTabHeader from './ModelTabHeader';
import { useUserModelStore } from '@/web/core/ai/model/useUserModelStore';
import {
  formatModelProviders,
  getModelProviderFromCache,
  getModelProviderListFromCache
} from '@fastgpt/global/core/ai/provider';
import type { ModelDefaultIds } from '@fastgpt/global/core/ai/defaultModel';

const MyModal = dynamic(() => import('@fastgpt/web/components/common/MyModal'));
const ModelEditModal = dynamic(() => import('./AddModelBox').then((mod) => mod.ModelEditModal));

const ModelTable = ({ Tab }: { Tab: React.ReactNode }) => {
  const { t, i18n } = useClientTranslation('config_model');
  const { userInfo } = useUserStore();
  const { feConfigs } = useSystemStore();

  const {
    data: adminConfig,
    runAsync: refreshSystemModelList,
    loading: loadingModels
  } = useRequest(getAdminModelConfig, { manual: false });
  const systemModelList = adminConfig?.models ?? [];
  const providerCache = useMemo(
    () => formatModelProviders(adminConfig?.providers ?? []),
    [adminConfig?.providers]
  );
  const getModelProviders = useCallback(
    (language?: string) =>
      getModelProviderListFromCache(providerCache.ModelProviderListCache, language),
    [providerCache.ModelProviderListCache]
  );
  const getModelProvider = useCallback(
    (provider?: string, language?: string) =>
      getModelProviderFromCache({ cache: providerCache.ModelProviderMapCache, provider, language }),
    [providerCache.ModelProviderMapCache]
  );
  const defaultModels = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(adminConfig?.defaultModelIds ?? {}).map(([key, modelId]) => [
          key,
          systemModelList.find((model) => model.modelId === modelId)
        ])
      ),
    [adminConfig?.defaultModelIds, systemModelList]
  );

  const isRoot = userInfo?.username === 'root';

  const [provider, setProvider] = useState<string | ''>('');
  const providerList = useMemo<{ label: React.ReactNode; value: string | '' }[]>(
    () => [
      { label: t('common:All'), value: '' },
      ...getModelProviders(i18n.language).map((item) => ({
        label: (
          <HStack>
            <Avatar src={item.avatar} w={'1rem'} />
            <Box>{item.name}</Box>
          </HStack>
        ),
        value: item.id
      }))
    ],
    [getModelProviders, i18n.language, t]
  );

  const [modelType, setModelType] = useState<ModelTypeEnum | ''>('');
  const selectModelTypeList = useMemo<{ label: string; value: ModelTypeEnum | '' }[]>(
    () => [
      { label: t('common:All'), value: '' },
      ...modelTypeList.map((item) => ({ label: t(item.label), value: item.value }))
    ],
    [t]
  );

  const [search, setSearch] = useState('');
  const [showActive, setShowActive] = useState(false);

  const refreshModels = useCallback(async () => {
    useUserModelStore.getState().clearMemory();
    await refreshSystemModelList();
  }, [refreshSystemModelList]);

  const modelList = useMemo(() => {
    const formatLLMModelList = systemModelList
      .filter((item) => item.type === ModelTypeEnum.llm)
      .map((item) => ({
        ...item,
        typeLabel: t('common:model.type.chat'),
        priceLabel: (
          <PriceTiersLabel
            config={item}
            unitLabel={`${t('common:support.wallet.subscription.point')} / 1K Tokens`}
          />
        ),
        tagColor: 'blue'
      }));
    const formatVectorModelList = systemModelList
      .filter((item) => item.type === ModelTypeEnum.embedding)
      .map((item) => ({
        ...item,
        typeLabel: t('common:model.type.embedding'),
        priceLabel: (
          <Flex color={'myGray.700'}>
            {`${t('common:Input')}: `}
            <Box fontWeight={'bold'} color={'myGray.900'} mr={0.5}>
              {item.charsPointsPrice || 0}
            </Box>
            {` ${t('common:support.wallet.subscription.point')} / 1K Tokens`}
          </Flex>
        ),
        tagColor: 'yellow'
      }));
    const formatAudioSpeechModelList = systemModelList
      .filter((item) => item.type === ModelTypeEnum.tts)
      .map((item) => ({
        ...item,
        typeLabel: t('common:model.type.tts'),
        priceLabel: (
          <Flex color={'myGray.700'}>
            <Box fontWeight={'bold'} color={'myGray.900'} mr={0.5}>
              {item.charsPointsPrice || 0}
            </Box>
            {` ${t('common:support.wallet.subscription.point')} / 1K ${t('common:unit.character')}`}
          </Flex>
        ),
        tagColor: 'green'
      }));
    const formatWhisperModel = systemModelList
      .filter((item) => item.type === ModelTypeEnum.stt)
      .map((item) => ({
        ...item,
        typeLabel: t('common:model.type.stt'),
        priceLabel: (
          <Flex color={'myGray.700'}>
            <Box fontWeight={'bold'} color={'myGray.900'} mr={0.5}>
              {item.charsPointsPrice || 0}
            </Box>
            {` ${t('common:support.wallet.subscription.point')} / 60${t('common:unit.seconds')}`}
          </Flex>
        ),
        tagColor: 'purple'
      }));
    const formatRerankModelList = systemModelList
      .filter((item) => item.type === ModelTypeEnum.rerank)
      .map((item) => ({
        ...item,
        typeLabel: t('common:model.type.reRank'),
        priceLabel: item.charsPointsPrice ? (
          <Flex color={'myGray.700'}>
            {`${t('common:Input')}: `}
            <Box fontWeight={'bold'} color={'myGray.900'} mr={0.5}>
              {item.charsPointsPrice}
            </Box>
            {` ${t('common:support.wallet.subscription.point')} / 1K Tokens`}
          </Flex>
        ) : (
          '-'
        ),
        tagColor: 'red'
      }));

    const list = (() => {
      if (modelType === ModelTypeEnum.llm) return formatLLMModelList;
      if (modelType === ModelTypeEnum.embedding) return formatVectorModelList;
      if (modelType === ModelTypeEnum.tts) return formatAudioSpeechModelList;
      if (modelType === ModelTypeEnum.stt) return formatWhisperModel;
      if (modelType === ModelTypeEnum.rerank) return formatRerankModelList;

      return [
        ...formatLLMModelList,
        ...formatVectorModelList,
        ...formatAudioSpeechModelList,
        ...formatWhisperModel,
        ...formatRerankModelList
      ];
    })();

    const formatList = list.map((item) => {
      const provider = getModelProvider(item.provider, i18n.language);
      return {
        ...item,
        avatar: provider.avatar,
        providerId: provider.id,
        providerName: t(provider.name as any),
        order: provider.order,
        contextToken:
          item.type === ModelTypeEnum.llm
            ? item.config.maxContext
            : item.type === ModelTypeEnum.embedding || item.type === ModelTypeEnum.rerank
              ? item.config.maxToken
              : undefined,
        vision:
          item.type === ModelTypeEnum.llm || item.type === ModelTypeEnum.embedding
            ? item.config.vision
            : undefined,
        audio: item.type === ModelTypeEnum.llm ? item.config.audio : undefined,
        video: item.type === ModelTypeEnum.llm ? item.config.video : undefined,
        reasoning: item.type === ModelTypeEnum.llm ? item.config.reasoning : undefined
      };
    });
    formatList.sort((a, b) => a.order - b.order);

    const filterList = formatList.filter((item) => {
      const providerFilter = provider ? item.providerId === provider : true;

      const regx = new RegExp(search, 'i');
      const nameFilter = search ? regx.test(item.name) : true;

      const activeFilter = showActive ? item.isActive : true;

      return providerFilter && nameFilter && activeFilter;
    });

    return filterList;
  }, [
    systemModelList,
    t,
    modelType,
    getModelProvider,
    i18n.language,
    provider,
    search,
    showActive
  ]);
  const activeModelLength = useMemo(() => {
    return modelList.filter((item) => item.isActive).length;
  }, [modelList]);

  const filterProviderList = useMemo(() => {
    const allProviderIds: string[] = systemModelList.map((model) => model.provider);

    return providerList.filter((item) => allProviderIds.includes(item.value) || item.value === '');
  }, [providerList, systemModelList]);

  const { runAsync: onTestModel, loading: testingModel } = useRequest(getTestModel, {
    manual: true,
    successToast: t('common:Success')
  });
  const { runAsync: updateModel, loading: updatingModel } = useRequest(putSystemModel, {
    onSuccess: refreshModels
  });

  const { runAsync: deleteModel } = useRequest(deleteSystemModel, {
    onSuccess: refreshModels
  });

  const [editModelData, setEditModelData] = useState<SystemModelDataType>();
  const { runAsync: onEditModel, loading: loadingData } = useRequest(
    (modelId: string) => getSystemModelDetail(modelId),
    {
      onSuccess: (data: SystemModelDataType) => {
        setEditModelData(data);
      }
    }
  );

  const onCreateModel = (type: ModelTypeEnum) => {
    const defaultModel = defaultModels[type];

    const modelData = {
      ...defaultModel,
      model: '',
      name: '',
      charsPointsPrice: 0,
      inputPrice: undefined,
      outputPrice: undefined,
      priceTiers: undefined,

      isCustom: true,
      isActive: true,

      type,
      ...(type === ModelTypeEnum.llm
        ? {
            config: {
              ...defaultModel?.config,
              vision: false,
              audio: false,
              video: false
            }
          }
        : {})
    } as SystemModelDataType;

    setEditModelData(modelData);
  };

  const {
    isOpen: isOpenJsonConfig,
    onOpen: onOpenJsonConfig,
    onClose: onCloseJsonConfig
  } = useDisclosure();
  const {
    onOpen: onOpenDefaultModel,
    onClose: onCloseDefaultModel,
    isOpen: isOpenDefaultModel
  } = useDisclosure();

  const isLoading = loadingModels || loadingData || updatingModel || testingModel;

  const [showModelId, setShowModelId] = useState(true);

  return (
    <>
      {isRoot && (
        <ModelTabHeader Tab={Tab}>
          <Grid
            w={['100%', 'auto']}
            templateColumns={['repeat(3, minmax(0, 1fr))', 'repeat(3, auto)']}
            gap={2}
          >
            <Button
              w={['100%', 'auto']}
              minW={0}
              px={[2, 4]}
              variant={'whiteBase'}
              onClick={onOpenDefaultModel}
            >
              {t('config_model:model.default_model')}
            </Button>
            <Button
              w={['100%', 'auto']}
              minW={0}
              px={[2, 4]}
              variant={'whiteBase'}
              onClick={onOpenJsonConfig}
            >
              {t('config_model:model.json_config')}
            </Button>
            <AddModelButton
              w={['100%', 'auto']}
              minW={0}
              px={[2, 4]}
              buttonBoxProps={{ w: ['100%', 'fit-content'] }}
              onCreate={onCreateModel}
            />
          </Grid>
        </ModelTabHeader>
      )}
      <Box display={'flex'} flex={'1 0 0'} h={0} minH={0} flexDirection={'column'}>
        <Flex {...accountPageRootStyles} h={'100%'} flexDirection={'column'}>
          <Flex
            px={6}
            flexDirection={['column', 'row']}
            gap={[3, 6]}
            alignItems={['stretch', 'flex-start']}
          >
            <Flex flexShrink={0} w={['100%', 'auto']} alignItems={'center'} gap={2}>
              <Box w={['84px', 'auto']} flexShrink={0} fontSize={'sm'} color={'myGray.900'}>
                {t('common:model.provider')}
              </Box>
              <Box flex={1} minW={0} w={['100%', '160px']}>
                <MySelect
                  w={'100%'}
                  bg={'myGray.25'}
                  value={provider}
                  onChange={setProvider}
                  list={filterProviderList}
                />
              </Box>
            </Flex>
            <Flex flexShrink={0} w={['100%', 'auto']} alignItems={'center'} gap={2}>
              <Box w={['84px', 'auto']} flexShrink={0} fontSize={'sm'} color={'myGray.900'}>
                {t('common:model.model_type')}
              </Box>
              <Box flex={1} minW={0} w={['100%', '160px']}>
                <MySelect
                  w={'100%'}
                  bg={'myGray.25'}
                  value={modelType}
                  onChange={setModelType}
                  list={selectModelTypeList}
                />
              </Box>
            </Flex>
            <Box
              ml={[0, 'auto']}
              w={'100%'}
              maxW={['100%', '200px']}
              flex={['none', '0 0 200px']}
              flexShrink={0}
            >
              <SearchInput
                bg={'myGray.25'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('common:model.search_name_placeholder')}
              />
            </Box>
          </Flex>
          <MyBox {...accountContentScrollStyles} flex={'1 0 0'} h={0} mt={5} isLoading={isLoading}>
            <TableContainer h={'100%'} minH={0} overflowY={['visible', 'auto']} px={6}>
              <Table>
                <Thead>
                  <Tr color={'myGray.600'}>
                    <Th fontSize={'xs'}>
                      <HStack
                        spacing={1}
                        cursor={'pointer'}
                        onClick={() => setShowModelId(!showModelId)}
                      >
                        <Box>
                          {showModelId ? t('config_model:model.model_id') : t('common:model.name')}
                        </Box>
                        <MyIcon name={'modal/changePer'} w={'1rem'} />
                      </HStack>
                    </Th>
                    <Th fontSize={'xs'}>{t('common:model.model_type')}</Th>
                    {feConfigs?.isPlus && <Th fontSize={'xs'}>{t('common:model.billing')}</Th>}
                    <Th fontSize={'xs'}>
                      <Box
                        cursor={'pointer'}
                        onClick={() => setShowActive(!showActive)}
                        color={showActive ? 'primary.600' : 'myGray.600'}
                      >
                        {t('config_model:model.active')}({activeModelLength})
                      </Box>
                    </Th>
                    <Th fontSize={'xs'}></Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {modelList.map((item) => (
                    <Tr key={item.model} _hover={{ bg: 'myGray.50' }}>
                      <Td fontSize={'sm'}>
                        <HStack>
                          <Avatar src={item.avatar} w={'1.2rem'} borderRadius={'50%'} />
                          <Flex alignItems={'center'} gap={1} minW={0}>
                            <CopyBox
                              value={showModelId ? item.model : item.name}
                              color={'myGray.900'}
                              fontWeight={'500'}
                            >
                              {showModelId ? item.model : item.name}
                            </CopyBox>
                            {item.testMode && <TestModeBetaTag />}
                          </Flex>
                        </HStack>
                        <ModelCapabilityTags
                          mt={2}
                          contextToken={item.contextToken}
                          showVision={!!item.vision}
                          showVideo={!!item.video}
                          showAudio={!!item.audio}
                          showReasoning={!!item.reasoning}
                        />
                      </Td>
                      <Td>
                        <MyTag colorSchema={item.tagColor as any}>{item.typeLabel}</MyTag>
                      </Td>
                      {feConfigs?.isPlus && <Td fontSize={'sm'}>{item.priceLabel}</Td>}
                      <Td fontSize={'sm'}>
                        <Switch
                          size={'sm'}
                          isChecked={item.isActive}
                          onChange={(e) => {
                            const {
                              modelId,
                              avatar: _avatar,
                              isCustom: _isCustom,
                              ...modelData
                            } = item;
                            updateModel({
                              modelId,
                              modelData: {
                                ...modelData,
                                isActive: e.target.checked
                              }
                            });
                          }}
                          colorScheme={'myBlue'}
                        />
                      </Td>
                      <Td>
                        <HStack>
                          <MyIconButton
                            icon={'core/chat/sendLight'}
                            tip={t('config_model:model.test_model')}
                            onClick={() => onTestModel({ modelId: item.modelId })}
                          />
                          <MyIconButton
                            icon={'common/settingLight'}
                            tip={t('config_model:model.edit_model')}
                            onClick={() => onEditModel(item.modelId!)}
                          />
                          {item.isCustom && (
                            <PopoverConfirm
                              Trigger={
                                <Box>
                                  <MyIconButton icon={'delete'} hoverColor={'red.500'} />
                                </Box>
                              }
                              type="delete"
                              content={t('config_model:model.delete_model_confirm')}
                              onConfirm={() => deleteModel({ modelId: item.modelId })}
                            />
                          )}
                        </HStack>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableContainer>
          </MyBox>
        </Flex>
      </Box>

      {!!editModelData && (
        <ModelEditModal
          modelData={editModelData}
          onSuccess={refreshModels}
          onClose={() => setEditModelData(undefined)}
        />
      )}
      {isOpenJsonConfig && (
        <JsonConfigModal onClose={onCloseJsonConfig} onSuccess={refreshModels} />
      )}
      {isOpenDefaultModel && (
        <DefaultModelModal
          models={systemModelList}
          defaultModelIds={adminConfig?.defaultModelIds ?? {}}
          onClose={onCloseDefaultModel}
          onSuccess={refreshModels}
        />
      )}
    </>
  );
};

const JsonConfigModal = ({
  onClose,
  onSuccess
}: {
  onClose: () => void;
  onSuccess: () => void;
}) => {
  const { t } = useClientTranslation('config_model');

  const [data, setData] = useState<string>('');
  const { loading } = useRequest(getModelConfigJson, {
    manual: false,
    onSuccess(res) {
      setData(res);
    }
  });

  const { runAsync } = useRequest(putUpdateWithJson, {
    onSuccess: () => {
      onSuccess();
      onClose();
    }
  });

  return (
    <MyModal
      isOpen
      isLoading={loading}
      onClose={onClose}
      iconSrc="modal/edit"
      title={t('config_model:model.json_config')}
      w={'100%'}
      h={'100%'}
    >
      <ModalBody display={'flex'} flexDirection={'column'}>
        <Box fontSize={'sm'} color={'myGray.500'}>
          {t('config_model:model.json_config_tip')}
        </Box>
        <Box mt={2} flex={1} w={'100%'} overflow={'hidden'}>
          <JsonEditor value={data} onChange={setData} resize h={'100%'} />
        </Box>
      </ModalBody>
      <ModalFooter>
        <Button variant={'whiteBase'} mr={4} onClick={onClose}>
          {t('common:Cancel')}
        </Button>

        <PopoverConfirm
          Trigger={<Button>{t('common:Confirm')}</Button>}
          type="info"
          content={t('config_model:model.json_config_confirm')}
          onConfirm={() => runAsync({ config: data })}
        />
      </ModalFooter>
    </MyModal>
  );
};

const labelStyles = {
  fontSize: 'sm',
  color: 'myGray.900',
  mb: 0.5
};
const DefaultModelModal = ({
  models,
  defaultModelIds,
  onSuccess,
  onClose
}: {
  models: SystemModelDataType[];
  defaultModelIds: ModelDefaultIds;
  onSuccess: () => void;
  onClose: () => void;
}) => {
  const { t } = useClientTranslation('config_model');
  const activeModels = models.filter((model) => model.isActive);
  const llmModelList = activeModels.filter((model) => model.type === ModelTypeEnum.llm);
  const embeddingModelList = activeModels.filter((model) => model.type === ModelTypeEnum.embedding);
  const ttsModelList = activeModels.filter((model) => model.type === ModelTypeEnum.tts);
  const sttModelList = activeModels.filter((model) => model.type === ModelTypeEnum.stt);
  const reRankModelList = activeModels.filter((model) => model.type === ModelTypeEnum.rerank);
  const vlmModelList = llmModelList.filter((model) => !!model.config.vision);
  const defaultModels = Object.fromEntries(
    Object.entries(defaultModelIds).map(([key, modelId]) => [
      key,
      models.find((model) => model.modelId === modelId)
    ])
  ) as Record<keyof ModelDefaultIds, SystemModelDataType | undefined>;

  // Create a copy of defaultModels for local state management
  const [defaultData, setDefaultData] = useState(defaultModels);

  const { runAsync, loading } = useRequest(putUpdateDefaultModels, {
    onSuccess: () => {
      onSuccess();
      onClose();
    },
    successToast: t('common:update_success')
  });

  return (
    <MyModal
      isOpen
      onClose={onClose}
      title={t('config_model:default_model_config')}
      iconSrc="modal/edit"
    >
      <ModalBody>
        <Box>
          <Box {...labelStyles}>{t('common:model.type.chat')}</Box>
          <Box flex={1}>
            <AIModelSelector
              modelType={ModelTypeEnum.llm}
              bg="myGray.50"
              value={defaultData.llm?.modelId}
              list={llmModelList.map((item) => ({
                value: item.modelId,
                label: item.name
              }))}
              onChange={(e) => {
                setDefaultData((state) => ({
                  ...state,
                  llm: llmModelList.find((item) => item.modelId === e)
                }));
              }}
            />
          </Box>
        </Box>
        <Box mt={4}>
          <Box {...labelStyles}>{t('common:model.type.embedding')}</Box>
          <Box flex={1}>
            <AIModelSelector
              modelType={ModelTypeEnum.embedding}
              bg="myGray.50"
              value={defaultData.embedding?.modelId}
              list={embeddingModelList.map((item) => ({
                value: item.modelId,
                label: item.name
              }))}
              onChange={(e) => {
                setDefaultData((state) => ({
                  ...state,
                  embedding: embeddingModelList.find((item) => item.modelId === e)
                }));
              }}
            />
          </Box>
        </Box>
        <Box mt={4}>
          <Box {...labelStyles}>{t('common:model.type.tts')}</Box>
          <Box flex={1}>
            <AIModelSelector
              modelType={ModelTypeEnum.tts}
              bg="myGray.50"
              value={defaultData.tts?.modelId}
              list={ttsModelList.map((item) => ({
                value: item.modelId,
                label: item.name
              }))}
              onChange={(e) => {
                setDefaultData((state) => ({
                  ...state,
                  tts: ttsModelList.find((item) => item.modelId === e)
                }));
              }}
            />
          </Box>
        </Box>
        <Box mt={4}>
          <Box {...labelStyles}>{t('common:model.type.stt')}</Box>
          <Box flex={1}>
            <AIModelSelector
              modelType={ModelTypeEnum.stt}
              bg="myGray.50"
              value={defaultData.stt?.modelId}
              list={sttModelList.map((item) => ({
                value: item.modelId,
                label: item.name
              }))}
              onChange={(e) => {
                setDefaultData((state) => ({
                  ...state,
                  stt: sttModelList.find((item) => item.modelId === e)
                }));
              }}
            />
          </Box>
        </Box>
        <Box mt={4}>
          <Box {...labelStyles}>{t('common:model.type.reRank')}</Box>
          <Box flex={1}>
            <AIModelSelector
              modelType={ModelTypeEnum.rerank}
              bg="myGray.50"
              value={defaultData.rerank?.modelId}
              list={reRankModelList.map((item) => ({
                value: item.modelId,
                label: item.name
              }))}
              onChange={(e) => {
                setDefaultData((state) => ({
                  ...state,
                  rerank: reRankModelList.find((item) => item.modelId === e)
                }));
              }}
            />
          </Box>
        </Box>
        <MyDivider />
        <Box>
          <Flex {...labelStyles} alignItems={'center'}>
            <Box mr={0.5}>{t('common:core.ai.model.Dataset Agent Model')}</Box>
            <QuestionTip label={t('common:dataset_text_model_tip')} />
          </Flex>
          <Box flex={1}>
            <AIModelSelector
              modelType={ModelTypeEnum.llm}
              bg="myGray.50"
              value={defaultData.datasetTextLLM?.modelId}
              list={llmModelList.map((item) => ({
                value: item.modelId,
                label: item.name
              }))}
              onChange={(e) => {
                setDefaultData((state) => ({
                  ...state,
                  datasetTextLLM: llmModelList.find((item) => item.modelId === e)
                }));
              }}
            />
          </Box>
        </Box>
        <Box>
          <Flex mt={4} {...labelStyles} alignItems={'center'}>
            <Box mr={0.5}>{t('config_model:vlm_model')}</Box>
            <QuestionTip label={t('config_model:vlm_model_tip')} />
          </Flex>
          <Box flex={1}>
            <AIModelSelector
              modelType={ModelTypeEnum.llm}
              bg="myGray.50"
              value={defaultData.datasetImageLLM?.modelId}
              list={vlmModelList.map((item) => ({
                value: item.modelId,
                label: item.name
              }))}
              onChange={(e) => {
                setDefaultData((state) => ({
                  ...state,
                  datasetImageLLM: vlmModelList.find((item) => item.modelId === e)
                }));
              }}
            />
          </Box>
        </Box>
        <Box>
          <Flex mt={4} {...labelStyles} alignItems={'center'}>
            <Box mr={0.5}>{t('config_model:chat_title_model')}</Box>
            <QuestionTip label={t('config_model:chat_title_model_tip')} />
          </Flex>
          <Box flex={1}>
            <AIModelSelector
              modelType={ModelTypeEnum.llm}
              bg="myGray.50"
              value={defaultData.chatTitleLLM?.modelId || ''}
              canBeUnset
              unsetLabel={t('config_model:not_set_chat_title_model')}
              list={llmModelList.map((item) => ({
                value: item.modelId,
                label: item.name
              }))}
              onChange={(e) => {
                setDefaultData((state) => ({
                  ...state,
                  chatTitleLLM: llmModelList.find((item) => item.modelId === e)
                }));
              }}
            />
          </Box>
        </Box>
      </ModalBody>
      <ModalFooter>
        <Button variant={'whiteBase'} mr={4} onClick={onClose}>
          {t('common:Cancel')}
        </Button>
        <Button
          isLoading={loading}
          onClick={() =>
            runAsync({
              [ModelTypeEnum.llm]: defaultData.llm?.modelId,
              [ModelTypeEnum.embedding]: defaultData.embedding?.modelId,
              [ModelTypeEnum.tts]: defaultData.tts?.modelId,
              [ModelTypeEnum.stt]: defaultData.stt?.modelId,
              [ModelTypeEnum.rerank]: defaultData.rerank?.modelId,
              datasetTextLLMModelId: defaultData.datasetTextLLM?.modelId,
              datasetImageLLMModelId: defaultData.datasetImageLLM?.modelId,
              chatTitleLLMModelId: defaultData.chatTitleLLM?.modelId
            })
          }
        >
          {t('common:Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default ModelTable;
