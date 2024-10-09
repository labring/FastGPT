import AvatarGroup from '@fastgpt/web/components/common/Avatar/AvatarGroup';
import {
  Box,
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
import { TeamModalContext } from '../../context';
import MyMenu, { MenuItemType } from '@fastgpt/web/components/common/MyMenu';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { deleteGroup } from '@/web/support/user/team/group/api';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import MemberTag from '../../../Info/MemberTag';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import dynamic from 'next/dynamic';
import { useState } from 'react';

const ChangeOwnerModal = dynamic(() => import('./GroupTransferOwnerModal'));

function MemberTable({
  onEditGroup,
  onManageMember
}: {
  onEditGroup: (groupId: string) => void;
  onManageMember: (groupId: string) => void;
}) {
  const { t } = useTranslation();
  const { userInfo } = useUserStore();
  const [editGroupId, setEditGroupId] = useState<string>();

  const { ConfirmModal: ConfirmDeleteGroupModal, openConfirm: openDeleteGroupModal } = useConfirm({
    type: 'delete',
    content: t('user:team.group.delete_confirm')
  });

  const { groups, refetchGroups, members, refetchMembers } = useContextSelector(
    TeamModalContext,
    (v) => v
  );

  const { runAsync: delDeleteGroup } = useRequest2(deleteGroup, {
    onSuccess: () => {
      refetchGroups();
      refetchMembers();
    }
  });

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

  const onChangeOwner = (groupId: string) => {
    setEditGroupId(groupId);
    onOpenChangeOwner();
  };

  return (
    <MyBox>
      <TableContainer overflow={'unset'} fontSize={'sm'} mx="6">
        <Table overflow={'unset'}>
          <Thead>
            <Tr bg={'white !important'}>
              <Th bg="myGray.100" borderLeftRadius="6px">
                {t('user:team.group.name')}
              </Th>
              <Th bg="myGray.100">{t('user:owner')}</Th>
              <Th bg="myGray.100">{t('user:team.group.members')}</Th>
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
                        group.name === DefaultGroupName ? userInfo?.team.teamName ?? '' : group.name
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
                              i.tmbId === group.members.find((item) => item.role === 'owner')?.tmbId
                          )?.avatar ?? ''
                    }
                  />
                </Td>
                <Td>
                  {group.name === DefaultGroupName ? (
                    <AvatarGroup avatars={members.map((v) => v.avatar)} groupId={group._id} />
                  ) : hasGroupManagePer(group) ? (
                    <MyTooltip label={t('user:team.group.manage_member')}>
                      <Box cursor="pointer" onClick={() => onManageMember(group._id)}>
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
                      Button={<MyIcon name={'edit'} cursor={'pointer'} w="1rem" />}
                      menuList={[
                        {
                          children: [
                            {
                              label: t('user:team.group.edit_info'),
                              icon: 'edit',
                              onClick: () => {
                                onEditGroup(group._id);
                              }
                            },
                            {
                              label: t('user:team.group.manage_member'),
                              icon: 'support/team/group',
                              onClick: () => {
                                onManageMember(group._id);
                              }
                            },
                            ...(isGroupOwner(group)
                              ? [
                                  {
                                    label: t('user:team.group.transfer_owner'),
                                    icon: 'modal/changePer',
                                    onClick: () => {
                                      onChangeOwner(group._id);
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
      <ConfirmDeleteGroupModal />
      {isOpenChangeOwner && editGroupId && (
        <ChangeOwnerModal groupId={editGroupId} onClose={onCloseChangeOwner} />
      )}
    </MyBox>
  );
}

export default MemberTable;
