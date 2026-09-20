import { FixedTableContainer } from '@fastgpt/web/components/common/FixedTable';
import Avatar from '@fastgpt/web/components/common/Avatar';
import {
  Box,
  Button,
  Flex,
  HStack,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  useDisclosure,
  VStack
} from '@chakra-ui/react';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import { useUserStore } from '@/web/support/user/useUserStore';
import {
  delRemoveMember,
  getTeamMembers,
  putUpdateMemberNameByManager,
  postRestoreMember
} from '@/web/support/user/team/api';
import Tag from '@fastgpt/web/components/common/Tag';
import { useContextSelector } from 'use-context-selector';
import { TeamContext } from './context';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyIcon from '@fastgpt/web/components/common/Icon';
import dynamic from 'next/dynamic';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { delLeaveTeam } from '@/web/support/user/team/api';
import { postSyncMembers } from '@/web/support/user/api';
import {
  TeamMemberRoleEnum,
  TeamMemberStatusEnum
} from '@fastgpt/global/support/user/team/constant';
import { getTeamMemberDisplayName } from '@fastgpt/global/support/user/team/memberName';
import { format } from 'date-fns/format';
import OrgTags from '@/components/support/user/team/OrgTags';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import { useCallback, useState, useMemo, type ComponentProps } from 'react';
import { downloadFetch, getIsMemberSyncMode } from '@/web/common/system/utils';
import { type TeamMemberItemType } from '@fastgpt/global/support/user/team/type';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { type PaginationResponse } from '@fastgpt/global/openapi/api';
import { SingleSelectFilter } from '@fastgpt/web/components/common/TagFilter';
import { useEditTitle } from '@/web/common/hooks/useEditTitle';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';

const InviteModal = dynamic(() => import('./Invite/InviteModal'));
const TransferOwnershipModal = dynamic(() => import('./TransferOwnershipModal'));

