import React from 'react';
import {
  Box,
  Checkbox,
  HStack,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getTeamClbs, updateMemberPermission } from '@/web/support/user/team/api';
import { useUserStore } from '@/web/support/user/useUserStore';

import { TeamModalContext } from '../../context';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MemberTag from '../../../Info/MemberTag';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import {
  TeamManagePermissionVal,
  TeamWritePermissionVal
} from '@fastgpt/global/support/permission/user/constant';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import { useCreation } from 'ahooks';

function PermissionManage() {
  const { t } = useTranslation();
  const { userInfo } = useUserStore();
  const { groups, refetchMembers, refetchGroups, members, searchKey } = useContextSelector(
    TeamModalContext,
    (v) => v
  );

  const { runAsync: refetchClbs, data: clbs = [] } = useRequest2(getTeamClbs, {
    manual: false,
    refreshDeps: [userInfo?.team?.teamId]
  });

  const filteredGroups = useCreation(
    () => groups?.filter((group) => group.name.toLowerCase().includes(searchKey.toLowerCase())),
    [groups, searchKey]
  );
  const filteredMembers = useCreation(
    () =>
      members
        ?.filter((member) => member.memberName.toLowerCase().includes(searchKey.toLowerCase()))
        .map((member) => {
          const clb = clbs?.find((clb) => String(clb.tmbId) === String(member.tmbId));
          const permission =
            member.role === 'owner'
              ? new TeamPermission({ isOwner: true })
              : new TeamPermission({ per: clb?.permission });

          return { ...member, permission };
        }),
    [clbs, members, searchKey]
  );

  const { runAsync: onUpdateMemberPermission } = useRequest2(updateMemberPermission, {
    onSuccess: () => {
      refetchGroups();
      refetchMembers();
      refetchClbs();
    }
  });

  const { runAsync: onAddPermission, loading: addLoading } = useRequest2(
    async ({
      groupId,
      memberId,
      per
    }: {
      groupId?: string;
      memberId?: string;
      per: 'write' | 'manage';
    }) => {
      if (groupId) {
        const group = groups?.find((group) => group._id === groupId);
        if (group) {
          const permission = new TeamPermission({ per: group.permission.value });
          switch (per) {
            case 'write':
              permission.addPer(TeamWritePermissionVal);
              return onUpdateMemberPermission({
                groupId: group._id,
                permission: permission.value
              });
            case 'manage':
              permission.addPer(TeamManagePermissionVal);
              return onUpdateMemberPermission({
                groupId: group._id,
                permission: permission.value
              });
          }
        }
      }
      if (memberId) {
        const member = filteredMembers?.find((member) => String(member.tmbId) === memberId);
        if (member) {
          const permission = new TeamPermission({ per: member.permission.value });
          switch (per) {
            case 'write':
              permission.addPer(TeamWritePermissionVal);
              return onUpdateMemberPermission({
                memberId: String(member.tmbId),
                permission: permission.value
              });
            case 'manage':
              permission.addPer(TeamManagePermissionVal);
              return onUpdateMemberPermission({
                memberId: String(member.tmbId),
                permission: permission.value
              });
          }
        }
      }
    }
  );

  const { runAsync: onRemovePermission, loading: removeLoading } = useRequest2(
    async ({
      groupId,
      memberId,
      per
    }: {
      groupId?: string;
      memberId?: string;
      per: 'write' | 'manage';
    }) => {
      if (groupId) {
        const group = groups?.find((group) => group._id === groupId);
        if (group) {
          const permission = new TeamPermission({ per: group.permission.value });
          switch (per) {
            case 'write':
              permission.removePer(TeamWritePermissionVal);
              return onUpdateMemberPermission({
                groupId: group._id,
                permission: permission.value
              });
            case 'manage':
              permission.removePer(TeamManagePermissionVal);
              return onUpdateMemberPermission({
                groupId: group._id,
                permission: permission.value
              });
          }
        }
      }
      if (memberId) {
        const member = members?.find((member) => String(member.tmbId) === memberId);
        if (member) {
          const permission = new TeamPermission({ per: member.permission.value }); // Hint: member.permission is read-only
          switch (per) {
            case 'write':
              permission.removePer(TeamWritePermissionVal);
              return onUpdateMemberPermission({
                memberId: String(member.tmbId),
                permission: permission.value
              });
            case 'manage':
              permission.removePer(TeamManagePermissionVal);
              return onUpdateMemberPermission({
                memberId: String(member.tmbId),
                permission: permission.value
              });
          }
        }
      }
    }
  );

  const userManage = userInfo?.permission.hasManagePer;

  return (
    <TableContainer fontSize={'sm'} mx="6">
      <Table>
        <Thead>
          <Tr bg={'white !important'}>
            <Th bg="myGray.100" borderLeftRadius="md" maxW={'150px'}>
              {t('user:team.group.group')} / {t('user:team.group.members')}
              <QuestionTip ml="1" label={t('user:team.group.permission_tip')} />
            </Th>
            <Th bg="myGray.100">
              <Box mx="auto" w="fit-content">
                {t('user:team.group.permission.write')}
              </Box>
            </Th>
            <Th bg="myGray.100" borderRightRadius="md">
              <Box mx="auto" w="fit-content">
                {t('user:team.group.permission.manage')}
                <QuestionTip ml="1" label={t('user:team.group.manage_tip')} />
              </Box>
            </Th>
          </Tr>
        </Thead>
        <Tbody>
          {filteredGroups?.map((group) => (
            <Tr key={group._id} overflow={'unset'} border="none">
              <Td border="none">
                <MemberTag
                  name={
                    group.name === DefaultGroupName ? userInfo?.team.teamName ?? '' : group.name
                  }
                  avatar={group.avatar}
                />
              </Td>
              <Td border="none">
                <Box mx="auto" w="fit-content">
                  <Checkbox
                    isDisabled={!userManage}
                    isChecked={group.permission.hasWritePer}
                    onChange={(e) =>
                      e.target.checked
                        ? onAddPermission({ groupId: group._id, per: 'write' })
                        : onRemovePermission({ groupId: group._id, per: 'write' })
                    }
                  />
                </Box>
              </Td>
              <Td border="none">
                <Box mx="auto" w="fit-content">
                  <Checkbox
                    isDisabled={!userInfo?.permission.isOwner}
                    isChecked={group.permission.hasManagePer}
                    onChange={(e) =>
                      e.target.checked
                        ? onAddPermission({ groupId: group._id, per: 'manage' })
                        : onRemovePermission({ groupId: group._id, per: 'manage' })
                    }
                  />
                </Box>
              </Td>
            </Tr>
          ))}
          {filteredGroups?.length > 0 && filteredMembers?.length > 0 && (
            <Tr borderBottom={'1px solid'} borderColor={'myGray.300'} />
          )}
          {filteredMembers?.map((member) => (
            <Tr key={member.tmbId} overflow={'unset'} border="none">
              <Td border="none">
                <HStack>
                  <Avatar src={member.avatar} w="1.5rem" borderRadius={'50%'} />
                  <Box>{member.memberName}</Box>
                </HStack>
              </Td>
              <Td border="none">
                <Box mx="auto" w="fit-content">
                  <Checkbox
                    isDisabled={member.permission.isOwner || !userManage}
                    isChecked={member.permission.hasWritePer}
                    onChange={(e) =>
                      e.target.checked
                        ? onAddPermission({ memberId: String(member.tmbId), per: 'write' })
                        : onRemovePermission({ memberId: String(member.tmbId), per: 'write' })
                    }
                  />
                </Box>
              </Td>
              <Td border="none">
                <Box mx="auto" w="fit-content">
                  <Checkbox
                    isDisabled={member.permission.isOwner || !userInfo?.permission.isOwner}
                    isChecked={member.permission.hasManagePer}
                    onChange={(e) =>
                      e.target.checked
                        ? onAddPermission({ memberId: String(member.tmbId), per: 'manage' })
                        : onRemovePermission({ memberId: String(member.tmbId), per: 'manage' })
                    }
                  />
                </Box>
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </TableContainer>
  );
}

export default PermissionManage;
