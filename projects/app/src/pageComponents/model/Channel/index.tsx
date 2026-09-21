import {
  deleteChannel,
  getAffectedModels,
  getChannelPageList,
  getChannelProviders,
  postBatchDeleteChannels,
  postBatchUpdateChannelStatus,
  putChannel,
  putChannelStatus
} from '@/web/core/ai/channel';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import React, { useCallback, useState } from 'react';
import {
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Box,
  Button,
  HStack,
  Flex,
  Spinner,
  Switch,
  Checkbox
} from '@chakra-ui/react';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import { useUserStore } from '@/web/support/user/useUserStore';
import { type ChannelInfoType } from '@/global/aiproxy/type';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { ChannelStatusEnum, defaultChannel } from '@/global/aiproxy/constants';
import dynamic from 'next/dynamic';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import Avatar from '@fastgpt/web/components/common/Avatar';
import ModelTabHeader from '../ModelTabHeader';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { FixedTableLayout } from '@fastgpt/web/components/common/FixedTable';
import { useLockFn, useSet } from 'ahooks';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { useTableMultipleSelect } from '@fastgpt/web/hooks/useTableMultipleSelect';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import type { ChannelListItem } from '@fastgpt/global/openapi/core/ai/channel/api';

const EditChannelModal = dynamic(() => import('./EditChannelModal'), { ssr: false });
const ModelTest = dynamic(() => import('./ModelTest'), { ssr: false });

