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
  Text,
  Tr
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import {
  deleteMemberPermission,
  getTeamClbs,
  updateMemberPermission
} from '@/web/support/user/team/api';
import { useUserStore } from '@/web/support/user/useUserStore';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MemberTag from '../../../../../components/support/user/team/Info/MemberTag';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import {
  TeamManagePermissionVal,
  TeamWritePermissionVal
} from '@fastgpt/global/support/permission/user/constant';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import { useCreation, useToggle } from 'ahooks';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import MemberModal from '@/components/support/permission/MemberManager/MemberModal';

function PermissionManage({
  isOpenAddPermission,
  onCloseAddPermission
}: {
  isOpenAddPermission: boolean;
  onCloseAddPermission: () => void;
}) {
  const { t } = useTranslation();
  const { userInfo } = useUserStore();

  const { runAsync: refetchClbs, data: clbs = { tmb: [], group: [], org: [] } } = useRequest2(
    getTeamClbs,
    {
      manual: false,
      refreshDeps: [userInfo?.team?.teamId]
    }
  );

  const [isExpandMember, setExpandMember] = useToggle(true);
  const [isExpandGroup, setExpandGroup] = useToggle(true);
  const [isExpandOrg, setExpandOrg] = useToggle(true);

  const members = useCreation(
    () =>
      clbs.tmb.map((item) => ({
        ...item,
        permission: new TeamPermission({ per: item.permission })
      })),
    [clbs]
  );

  const groups = useCreation(
    () =>
      clbs.group.map((item) => ({
        ...item,
        permission: new TeamPermission({ per: item.permission })
      })),
    [clbs]
  );

  const orgs = useCreation(
    () =>
      clbs.org.map((item) => ({
        ...item,
        permission: new TeamPermission({ per: item.permission })
      })),
    [clbs]
  );

  const { runAsync: onUpdateMemberPermission } = useRequest2(updateMemberPermission, {
    onSuccess: () => {
      refetchClbs();
    }
  });

  const { runAsync: onAddPermission, loading: addLoading } = useRequest2(
    async ({
      orgId,
      groupId,
      memberId,
      per
    }: {
      orgId?: string;
      groupId?: string;
      memberId?: string;
      per: 'write' | 'manage';
    }) => {
      if (groupId) {
        const group = groups?.find((group) => group.groupId === groupId);
        if (group) {
          const permission = new TeamPermission({ per: group.permission.value });
          switch (per) {
            case 'write':
              permission.addPer(TeamWritePermissionVal);
              return onUpdateMemberPermission({
                groupId: group.groupId,
                permission: permission.value
              });
            case 'manage':
              permission.addPer(TeamManagePermissionVal);
              return onUpdateMemberPermission({
                groupId: group.groupId,
                permission: permission.value
              });
          }
        }
      }
      if (orgId) {
        const org = orgs.find((org) => String(org.orgId) === orgId);
        if (org) {
          const permission = new TeamPermission({ per: org.permission.value });
          switch (per) {
            case 'write':
              permission.addPer(TeamWritePermissionVal);
              return onUpdateMemberPermission({
                orgId: org.orgId,
                permission: permission.value
              });
            case 'manage':
              permission.addPer(TeamManagePermissionVal);
              return onUpdateMemberPermission({
                orgId: org.orgId,
                permission: permission.value
              });
          }
        }
      }
      if (memberId) {
        const member = members?.find((member) => member.tmbId === memberId);
        if (member) {
          const permission = new TeamPermission({ per: member.permission.value });
          switch (per) {
            case 'write':
              permission.addPer(TeamWritePermissionVal);
              return onUpdateMemberPermission({
                memberId: member.tmbId,
                permission: permission.value
              });
            case 'manage':
              permission.addPer(TeamManagePermissionVal);
              return onUpdateMemberPermission({
                memberId: member.tmbId,
                permission: permission.value
              });
          }
        }
      }
    }
  );

  const { runAsync: onRemovePermission, loading: removeLoading } = useRequest2(
    async ({
      orgId,
      groupId,
      memberId,
      per
    }: {
      orgId?: string;
      groupId?: string;
      memberId?: string;
      per: 'write' | 'manage';
    }) => {
      if (groupId) {
        const group = groups?.find((group) => group.groupId === groupId);
        if (group) {
          const permission = new TeamPermission({ per: group.permission.value });
          switch (per) {
            case 'write':
              permission.removePer(TeamWritePermissionVal);
              return onUpdateMemberPermission({
                groupId: group.groupId,
                permission: permission.value
              });
            case 'manage':
              permission.removePer(TeamManagePermissionVal);
              return onUpdateMemberPermission({
                groupId: group.groupId,
                permission: permission.value
              });
          }
        }
      }
      if (orgId) {
        const org = orgs.find((org) => String(org.orgId) === orgId);
        if (org) {
          const permission = new TeamPermission({ per: org.permission.value });
          switch (per) {
            case 'write':
              permission.removePer(TeamWritePermissionVal);
              return onUpdateMemberPermission({
                orgId: org.orgId,
                permission: permission.value
              });
            case 'manage':
              permission.removePer(TeamManagePermissionVal);
              return onUpdateMemberPermission({
                orgId: org.orgId,
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

  const { runAsync: onDeleteMemberPermission } = useRequest2(deleteMemberPermission, {
    onSuccess: () => {
      refetchClbs();
    }
  });

  const userManage = userInfo?.permission.hasManagePer;

  return (
    <TableContainer fontSize={'sm'}>
      <Table>
        <Thead>
          <Tr bg={'white !important'}>
            <Th bg="myGray.100" borderLeftRadius="md" maxW={'150px'}>
              {`${t('user:team.group.members')} / ${t('user:team.org.org')} / ${t('user:team.group.group')}`}
              <QuestionTip ml="1" label={t('user:team.group.permission_tip')} />
            </Th>
            <Th bg="myGray.100">
              <Box mx="auto" w="fit-content">
                {t('user:team.group.permission.write')}
              </Box>
            </Th>
            <Th bg="myGray.100">
              <Box mx="auto" w="fit-content">
                {t('user:team.group.permission.manage')}
                <QuestionTip ml="1" label={t('user:team.group.manage_tip')} />
              </Box>
            </Th>
            <Th bg="myGray.100" borderRightRadius="md">
              <Box mx="auto" w="fit-content">
                {t('common:common.Action')}
              </Box>
            </Th>
          </Tr>
        </Thead>
        <Tbody>
          <Tr overflow={'unset'} border="none">
            <HStack paddingX={'8px'} paddingY={'4px'}>
              <MyIconButton
                icon={isExpandMember ? 'common/downArrowFill' : 'common/rightArrowFill'}
                onClick={setExpandMember.toggle}
              />
              <Text>{t('user:team.group.members')}</Text>
            </HStack>
          </Tr>
          {isExpandMember &&
            members.map((member) => (
              <Tr key={member.tmbId} overflow={'unset'} border="none">
                <Td border="none">
                  <HStack>
                    <Avatar src={member.avatar} w="1.5rem" borderRadius={'50%'} />
                    <Box>{member.name}</Box>
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
                {userManage &&
                  !member.permission.isOwner &&
                  userInfo?.team.tmbId !== member.tmbId && (
                    <Td border="none">
                      <Box mx="auto" w="fit-content">
                        <MyIconButton
                          icon="common/trash"
                          onClick={() => onDeleteMemberPermission({ tmbId: String(member.tmbId) })}
                        />
                      </Box>
                    </Td>
                  )}
              </Tr>
            ))}

          <Tr borderBottom={'1px solid'} borderColor={'myGray.200'} />
          <Tr overflow={'unset'} border="none">
            <HStack paddingX={'8px'} paddingY={'4px'}>
              <MyIconButton
                icon={isExpandOrg ? 'common/downArrowFill' : 'common/rightArrowFill'}
                onClick={setExpandOrg.toggle}
              />
              <Text>{t('user:team.org.org')}</Text>
            </HStack>
          </Tr>

          {isExpandOrg &&
            orgs.map((org) => (
              <Tr key={org.orgId} overflow={'unset'} border="none">
                <Td border="none">
                  <MemberTag name={org.name} avatar={org.avatar} />
                </Td>
                <Td border="none">
                  <Box mx="auto" w="fit-content">
                    <Checkbox
                      isDisabled={!userManage}
                      isChecked={org.permission.hasWritePer}
                      onChange={(e) =>
                        e.target.checked
                          ? onAddPermission({ orgId: org.orgId, per: 'write' })
                          : onRemovePermission({ orgId: org.orgId, per: 'write' })
                      }
                    />
                  </Box>
                </Td>
                <Td border="none">
                  <Box mx="auto" w="fit-content">
                    <Checkbox
                      isDisabled={!userInfo?.permission.isOwner}
                      isChecked={org.permission.hasManagePer}
                      onChange={(e) =>
                        e.target.checked
                          ? onAddPermission({ orgId: org.orgId, per: 'manage' })
                          : onRemovePermission({ orgId: org.orgId, per: 'manage' })
                      }
                    />
                  </Box>
                </Td>
                {userInfo?.permission.isOwner && (
                  <Td border="none">
                    <Box mx="auto" w="fit-content">
                      <MyIconButton
                        icon="common/trash"
                        onClick={() => onDeleteMemberPermission({ orgId: org.orgId })}
                      />
                    </Box>
                  </Td>
                )}
              </Tr>
            ))}

          <Tr borderBottom={'1px solid'} borderColor={'myGray.200'} />
          <Tr overflow={'unset'} border="none">
            <HStack paddingX={'8px'} paddingY={'4px'}>
              <MyIconButton
                icon={isExpandGroup ? 'common/downArrowFill' : 'common/rightArrowFill'}
                onClick={setExpandGroup.toggle}
              />
              <Text>{t('user:team.group.group')}</Text>
            </HStack>
          </Tr>

          {isExpandGroup &&
            groups.map((group) => (
              <Tr key={group.groupId} overflow={'unset'} border="none">
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
                          ? onAddPermission({ groupId: group.groupId, per: 'write' })
                          : onRemovePermission({ groupId: group.groupId, per: 'write' })
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
                          ? onAddPermission({ groupId: group.groupId, per: 'manage' })
                          : onRemovePermission({ groupId: group.groupId, per: 'manage' })
                      }
                    />
                  </Box>
                </Td>
                {userInfo?.permission.isOwner && (
                  <Td border="none">
                    <Box mx="auto" w="fit-content">
                      <MyIconButton
                        icon="common/trash"
                        onClick={() => onDeleteMemberPermission({ groupId: group.groupId })}
                      />
                    </Box>
                  </Td>
                )}
              </Tr>
            ))}
        </Tbody>
      </Table>
      {isOpenAddPermission && (
        <MemberModal
          onClose={() => {
            refetchClbs();
            onCloseAddPermission();
          }}
          mode="all"
        />
      )}
    </TableContainer>
  );
}

export default PermissionManage;
