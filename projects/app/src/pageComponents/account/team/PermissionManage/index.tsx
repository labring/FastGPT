import React, { useMemo, useState } from 'react';
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
  Tr,
  Flex,
  Button
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import {
  deleteMemberPermission,
  getTeamClbs,
  updateMemberPermission,
  updateOneMemberPermission
} from '@/web/support/user/team/api';
import { useUserStore } from '@/web/support/user/useUserStore';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MemberTag from '../../../../components/support/user/team/Info/MemberTag';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import {
  TeamApikeyCreatePermissionVal,
  TeamApikeyCreateRoleVal,
  TeamAppCreatePermissionVal,
  TeamAppCreateRoleVal,
  TeamDatasetCreatePermissionVal,
  TeamDatasetCreateRoleVal,
  TeamManagePermissionVal,
  TeamManageRoleVal,
  TeamRoleList
} from '@fastgpt/global/support/permission/user/constant';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import { useToggle } from 'ahooks';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import MyBox from '@fastgpt/web/components/common/MyBox';
import CollaboratorContextProvider, {
  CollaboratorContext
} from '@/components/support/permission/MemberManager/context';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useContextSelector } from 'use-context-selector';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import { GetSearchUserGroupOrg } from '@/web/support/user/api';
import { type PermissionValueType } from '@fastgpt/global/support/permission/type';
import { type CollaboratorItemType } from '@fastgpt/global/support/permission/collaborator';
import type { Permission } from '@fastgpt/global/support/permission/controller';
import { ReadRoleVal } from '@fastgpt/global/support/permission/constant';

