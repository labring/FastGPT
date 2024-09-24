import AvatarGroup from '@fastgpt/web/components/common/Avatar/AvatarGroup';
import { Box, HStack, Table, TableContainer, Tbody, Td, Th, Thead, Tr } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useContextSelector } from 'use-context-selector';
import { TeamModalContext } from '../context';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { deleteGroup } from '@/web/support/user/team/group/api';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import MemberTag from '../../Info/MemberTag';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';

function MemberTable({
  onEditGroup,
  onManageMember
}: {
  onEditGroup: (groupId: string) => void;
  onManageMember: (groupId: string) => void;
}) {
  const { t } = useTranslation();
  const { userInfo } = useUserStore();

  const { ConfirmModal: ConfirmDeleteGroupModal, openConfirm: openDeleteGroupModal } = useConfirm({
    type: 'delete',
    content: t('user:team.group.delete_confirm')
  });

  const { groups, refetchGroups, members, refetchMembers } = useContextSelector(
    TeamModalContext,
    (v) => v
  );

  const { runAsync: delDeleteGroup, loading: isLoadingDeleteGroup } = useRequest2(deleteGroup, {
    onSuccess: () => Promise.all([refetchGroups(), refetchMembers()])
  });

  return (
    <MyBox isLoading={isLoadingDeleteGroup}>
      <TableContainer overflow={'unset'} fontSize={'sm'}>
        <Table overflow={'unset'}>
          <Thead bg={'myWhite.400'}>
            <Tr>
              <Th borderRadius={'none !important'}>{t('user:team.group.name')}</Th>
              <Th>{t('user:owner')}</Th>
              <Th>{t('user:team.group.members')}</Th>
              <Th borderRadius={'none !important'}>{t('common:common.Action')}</Th>
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
                        ? group.avatar
                        : members.find((item) => item.role === 'owner')?.avatar ?? ''
                    }
                  />
                </Td>
                <Td>
                  {group.name === DefaultGroupName ? (
                    <AvatarGroup avatars={members.map((v) => v.avatar)} groupId={group._id} />
                  ) : (
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
                  )}
                </Td>
                <Td>
                  {userInfo?.team.permission.hasManagePer && group.name !== DefaultGroupName && (
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
                              icon: 'edit',
                              onClick: () => {
                                onManageMember(group._id);
                              }
                            },
                            {
                              label: t('user:team.group.transfer_owner'),
                              icon: 'edit',
                              onClick: () => {
                                onEditGroup(group._id);
                              }
                            },
                            {
                              label: t('common:common.Delete'),
                              icon: 'delete',
                              type: 'danger',
                              onClick: () => {
                                openDeleteGroupModal(() => delDeleteGroup(group._id))();
                              }
                            }
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
    </MyBox>
  );
}

export default MemberTable;
