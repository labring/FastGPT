import {
  deleteChannel,
  getChannelList,
  getChannelProviders,
  putChannel,
  putChannelStatus
} from '@/web/core/ai/channel';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import React, { useState } from 'react';
import {
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Box,
  Button,
  HStack,
  Flex,
  Spinner,
  Switch
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
import { useFixedTableHeader } from '@fastgpt/web/hooks/useFixedTableHeader';
import { useSet } from 'ahooks';
import { useToast } from '@fastgpt/web/hooks/useToast';

const EditChannelModal = dynamic(() => import('./EditChannelModal'), { ssr: false });
const ModelTest = dynamic(() => import('./ModelTest'), { ssr: false });

const ChannelTable = ({ Tab }: { Tab: React.ReactNode }) => {
  const { t, i18n } = useClientTranslation('config_model');
  const { toast } = useToast();
  const { userInfo } = useUserStore();
  const { aiproxyChannels } = useSystemStore();

  const isRoot = userInfo?.username === 'root';

  const {
    data: channelList = [],
    runAsync: refreshChannelList,
    loading: loadingChannelList
  } = useRequest(getChannelList, {
    manual: false
  });

  const { data: _channelProviders = {} } = useRequest(getChannelProviders, {
    manual: false
  });

  const [editChannel, setEditChannel] = useState<ChannelInfoType>();

  const { runAsync: updateChannel, loading: loadingUpdateChannel } = useRequest(putChannel, {
    manual: true,
    onSuccess: () => {
      refreshChannelList();
    }
  });
  const [updatingChannelIds, updatingChannelIdsDispatch] = useSet<number>();
  const { runAsync: updateChannelStatus } = useRequest(
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
        await putChannelStatus(channelId, status);
        toast({
          status: 'success',
          title: t(
            status === ChannelStatusEnum.ChannelStatusEnabled
              ? 'config_model:status_enabled'
              : 'config_model:status_disabled',
            { name: channelName }
          )
        });
        // 状态写入已经成功；列表刷新失败由其自身提示，不能把成功操作再次报成失败。
        await refreshChannelList().catch(() => {});
      } finally {
        updatingChannelIdsDispatch.remove(channelId);
      }
    }
  );

  const { openConfirm, ConfirmModal } = useConfirm({
    type: 'delete'
  });
  const { runAsync: onDeleteChannel, loading: loadingDeleteChannel } = useRequest(deleteChannel, {
    manual: true,
    onSuccess: () => {
      refreshChannelList();
    }
  });

  const [modelTestData, setTestModelData] = useState<{ channelId: number; models: string[] }>();

  const isLoading = loadingChannelList || loadingUpdateChannel || loadingDeleteChannel;
  const { headerContainerRef, bodyContainerRef, headerTableWidth } = useFixedTableHeader();

  return (
    <>
      {isRoot && (
        <ModelTabHeader Tab={Tab}>
          <Button
            w={['100%', 'auto']}
            variant={'primary'}
            onClick={() => setEditChannel(defaultChannel)}
          >
            {t('config_model:create_channel')}
          </Button>
        </ModelTabHeader>
      )}
      <MyBox
        flex={'1 0 0'}
        h={0}
        minH={0}
        display="flex"
        flexDirection="column"
        isLoading={isLoading}
      >
        <TableContainer ref={headerContainerRef} flexShrink={0} overflowX="hidden" px={6}>
          <Table
            sx={{
              tableLayout: 'fixed',
              width: `${headerTableWidth} !important`
            }}
          >
            <colgroup>
              <col />
              <col />
              <col style={{ width: '120px' }} />
              <col style={{ width: '120px' }} />
              <col style={{ width: '140px' }} />
              <col style={{ width: '120px' }} />
            </colgroup>
            <Thead>
              <Tr>
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
        </TableContainer>
        <TableContainer
          ref={bodyContainerRef}
          h={['auto', '100%']}
          flex={['0 0 auto', '1 1 0']}
          minH={0}
          overflowY={['visible', 'auto']}
          px={6}
          fontSize={'sm'}
        >
          <Table sx={{ tableLayout: 'fixed' }}>
            <colgroup>
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
                  <Td colSpan={6} borderBottom={0}>
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
                        onBlur={(e) => {
                          const val = (() => {
                            if (!e) return 1;
                            return e;
                          })();
                          updateChannel({
                            ...item,
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
                          onClick={() => setEditChannel(item)}
                        />
                        <MyIconButton
                          icon={'delete'}
                          tip={t('common:Delete')}
                          hoverColor={'red.500'}
                          hoverBg={'red.50'}
                          onClick={() =>
                            openConfirm({
                              onConfirm: () => onDeleteChannel(item.id),
                              customContent: t('config_model:confirm_delete_channel', {
                                name: item.name
                              })
                            })()
                          }
                        />
                      </HStack>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        </TableContainer>
      </MyBox>

      {!!editChannel && (
        <EditChannelModal
          defaultConfig={editChannel}
          onClose={() => setEditChannel(undefined)}
          onSuccess={refreshChannelList}
        />
      )}
      {!!modelTestData && (
        <ModelTest {...modelTestData} onClose={() => setTestModelData(undefined)} />
      )}
      <ConfirmModal />
    </>
  );
};

export default ChannelTable;