function MemberTable({ Tabs }: { Tabs: React.ReactNode }) {
  const { t } = useClientTranslation(['account_team', 'user']);
  const { toast } = useToast();
  const { userInfo, initUserInfo } = useUserStore();
  const { feConfigs } = useSystemStore();
  const isSyncMode = getIsMemberSyncMode(feConfigs);

  const { myTeams, onSwitchTeam } = useContextSelector(TeamContext, (v) => v);

  const [status, setStatus] = useState<string | undefined>(TeamMemberStatusEnum.active);

  const statusOptions = [
    { label: t('common:All'), value: undefined },
    { label: t('common:user.team.member.active'), value: TeamMemberStatusEnum.active },
    { label: t('account_team:leave'), value: TeamMemberStatusEnum.leave },
    ...(isSyncMode
      ? [{ label: t('account_team:forbidden'), value: TeamMemberStatusEnum.forbidden }]
      : [])
  ];

  const isWecomTeam = useMemo(() => {
    return !!userInfo?.team?.isWecomTeam;
  }, [userInfo?.team?.isWecomTeam]);

  const {
    isOpen: isOpenTransferModal,
    onOpen: onOpenTransferModal,
    onClose: onCloseTransferModal
  } = useDisclosure();

  // member action
  const [searchKey, setSearchKey] = useState<string>('');
  const {
    data: members = [],
    isLoading: loadingMembers,
    refreshList: refetchMemberList,
    ScrollData: MemberScrollData
  } = useScrollPagination<
    any,
    PaginationResponse<TeamMemberItemType<{ withOrgs: true; withPermission: true }>>
  >(getTeamMembers, {
    pageSize: 20,
    params: {
      status,
      withPermission: true,
      withOrgs: true,
      searchKey
    },
    refreshDeps: [searchKey, status],
    throttleWait: 500,
    debounceWait: 200
  });

  const onRefreshMembers = useCallback(() => {
    refetchMemberList();
  }, [refetchMemberList]);

  // 外层统一显示成员请求 loading，避免滚动容器重复渲染 loading 覆盖层。
  const MemberScrollContainer = useMemo(
    () =>
      function MemberScrollContainer(props: ComponentProps<typeof MemberScrollData>) {
        return <MemberScrollData {...props} showLoadingOverlay={false} />;
      },
    [MemberScrollData]
  );

  const { isOpen: isOpenInvite, onOpen: onOpenInvite, onClose: onCloseInvite } = useDisclosure();

  const { runAsync: onSyncMember, loading: isSyncing } = useRequest(postSyncMembers, {
    onSuccess: onRefreshMembers,
    successToast: t('account_team:sync_member_success'),
    errorToast: t('account_team:sync_member_failed')
  });

  const { runAsync: onLeaveTeam } = useRequest(delLeaveTeam, {
    onSuccess() {
      const defaultTeam = myTeams[0];
      onSwitchTeam(defaultTeam.teamId);
    },
    errorToast: t('account_team:user_team_leave_team_failed')
  });

  const { runAsync: onRemoveMember } = useRequest(delRemoveMember, {
    onSuccess: onRefreshMembers
  });

  const { runAsync: onRestore } = useRequest(postRestoreMember, {
    onSuccess: onRefreshMembers,
    successToast: t('common:Success'),
    errorToast: t('common:user.team.invite.Reject')
  });

  const isLoading = loadingMembers || isSyncing;

  const { EditModal: EditMemberNameModal, onOpenModal: openEditMemberName } = useEditTitle({
    title: t('account_team:edit_member'),
    tip: t('account_team:edit_member_tip'),
    canEmpty: false
  });
  const handleEditMemberName = (tmbId: string, memberName: string) => {
    openEditMemberName({
      defaultVal: memberName,
      onSuccess: (newName: string) => {
        return putUpdateMemberNameByManager(tmbId, newName).then(() => {
          onRefreshMembers();
        });
      },
      onError: (_err) => {
        toast({
          title: '',
          status: 'error'
        });
      }
    });
  };

  return (
    <>
      <Flex
        px={6}
        justify={'space-between'}
        align={['stretch', 'center']}
        flexDirection={['column', 'row']}
        pb={'1rem'}
      >
        <Box w={['100%', 'auto']}>{Tabs}</Box>
        <Flex
          mt={[3, 0]}
          w={['100%', 'auto']}
          flexDirection={['column', 'row']}
          alignItems={['stretch', 'center']}
          gap={2}
        >
          <Flex
            w={['100%', 'auto']}
            flexDirection={['column', 'row']}
            alignItems={'stretch'}
            gap={2}
          >
            <Box w={['100%', '200px']}>
              <SearchInput
                bg={'white'}
                placeholder={t('account_team:search_member')}
                onChange={(e) => setSearchKey(e.target.value)}
              />
            </Box>
            <Box w={['100%', 'auto']}>
              <SingleSelectFilter
                title={t('common:Status')}
                value={status}
                options={statusOptions}
                onChange={setStatus}
              />
            </Box>
          </Flex>
          {userInfo?.team.permission.hasManagePer && isSyncMode && (
            <Button
              w={['100%', 'auto']}
              variant={'primary'}
              size="md"
              borderRadius={'md'}
              leftIcon={<MyIcon name="common/retryLight" w={'16px'} color={'white'} />}
              onClick={() => {
                onSyncMember();
              }}
            >
              {t('account_team:sync_immediately')}
            </Button>
          )}
          {((userInfo?.team.permission.isOwner && !isSyncMode && feConfigs?.teamMode === 'multi') ||
            (userInfo?.team.permission.hasManagePer && !isSyncMode && !isWecomTeam)) && (
            <HStack w={['100%', 'auto']} gap={2}>
              {userInfo?.team.permission.isOwner &&
                !isSyncMode &&
                feConfigs?.teamMode === 'multi' && (
                  <Button
                    w={['100%', 'auto']}
                    flex={['1 1 0', 'initial']}
                    variant={'whitePrimary'}
                    size="md"
                    borderRadius={'md'}
                    onClick={onOpenTransferModal}
                  >
                    {t('account_team:transfer_team_ownership')}
                  </Button>
                )}
              {userInfo?.team.permission.hasManagePer && !isSyncMode && !isWecomTeam && (
                <Button
                  w={['100%', 'auto']}
                  flex={['1 1 0', 'initial']}
                  variant={'primary'}
                  size="md"
                  borderRadius={'md'}
                  leftIcon={<MyIcon name="common/inviteLight" w={'16px'} color={'white'} />}
                  onClick={onOpenInvite}
                >
                  {t('account_team:user_team_invite_member')}
                </Button>
              )}
            </HStack>
          )}
          {userInfo?.team.permission.isOwner && isSyncMode && (
            <Button
              w={['100%', 'auto']}
              variant={'whitePrimary'}
              size="md"
              borderRadius={'md'}
              leftIcon={<MyIcon name="export" w={'16px'} />}
              onClick={() => {
                downloadFetch({
                  url: '/api/proApi/support/user/team/member/export',
                  filename: `${userInfo.team.teamName}-${format(new Date(), 'yyyyMMddHHmmss')}.csv`
                });
              }}
            >
              {t('account_team:export_members')}
            </Button>
          )}
          {!userInfo?.team.permission.isOwner && !isSyncMode && !isWecomTeam && (
            <Box w={['100%', 'auto']}>
              <PopoverConfirm
                Trigger={
                  <Button
                    w={'100%'}
                    variant={'whitePrimary'}
                    size="md"
                    borderRadius={'md'}
                    leftIcon={<MyIcon name={'support/account/loginoutLight'} w={'14px'} />}
                  >
                    {t('account_team:user_team_leave_team')}
                  </Button>
                }
                type="delete"
                content={t('account_team:confirm_leave_team')}
                onConfirm={() => onLeaveTeam()}
              />
            </Box>
          )}
        </Flex>
      </Flex>

      <MyBox isLoading={isLoading} flex={['0 0 auto', '1 0 0']} h={['auto', 0]} minH={0}>
        <FixedTableContainer
          scrollContainer={MemberScrollContainer}
          maxH="none"
          minH={0}
          px={4}
          h={['60dvh', '100%']}
          fontSize={'sm'}
        >
          <Table overflow={'unset'}>
            <Thead>
              <Tr bgColor={'white !important'}>
                <Th borderLeftRadius="6px" bgColor="myGray.100">
                  {t('account_team:user_name')}
                </Th>
                <Th bgColor="myGray.100">{t('common:contact_way')}</Th>
                <Th bgColor="myGray.100" pl={9}>
                  {t('account_team:org')}
                </Th>
                <Th bgColor="myGray.100">{t('account_team:join_update_time')}</Th>
                <Th borderRightRadius="6px" bgColor="myGray.100">
                  {t('common:Action')}
                </Th>
              </Tr>
            </Thead>
            <Tbody>
              {members.map((member) => (
                <Tr key={member.tmbId} overflow={'unset'}>
                  <Td>
                    <HStack>
                      <Avatar src={member.avatar} w={['18px', '22px']} borderRadius={'50%'} />
                      <Box className={'textEllipsis'}>
                        {getTeamMemberDisplayName(member)}
                        {member.status !== 'active' && (
                          <Tag ml="2" colorSchema="gray" bg={'myGray.100'} color={'myGray.700'}>
                            {member.status === 'forbidden'
                              ? t('account_team:forbidden')
                              : t('account_team:leave')}
                          </Tag>
                        )}
                      </Box>
                    </HStack>
                  </Td>
                  <Td maxW={'300px'}>{member.contact || '-'}</Td>
                  <Td maxWidth="300px">
                    {(() => {
                      return <OrgTags orgs={member.orgs || undefined} type="tag" />;
                    })()}
                  </Td>
                  <Td maxW={'300px'}>
                    <VStack gap={0} align="start">
                      <Box>{format(new Date(member.createTime), 'yyyy-MM-dd HH:mm:ss')}</Box>
                      <Box>
                        {member.updateTime
                          ? format(new Date(member.updateTime), 'yyyy-MM-dd HH:mm:ss')
                          : '-'}
                      </Box>
                    </VStack>
                  </Td>
                  <Td>
                    {userInfo?.team.permission.hasManagePer &&
                      member.role !== TeamMemberRoleEnum.owner &&
                      member.tmbId !== userInfo?.team.tmbId &&
                      (member.status === TeamMemberStatusEnum.active ? (
                        <HStack>
                          <MyIconButton
                            icon={'edit'}
                            size="1rem"
                            hoverColor={'blue.500'}
                            onClick={() => handleEditMemberName(member.tmbId, member.memberName)}
                          />
                          <PopoverConfirm
                            Trigger={
                              <Box>
                                <MyIconButton
                                  icon={'common/trash'}
                                  hoverColor={'red.500'}
                                  hoverBg="red.50"
                                  size={'1rem'}
                                />
                              </Box>
                            }
                            type="delete"
                            content={
                              isSyncMode
                                ? t('account_team:forbidden_tip', {
                                    username: getTeamMemberDisplayName(member)
                                  })
                                : t('account_team:remove_tip', {
                                    username: getTeamMemberDisplayName(member)
                                  })
                            }
                            onConfirm={() => onRemoveMember(member.tmbId)}
                          />
                        </HStack>
                      ) : (
                        <PopoverConfirm
                          Trigger={
                            <Box display={'inline-block'}>
                              <MyIconButton
                                icon={'common/confirm/restoreTip'}
                                size={'1rem'}
                                hoverColor={'primary.500'}
                              />
                            </Box>
                          }
                          type="info"
                          content={t('account_team:restore_tip', {
                            username: getTeamMemberDisplayName(member)
                          })}
                          onConfirm={() => onRestore(member.tmbId)}
                        />
                      ))}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          <EditMemberNameModal size="sm" maxLength={20} />
        </FixedTableContainer>
      </MyBox>

      {isOpenInvite && userInfo?.team?.teamId && <InviteModal onClose={onCloseInvite} />}
      {isOpenTransferModal && (
        <TransferOwnershipModal
          onClose={onCloseTransferModal}
          onSuccess={() => {
            onCloseTransferModal();
            initUserInfo();
            refetchMemberList();
          }}
        />
      )}
    </>
  );
}

export default MemberTable;
