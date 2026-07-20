import {
  deleteChannel,
  getChannelAffectedModels,
  getChannelList,
  getChannelModels,
  putChannel,
  putChannelStatus,
  type ChannelKind
} from '@/web/core/ai/channel';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import React, { useMemo, useState } from 'react';
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
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import { useTranslation } from 'next-i18next';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import { useUserStore } from '@/web/support/user/useUserStore';
import { type ChannelInfoType } from '@/global/aiproxy/type';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { ChannelStatusEnum, ChannelStautsMap, defaultChannel } from '@/global/aiproxy/constants';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import dynamic from 'next/dynamic';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import { useConfirmInput } from '@/components/core/ai/ConfirmInput';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MySelect from '@fastgpt/web/components/common/MySelect';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyPopover from '@fastgpt/web/components/common/MyPopover';

const EditChannelModal = dynamic(() => import('./EditChannelModal'), { ssr: false });
const ModelTest = dynamic(() => import('./ModelTest'), { ssr: false });
const ChannelLogModal = dynamic(() => import('./ChannelLogModal'), { ssr: false });

type ChannelGroupType = 'public' | 'team';

/** Shows all related models; deletion checks only models whose sole route is this channel. */
const RelatedModelsPopover = ({
  count,
  channelId,
  channelType
}: {
  count: number;
  channelId: number;
  channelType: ChannelKind;
}) => {
  const { t } = useTranslation();
  const { runAsync, data, loading } = useRequest(() => getChannelModels(channelId, channelType), {
    manual: true
  });

  return (
    <MyPopover
      trigger="hover"
      placement="bottom-start"
      w={'260px'}
      onOpenFunc={() => runAsync()}
      Trigger={
        <Box
          as={'span'}
          cursor={'pointer'}
          color={'primary.600'}
          textDecoration={'underline'}
          textUnderlineOffset={'3px'}
        >
          {count}
        </Box>
      }
    >
      {() => (
        <Box p={3} fontSize={'sm'}>
          <Box color={'myGray.900'}>{t('account_model:channel_related_models')}</Box>
          <Box mt={1} color={'myGray.600'} whiteSpace={'pre-wrap'}>
            {loading
              ? '...'
              : data?.models?.length
                ? data.models.map((m) => m.name).join('、')
                : t('account_model:channel_related_models_empty')}
          </Box>
        </Box>
      )}
    </MyPopover>
  );
};

