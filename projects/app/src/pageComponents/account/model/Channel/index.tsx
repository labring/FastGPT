import {
  deleteChannel,
  getChannelList,
  getChannelProviders,
  putChannel,
  putChannelStatus
} from '@/web/core/ai/channel';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
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
  Flex,
  Button,
  HStack
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import { useUserStore } from '@/web/support/user/useUserStore';
import { type ChannelInfoType } from '@/global/aiproxy/type';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import {
  aiproxyIdMap,
  ChannelStatusEnum,
  ChannelStautsMap,
  defaultChannel
} from '@/global/aiproxy/constants';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import dynamic from 'next/dynamic';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import { getModelProvider } from '@fastgpt/global/core/ai/provider';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';

const EditChannelModal = dynamic(() => import('./EditChannelModal'), { ssr: false });
const ModelTest = dynamic(() => import('./ModelTest'), { ssr: false });

const ChannelTable = ({ Tab }: { Tab: React.ReactNode }) => {
  const { t } = useTranslation();
  const { userInfo } = useUserStore();

  const isRoot = userInfo?.username === 'root';

  const {
    data: channelList = [],
    runAsync: refreshChannelList,
    loading: loadingChannelList
  } = useRequest2(getChannelList, {
    manual: false
  });

  const { data: channelProviders = {} } = useRequest2(getChannelProviders, {
    manual: false
  });

  const [editChannel, setEditChannel] = useState<ChannelInfoType>();

  const { runAsync: updateChannel, loading: loadingUpdateChannel } = useRequest2(putChannel, {
    manual: true,
    onSuccess: () => {
      refreshChannelList();
    }
  });
  const { runAsync: updateChannelStatus, loading: loadingUpdateChannelStatus } = useRequest2(
    putChannelStatus,
    {
      onSuccess: () => {
        refreshChannelList();
      }
    }
  );

  const { openConfirm, ConfirmModal } = useConfirm({
    type: 'delete'
  });
  const { runAsync: onDeleteChannel, loading: loadingDeleteChannel } = useRequest2(deleteChannel, {
    manual: true,
    onSuccess: () => {
      refreshChannelList();
    }
  });

  const [modelTestData, setTestModelData] = useState<{ channelId: number; models: string[] }>();

  const isLoading =
    loadingChannelList ||
    loadingUpdateChannel ||
    loadingDeleteChannel ||
    loadingUpdateChannelStatus;

  return (
    <>
      {isRoot && (
        <Flex alignItems={'center'}>
          {Tab}
          <Box flex={1} />
          <Button variant={'whiteBase'} mr={2} onClick={() => setEditChannel(defaultChannel)}>
            {t('account_model:create_channel')}
          </Button>
        </Flex>
      )}
      <MyBox flex={'1 0 0'} h={0} isLoading={isLoading}>
        <TableContainer h={'100%'} overflowY={'auto'} fontSize={'sm'}>
          <Table>
            <Thead>
              <Tr>
                <Th>ID</Th>
                <Th>{t('account_model:channel_name')}</Th>
                <Th>{t('account_model:channel_type')}</Th>
                <Th>{t('account_model:channel_status')}</Th>
                <Th>
                  {t('account_model:channel_priority')}
                  <QuestionTip label={t('account_model:channel_priority_tip')} />
                </Th>
                <Th></Th>
              </Tr>
            </Thead>
            <Tbody>
              {channelList.map((item) => {
                const providerData = aiproxyIdMap[item.type] || {
                  label: channelProviders[item.type]?.name || 'Invalid provider',
                  provider: 'Other'
                };
                const provider = getModelProvider(providerData?.provider);

                return (
                  <Tr key={item.id} _hover={{ bg: 'myGray.100' }}>
                    <Td>{item.id}</Td>
                    <Td>{item.name}</Td>
                    <Td>
                      <HStack>
                        <MyIcon
                          name={(providerData?.avatar || provider?.avatar) as any}
                          w={'1rem'}
                        />
                        <Box>{t(providerData?.label as any)}</Box>
                      </HStack>
                    </Td>
                    <Td>
                      <MyTag
                        colorSchema={ChannelStautsMap[item.status]?.colorSchema as any}
                        type="borderFill"
                      >
                        {t(ChannelStautsMap[item.status]?.label as any) ||
                          t('account_model:channel_status_unknown')}
                      </MyTag>
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
                      <MyMenu
                        menuList={[
                          {
                            label: '',
                            children: [
                              {
                                icon: 'core/chat/sendLight',
                                label: t('account_model:model_test'),
                                onClick: () =>
                                  setTestModelData({
                                    channelId: item.id,
                                    models: item.models
                                  })
                              },
                              ...(item.status === ChannelStatusEnum.ChannelStatusEnabled
                                ? [
                                    {
                                      icon: 'common/disable',
                                      label: t('account_model:forbid_channel'),
                                      onClick: () =>
                                        updateChannelStatus(
                                          item.id,
                                          ChannelStatusEnum.ChannelStatusDisabled
                                        )
                                    }
                                  ]
                                : [
                                    {
                                      icon: 'common/enable',
                                      label: t('account_model:enable_channel'),
                                      onClick: () =>
                                        updateChannelStatus(
                                          item.id,
                                          ChannelStatusEnum.ChannelStatusEnabled
                                        )
                                    }
                                  ]),
                              {
                                icon: 'common/settingLight',
                                label: t('account_model:edit'),
                                onClick: () => setEditChannel(item)
                              },
                              {
                                type: 'danger',
                                icon: 'delete',
                                label: t('common:Delete'),
                                onClick: () =>
                                  openConfirm(
                                    () => onDeleteChannel(item.id),
                                    undefined,
                                    t('account_model:confirm_delete_channel', {
                                      name: item.name
                                    })
                                  )()
                              }
                            ]
                          }
                        ]}
                        Button={<MyIconButton icon={'more'} />}
                      />
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
