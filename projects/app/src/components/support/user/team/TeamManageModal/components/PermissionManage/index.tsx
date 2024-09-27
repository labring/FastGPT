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
import { updateMemberPermission } from '@/web/support/user/team/api';
import { useUserStore } from '@/web/support/user/useUserStore';

import { TeamModalContext } from '../../context';
import MyBox from '@fastgpt/web/components/common/MyBox';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MemberTag from '../../../Info/MemberTag';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import {
  ManagePermissionVal,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';

function PermissionManage() {
  const { t } = useTranslation();
  const { userInfo } = useUserStore();
  const { groups, refetchMembers, refetchGroups, members, clbs, refetchClbs, searchKey } =
    useContextSelector(TeamModalContext, (v) => v);

  const filteredGroups = groups?.filter((group) =>
    group.name.toLowerCase().includes(searchKey.toLowerCase())
  );
  const filteredMembers = members
    ?.filter((member) => member.memberName.toLowerCase().includes(searchKey.toLowerCase()))
    .map((member) => {
      const clb = clbs?.find((clb) => String(clb.tmbId) === String(member.tmbId));
      const permission =
        member.role === 'owner'
          ? new TeamPermission({ isOwner: true })
          : new TeamPermission({ per: clb?.permission });

      return { ...member, permission };
    });

  const { runAsync: onUpdateMemberPermission } = useRequest2(updateMemberPermission, {
    onSuccess: () => {
      refetchGroups();
      refetchMembers();
      refetchClbs();
    }
  });

  const onAddPermission = ({
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
        group.permission = new TeamPermission({ per: group.permission.value });
        switch (per) {
          case 'write':
            group.permission.addPer(WritePermissionVal);
            return onUpdateMemberPermission({
              groupId: group._id,
              permission: group.permission.value
            });
          case 'manage':
            group.permission.addPer(ManagePermissionVal);
            return onUpdateMemberPermission({
              groupId: group._id,
              permission: group.permission.value
            });
        }
      }
    }
    if (memberId) {
      const member = filteredMembers?.find((member) => String(member.tmbId) === memberId);
      console.log(member);
      if (member) {
        const permission = new TeamPermission({ per: member.permission.value });
        switch (per) {
          case 'write':
            permission.addPer(WritePermissionVal);
            return onUpdateMemberPermission({
              memberId: String(member.tmbId),
              permission: permission.value
            });
          case 'manage':
            permission.addPer(ManagePermissionVal);
            return onUpdateMemberPermission({
              memberId: String(member.tmbId),
              permission: permission.value
            });
        }
      }
    }
  };

  const onRemovePermission = ({
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
        group.permission = new TeamPermission({ per: group.permission.value });
        switch (per) {
          case 'write':
            group.permission.removePer(WritePermissionVal);
            return onUpdateMemberPermission({
              groupId: group._id,
              permission: group.permission.value
            });
          case 'manage':
            group.permission.removePer(ManagePermissionVal);
            return onUpdateMemberPermission({
              groupId: group._id,
              permission: group.permission.value
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
            permission.removePer(WritePermissionVal);
            return onUpdateMemberPermission({
              memberId: String(member.tmbId),
              permission: permission.value
            });
          case 'manage':
            permission.removePer(ManagePermissionVal);
            return onUpdateMemberPermission({
              memberId: String(member.tmbId),
              permission: permission.value
            });
        }
      }
    }
  };

  const userManage = userInfo?.permission.hasManagePer;

  return (
    <MyBox h={'100%'} bg={'white'}>
      <TableContainer overflow={'unset'} fontSize={'sm'} mx="6">
        <Table overflow={'unset'}>
          <Thead>
            <Tr bg={'white !important'}>
              <Th bg="myGray.100" borderLeftRadius="6px" maxW={'150px'}>
                {t('user:team.group.group')} / {t('user:team.group.members')}
                <QuestionTip ml="1" label={t('user:team.group.permission_tip')} />
              </Th>
              <Th bg="myGray.100">
                <Box mx="auto" w="fit-content">
                  {t('user:team.group.permission.write')}
                </Box>
              </Th>
              <Th bg="myGray.100" borderRightRadius="6px">
                <Box mx="auto" w="fit-content">
                  {t('user:team.group.permission.manage')}
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
                      isDisabled={!userManage}
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
    </MyBox>
  );
}

export default PermissionManage;
