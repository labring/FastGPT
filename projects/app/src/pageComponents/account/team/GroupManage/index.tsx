import AvatarGroup from '@fastgpt/web/components/common/Avatar/AvatarGroup';
import {
  Box,
  Button,
  Flex,
  HStack,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  useDisclosure
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useContextSelector } from 'use-context-selector';
import { TeamContext } from '../context';
import MyMenu, { MenuItemType } from '@fastgpt/web/components/common/MyMenu';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { deleteGroup } from '@/web/support/user/team/group/api';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import MemberTag from '../../../../components/support/user/team/Info/MemberTag';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import IconButton from '../OrgManage/IconButton';
import { MemberGroupType } from '@fastgpt/global/support/permission/memberGroup/type';

const ChangeOwnerModal = dynamic(() => import('./GroupTransferOwnerModal'));
const GroupInfoModal = dynamic(() => import('./GroupInfoModal'));
const GroupManageMember = dynamic(() => import('./GroupManageMember'));

function MemberTable({ Tabs }: { Tabs: React.ReactNode }) {
  const { t } = useTranslation();
  const { userInfo } = useUserStore();

  const { groups, refetchGroups, members, refetchMembers } = useContextSelector(
    TeamContext,
    (v) => v
  );

  const [editGroup, setEditGroup] = useState<MemberGroupType>();
  const {
    isOpen: isOpenGroupInfo,
    onOpen: onOpenGroupInfo,
    onClose: onCloseGroupInfo
  } = useDisclosure();

  const onEditGroupInfo = (e: MemberGroupType) => {
    setEditGroup(e);
    onOpenGroupInfo();
  };

  const { ConfirmModal: ConfirmDeleteGroupModal, openConfirm: openDeleteGroupModal } = useConfirm({
    type: 'delete',
    content: t('account_team:confirm_delete_group')
  });

  const { runAsync: delDeleteGroup } = useRequest2(deleteGroup, {
    onSuccess: () => {
      refetchGroups();
      refetchMembers();
    }
  });

  const {
    isOpen: isOpenManageGroupMember,
    onOpen: onOpenManageGroupMember,
    onClose: onCloseManageGroupMember
  } = useDisclosure();
  const onManageMember = (e: MemberGroupType) => {
    setEditGroup(e);
    onOpenManageGroupMember();
  };

  const hasGroupManagePer = (group: (typeof groups)[0]) =>
    userInfo?.team.permission.hasManagePer ||
    ['admin', 'owner'].includes(
      group.members.find((item) => item.tmbId === userInfo?.team.tmbId)?.role ?? ''
    );
  const isGroupOwner = (group: (typeof groups)[0]) =>
    userInfo?.team.permission.hasManagePer ||
    group.members.find((item) => item.role === 'owner')?.tmbId === userInfo?.team.tmbId;

  const {
    isOpen: isOpenChangeOwner,
    onOpen: onOpenChangeOwner,
    onClose: onCloseChangeOwner
  } = useDisclosure();
  const onChangeOwner = (e: MemberGroupType) => {
    setEditGroup(e);
    onOpenChangeOwner();
  };

  return (
    <>
      <Flex justify={'space-between'} align={'center'} pb={'1rem'}>
        {Tabs}
        {userInfo?.team.permission.hasManagePer && (
          <Button
            variant={'primary'}
            size="md"
            borderRadius={'md'}
            ml={3}
            leftIcon={<MyIcon name="support/permission/collaborator" w={'14px'} />}
            onClick={onOpenGroupInfo}
          >
            {t('user:team.group.create')}
          </Button>
        )}
      </Flex>

      <MyBox flex={'1 0 0'} overflow={'auto'}>
        <TableContainer overflow={'unset'} fontSize={'sm'}>
          <Table overflow={'unset'}>
            <Thead>
              <Tr bg={'white !important'}>
                <Th bg="myGray.100" borderLeftRadius="6px">
                  {t('account_team:group_name')}
                </Th>
                <Th bg="myGray.100">{t('account_team:owner')}</Th>
                <Th bg="myGray.100">{t('account_team:member')}</Th>
                <Th bg="myGray.100" borderRightRadius="6px">
                  {t('common:common.Action')}
                </Th>
              </Tr>
            </Thead>
            <Tbody>
              {groups?.map((group) => (
                <Tr key={group._id} overflow={'unset'}>
                  <Td>
                    <HStack>
                      <MemberTag
                        name={
                          group.name === DefaultGroupName
                            ? userInfo?.team.teamName ?? ''
                            : group.name
                        }
                        avatar={group.avatar}
                      />
                      <Box>
                        ({group.name === DefaultGroupName ? members.length : group.members.length})
                      </Box>
                    </HStack>
                  </Td>
                  <Td>
                    <MemberTag
                      name={
                        group.name === DefaultGroupName
                          ? members.find((item) => item.role === 'owner')?.memberName ?? ''
                          : members.find(
                              (item) =>
                                item.tmbId ===
                                group.members.find((item) => item.role === 'owner')?.tmbId
                            )?.memberName ?? ''
                      }
                      avatar={
                        group.name === DefaultGroupName
                          ? members.find((item) => item.role === 'owner')?.avatar ?? ''
                          : members.find(
                              (i) =>
                                i.tmbId ===
                                group.members.find((item) => item.role === 'owner')?.tmbId
                            )?.avatar ?? ''
                      }
                    />
                  </Td>
                  <Td>
                    {group.name === DefaultGroupName ? (
                      <AvatarGroup avatars={members.map((v) => v.avatar)} groupId={group._id} />
                    ) : hasGroupManagePer(group) ? (
                      <MyTooltip label={t('account_team:manage_member')}>
                        <Box cursor="pointer" onClick={() => onManageMember(group)}>
                          <AvatarGroup
                            avatars={group.members.map(
                              (v) => members.find((m) => m.tmbId === v.tmbId)?.avatar ?? ''
                            )}
                            groupId={group._id}
                          />
                        </Box>
                      </MyTooltip>
                    ) : (
                      <AvatarGroup
                        avatars={group.members.map(
                          (v) => members.find((m) => m.tmbId === v.tmbId)?.avatar ?? ''
                        )}
                        groupId={group._id}
                      />
                    )}
                  </Td>
                  <Td>
                    {hasGroupManagePer(group) && group.name !== DefaultGroupName && (
                      <MyMenu
                        Button={<IconButton name={'more'} />}
                        menuList={[
                          {
                            children: [
                              {
                                label: t('account_team:edit_info'),
                                icon: 'edit',
                                onClick: () => {
                                  onEditGroupInfo(group);
                                }
                              },
                              {
                                label: t('account_team:manage_member'),
                                icon: 'support/team/group',
                                onClick: () => {
                                  onManageMember(group);
                                }
                              },
                              ...(isGroupOwner(group)
                                ? [
                                    {
                                      label: t('account_team:transfer_ownership'),
                                      icon: 'modal/changePer',
                                      onClick: () => {
                                        onChangeOwner(group);
                                      },
                                      type: 'primary' as MenuItemType
                                    },
                                    {
                                      label: t('common:common.Delete'),
                                      icon: 'delete',
                                      onClick: () => {
                                        openDeleteGroupModal(() => delDeleteGroup(group._id))();
                                      },
                                      type: 'danger' as MenuItemType
                                    }
                                  ]
                                : [])
                            ]
                          }
                        ]}
                      />
                    )}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableContainer>
      </MyBox>

      <ConfirmDeleteGroupModal />
      {isOpenChangeOwner && editGroup && (
        <ChangeOwnerModal groupId={editGroup._id} onClose={onCloseChangeOwner} />
      )}
      {isOpenGroupInfo && (
        <GroupInfoModal
          onClose={() => {
            onCloseGroupInfo();
            setEditGroup(undefined);
          }}
          editGroupId={editGroup?._id}
        />
      )}
      {isOpenManageGroupMember && editGroup && (
        <GroupManageMember
          onClose={() => {
            onCloseManageGroupMember();
            setEditGroup(undefined);
          }}
          editGroupId={editGroup._id}
        />
      )}
    </>
  );
}

export default MemberTable;
