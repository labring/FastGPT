import {
  Box,
  Flex,
  Grid,
  HStack,
  Table,
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
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import {
  deleteModel,
  deleteModels,
  testModel,
  putModelsStatus,
  putUpdateModelOrder,
  postUpdateModelChannels
} from '@/web/core/ai/model/api';
import type { ModelConfigListItem } from '@fastgpt/global/openapi/core/ai/model/api';
import type { ChannelType } from '@fastgpt/global/core/ai/model/scope';
import type { AIModelDataType } from '@fastgpt/global/core/ai/model/schema';
import ModelScopeCell from '@/components/core/ai/ModelScopeCell';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import CopyBox from '@fastgpt/web/components/common/String/CopyBox';
import MyIcon from '@fastgpt/web/components/common/Icon';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import AddModel from './AddModel';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import TestModeBetaTag from '@/components/core/ai/TestModeBetaTag';
import ModelCapabilityTags from '@/components/core/ai/ModelCapabilityTags';
import { accountContentScrollStyles, accountPageRootStyles } from '@/pageComponents/account/styles';
import ModelTabHeader from '@/components/core/ai/ModelTabHeader';
import type { ModelProviderItemType } from '@fastgpt/global/core/ai/model/provider';
import { useLockFn, useSet } from 'ahooks';
import ModelChannelCount from './ModelChannelCount';
import ModelChannelModal from './ModelChannelModal';
import ModelEditModal from './ModelEditModal';
import { useStaticVirtualList } from '@fastgpt/web/hooks/useVirtualList';
import { useTableMultipleSelect } from '@fastgpt/web/hooks/useTableMultipleSelect';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { FixedTableLayout } from '@fastgpt/web/components/common/FixedTable';
import JsonModelConfigModal from './JsonModelConfigModal';
import DefaultModelModal from './DefaultModelModal';
import ModelListFilters from '@/components/core/ai/ModelListFilters';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useModelTableFormat } from '@/components/core/ai/hooks/useModelTableFormat';
import { useModelConfig } from '@/web/core/ai/model/useModelConfig';
import DndDrag, {
  Draggable,
  getDraggableItemProps,
  type DraggableProvided,
  type DraggableStateSnapshot
} from '@fastgpt/web/components/common/DndDrag';

const modelRowHeight = 80;
const sortModelRowHeight = 48;
const modelTableColumnWidth = {
  selection: '48px',
  channels: '160px',
  billing: '240px',
  scope: '160px',
  active: '128px',
  actions: '160px'
} as const;

/** 将编辑弹窗状态隔离在单行操作中，避免打开弹窗时重渲染整张大模型表。 */
const ModelEditButton = React.memo(
  ({
    model,
    providers,
    channelType,
    onSuccess,
    isDisabled
  }: {
    model: ModelConfigListItem;
    providers: ModelProviderItemType[];
    channelType: ChannelType;
    onSuccess: () => Promise<void>;
    isDisabled?: boolean;
  }) => {
    const { t } = useSafeTranslation();
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
            channelType={channelType}
            onSuccess={onSuccess}
            onClose={() => setIsOpen(false)}
          />
        )}
      </>
    );
  }
);
ModelEditButton.displayName = 'ModelEditButton';

/** 普通窗口行与 RBD 克隆共用同一结构，确保固定行高和拖拽样式一致。 */
const SortModelRow = ({
  item,
  provided,
  snapshot,
  canDrag
}: {
  item: ModelConfigListItem;
  provided: DraggableProvided;
  snapshot: DraggableStateSnapshot;
  canDrag: boolean;
}) => {
  const { draggableItemProps, dragHandleProps } = getDraggableItemProps(provided, snapshot);

  return (
    <Tr
      {...draggableItemProps}
      {...dragHandleProps}
      h={`${sortModelRowHeight}px`}
      cursor={canDrag ? 'grab' : 'not-allowed'}
      bg={snapshot.isDragging ? 'primary.50' : undefined}
      _hover={{ bg: 'primary.50' }}
      clipPath={snapshot.isDragging ? 'inset(0 round 8px)' : undefined}
    >
      <Td px={3} py={0} h={`${sortModelRowHeight}px`}>
        <HStack spacing={3} minW={0}>
          <Box
            w={'16px'}
            h={'24px'}
            p={'2px'}
            display={'flex'}
            alignItems={'center'}
            justifyContent={'center'}
            flexShrink={0}
            borderRadius={'xs'}
            _hover={{
              bg: '#E5E9F4',
              '& svg': { color: 'myGray.500' }
            }}
            cursor={canDrag ? 'grab' : 'not-allowed'}
          >
            <MyIcon name={'drag'} w={'16px'} color={'myGray.400'} />
          </Box>
          <Avatar src={item.avatar} w={'1.2rem'} borderRadius={'50%'} flexShrink={0} />
          <Box minW={0} noOfLines={1} color={'myGray.900'} fontSize={'sm'} fontWeight={'500'}>
            {item.model}
          </Box>
        </HStack>
      </Td>
    </Tr>
  );
};
SortModelRow.displayName = 'SortModelRow';