const ChannelTable = ({
  Tab,
  channelType = 'system'
}: {
  Tab: React.ReactNode;
  channelType?: 'system' | 'team';
}) => {
  const { t, i18n } = useClientTranslation('config_model');
  const { toast } = useToast();
  const { userInfo } = useUserStore();
  const { aiproxyChannels } = useSystemStore();

  const isRoot = userInfo?.username === 'root';
  const [search, setSearch] = useState('');

  const {
    data: channelList = [],
    isLoading: loadingChannelList,
    total,
    pageSize,
    Pagination,
    refresh
  } = usePagination(getChannelPageList, {
    defaultPageSize: 20,
    params: {
      channelType,
      search: search.trim() || undefined
    },
    refreshDeps: [channelType, search]
  });

  const refreshChannelList = useCallback(() => {
    refresh();
  }, [refresh]);

  const { data: _channelProviders = {} } = useRequest(getChannelProviders, {
    manual: false
  });

  const [editChannel, setEditChannel] = useState<ChannelInfoType>();
  const [channelMutationLoading, setChannelMutationLoading] = useState(false);
  const runChannelMutation = useLockFn(async (operation: () => Promise<unknown>) => {
    setChannelMutationLoading(true);
    try {
      return await operation();
    } finally {
      setChannelMutationLoading(false);
    }
  });

  // Table row multi-selection
  const getChannelId = useCallback((item: ChannelListItem) => item.id, []);
  const {
    selectedItems,
    setSelectedItems,
    toggleSelect,
    isSelected,
    FloatingActionBar,
    isSelecteAll,
    selectAllTrigger
  } = useTableMultipleSelect({
    list: channelList,
    getItemId: getChannelId
  });

  const { runAsync: updateChannelRequest, loading: loadingUpdateChannel } = useRequest(
    (data: Parameters<typeof putChannel>[0]) => putChannel({ ...data, channelType }),
    {
      manual: true,
      onSuccess: () => {
        refreshChannelList();
      }
    }
  );
  const updateChannel = (data: Parameters<typeof putChannel>[0]) =>
    runChannelMutation(() => updateChannelRequest(data));

  const [updatingChannelIds, updatingChannelIdsDispatch] = useSet<number>();
  const { runAsync: updateChannelStatusRequest } = useRequest(
    async ({
      channelId,
      channelName,
      status
    }: {
      channelId: number;
      channelName: string;
      status: ChannelStatusEnum;
    }) => {
      updatingChannelIdsDispatch.add(channelId);
      try {
        await putChannelStatus(channelId, status, channelType);
        toast({
          status: 'success',
          title: t(
            status === ChannelStatusEnum.ChannelStatusEnabled
              ? 'config_model:status_enabled'
              : 'config_model:status_disabled',
            { name: channelName }
          )
        });
        refreshChannelList();
      } finally {
        updatingChannelIdsDispatch.remove(channelId);
      }
    }
  );
  const updateChannelStatus = (data: Parameters<typeof updateChannelStatusRequest>[0]) =>
    runChannelMutation(() => updateChannelStatusRequest(data));

  const { openConfirm, ConfirmModal } = useConfirm({
    type: 'delete'
  });

  const { runAsync: deleteChannelRequest, loading: loadingDeleteChannel } = useRequest(
    (channelId: number) => deleteChannel(channelId, channelType),
    {
      manual: true,
      onSuccess: () => {
        setSelectedItems((prev) =>
          prev.filter((item) => !selectedItems.some((s) => s.id === item.id))
        );
        refreshChannelList();
      }
    }
  );
  const onDeleteChannel = (channelId: number) =>
    runChannelMutation(() => deleteChannelRequest(channelId));

  // Delete preflight checking for affected models
  const handleDeleteChannel = async (item: ChannelListItem) => {
    let affectedWarning = '';
    try {
      const res = await getAffectedModels(item.id, channelType);
      if (res?.affectedModels && res.affectedModels.length > 0) {
        const names = res.affectedModels.map((m) => m.name || m.model).join(', ');
        affectedWarning = t('config_model:channel.delete_affected_models_warning', {
          models: names
        });
      }
    } catch (_error) {
      // preflight failure does not block deletion dialog
    }

    openConfirm({
      onConfirm: () => onDeleteChannel(item.id),
      customContent:
        affectedWarning ||
        t('config_model:confirm_delete_channel', {
          name: item.name
        })
    })();
  };

  // Batch operations
  const [batchOperating, setBatchOperating] = useState(false);
  const handleBatchStatus = async (status: 1 | 2) => {
    if (selectedItems.length === 0) return;
    setBatchOperating(true);
    try {
      await postBatchUpdateChannelStatus({
        ids: selectedItems.map((c) => c.id),
        status,
        channelType
      });
      toast({
        status: 'success',
        title: t(
          status === 1
            ? 'config_model:channel.batch_status_enabled'
            : 'config_model:channel.batch_status_disabled',
          { count: selectedItems.length }
        )
      });
      setSelectedItems([]);
      refreshChannelList();
    } catch (err: any) {
      toast({
        status: 'error',
        title: err?.message || 'Batch update status failed'
      });
    } finally {
      setBatchOperating(false);
    }
  };

  const handleBatchDelete = () => {
    if (selectedItems.length === 0) return;
    openConfirm({
      onConfirm: async () => {
        setBatchOperating(true);
        try {
          await postBatchDeleteChannels({
            ids: selectedItems.map((c) => c.id),
            channelType
          });
          toast({
            status: 'success',
            title: t('common:Delete_Success')
          });
          setSelectedItems([]);
          refreshChannelList();
        } catch (err: any) {
          toast({
            status: 'error',
            title: err?.message || 'Batch delete failed'
          });
        } finally {
          setBatchOperating(false);
        }
      },
      customContent: t('config_model:channel.batch_delete_confirm', {
        count: selectedItems.length
      })
    })();
  };

  const [modelTestData, setTestModelData] = useState<{ channelId: number; models: string[] }>();

  const isLoading =
    loadingChannelList ||
    loadingUpdateChannel ||
    loadingDeleteChannel ||
    channelMutationLoading ||
    batchOperating;

  const canCreateChannel = isRoot || Boolean(userInfo?.team?.permission?.hasModelCreateRole);

  return (
    <>
      <ModelTabHeader Tab={Tab}>
        <HStack spacing={2} w={['100%', 'auto']}>
          <SearchInput
            w={['100%', '240px']}
            size={'sm'}
            placeholder={t('config_model:channel.search_placeholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {canCreateChannel && (
            <Button
              variant={'primary'}
              size={'sm'}
              isDisabled={channelMutationLoading}
              onClick={() => setEditChannel(defaultChannel)}
            >
              {t('config_model:create_channel')}
            </Button>
          )}
        </HStack>
      </ModelTabHeader>
      <MyBox
        flex={'1 0 0'}
        h={0}
        minH={0}
        display="flex"
        flexDirection="column"
        bg={'white'}
        borderRadius={'md'}
        isLoading={isLoading}
      >
        <FixedTableLayout
          scrollMode="normal"
          rootProps={{ flex: '1 0 0', h: 0 }}
          headerProps={{ px: 4 }}
          bodyProps={{
            h: 0,
            flex: '1 1 0',
            overflowY: 'auto',
            px: 4,
            fontSize: 'sm'
          }}
          renderHeader={({ headerTableWidth }) => (
            <Table
              sx={{
                tableLayout: 'fixed',
                width: `${headerTableWidth} !important`
              }}
            >
              <colgroup>
                <col style={{ width: '48px' }} />
                <col />
                <col />
                <col style={{ width: '120px' }} />
                <col style={{ width: '120px' }} />
                <col style={{ width: '140px' }} />
                <col style={{ width: '120px' }} />
              </colgroup>
              <Thead>
                <Tr>
                  <Th px={3}>
                    <Checkbox
                      isChecked={isSelecteAll}
                      isIndeterminate={selectedItems.length > 0 && !isSelecteAll}
                      onChange={selectAllTrigger}
                    />
                  </Th>
                  <Th>{t('common:Name')}</Th>
                  <Th>{t('config_model:channel_type')}</Th>
                  <Th>{t('config_model:model_count')}</Th>
                  <Th>{t('config_model:model.active')}</Th>
                  <Th>
                    <HStack spacing={1} alignItems="center">
                      <Box>{t('config_model:channel_priority')}</Box>
                      <QuestionTip label={t('config_model:channel_priority_tip')} />
                    </HStack>
                  </Th>
                  <Th>{t('common:Operation')}</Th>
                </Tr>
              </Thead>
            </Table>
          )}
          renderBody={() => (
            <Table sx={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '48px' }} />
                <col />
                <col />
                <col style={{ width: '120px' }} />
                <col style={{ width: '120px' }} />
                <col style={{ width: '140px' }} />
                <col style={{ width: '120px' }} />
              </colgroup>
              <Tbody>
                {!loadingChannelList && channelList.length === 0 && (
                  <Tr>
                    <Td colSpan={7} borderBottom={0}>
                      <EmptyTip text={t('config_model:channel_list_empty')} />
                    </Td>
                  </Tr>
                )}
                {channelList.map((item) => {
                  const providerData = aiproxyChannels.find(
                    (channel) => channel.channelId === item.type
                  ) || {
                    name: 'Invalid provider',
                    avatar: 'model/huggingface'
                  };
                  return (
                    <Tr key={item.id} _hover={{ bg: 'myGray.100' }}>
                      <Td px={3}>
                        <Checkbox
                          isChecked={isSelected(item)}
                          onChange={() => toggleSelect(item)}
                        />
                      </Td>
                      <Td>{item.name}</Td>
                      <Td>
                        <HStack>
                          <Avatar src={providerData.avatar} w={'1rem'} />
                          <Box>{parseI18nString(providerData.name, i18n.language)}</Box>
                        </HStack>
                      </Td>
                      <Td>{item.models.length}</Td>
                      <Td>
                        <Flex w={'32px'} justifyContent={'center'}>
                          {updatingChannelIds.has(item.id) ? (
                            <Spinner size={'sm'} color={'primary.600'} />
                          ) : (
                            <Switch
                              size={'sm'}
                              cursor={'pointer'}
                              isDisabled={channelMutationLoading}
                              isChecked={item.status === ChannelStatusEnum.ChannelStatusEnabled}
                              onChange={(e) =>
                                updateChannelStatus({
                                  channelId: item.id,
                                  channelName: item.name,
                                  status: e.target.checked
                                    ? ChannelStatusEnum.ChannelStatusEnabled
                                    : ChannelStatusEnum.ChannelStatusDisabled
                                })
                              }
                              colorScheme={'myBlue'}
                            />
                          )}
                        </Flex>
                      </Td>
                      <Td>
                        <MyNumberInput
                          defaultValue={item.priority || 1}
                          min={1}
                          max={100}
                          h={'32px'}
                          w={'80px'}
                          isDisabled={channelMutationLoading}
                          onBlur={(e) => {
                            const val = (() => {
                              if (!e) return 1;
                              return e;
                            })();
                            updateChannel({
                              ...item,
                              key: '',
                              priority: val
                            });
                          }}
                        />
                      </Td>
                      <Td>
                        <HStack spacing={2} justifyContent={'flex-end'}>
                          <MyIconButton
                            icon={'core/chat/sendLight'}
                            tip={t('config_model:model_test')}
                            onClick={() =>
                              setTestModelData({
                                channelId: item.id,
                                models: item.models
                              })
                            }
                          />
                          <MyIconButton
                            icon={'common/settingLight'}
                            tip={t('config_model:edit')}
                            pointerEvents={channelMutationLoading ? 'none' : undefined}
                            opacity={channelMutationLoading ? 0.5 : 1}
                            onClick={() =>
                              setEditChannel({
                                ...defaultChannel,
                                ...item,
                                key: '',
                                status: item.status as ChannelStatusEnum,
                                base_url: item.base_url ?? '',
                                priority: item.priority ?? 1,
                                created_at: item.created_at ?? 0
                              })
                            }
                          />
                          <MyIconButton
                            icon={'delete'}
                            tip={t('common:Delete')}
                            hoverColor={'red.500'}
                            hoverBg={'red.50'}
                            pointerEvents={channelMutationLoading ? 'none' : undefined}
                            opacity={channelMutationLoading ? 0.5 : 1}
                            onClick={() => handleDeleteChannel(item)}
                          />
                        </HStack>
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          )}
          footer={
            selectedItems.length > 0 ? (
              <FloatingActionBar
                borderTopWidth="1px"
                borderColor="myGray.100"
                px={3}
                Controler={
                  <HStack spacing={2}>
                    <Button
                      size="sm"
                      variant="whiteBase"
                      isLoading={batchOperating}
                      onClick={() => handleBatchStatus(1)}
                    >
                      {t('config_model:channel.batch_enable')}
                    </Button>
                    <Button
                      size="sm"
                      variant="whiteBase"
                      isLoading={batchOperating}
                      onClick={() => handleBatchStatus(2)}
                    >
                      {t('config_model:channel.batch_disable')}
                    </Button>
                    <Button
                      size="sm"
                      variant="whiteBase"
                      color="red.600"
                      isLoading={batchOperating || channelMutationLoading}
                      onClick={handleBatchDelete}
                    >
                      {t('config_model:channel.batch_delete')}
                    </Button>
                  </HStack>
                }
              />
            ) : total > pageSize ? (
              <Flex flexShrink={0} mt={3} px={6} justifyContent={'center'}>
                <Pagination />
              </Flex>
            ) : undefined
          }
        />
      </MyBox>
      <ConfirmModal />
      {editChannel && (
        <EditChannelModal
          defaultConfig={editChannel}
          channelType={channelType}
          onClose={() => setEditChannel(undefined)}
          onSuccess={() => {
            setEditChannel(undefined);
            refreshChannelList();
          }}
        />
      )}
      {modelTestData && (
        <ModelTest
          channelId={modelTestData.channelId}
          models={modelTestData.models}
          channelType={channelType}
          onClose={() => setTestModelData(undefined)}
        />
      )}
    </>
  );
};

export default ChannelTable;
