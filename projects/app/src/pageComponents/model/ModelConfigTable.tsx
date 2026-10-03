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
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import React, { useCallback, useEffect, useState } from 'react';
import type { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { deleteModel, deleteModels, testModel, putModelsStatus } from '@/web/core/ai/model/api';
import type { SystemModelListItem } from '@fastgpt/global/openapi/core/ai/model/api';
import type { SystemModelDataType } from '@fastgpt/global/core/ai/model/schema';
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
import ModelTabHeader from './ModelTabHeader';
import type { ModelProviderItemType } from '@fastgpt/global/core/ai/model/provider';
import { useLockFn, useSet } from 'ahooks';
import ModelChannelCount from './ModelChannelCount';
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

const modelRowHeight = 80;
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
    channelType = 'system',
    onSuccess,
    isDisabled
  }: {
    model: SystemModelListItem;
    providers: ModelProviderItemType[];
    channelType?: 'system' | 'team';
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

const ModelTable = ({
  Tab,
  channelType = 'system'
}: {
  Tab: React.ReactNode;
  channelType?: 'system' | 'team';
}) => {
  const { t, i18n } = useClientTranslation('config_model');
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
  const getModelId = useCallback((model: SystemModelListItem) => model.modelId, []);
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
          title: t(isActive ? 'config_model:status_enabled' : 'config_model:status_disabled', {
            name: model
          })
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

  const canManageModel = Boolean(
    isRoot ||
    userInfo?.team?.permission?.hasManagePer ||
    userInfo?.team?.permission?.hasModelCreateRole
  );

  return (
    <>
      {canManageModel && (
        <ModelTabHeader Tab={Tab}>
          <Grid
            w={['100%', 'auto']}
            templateColumns={
              !isTeam && isRoot ? ['repeat(3, minmax(0, 1fr))', 'repeat(3, auto)'] : ['1fr', 'auto']
            }
            gap={2}
          >
            {!isTeam && isRoot && (
              <>
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
              </>
            )}
            <AddModel
              installedModels={modelItems}
              channels={channelList}
              providers={modelProviders}
              channelType={channelType}
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
              headerProps={{ px: 4 }}
              bodyProps={{ flex: '1 0 0', h: 0, px: 4 }}
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
                <Table w={'100%'} minW={isTeam ? '950px' : '980px'} sx={{ tableLayout: 'fixed' }}>
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
                            text={modelItems.length === 0 ? t('config_model:no_models') : undefined}
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
                            <ModelChannelCount channels={item.channels} />
                          </Box>
                        </Td>
                        {showBilling && <Td fontSize={'sm'}>{item.priceLabel}</Td>}
                        {isTeam && (
                          <Td fontSize={'sm'}>
                            <ModelScopeCell
                              modelId={item.modelId}
                              scope={item.scope}
                              isAccountConfig
                              hasManagePer={userInfo?.team.permission.hasManagePer}
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
                              onClick={() => onTestModel({ modelId: item.modelId, channelType })}
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
        </Flex>
      </Box>

      {isOpenJsonConfig && (
        <JsonModelConfigModal onClose={onCloseJsonConfig} onSuccess={refreshModels} />
      )}
      {isOpenDefaultModel && (
        <DefaultModelModal
          models={modelItems as unknown as SystemModelDataType[]}
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