function PermissionManage({
  Tabs,
  onOpenAddMember
}: {
  Tabs: React.ReactNode;
  onOpenAddMember: () => void;
}) {
  const { t } = useTranslation();
  const { userInfo } = useUserStore();

  const collaboratorList = useContextSelector(
    CollaboratorContext,
    (state) => state.collaboratorList
  );
  const onDelOneCollaborator = useContextSelector(
    CollaboratorContext,
    (state) => state.onDelOneCollaborator
  );
  const refetchCollaborators = useContextSelector(
    CollaboratorContext,
    (state) => state.refetchCollaboratorList
  );

  const [isExpandMember, setExpandMember] = useToggle(true);
  const [isExpandGroup, setExpandGroup] = useToggle(true);
  const [isExpandOrg, setExpandOrg] = useToggle(true);

  const [searchKey, setSearchKey] = useState('');

  const { data: searchResult } = useRequest2(() => GetSearchUserGroupOrg(searchKey), {
    manual: false,
    throttleWait: 500,
    debounceWait: 200,
    refreshDeps: [searchKey]
  });

  const { tmbList, groupList, orgList } = useMemo(() => {
    const tmbList = collaboratorList.filter(
      (item) =>
        Object.keys(item).includes('tmbId') &&
        (!searchKey || searchResult?.members.find((member) => member.tmbId === item.tmbId))
    );
    const groupList = collaboratorList.filter(
      (item) =>
        Object.keys(item).includes('groupId') &&
        (!searchKey || searchResult?.groups.find((group) => group._id === item.groupId))
    );
    const orgList = collaboratorList.filter(
      (item) =>
        Object.keys(item).includes('orgId') &&
        (!searchKey || searchResult?.orgs.find((org) => org._id === item.orgId))
    );

    return {
      tmbList,
      groupList,
      orgList
    };
  }, [collaboratorList, searchResult, searchKey]);

  const { runAsync: onUpdatePermission, loading: addLoading } = useRequest2(
    async ({ id, type, per }: { id: string; type: 'add' | 'remove'; per: PermissionValueType }) => {
      const clb = collaboratorList.find(
        (clb) => clb.tmbId === id || clb.groupId === id || clb.orgId === id
      );

      if (!clb) return;

      const permission = new TeamPermission({ role: clb.permission.role });
      if (type === 'add') {
        permission.addRole(per);
      } else {
        permission.removeRole(per);
      }

      return updateOneMemberPermission({
        tmbId: clb.tmbId,
        groupId: clb.groupId,
        orgId: clb.orgId,
        permission: permission.role
      });
    },
    {
      onSuccess: refetchCollaborators
    }
  );

  const { runAsync: onDeleteMemberPermission, loading: deleteLoading } = useRequest2(
    async (props) => {
      if (onDelOneCollaborator) {
        return await onDelOneCollaborator(props);
      }
      return Promise.resolve();
    }
  );

  const userManage = userInfo?.permission.hasManagePer;
  const hasDeletePer = (per: Permission) => {
    if (userInfo?.permission.isOwner) return true;
    if (userManage && !per.hasManagePer) return true;
    return false;
  };

  function PermissionCheckBox({
    isDisabled,
    role,
    clbPer,
    id
  }: {
    isDisabled: boolean;
    role: PermissionValueType;
    clbPer: Permission;
    id: string;
  }) {
    return (
      <Td>
        <Box mx="auto" w="fit-content">
          <Checkbox
            isDisabled={isDisabled}
            isChecked={clbPer.checkRole(role)}
            onChange={(e) =>
              e.target.checked
                ? onUpdatePermission({
                    id,
                    type: 'add',
                    per: role
                  })
                : onUpdatePermission({
                    id,
                    type: 'remove',
                    per: role
                  })
            }
          />
        </Box>
      </Td>
    );
  }

  return (
    <>
      <Flex justify={'space-between'} align={'center'} pb={'1rem'}>
        {Tabs}
        <Box ml="auto">
          <SearchInput
            placeholder={t('user:search_group_org_user')}
            w="200px"
            value={searchKey}
            onChange={(e) => setSearchKey(e.target.value)}
          />
        </Box>
        {userInfo?.team.permission.hasManagePer && (
          <Button
            variant={'primary'}
            size="md"
            borderRadius={'md'}
            ml={3}
            onClick={onOpenAddMember}
          >
            {t('account_team:manage_per')}
          </Button>
        )}
      </Flex>
      <MyBox isLoading={addLoading || deleteLoading}>
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
                    {t('account_team:permission_appCreate')}
                    <QuestionTip ml="1" label={t('account_team:permission_appCreate_tip')} />
                  </Box>
                </Th>
                <Th bg="myGray.100">
                  <Box mx="auto" w="fit-content">
                    {t('account_team:permission_datasetCreate')}
                    <QuestionTip ml="1" label={t('account_team:permission_datasetCreate_Tip')} />
                  </Box>
                </Th>
                <Th bg="myGray.100">
                  <Box mx="auto" w="fit-content">
                    {t('account_team:permission_apikeyCreate')}
                    <QuestionTip ml="1" label={t('account_team:permission_apikeyCreate_Tip')} />
                  </Box>
                </Th>
                <Th bg="myGray.100">
                  <Box mx="auto" w="fit-content">
                    {t('account_team:permission_manage')}
                    <QuestionTip ml="1" label={t('account_team:permission_manage_tip')} />
                  </Box>
                </Th>
                <Th bg="myGray.100" borderRightRadius="md">
                  <Box mx="auto" w="fit-content">
                    {t('common:Action')}
                  </Box>
                </Th>
              </Tr>
            </Thead>
            <Tbody>
              <>
                <Tr userSelect={'none'}>
                  <HStack pl={3} pt={3} pb={isExpandMember && !!tmbList.length ? 0 : 3}>
                    <MyIconButton
                      icon={isExpandMember ? 'common/downArrowFill' : 'common/rightArrowFill'}
                      onClick={setExpandMember.toggle}
                    />
                    <Box color={'myGray.900'}>{t('user:team.group.members')}</Box>
                  </HStack>
                </Tr>
                {isExpandMember &&
                  tmbList.map((member) => (
                    <Tr key={member.tmbId}>
                      <Td pl={10}>
                        <HStack>
                          <Avatar src={member.avatar} w="1.5rem" borderRadius={'50%'} />
                          <Box>{member.name}</Box>
                        </HStack>
                      </Td>
                      <PermissionCheckBox
                        isDisabled={member.permission.hasManagePer && !userInfo?.permission.isOwner}
                        role={TeamAppCreateRoleVal}
                        clbPer={member.permission}
                        id={member.tmbId!}
                      />
                      <PermissionCheckBox
                        isDisabled={member.permission.hasManagePer && !userInfo?.permission.isOwner}
                        role={TeamDatasetCreateRoleVal}
                        clbPer={member.permission}
                        id={member.tmbId!}
                      />
                      <PermissionCheckBox
                        isDisabled={member.permission.hasManagePer && !userInfo?.permission.isOwner}
                        role={TeamApikeyCreateRoleVal}
                        clbPer={member.permission}
                        id={member.tmbId!}
                      />
                      <PermissionCheckBox
                        isDisabled={!userInfo?.permission.isOwner}
                        role={TeamManageRoleVal}
                        clbPer={member.permission}
                        id={member.tmbId!}
                      />
                      <Td>
                        {hasDeletePer(member.permission) &&
                          userInfo?.team.tmbId !== member.tmbId && (
                            <Box mx="auto" w="fit-content">
                              <MyIconButton
                                icon="common/trash"
                                onClick={() =>
                                  onDeleteMemberPermission({ tmbId: String(member.tmbId) })
                                }
                              />
                            </Box>
                          )}
                      </Td>
                    </Tr>
                  ))}
              </>
              <>
                <Tr borderBottom={'1px solid'} borderColor={'myGray.200'} />
                <Tr userSelect={'none'}>
                  <HStack pl={3} pt={3} pb={isExpandOrg && !!orgList.length ? 0 : 3}>
                    <MyIconButton
                      icon={isExpandOrg ? 'common/downArrowFill' : 'common/rightArrowFill'}
                      onClick={setExpandOrg.toggle}
                    />
                    <Text>{t('user:team.org.org')}</Text>
                  </HStack>
                </Tr>
                {isExpandOrg &&
                  orgList.map((org) => (
                    <Tr key={org.orgId}>
                      <Td pl={10}>
                        <MemberTag name={org.name} avatar={org.avatar} />
                      </Td>
                      <PermissionCheckBox
                        isDisabled={org.permission.isOwner || !userManage}
                        role={TeamAppCreatePermissionVal}
                        clbPer={org.permission}
                        id={org.orgId!}
                      />
                      <PermissionCheckBox
                        isDisabled={org.permission.isOwner || !userManage}
                        role={TeamDatasetCreatePermissionVal}
                        clbPer={org.permission}
                        id={org.orgId!}
                      />
                      <PermissionCheckBox
                        isDisabled={org.permission.isOwner || !userManage}
                        role={TeamApikeyCreatePermissionVal}
                        clbPer={org.permission}
                        id={org.orgId!}
                      />
                      <PermissionCheckBox
                        isDisabled={org.permission.isOwner || !userInfo?.permission.isOwner}
                        role={TeamManagePermissionVal}
                        clbPer={org.permission}
                        id={org.orgId!}
                      />
                      <Td>
                        {hasDeletePer(org.permission) && (
                          <Box mx="auto" w="fit-content">
                            <MyIconButton
                              icon="common/trash"
                              onClick={() => onDeleteMemberPermission({ orgId: org.orgId! })}
                            />
                          </Box>
                        )}
                      </Td>
                    </Tr>
                  ))}
              </>

              <>
                <Tr borderBottom={'1px solid'} borderColor={'myGray.200'} />
                <Tr userSelect={'none'}>
                  <HStack pl={3} pt={3} pb={isExpandGroup && !!groupList.length ? 0 : 3}>
                    <MyIconButton
                      icon={isExpandGroup ? 'common/downArrowFill' : 'common/rightArrowFill'}
                      onClick={setExpandGroup.toggle}
                    />
                    <Text>{t('user:team.group.group')}</Text>
                  </HStack>
                </Tr>
                {isExpandGroup &&
                  groupList.map((group) => (
                    <Tr key={group.groupId}>
                      <Td pl={10}>
                        <MemberTag
                          name={
                            group.name === DefaultGroupName
                              ? userInfo?.team.teamName ?? ''
                              : group.name
                          }
                          avatar={group.avatar}
                        />
                      </Td>
                      <PermissionCheckBox
                        isDisabled={group.permission.isOwner || !userManage}
                        role={TeamAppCreatePermissionVal}
                        clbPer={group.permission}
                        id={group.groupId!}
                      />
                      <PermissionCheckBox
                        isDisabled={group.permission.isOwner || !userManage}
                        role={TeamDatasetCreatePermissionVal}
                        clbPer={group.permission}
                        id={group.groupId!}
                      />
                      <PermissionCheckBox
                        isDisabled={group.permission.isOwner || !userManage}
                        role={TeamApikeyCreatePermissionVal}
                        clbPer={group.permission}
                        id={group.groupId!}
                      />
                      <PermissionCheckBox
                        isDisabled={group.permission.isOwner || !userInfo?.permission.isOwner}
                        role={TeamManagePermissionVal}
                        clbPer={group.permission}
                        id={group.groupId!}
                      />
                      <Td>
                        {hasDeletePer(group.permission) && (
                          <Box mx="auto" w="fit-content">
                            <MyIconButton
                              icon="common/trash"
                              onClick={() => onDeleteMemberPermission({ groupId: group.groupId! })}
                            />
                          </Box>
                        )}
                      </Td>
                    </Tr>
                  ))}
              </>
            </Tbody>
          </Table>
        </TableContainer>
      </MyBox>
    </>
  );
}

export const Render = ({ Tabs }: { Tabs: React.ReactNode }) => {
  const { userInfo } = useUserStore();

  return userInfo?.team ? (
    <CollaboratorContextProvider
      defaultRole={ReadRoleVal}
      permission={userInfo?.team.permission}
      roleList={TeamRoleList}
      onGetCollaboratorList={getTeamClbs}
      onUpdateCollaborators={updateMemberPermission}
      onDelOneCollaborator={deleteMemberPermission}
      refreshDeps={[userInfo?.team.teamId]}
      addPermissionOnly={true}
    >
      {({ onOpenManageModal }) => (
        <PermissionManage Tabs={Tabs} onOpenAddMember={onOpenManageModal} />
      )}
    </CollaboratorContextProvider>
  ) : null;
};

export default Render;