const ChannelTable = ({ Tab }: { Tab: React.ReactNode }) => {
  const { t, i18n } = useClientTranslation('account_model');
  const { userInfo } = useUserStore();
  const { aiproxyChannels } = useSystemStore();

  const isRoot = userInfo?.username === 'root';

  // Root can always create channels; members need the team model-create permission.
  const hasModelCreatePer =
    isRoot || !!userInfo?.permission?.hasModelCreatePer || !!userInfo?.permission?.isOwner;

  const [activeGroupType, setActiveGroupType] = useState<ChannelGroupType>('public');
  const channelScopeList = useMemo<{ label: string; value: ChannelGroupType }[]>(
    () => [
      { label: t('account_model:channel_public_tab'), value: 'public' },
      { label: t('account_model:channel_team_tab'), value: 'team' }
    ],
    [t]
  );
  // Declared channel kind for resource ops (design §2.9.4): root public tab →
  // system channels; team tab / members → team channels.
  const currentChannelKind: ChannelKind = isRoot
    ? activeGroupType === 'team'
      ? 'team'
      : 'system'
    : 'team';
  // Root selects the bucket by tab; member channels always use their team bucket.
  const createGroupType: 'system' | 'team' = isRoot
    ? activeGroupType === 'team'
      ? 'team'
      : 'system'
    : 'team';

  const {
    data: channelList = [],
    runAsync: refreshChannelList,
    loading: loadingChannelList
  } = useRequest(
    () =>
      getChannelList(isRoot ? { groupType: activeGroupType === 'team' ? 'team' : 'system' } : {}),
    {
      manual: false,
      refreshDeps: [activeGroupType, isRoot]
    }
  );

  const channelRows = channelList as ChannelInfoType[];

  const [editChannel, setEditChannel] = useState<ChannelInfoType>();

  const { runAsync: updateChannel, loading: loadingUpdateChannel } = useRequest(putChannel, {
    manual: true,
    onSuccess: () => {
      refreshChannelList();
    }
  });
  const { runAsync: updateChannelStatus, loading: loadingUpdateChannelStatus } = useRequest(
    putChannelStatus,
    {
      onSuccess: () => {
        refreshChannelList();
      }
    }
  );

  const { openConfirmInput, ConfirmInputModal } = useConfirmInput();
  const { runAsync: onDeleteChannel, loading: loadingDeleteChannel } = useRequest(deleteChannel, {
    manual: true,
    onSuccess: () => {
      refreshChannelList();
    }
  });
  const { runAsync: onGetChannelAffectedModels } = useRequest(getChannelAffectedModels, {
    manual: true
  });

  const [modelTestData, setTestModelData] = useState<{ channelId: number; models: string[] }>();
  // Channel-dimension call log (moved here from the model log page, design §5.1)
  const [channelLogId, setChannelLogId] = useState<number>();

  const isLoading =
    loadingChannelList ||
    loadingUpdateChannel ||
    loadingDeleteChannel ||
    loadingUpdateChannelStatus;

  return (
    <>
      <Flex alignItems={'center'}>
        <Box>{Tab}</Box>
        <Box flex={1} />
        <MyTooltip
          label={t('account_model:channel_no_permission_tip')}
          isDisabled={hasModelCreatePer}
        >
          <span>
            <Button
              variant={'whiteBase'}
              mr={2}
              isDisabled={!hasModelCreatePer}
              onClick={() => setEditChannel(defaultChannel)}
            >
              {t('account_model:create_channel')}
            </Button>
          </span>
        </MyTooltip>
      </Flex>
      <Flex alignItems={'center'} mt={4}>
        {isRoot && (
          <HStack flexShrink={0}>
            <Box fontSize={'sm'} color={'myGray.900'}>
              {t('account_model:channel.scope')}
            </Box>
            <MySelect
              w={'150px'}
              bg={'myGray.50'}
              value={activeGroupType}
              onChange={setActiveGroupType}
              list={channelScopeList}
            />
          </HStack>
        )}
        <Box flex={1} />
      </Flex>
      <MyBox flex={'1 0 0'} h={0} isLoading={isLoading}>
        <TableContainer h={'100%'} overflowY={'auto'} fontSize={'sm'}>
          <Table>
            <Thead>
              <Tr>
                <Th>ID</Th>
                <Th>{t('account_model:channel_name')}</Th>
                <Th>{t('account_model:channel_type')}</Th>
                <Th>{t('account_model:channel_status')}</Th>
                <Th>{t('account_model:channel_related_model_count')}</Th>
                <Th>
                  {t('account_model:channel_priority')}
                  <QuestionTip label={t('account_model:channel_priority_tip')} />
                </Th>
                <Th></Th>
              </Tr>
            </Thead>
            <Tbody>
              {channelRows.map((item) => {
                const providerData = aiproxyChannels.find(
                  (channel) => channel.channelId === item.type
                ) || {
                  name: 'Invalid provider',
                  avatar: 'model/huggingface'
                };
                return (
                  <Tr key={item.id} _hover={{ bg: 'myGray.100' }}>
                    <Td>{item.id}</Td>
                    <Td>{item.name}</Td>
                    <Td>
                      <HStack>
                        <Avatar src={providerData.avatar} w={'1rem'} />
                        <Box>{parseI18nString(providerData.name, i18n.language as localeType)}</Box>
                      </HStack>
                    </Td>
                    <Td>
                      <MyTag
                        colorSchema={
                          ChannelStautsMap[item.status as ChannelStatusEnum]?.colorSchema as any
                        }
                        type="borderFill"
                      >
                        {t(ChannelStautsMap[item.status as ChannelStatusEnum]?.label as any) ||
                          t('account_model:channel_status_unknown')}
                      </MyTag>
                    </Td>
                    <Td>
                      <RelatedModelsPopover
                        count={item.relatedModelCount || 0}
                        channelId={item.id}
                        channelType={currentChannelKind}
                      />
                    </Td>
                    <Td>
                      <MyNumberInput
                        defaultValue={item.priority || 1}
                        min={1}
                        max={100}
                        h={'32px'}
                        w={'80px'}
                        isDisabled={!hasModelCreatePer}
                        onBlur={(e) => {
                          const val = (() => {
                            if (!e) return 1;
                            return e;
                          })();
                          updateChannel(
                            {
                              ...item,
                              priority: val
                            },
                            currentChannelKind
                          );
                        }}
                      />
                    </Td>
                    <Td>
                      {hasModelCreatePer ? (
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
                                // aiproxy channel logs are root-only (admin passthrough auth)
                                ...(isRoot
                                  ? [
                                      {
                                        icon: 'core/app/logsLight',
                                        label: t('account_model:log'),
                                        onClick: () => setChannelLogId(item.id)
                                      }
                                    ]
                                  : []),
                                ...(item.status === ChannelStatusEnum.ChannelStatusEnabled
                                  ? [
                                      {
                                        icon: 'common/disable',
                                        label: t('account_model:forbid_channel'),
                                        onClick: () =>
                                          updateChannelStatus(
                                            item.id,
                                            ChannelStatusEnum.ChannelStatusDisabled,
                                            currentChannelKind
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
                                            ChannelStatusEnum.ChannelStatusEnabled,
                                            currentChannelKind
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
                                  // Require name confirmation when deletion strands any model.
                                  onClick: async () => {
                                    const { affectedModels } = await onGetChannelAffectedModels(
                                      item.id,
                                      currentChannelKind
                                    );
                                    openConfirmInput({
                                      title: t('account_model:channel_delete_title'),
                                      message:
                                        affectedModels.length > 0
                                          ? t('account_model:channel_delete_affected_warn')
                                          : t('account_model:confirm_delete_channel', {
                                              name: item.name
                                            }),
                                      detail:
                                        affectedModels.length > 0
                                          ? affectedModels.map((m) => m.name).join('、')
                                          : undefined,
                                      confirmPlaceholder: t(
                                        'account_model:channel_delete_placeholder'
                                      ),
                                      confirmValue:
                                        affectedModels.length > 0 ? item.name : undefined,
                                      onConfirm: async () => {
                                        await onDeleteChannel(item.id, currentChannelKind);
                                      }
                                    });
                                  }
                                }
                              ]
                            }
                          ]}
                          Button={<MyIconButton icon={'more'} />}
                        />
                      ) : (
                        <MyIconButton
                          icon={'more'}
                          isDisabled
                          tip={t('account_model:channel_no_permission_tip')}
                        />
                      )}
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
          groupType={createGroupType}
          onClose={() => setEditChannel(undefined)}
          onSuccess={refreshChannelList}
        />
      )}
      {!!modelTestData && (
        <ModelTest {...modelTestData} onClose={() => setTestModelData(undefined)} />
      )}
      {channelLogId !== undefined && (
        <ChannelLogModal
          channelId={channelLogId}
          channelType={currentChannelKind}
          onClose={() => setChannelLogId(undefined)}
        />
      )}
      <ConfirmInputModal />
    </>
  );
};

export default ChannelTable;
