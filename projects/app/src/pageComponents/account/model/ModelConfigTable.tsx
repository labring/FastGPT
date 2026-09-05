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
  Spinner,
  Checkbox,
  Button,
  useDisclosure
} from '@chakra-ui/react';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import {
  deleteSystemModel,
  getAdminModelConfig,
  getTestModel,
  deleteSystemModels,
  putSystemModelsStatus,
  putReplaceSystemModelChannels
} from '@/web/core/ai/config';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import CopyBox from '@fastgpt/web/components/common/String/CopyBox';
import MyIcon from '@fastgpt/web/components/common/Icon';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import AddModel from './AddModel';
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
  getModelProviderListFromCache,
  type ModelProviderItemType
} from '@fastgpt/global/core/ai/provider';
import type { AdminSystemModelListItem } from '@fastgpt/global/openapi/admin/core/ai/model/api';
import { useLockFn, useSet } from 'ahooks';
import ModelChannelCount from './ModelChannelCount';
import ModelChannelModal from './ModelChannelModal';
import ModelEditModal from './ModelEditModal';
import { useStaticVirtualList } from '@fastgpt/web/hooks/useVirtualList';
import { useTableMultipleSelect } from '@fastgpt/web/hooks/useTableMultipleSelect';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useFixedTableHeader } from '@fastgpt/web/hooks/useFixedTableHeader';
import JsonModelConfigModal from './JsonModelConfigModal';
import DefaultModelModal from './DefaultModelModal';
import ModelListFilters from '@/components/core/ai/ModelListFilters';
import { useToast } from '@fastgpt/web/hooks/useToast';

const modelRowHeight = 80;
const modelTableColumnWidth = {
  selection: '48px',
  billing: '250px',
  channels: '180px',
  active: '128px',
  actions: '160px'
} as const;

/** 将编辑弹窗状态隔离在单行操作中，避免打开弹窗时重渲染整张大模型表。 */
const ModelEditButton = React.memo(
  ({
    model,
    providers,
    onSuccess,
    isDisabled
  }: {
    model: AdminSystemModelListItem;
    providers: ModelProviderItemType[];
    onSuccess: () => Promise<void>;
    isDisabled?: boolean;
  }) => {
    const { t } = useClientTranslation('config_model');
    const [isOpen, setIsOpen] = useState(false);

    return (
      <>
        <MyIconButton
          icon={'common/settingLight'}
          tip={t('config_model:model.edit_model')}
          pointerEvents={isDisabled ? 'none' : undefined}
          opacity={isDisabled ? 0.5 : 1}
          onClick={() => setIsOpen(true)}
        />
        {isOpen && (
          <ModelEditModal
            model={model}
            providers={providers}
            onSuccess={onSuccess}
            onClose={() => setIsOpen(false)}
          />
        )}
      </>
    );
  }
);
ModelEditButton.displayName = 'ModelEditButton';