const ModelTable = ({ Tab, channelType }: { Tab: React.ReactNode; channelType: ChannelType }) => {
  const { t, i18n } = useSafeTranslation();
  const { toast } = useToast();
  const { userInfo } = useUserStore();
  const { feConfigs } = useSystemStore();
  const isTeam = channelType === 'team';
  const showBilling = !isTeam && !!feConfigs?.isPlus;
  const tableColumnCount = 2 + (showBilling ? 1 : 0) + (isTeam ? 1 : 0) + 1 + 1 + 1;

  const {
    data: modelConfigData,
    models: modelItems,
    channels: channelList,
    providers: modelProviders,
    getModelProvider,
    refresh: refreshModels,
    loading: loadingModels
  } = useModelConfig({ channelType, language: i18n.language });

  const isRoot = userInfo?.username === 'root';

  const [provider, setProvider] = useState<string | ''>('');
  const [modelType, setModelType] = useState<ModelTypeEnum | ''>('');
  const [search, setSearch] = useState('');
  const [showActive, setShowActive] = useState(false);

  const { formattedList: modelList, activeCount: activeModelLength } = useModelTableFormat({
    models: modelItems,
    modelType,
    provider,
    search,
    showActive,
    getModelProvider,
    language: i18n.language
  });
  const getModelId = useCallback((model: ModelConfigListItem) => model.modelId, []);
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
  useEffect(() => {
    scrollModelListToTop();
  }, [modelType, provider, scrollModelListToTop, search, showActive]);

  const [testingModelIds, testingModelIdsDispatch] = useSet<string>();
  const { runAsync: onTestModel } = useRequest(
    async (data: Parameters<typeof testModel>[0]) => {
      testingModelIdsDispatch.add(data.modelId);
      try {
        return await testModel({ ...data, channelType });
      } finally {
        testingModelIdsDispatch.remove(data.modelId);
      }
    },
    {
      manual: true,
      successToast: undefined,
      onSuccess: (_, params) => {
        const model = modelList.find((item) => item.modelId === params[0]?.modelId)?.model;
        if (model) {
          toast({
            status: 'success',
            title: t('config_model:model_test_success', { model })
          });
        }
      }
    }
  );
  const [updatingModelIds, updatingModelIdsDispatch] = useSet<string>();
  const { runAsync: updateModelStatus } = useRequest(
    async ({ modelId, model, isActive }: { modelId: string; model: string; isActive: boolean }) => {
      updatingModelIdsDispatch.add(modelId);
      try {
        await putModelsStatus({ modelIds: [modelId], isActive, channelType });
        toast({
          status: 'success',
          title: isActive
            ? t('config_model:status_enabled', { name: model })
            : t('config_model:status_disabled', { name: model })
        });
        refreshModels();
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

  /** 点击渠道数打开关联弹窗；提交时由服务端按差集原子增删渠道关联 */
  const [channelModel, setChannelModel] = useState<ModelConfigListItem>();
  const updateModelChannels = async (nextChannelIds: number[]) => {
    if (!channelModel) return;
    const currentIds = new Set(channelModel.channels.map((channel) => channel.id));
    const nextIds = new Set(nextChannelIds);
    await runChannelMutation(() =>
      postUpdateModelChannels({
        modelId: channelModel.modelId,
        channelType,
        addChannelIds: nextChannelIds.filter((id) => !currentIds.has(id)),
        removeChannelIds: [...currentIds].filter((id) => !nextIds.has(id))
      })
    );
    toast({ status: 'success', title: t('config_model:associate_success') });
    setChannelModel(undefined);
    await refreshModels().catch(() => {});
  };

  const { runAsync: deleteModelRequest } = useRequest(deleteModel, {
    onSuccess: () => {
      refreshModels();
    },
    successToast: t('common:delete_success')
  });
  const handleDeleteModel = (data: Parameters<typeof deleteModel>[0]) =>
    runChannelMutation(() => deleteModelRequest(data));
  const clearSelection = useCallback(() => {
    setSelectedItems([]);
  }, [setSelectedItems]);
  const { runAsync: updateModelsStatus, loading: updatingModelsStatus } = useRequest(
    async (data: Parameters<typeof putModelsStatus>[0]) => {
      await putModelsStatus(data);
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
      refreshModels();
    }
  );
  const { runAsync: deleteModelsRequest, loading: deletingModels } = useRequest(deleteModels, {
    manual: true,
    onSuccess: () => {
      clearSelection();
      refreshModels();
    },
    successToast: t('common:delete_success')
  });
  const handleDeleteModels = (data: Parameters<typeof deleteModels>[0]) =>
    runChannelMutation(() => deleteModelsRequest(data));
  const { openConfirm: openBatchDeleteConfirm, ConfirmModal: BatchDeleteConfirmModal } = useConfirm(
    {
      type: 'delete'
    }
  );

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
  const isInitialLoading = loadingModels && modelConfigData === undefined;

  const [showModelId, setShowModelId] = useState(true);
  const [isSortMode, setIsSortMode] = useState(false);
  const [sortModels, setSortModels] = useState<ModelConfigListItem[]>([]);
  const [isSortBusy, setIsSortBusy] = useState(false);
  const {
    containerRef: sortModelListContainerRef,
    virtualDataList: virtualSortModels,
    topPlaceholderHeight: sortTopPlaceholderHeight,
    bottomPlaceholderHeight: sortBottomPlaceholderHeight
  } = useStaticVirtualList({
    data: sortModels,
    itemHeight: sortModelRowHeight,
    overscan: 10
  });
  const sortModelTableBodyRef = React.useRef<HTMLTableSectionElement | null>(null);
  const getSortModelCloneContainer = useCallback(() => {
    if (!sortModelTableBodyRef.current) {
      throw new Error('Model sort table body is not mounted');
    }
    return sortModelTableBodyRef.current;
  }, []);
  const [initialSortModelIds, setInitialSortModelIds] = useState<string[]>([]);
  const isSortDirty = useMemo(
    () =>
      sortModels.length !== initialSortModelIds.length ||
      sortModels.some((model, index) => model.modelId !== initialSortModelIds[index]),
    [initialSortModelIds, sortModels]
  );
  const { runAsync: saveModelOrder } = useRequest(putUpdateModelOrder, { manual: true });

  // 入口级粗筛：root 或拥有“安装模型”权限才展示管理操作；单个模型的最终判定以服务端 authModelConfig（action: config）为准
  const canManageModel = Boolean(isRoot || userInfo?.team?.permission?.hasModelCreatePer);

  /** 从未过滤的完整列表创建排序草稿，避免把搜索/筛选结果误当成完整顺序提交。 */
  const enterSortMode = useCallback(() => {
    if (isSortBusy) return;
    setSelectedItems([]);
    setSortModels([...modelItems]);
    setInitialSortModelIds(modelItems.map((model) => model.modelId));
    setIsSortMode(true);
  }, [isSortBusy, modelItems, setSelectedItems]);

  const cancelSortMode = useCallback(() => {
    if (isSortBusy) return;
    setSortModels([]);
    setInitialSortModelIds([]);
    setIsSortMode(false);
  }, [isSortBusy]);

  /** 保存完整草稿顺序；保存或刷新失败时保留草稿以便重试。 */
  const handleSaveModelOrder = useLockFn(async () => {
    const modelIds = sortModels.map((model) => model.modelId);
    if (!isSortDirty) {
      cancelSortMode();
      return;
    }

    // 保存和刷新共同占用草稿，避免请求完成时清除等待期间的新操作。
    setIsSortBusy(true);
    try {
      await saveModelOrder({ channelType, modelIds });
      await refreshModels();
      setSortModels([]);
      setInitialSortModelIds([]);
      setIsSortMode(false);
    } finally {
      setIsSortBusy(false);
    }
  });

  return (
    <>
      {canManageModel && (
        <ModelTabHeader Tab={Tab}>
          <Grid
            w={['100%', 'auto']}
            templateColumns={
              isSortMode
                ? ['repeat(2, minmax(0, 1fr))', 'repeat(2, auto)']
                : !isTeam && isRoot
                  ? ['repeat(2, minmax(0, 1fr))', 'repeat(4, minmax(0, 1fr))']
                  : ['repeat(2, minmax(0, 1fr))', 'repeat(2, minmax(0, 1fr))']
            }
            gap={2}
          >
            {isSortMode ? (
              <>
                <Button
                  w={['100%', '81px']}
                  minW={0}
                  px={[2, 4]}
                  variant={'whiteBase'}
                  leftIcon={<MyIcon name={'common/closeLight'} w={'16px'} h={'16px'} />}
                  onClick={cancelSortMode}
                  isDisabled={isSortBusy}
                >
                  {t('config_model:model.cancel_sort')}
                </Button>
                <Button
                  w={['100%', '123px']}
                  minW={0}
                  px={[2, 4]}
                  variant={'primary'}
                  leftIcon={<MyIcon name={'common/check'} w={'16px'} h={'16px'} />}
                  isLoading={isSortBusy}
                  isDisabled={isSortBusy || !isSortDirty}
                  onClick={handleSaveModelOrder}
                >
                  {t('config_model:model.save_sort')}
                </Button>
              </>
            ) : (
              <>
                <Button
                  w={'100%'}
                  minW={0}
                  px={[2, 4]}
                  variant={'whiteBase'}
                  isDisabled={isSortBusy || channelMutationLoading || modelItems.length === 0}
                  onClick={enterSortMode}
                >
                  {t('config_model:model.custom_sort')}
                </Button>
                {!isTeam && isRoot && (
                  <>
                    <Button
                      w={'100%'}
                      minW={0}
                      px={[2, 4]}
                      variant={'whiteBase'}
                      onClick={onOpenDefaultModel}
                    >
                      {t('config_model:model.default_model')}
                    </Button>
                    <Button
                      w={'100%'}
                      minW={0}
                      px={[2, 4]}
                      variant={'whiteBase'}
                      onClick={onOpenJsonConfig}
                    >
                      {t('config_model:model.json_config')}
                    </Button>
                  </>
                )}
                <AddModel
                  installedModels={modelItems}
                  channels={channelList}
                  providers={modelProviders}
                  channelType={channelType}
                  onSuccess={refreshModels}
                  isDisabled={channelMutationLoading}
                  w={'100%'}
                  minW={0}
                  px={[2, 4]}
                  buttonBoxProps={{ w: '100%' }}
                />
              </>
            )}
          </Grid>
        </ModelTabHeader>
      )}
      <Box display={'flex'} flex={'1 0 0'} h={0} minH={0} flexDirection={'column'}>
        <Flex {...accountPageRootStyles} h={'100%'} flexDirection={'column'}>
          {isSortMode ? (
            <MyBox
              {...accountContentScrollStyles}
              display={'flex'}
              flexDirection={'column'}
              flex={'1 0 0'}
              h={0}
              mt={5}
              overflowY={'visible'}
            >
              <FixedTableLayout
                scrollMode="virtual"
                horizontalScroll={false}
                bodyRef={sortModelListContainerRef}
                rootProps={{ flex: '1 0 0', h: 0 }}
                headerProps={{ px: 6 }}
                bodyProps={{ flex: '1 0 0', h: 0, px: 6 }}
                renderHeader={() => (
                  <Table w={'100%'} sx={{ tableLayout: 'fixed' }}>
                    <colgroup>
                      <col />
                    </colgroup>
                    <Thead>
                      <Tr color="myGray.600">
                        <Th px={3} fontSize="xs">
                          {t('config_model:model.model_id')}
                        </Th>
                      </Tr>
                    </Thead>
                  </Table>
                )}
                renderBody={() => (
                  // Table 必须包在 DndDrag 外层，使通过 portal 渲染的克隆行仍处于 Chakra 表格样式上下文中。
                  <Table w={'100%'} sx={{ tableLayout: 'fixed' }}>
                    <colgroup>
                      <col />
                    </colgroup>
                    <DndDrag<ModelConfigListItem>
                      dataList={sortModels}
                      onDragEndCb={(models) => {
                        if (!isSortBusy) setSortModels(models);
                      }}
                      mode="virtual"
                      getContainerForClone={getSortModelCloneContainer}
                      renderClone={(provided, snapshot, rubric) => (
                        <SortModelRow
                          item={sortModels[rubric.source.index]}
                          provided={provided}
                          snapshot={snapshot}
                          canDrag={!isSortBusy && sortModels.length > 1}
                        />
                      )}
                    >
                      {({ provided, snapshot }) => {
                        const setDroppableRef = (node: HTMLTableSectionElement | null) => {
                          provided.innerRef(node);
                          sortModelTableBodyRef.current = node;
                        };

                        return (
                          <Tbody {...provided.droppableProps} ref={setDroppableRef}>
                            {sortTopPlaceholderHeight > 0 && (
                              <Tr h={`${sortTopPlaceholderHeight}px`} aria-hidden>
                                <Td
                                  colSpan={1}
                                  h={`${sortTopPlaceholderHeight}px`}
                                  p={0}
                                  border={0}
                                />
                              </Tr>
                            )}
                            {virtualSortModels.map(({ data: item, index }) => (
                              <React.Fragment key={item.modelId}>
                                <Draggable
                                  draggableId={item.modelId}
                                  index={index}
                                  isDragDisabled={isSortBusy || sortModels.length < 2}
                                >
                                  {(provided, snapshot) => (
                                    <SortModelRow
                                      item={item}
                                      provided={provided}
                                      snapshot={snapshot}
                                      canDrag={!isSortBusy && sortModels.length > 1}
                                    />
                                  )}
                                </Draggable>
                                {snapshot.draggingFromThisWith === item.modelId && (
                                  <Tr
                                    h={`${sortModelRowHeight}px`}
                                    aria-hidden
                                    data-model-sort-source-placeholder=""
                                  >
                                    <Td
                                      colSpan={1}
                                      h={`${sortModelRowHeight}px`}
                                      p={0}
                                      border={0}
                                    />
                                  </Tr>
                                )}
                              </React.Fragment>
                            ))}
                            {sortBottomPlaceholderHeight > 0 && (
                              <Tr h={`${sortBottomPlaceholderHeight}px`} aria-hidden>
                                <Td
                                  colSpan={1}
                                  h={`${sortBottomPlaceholderHeight}px`}
                                  p={0}
                                  border={0}
                                />
                              </Tr>
                            )}
                          </Tbody>
                        );
                      }}
                    </DndDrag>
                  </Table>
                )}
              />
            </MyBox>
          ) : (
            <>
              <ModelListFilters
                px={6}
                providers={modelProviders}
                models={modelItems}
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
                <FixedTableLayout
                  scrollMode="virtual"
                  bodyRef={modelListContainerRef}
                  rootProps={{ flex: '1 0 0', h: 0 }}
                  headerProps={{ px: 6 }}
                  bodyProps={{ flex: '1 0 0', h: 0, px: 6 }}
                  renderHeader={({ headerTableWidth }) => (
                    <Table
                      minW={isTeam ? '950px' : '980px'}
                      sx={{
                        tableLayout: 'fixed',
                        width: `${headerTableWidth} !important`
                      }}
                    >
                      <colgroup>
                        <col style={{ width: modelTableColumnWidth.selection }} />
                        <col />
                        <col style={{ width: modelTableColumnWidth.channels }} />
                        {showBilling && <col style={{ width: modelTableColumnWidth.billing }} />}
                        {isTeam && <col style={{ width: modelTableColumnWidth.scope }} />}
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
                                {showModelId
                                  ? t('config_model:model.model_id')
                                  : t('common:model.name')}
                              </Box>
                              <MyIcon name="modal/changePer" w="1rem" />
                            </HStack>
                          </Th>
                          <Th fontSize="xs">{t('config_model:model.channels')}</Th>
                          {showBilling && <Th fontSize="xs">{t('common:model.billing')}</Th>}
                          {isTeam && <Th fontSize="xs">{t('config_model:available_range')}</Th>}
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
                  )}
                  renderBody={() => (
                    <Table
                      w={'100%'}
                      minW={isTeam ? '950px' : '980px'}
                      sx={{ tableLayout: 'fixed' }}
                    >
                      <colgroup>
                        <col style={{ width: modelTableColumnWidth.selection }} />
                        <col />
                        <col style={{ width: modelTableColumnWidth.channels }} />
                        {showBilling && <col style={{ width: modelTableColumnWidth.billing }} />}
                        {isTeam && <col style={{ width: modelTableColumnWidth.scope }} />}
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
                                  modelItems.length === 0 ? t('config_model:no_models') : undefined
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
                                  {isTeam && item.scope === ModelScopeEnum.system && (
                                    <MyTag type={'borderFill'} colorSchema={'gray'}>
                                      {t('config_model:system_model_tag')}
                                    </MyTag>
                                  )}
                                  {item.testMode && <TestModeBetaTag />}
                                </Flex>
                              </HStack>
                              <HStack mt={2} spacing={2} flexWrap={'nowrap'}>
                                <MyTag type={'borderFill'} colorSchema={item.tagColor} py={0.5}>
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
                            <Td fontSize={'sm'}>
                              <Box pointerEvents={channelMutationLoading ? 'none' : undefined}>
                                <ModelChannelCount
                                  channels={item.channels}
                                  onClick={() => setChannelModel(item)}
                                />
                              </Box>
                            </Td>
                            {showBilling && <Td fontSize={'sm'}>{item.priceLabel}</Td>}
                            {isTeam && (
                              <Td fontSize={'sm'}>
                                <ModelScopeCell
                                  modelId={item.modelId}
                                  scope={item.scope}
                                  ownerTmbId={item.tmbId}
                                  isAccountConfig
                                  selectedHint={t('config_model:available_range')}
                                />
                              </Td>
                            )}
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
                                  onClick={() =>
                                    onTestModel({ modelId: item.modelId, channelType })
                                  }
                                />
                                <ModelEditButton
                                  model={item}
                                  providers={modelProviders}
                                  channelType={channelType}
                                  onSuccess={refreshModels}
                                  isDisabled={channelMutationLoading}
                                />
                                <PopoverConfirm
                                  Trigger={
                                    <Box
                                      pointerEvents={channelMutationLoading ? 'none' : undefined}
                                    >
                                      <MyIconButton
                                        icon={'delete'}
                                        hoverColor={'red.500'}
                                        opacity={channelMutationLoading ? 0.5 : 1}
                                      />
                                    </Box>
                                  }
                                  type="delete"
                                  content={t('config_model:model.delete_model_confirm')}
                                  onConfirm={() =>
                                    handleDeleteModel({ modelId: item.modelId, channelType })
                                  }
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
                  )}
                  footer={
                    <FloatingActionBar
                      borderTopWidth="1px"
                      borderColor="myGray.100"
                      px={3}
                      Controler={
                        <HStack spacing={2}>
                          <Button
                            variant="whiteBase"
                            isLoading={updatingModelsStatus}
                            onClick={() =>
                              updateModelsStatus({
                                modelIds: selectedItems.map((model) => model.modelId),
                                isActive: true,
                                channelType
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
                                isActive: false,
                                channelType
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
                                  handleDeleteModels({
                                    modelIds: selectedItems.map((model) => model.modelId),
                                    channelType
                                  })
                              })()
                            }
                          >
                            {t('config_model:model.batch_delete')}
                          </Button>
                        </HStack>
                      }
                    />
                  }
                />
              </MyBox>
            </>
          )}
        </Flex>
      </Box>

      {!!channelModel && (
        <ModelChannelModal
          channelType={channelType}
          models={[channelModel]}
          channels={channelList}
          selectedChannelIds={channelModel.channels.map((channel) => channel.id)}
          onClose={() => setChannelModel(undefined)}
          onConfirm={updateModelChannels}
        />
      )}
      {isOpenJsonConfig && (
        <JsonModelConfigModal onClose={onCloseJsonConfig} onSuccess={refreshModels} />
      )}
      {isOpenDefaultModel && (
        <DefaultModelModal
          models={modelItems as unknown as AIModelDataType[]}
          defaultModelIds={
            modelConfigData && 'defaultModelIds' in modelConfigData
              ? modelConfigData.defaultModelIds
              : {}
          }
          onClose={onCloseDefaultModel}
          onSuccess={refreshModels}
        />
      )}
      <BatchDeleteConfirmModal isLoading={deletingModels} />
    </>
  );
};

export default ModelTable;
