import React, { useMemo } from 'react';
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
  updateMemberPermission
} from '@/web/support/user/team/api';
import { useUserStore } from '@/web/support/user/useUserStore';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MemberTag from '../../../../components/support/user/team/Info/MemberTag';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import {
  TeamManagePermissionVal,
  TeamPermissionList,
  TeamWritePermissionVal
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
import { CollaboratorItemType } from '@fastgpt/global/support/permission/collaborator';

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
  const onUpdateCollaborators = useContextSelector(
    CollaboratorContext,
    (state) => state.onUpdateCollaborators
  );
  const onDelOneCollaborator = useContextSelector(
    CollaboratorContext,
    (state) => state.onDelOneCollaborator
  );

  const [isExpandMember, setExpandMember] = useToggle(true);
  const [isExpandGroup, setExpandGroup] = useToggle(true);
  const [isExpandOrg, setExpandOrg] = useToggle(true);

  const { tmbList, groupList, orgList } = useMemo(() => {
    const tmbList: CollaboratorItemType[] = [];
    const groupList: CollaboratorItemType[] = [];
    const orgList: CollaboratorItemType[] = [];

    collaboratorList.forEach((item) => {
      if (item.tmbId) {
        tmbList.push(item);
      } else if (item.groupId) {
        groupList.push(item);
      } else if (item.orgId) {
        orgList.push(item);
      }
    });

    return {
      tmbList,
      groupList,
      orgList
    };
  }, [collaboratorList]);

  const { runAsync: onUpdatePermission, loading: addLoading } = useRequest2(
    async ({ id, type, per }: { id: string; type: 'add' | 'remove'; per: 'write' | 'manage' }) => {
      const clb = collaboratorList.find(
        (clb) => clb.tmbId === id || clb.groupId === id || clb.orgId === id
      );

      if (!clb) return;

      const updatePer = per === 'write' ? TeamWritePermissionVal : TeamManagePermissionVal;
      const permission = new TeamPermission({ per: clb.permission.value });
      if (type === 'add') {
        permission.addPer(updatePer);
      } else {
        permission.removePer(updatePer);
      }

      return onUpdateCollaborators({
        ...(clb.tmbId && { members: [clb.tmbId] }),
        ...(clb.groupId && { groups: [clb.groupId] }),
        ...(clb.orgId && { orgs: [clb.orgId] }),
        permission: permission.value
      });
    }
  );

  const { runAsync: onDeleteMemberPermission, loading: deleteLoading } =
    useRequest2(onDelOneCollaborator);

  const userManage = userInfo?.permission.hasManagePer;
  const hasDeletePer = (per: TeamPermission) => {
    if (userInfo?.permission.isOwner) return true;
    if (userManage && !per.hasManagePer) return true;
    return false;
  };

  return (
    <>
      <Flex justify={'space-between'} align={'center'} pb={'1rem'}>
        {Tabs}
        <Box ml="auto">
          {/* <SearchInput
            placeholder={t('user:search_group_org_user')}
            w="200px"
            value={searchKey}
            onChange={(e) => setSearchKey(e.target.value)}
          /> */}
        </Box>
        {userInfo?.team.permission.hasManagePer && (
          <Button
            variant={'primary'}
            size="md"
            borderRadius={'md'}
            ml={3}
            leftIcon={<MyIcon name="common/add2" w={'14px'} />}
            onClick={onOpenAddMember}
          >
            {t('user:permission.Add')}
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
                      <Td>
                        <Box mx="auto" w="fit-content">
                          <Checkbox
                            isDisabled={member.permission.isOwner || !userManage}
                            isChecked={member.permission.hasWritePer}
                            onChange={(e) =>
                              e.target.checked
                                ? onUpdatePermission({
                                    id: member.tmbId!,
                                    type: 'add',
                                    per: 'write'
                                  })
                                : onUpdatePermission({
                                    id: member.tmbId!,
                                    type: 'remove',
                                    per: 'write'
                                  })
                            }
                          />
                        </Box>
                      </Td>
                      <Td>
                        <Box mx="auto" w="fit-content">
                          <Checkbox
                            isDisabled={member.permission.isOwner || !userInfo?.permission.isOwner}
                            isChecked={member.permission.hasManagePer}
                            onChange={(e) =>
                              e.target.checked
                                ? onUpdatePermission({
                                    id: member.tmbId!,
                                    type: 'add',
                                    per: 'manage'
                                  })
                                : onUpdatePermission({
                                    id: member.tmbId!,
                                    type: 'remove',
                                    per: 'manage'
                                  })
                            }
                          />
                        </Box>
                      </Td>
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
                      <Td>
                        <Box mx="auto" w="fit-content">
                          <Checkbox
                            isDisabled={!userManage}
                            isChecked={org.permission.hasWritePer}
                            onChange={(e) =>
                              e.target.checked
                                ? onUpdatePermission({ id: org.orgId!, type: 'add', per: 'write' })
                                : onUpdatePermission({
                                    id: org.orgId!,
                                    type: 'remove',
                                    per: 'write'
                                  })
                            }
                          />
                        </Box>
                      </Td>
                      <Td>
                        <Box mx="auto" w="fit-content">
                          <Checkbox
                            isDisabled={!userInfo?.permission.isOwner}
                            isChecked={org.permission.hasManagePer}
                            onChange={(e) =>
                              e.target.checked
                                ? onUpdatePermission({ id: org.orgId!, type: 'add', per: 'manage' })
                                : onUpdatePermission({
                                    id: org.orgId!,
                                    type: 'remove',
                                    per: 'manage'
                                  })
                            }
                          />
                        </Box>
                      </Td>
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
                      <Td>
                        <Box mx="auto" w="fit-content">
                          <Checkbox
                            isDisabled={!userManage}
                            isChecked={group.permission.hasWritePer}
                            onChange={(e) =>
                              e.target.checked
                                ? onUpdatePermission({
                                    id: group.groupId!,
                                    type: 'add',
                                    per: 'write'
                                  })
                                : onUpdatePermission({
                                    id: group.groupId!,
                                    type: 'remove',
                                    per: 'write'
                                  })
                            }
                          />
                        </Box>
                      </Td>
                      <Td>
                        <Box mx="auto" w="fit-content">
                          <Checkbox
                            isDisabled={!userInfo?.permission.isOwner}
                            isChecked={group.permission.hasManagePer}
                            onChange={(e) =>
                              e.target.checked
                                ? onUpdatePermission({
                                    id: group.groupId!,
                                    type: 'add',
                                    per: 'manage'
                                  })
                                : onUpdatePermission({
                                    id: group.groupId!,
                                    type: 'remove',
                                    per: 'manage'
                                  })
                            }
                          />
                        </Box>
                      </Td>
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
      permission={userInfo?.team.permission}
      permissionList={TeamPermissionList}
      onGetCollaboratorList={getTeamClbs}
      onUpdateCollaborators={updateMemberPermission}
      onDelOneCollaborator={deleteMemberPermission}
      refreshDeps={[userInfo?.team.teamId]}
      addPermissionOnly={true}
    >
      {({ onOpenAddMember }) => <PermissionManage Tabs={Tabs} onOpenAddMember={onOpenAddMember} />}
    </CollaboratorContextProvider>
  ) : null;
};

export default Render;