const ModelTable = ({ Tab }: { Tab: React.ReactNode }) => {
  const { t, i18n } = useClientTranslation('config_model');
  const { toast } = useToast();
  const { userInfo } = useUserStore();
  const { feConfigs } = useSystemStore();
  const showBilling = !!feConfigs?.isPlus;
  const tableColumnCount = showBilling ? 6 : 5;

  const {
    data: adminConfig,
    runAsync: refreshSystemModelList,
    loading: loadingModels
  } = useRequest(getAdminModelConfig, { manual: false });
  const systemModelList = useMemo(() => adminConfig?.models ?? [], [adminConfig?.models]);
  const channelList = useMemo(() => adminConfig?.channels ?? [], [adminConfig?.channels]);
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
  const modelProviders = useMemo(
    () => getModelProviders(i18n.language),
    [getModelProviders, i18n.language]
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
  const [modelType, setModelType] = useState<ModelTypeEnum | ''>('');
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
        tagColor: 'yellow'
      }));
    const formatAudioSpeechModelList = systemModelList
      .filter((item) => item.type === ModelTypeEnum.tts)
      .map((item) => ({
        ...item,
        typeLabel: t('common:model.type.tts'),
        priceLabel: item.charsPointsPrice ? (
          <Flex color={'myGray.700'}>
            <Box fontWeight={'bold'} color={'myGray.900'} mr={0.5}>
              {item.charsPointsPrice}
            </Box>
            {` ${t('common:support.wallet.subscription.point')} / 1K ${t('common:unit.character')}`}
          </Flex>
        ) : (
          '-'
        ),
        tagColor: 'green'
      }));
    const formatWhisperModel = systemModelList
      .filter((item) => item.type === ModelTypeEnum.stt)
      .map((item) => ({
        ...item,
        typeLabel: t('common:model.type.stt'),
        priceLabel: item.charsPointsPrice ? (
          <Flex color={'myGray.700'}>
            <Box fontWeight={'bold'} color={'myGray.900'} mr={0.5}>
              {item.charsPointsPrice}
            </Box>
            {` ${t('common:support.wallet.subscription.point')} / 60${t('common:unit.seconds')}`}
          </Flex>
        ) : (
          '-'
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

    const formattedModelMap = new Map(
      [
        ...formatLLMModelList,
        ...formatVectorModelList,
        ...formatAudioSpeechModelList,
        ...formatWhisperModel,
        ...formatRerankModelList
      ].map((item) => [item.modelId, item] as const)
    );
    // 格式化不能改变服务端返回的 MongoDB 新建时间倒序。
    const list = systemModelList.flatMap((item) => {
      if (modelType && item.type !== modelType) return [];
      const formattedModel = formattedModelMap.get(item.modelId);
      return formattedModel ? [formattedModel] : [];
    });

    const formatList = list.map((item) => {
      const provider = getModelProvider(item.provider, i18n.language);
      return {
        ...item,
        avatar: provider.avatar,
        providerId: provider.id,
        providerName: provider.name,
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

    const filterList = formatList.filter((item) => {
      const providerFilter = provider ? item.providerId === provider : true;

      const normalizedSearch = search.trim().toLowerCase();
      const nameFilter = normalizedSearch
        ? item.name.toLowerCase().includes(normalizedSearch) ||
          item.model.toLowerCase().includes(normalizedSearch)
        : true;

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
  const getModelId = useCallback((model: AdminSystemModelListItem) => model.modelId, []);
  const {
    selectedItems,
    setSelectedItems,
    toggleSelect,
    isSelected,
    getRowSelectionProps,
    FloatingActionBar,
    isSelecteAll,
    selectAllTrigger
  } = useTableMultipleSelect({
    list: modelList,
    getItemId: getModelId
  });
  const {
    containerRef: modelListContainerRef,
    virtualDataList: virtualModelList,
    topPlaceholderHeight,
    bottomPlaceholderHeight,
    scrollToTop: scrollModelListToTop
  } = useStaticVirtualList({
    data: modelList,
    itemHeight: modelRowHeight,
    overscan: 10
  });
  const { headerContainerRef: modelTableHeaderRef, headerTableWidth: modelTableHeaderWidth } =
    useFixedTableHeader(modelListContainerRef);

  useEffect(() => {
    scrollModelListToTop();
  }, [modelType, provider, scrollModelListToTop, search, showActive]);

  const [testingModelIds, testingModelIdsDispatch] = useSet<string>();
  const { runAsync: onTestModel } = useRequest(
    async (data: Parameters<typeof getTestModel>[0]) => {
      testingModelIdsDispatch.add(data.modelId);
      try {
        return await getTestModel(data);
      } finally {
        testingModelIdsDispatch.remove(data.modelId);
      }
    },
    {
      manual: true,
      successToast: t('common:Success')
    }
  );
  const [updatingModelIds, updatingModelIdsDispatch] = useSet<string>();
  const { runAsync: updateModelStatus } = useRequest(
    async ({ modelId, model, isActive }: { modelId: string; model: string; isActive: boolean }) => {
      updatingModelIdsDispatch.add(modelId);
      try {
        await putSystemModelsStatus({ modelIds: [modelId], isActive });
        toast({
          status: 'success',
          title: t(isActive ? 'config_model:status_enabled' : 'config_model:status_disabled', {
            name: model
          })
        });
        // 状态写入已经成功；列表刷新失败由其自身提示，不能把成功操作再次报成失败。
        await refreshModels().catch(() => {});
      } finally {
        updatingModelIdsDispatch.remove(modelId);
      }
    }
  );

  const [channelMutationLoading, setChannelMutationLoading] = useState(false);
  const runChannelMutation = useLockFn(async (operation: () => Promise<unknown>) => {
    setChannelMutationLoading(true);
    try {
      return await operation();
    } finally {
      setChannelMutationLoading(false);
    }
  });

  const { runAsync: deleteModelRequest } = useRequest(deleteSystemModel, {
    onSuccess: () => void refreshModels().catch(() => {}),
    successToast: t('common:delete_success')
  });
  const deleteModel = (data: Parameters<typeof deleteSystemModel>[0]) =>
    runChannelMutation(() => deleteModelRequest(data));
  const clearSelection = useCallback(() => {
    setSelectedItems([]);
  }, [setSelectedItems]);
  const { runAsync: updateModelsStatus, loading: updatingModelsStatus } = useRequest(
    async (data: Parameters<typeof putSystemModelsStatus>[0]) => {
      await putSystemModelsStatus(data);
      clearSelection();
      toast({
        status: 'success',
        title: t(
          data.isActive
            ? 'config_model:model.batch_status_enabled'
            : 'config_model:model.batch_status_disabled',
          { count: data.modelIds.length }
        )
      });
      await refreshModels().catch(() => {});
    }
  );
  const { runAsync: deleteModelsRequest, loading: deletingModels } = useRequest(
    deleteSystemModels,
    {
      manual: true,
      onSuccess: () => {
        clearSelection();
        void refreshModels().catch(() => {});
      },
      successToast: t('common:delete_success')
    }
  );
  const deleteModels = (data: Parameters<typeof deleteSystemModels>[0]) =>
    runChannelMutation(() => deleteModelsRequest(data));
  const { openConfirm: openBatchDeleteConfirm, ConfirmModal: BatchDeleteConfirmModal } = useConfirm(
    {
      type: 'delete'
    }
  );

  const [channelModel, setChannelModel] = useState<AdminSystemModelListItem>();

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

  // 渠道是列表的补充数据，模型详情和更新也都有独立操作反馈；只有模型首次加载阻塞整表。
  const isInitialLoading = loadingModels && adminConfig === undefined;

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
            <AddModel
              installedModels={systemModelList}
              defaultModels={defaultModels}
              channels={channelList}
              providers={modelProviders}
              defaultProvider={modelProviders[0]?.id ?? 'OpenAI'}
              onSuccess={refreshModels}
              isDisabled={channelMutationLoading}
              w={['100%', 'auto']}
              minW={0}
              px={[2, 4]}
              buttonBoxProps={{ w: ['100%', 'fit-content'] }}
            />
          </Grid>
        </ModelTabHeader>
      )}
      <Box display={'flex'} flex={'1 0 0'} h={0} minH={0} flexDirection={'column'}>
        <Flex {...accountPageRootStyles} h={'100%'} flexDirection={'column'}>
          <ModelListFilters
            px={6}
            providers={modelProviders}
            models={systemModelList}
            provider={provider}
            onProviderChange={setProvider}
            modelType={modelType}
            onModelTypeChange={setModelType}
            search={search}
            onSearchChange={setSearch}
          />
          <MyBox
            {...accountContentScrollStyles}
            display={'flex'}
            flexDirection={'column'}
            flex={'1 0 0'}
            h={0}
            mt={5}
            isLoading={isInitialLoading}
          >
            <TableContainer ref={modelTableHeaderRef} flexShrink={0} overflowX="hidden" px={6}>
              <Table
                minW="1100px"
                sx={{
                  tableLayout: 'fixed',
                  width: `${modelTableHeaderWidth} !important`
                }}
              >
                <colgroup>
                  <col style={{ width: modelTableColumnWidth.selection }} />
                  <col />
                  {showBilling && <col style={{ width: modelTableColumnWidth.billing }} />}
                  <col style={{ width: modelTableColumnWidth.channels }} />
                  <col style={{ width: modelTableColumnWidth.active }} />
                  <col style={{ width: modelTableColumnWidth.actions }} />
                </colgroup>
                <Thead>
                  <Tr color="myGray.600">
                    <Th px={3}>
                      <Checkbox
                        isChecked={isSelecteAll}
                        isIndeterminate={selectedItems.length > 0 && !isSelecteAll}
                        onChange={selectAllTrigger}
                      />
                    </Th>
                    <Th fontSize="xs">
                      <HStack
                        spacing={1}
                        cursor="pointer"
                        onClick={() => setShowModelId(!showModelId)}
                      >
                        <Box>
                          {showModelId ? t('config_model:model.model_id') : t('common:model.name')}
                        </Box>
                        <MyIcon name="modal/changePer" w="1rem" />
                      </HStack>
                    </Th>
                    {showBilling && <Th fontSize="xs">{t('common:model.billing')}</Th>}
                    <Th fontSize="xs">{t('config_model:model.channels')}</Th>
                    <Th fontSize="xs">
                      <Box
                        cursor="pointer"
                        onClick={() => setShowActive(!showActive)}
                        color={showActive ? 'primary.600' : 'myGray.600'}
                      >
                        {t('config_model:model.active')}({activeModelLength})
                      </Box>
                    </Th>
                    <Th fontSize="xs">{t('common:Operation')}</Th>
                  </Tr>
                </Thead>
              </Table>
            </TableContainer>
            <TableContainer
              ref={modelListContainerRef}
              flex={'1 0 0'}
              h={0}
              minH={0}
              overflowY={'auto'}
              px={6}
            >
              <Table w={'100%'} minW={'1100px'} sx={{ tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: modelTableColumnWidth.selection }} />
                  <col />
                  {showBilling && <col style={{ width: modelTableColumnWidth.billing }} />}
                  <col style={{ width: modelTableColumnWidth.channels }} />
                  <col style={{ width: modelTableColumnWidth.active }} />
                  <col style={{ width: modelTableColumnWidth.actions }} />
                </colgroup>
                <Tbody>
                  {!isInitialLoading && modelList.length === 0 && (
                    <Tr>
                      <Td colSpan={tableColumnCount}>
                        <EmptyTip
                          py={12}
                          text={
                            systemModelList.length === 0 ? t('config_model:no_models') : undefined
                          }
                        />
                      </Td>
                    </Tr>
                  )}
                  {topPlaceholderHeight > 0 && (
                    <Tr h={`${topPlaceholderHeight}px`} aria-hidden>
                      <Td
                        colSpan={tableColumnCount}
                        h={`${topPlaceholderHeight}px`}
                        p={0}
                        border={0}
                      />
                    </Tr>
                  )}
                  {virtualModelList.map(({ data: item }) => (
                    <Tr
                      key={item.modelId}
                      h={`${modelRowHeight}px`}
                      {...getRowSelectionProps(item)}
                    >
                      <Td w={modelTableColumnWidth.selection} px={3}>
                        <Checkbox
                          isChecked={isSelected(item)}
                          onChange={() => toggleSelect(item)}
                        />
                      </Td>
                      <Td fontSize={'sm'}>
                        <HStack>
                          <Avatar src={item.avatar} w={'1.2rem'} borderRadius={'50%'} />
                          <Flex alignItems={'center'} gap={1} minW={0}>
                            <CopyBox
                              value={showModelId ? item.model : item.name}
                              data-row-action
                              color={'myGray.900'}
                              fontWeight={'500'}
                              noOfLines={1}
                            >
                              {showModelId ? item.model : item.name}
                            </CopyBox>
                            {item.testMode && <TestModeBetaTag />}
                          </Flex>
                        </HStack>
                        <HStack mt={2} spacing={2} flexWrap={'nowrap'}>
                          <MyTag type={'borderFill'} colorSchema={item.tagColor as any} py={0.5}>
                            {item.typeLabel}
                          </MyTag>
                          <ModelCapabilityTags
                            contextToken={item.contextToken}
                            showVision={!!item.vision}
                            showVideo={!!item.video}
                            showAudio={!!item.audio}
                            showReasoning={!!item.reasoning}
                          />
                        </HStack>
                      </Td>
                      {showBilling && <Td fontSize={'sm'}>{item.priceLabel}</Td>}
                      <Td fontSize={'sm'}>
                        <Box pointerEvents={channelMutationLoading ? 'none' : undefined}>
                          <ModelChannelCount
                            channels={item.channels}
                            onClick={() => setChannelModel(item)}
                          />
                        </Box>
                      </Td>
                      <Td fontSize={'sm'}>
                        <Flex data-row-action w={'32px'} justifyContent={'center'}>
                          {updatingModelIds.has(item.modelId) ? (
                            <Spinner size={'sm'} color={'primary.600'} />
                          ) : (
                            <Switch
                              size={'sm'}
                              cursor={'pointer'}
                              isChecked={item.isActive}
                              onChange={(e) =>
                                updateModelStatus({
                                  modelId: item.modelId,
                                  model: item.model,
                                  isActive: e.target.checked
                                })
                              }
                              colorScheme={'myBlue'}
                            />
                          )}
                        </Flex>
                      </Td>
                      <Td>
                        <HStack>
                          <MyIconButton
                            icon={'core/chat/sendLight'}
                            tip={t('config_model:model.test_model')}
                            isLoading={testingModelIds.has(item.modelId)}
                            onClick={() => onTestModel({ modelId: item.modelId })}
                          />
                          <ModelEditButton
                            model={item}
                            providers={modelProviders}
                            onSuccess={refreshModels}
                            isDisabled={channelMutationLoading}
                          />
                          <PopoverConfirm
                            Trigger={
                              <Box pointerEvents={channelMutationLoading ? 'none' : undefined}>
                                <MyIconButton
                                  icon={'delete'}
                                  hoverColor={'red.500'}
                                  opacity={channelMutationLoading ? 0.5 : 1}
                                />
                              </Box>
                            }
                            type="delete"
                            content={t('config_model:model.delete_model_confirm')}
                            onConfirm={() => deleteModel({ modelId: item.modelId })}
                          />
                        </HStack>
                      </Td>
                    </Tr>
                  ))}
                  {bottomPlaceholderHeight > 0 && (
                    <Tr h={`${bottomPlaceholderHeight}px`} aria-hidden>
                      <Td
                        colSpan={tableColumnCount}
                        h={`${bottomPlaceholderHeight}px`}
                        p={0}
                        border={0}
                      />
                    </Tr>
                  )}
                </Tbody>
              </Table>
            </TableContainer>
            <FloatingActionBar
              flexShrink={0}
              borderTopWidth="1px"
              borderColor="myGray.100"
              Controler={
                <HStack spacing={2}>
                  <Button
                    variant="whiteBase"
                    isLoading={updatingModelsStatus}
                    onClick={() =>
                      updateModelsStatus({
                        modelIds: selectedItems.map((model) => model.modelId),
                        isActive: true
                      })
                    }
                  >
                    {t('config_model:model.batch_enable')}
                  </Button>
                  <Button
                    variant="whiteBase"
                    isLoading={updatingModelsStatus}
                    onClick={() =>
                      updateModelsStatus({
                        modelIds: selectedItems.map((model) => model.modelId),
                        isActive: false
                      })
                    }
                  >
                    {t('config_model:model.batch_disable')}
                  </Button>
                  <Button
                    variant="whiteBase"
                    color="red.600"
                    isLoading={deletingModels || channelMutationLoading}
                    onClick={() =>
                      openBatchDeleteConfirm({
                        customContent: t('config_model:model.batch_delete_confirm', {
                          count: selectedItems.length
                        }),
                        onConfirm: () =>
                          deleteModels({
                            modelIds: selectedItems.map((model) => model.modelId)
                          })
                      })()
                    }
                  >
                    {t('config_model:model.batch_delete')}
                  </Button>
                </HStack>
              }
            />
          </MyBox>
        </Flex>
      </Box>

      {!!channelModel && (
        <ModelChannelModal
          models={[channelModel]}
          channels={channelList}
          selectedChannelIds={channelModel.channels.map((channel) => channel.id)}
          onClose={() => setChannelModel(undefined)}
          onConfirm={async (channelIds) => {
            await runChannelMutation(() =>
              putReplaceSystemModelChannels({ modelId: channelModel.modelId, channelIds })
            );
            setChannelModel(undefined);
            await refreshModels().catch(() => {});
          }}
        />
      )}
      {isOpenJsonConfig && (
        <JsonModelConfigModal onClose={onCloseJsonConfig} onSuccess={refreshModels} />
      )}
      {isOpenDefaultModel && (
        <DefaultModelModal
          models={systemModelList}
          defaultModelIds={adminConfig?.defaultModelIds ?? {}}
          onClose={onCloseDefaultModel}
          onSuccess={refreshModels}
        />
      )}
      <BatchDeleteConfirmModal isLoading={deletingModels} />
    </>
  );
};

export default ModelTable;
