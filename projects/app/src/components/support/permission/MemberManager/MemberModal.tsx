import Path from '@/components/common/folder/Path';
import { getTeamMembers } from '@/web/support/user/team/api';
import { getGroupList } from '@/web/support/user/team/group/api';
import useOrg from '@/web/support/user/team/org/hooks/useOrg';
import { useUserStore } from '@/web/support/user/useUserStore';
import { Box, Button, Flex, Grid, HStack, ModalBody, ModalFooter, Tooltip } from '@chakra-ui/react';
import {
  DEFAULT_ORG_AVATAR,
  DEFAULT_TEAM_AVATAR,
  DEFAULT_USER_AVATAR
} from '@fastgpt/global/common/system/constants';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import { type TeamMemberItemType } from '@fastgpt/global/support/user/team/type';
import MyAvatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { useTranslation } from 'next-i18next';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useContextSelector } from 'use-context-selector';
import { CollaboratorContext } from './context';
import MemberItemCard from './MemberItemCard';
import type {
  CollaboratorItemDetailType,
  CollaboratorItemType
} from '@fastgpt/global/support/permission/collaborator';
import type { RoleValueType } from '@fastgpt/global/support/permission/type';
import { Permission } from '@fastgpt/global/support/permission/controller';
import {
  checkRoleUpdateConflict,
  getCollaboratorId
} from '@fastgpt/global/support/permission/utils';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { ManageRoleVal, OwnerRoleVal } from '@fastgpt/global/support/permission/constant';

const HoverBoxStyle = {
  bgColor: 'myGray.50',
  cursor: 'pointer'
};

function MemberModal({
  onClose,
  SelectedTip
}: {
  onClose: () => void;
  SelectedTip?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { userInfo } = useUserStore();
  const collaboratorDetailList = useContextSelector(CollaboratorContext, (v) => v.collaboratorList);
  const isInheritPermission = useContextSelector(CollaboratorContext, (v) => v.isInheritPermission);
  const defaultRole = useContextSelector(CollaboratorContext, (v) => v.defaultRole);
  const [filterClass, setFilterClass] = useState<'member' | 'org' | 'group'>();
  const {
    paths,
    onClickOrg,
    members: orgMembers,
    MemberScrollData: OrgMemberScrollData,
    onPathClick,
    orgs,
    searchKey,
    setSearchKey
  } = useOrg({ withPermission: false });

  const { data: members, ScrollData: TeamMemberScrollData } = useScrollPagination(getTeamMembers, {
    pageSize: 15,
    params: {
      withPermission: true,
      withOrgs: true,
      status: 'active',
      searchKey
    },
    throttleWait: 500,
    debounceWait: 200,
    refreshDeps: [searchKey]
  });

  const { data: groups = [], loading: loadingGroupsAndOrgs } = useRequest2(
    async () => {
      if (!userInfo?.team?.teamId) return [];
      return getGroupList<false>({
        withMembers: false,
        searchKey
      });
    },
    {
      manual: false,
      refreshDeps: [userInfo?.team?.teamId]
    }
  );

  const [editCollaborators, setCollaboratorList] = useState<CollaboratorItemDetailType[]>([]);

  useEffect(() => {
    setCollaboratorList(collaboratorDetailList);
  }, [collaboratorDetailList]);

  const onUpdateCollaborators = useContextSelector(
    CollaboratorContext,
    (v) => v.onUpdateCollaborators
  );

  const parentClbs = useContextSelector(CollaboratorContext, (v) => v.parentClbList);
  const myRole = useContextSelector(CollaboratorContext, (v) => v.myRole);

  const { runAsync: _onConfirm, loading: isUpdating } = useRequest2(
    () =>
      onUpdateCollaborators({
        collaborators: editCollaborators.map(
          (clb) =>
            ({
              tmbId: clb.tmbId,
              groupId: clb.groupId,
              orgId: clb.orgId,
              permission: clb.permission.role
            }) as CollaboratorItemType
        )
      }),
    {
      successToast: t('common:add_success'),
      onSuccess() {
        onClose();
      }
    }
  );

  const { openConfirm: openConfirmDisableInheritPer, ConfirmModal: ConfirmDisableInheritPer } =
    useConfirm({
      content: t('common:permission.Remove InheritPermission Confirm')
    });

  const onConfirm = useCallback(() => {
    const _parentClbs = parentClbs.map((clb) => ({
      ...clb,
      permission: clb.permission.role === OwnerRoleVal ? ManageRoleVal : clb.permission.role
    }));

    const newChildClbs = editCollaborators.map((clb) => ({
      ...clb,
      permission: clb.permission.role
    }));

    const isConflict = checkRoleUpdateConflict({
      parentClbs: _parentClbs,
      newChildClbs
    });
    if (isConflict && isInheritPermission) {
      return openConfirmDisableInheritPer({ onConfirm: _onConfirm })();
    } else {
      return _onConfirm();
    }
  }, [
    _onConfirm,
    editCollaborators,
    isInheritPermission,
    openConfirmDisableInheritPer,
    parentClbs
  ]);

  const entryList = useRef([
    { label: t('user:team.group.members'), icon: DEFAULT_USER_AVATAR, value: 'member' },
    { label: t('user:team.org.org'), icon: DEFAULT_ORG_AVATAR, value: 'org' },
    { label: t('user:team.group.group'), icon: DEFAULT_TEAM_AVATAR, value: 'group' }
  ]);

  const memberWithPer = useMemo(() => {
    const map = new Map(collaboratorDetailList.map((clb) => [getCollaboratorId(clb), { ...clb }]));
    return members.map((member) => {
      const clb = map.get(getCollaboratorId(member));
      return {
        ...member,
        permission: new Permission({
          role: clb?.permission.role
        })
      };
    });
  }, [collaboratorDetailList, members]);

  const orgMembersWithPer = useMemo(() => {
    const map = new Map(collaboratorDetailList.map((clb) => [getCollaboratorId(clb), { ...clb }]));
    return orgMembers.map((member) => {
      const clb = map.get(getCollaboratorId(member));
      return {
        ...member,
        permission: new Permission({
          role: clb?.permission.role
        })
      };
    });
  }, [collaboratorDetailList, orgMembers]);

  return (
    <>
      <MyModal
        isOpen
        onClose={onClose}
        iconSrc={'common/settingLight'}
        title={t('user:team.manage_collaborators')}
        minW="900px"
        maxW={'60vw'}
        h={'100%'}
        isCentered
        isLoading={loadingGroupsAndOrgs}
      >
        <ModalBody flex={'1'}>
          <Grid
            border="1px solid"
            borderColor="myGray.200"
            borderRadius="0.5rem"
            gridTemplateColumns="40% 60%"
            h={'100%'}
          >
            <Flex
              h={'100%'}
              flexDirection="column"
              borderRight="1px solid"
              borderColor="myGray.200"
              py="2"
            >
              <Box px={2}>
                <SearchInput
                  placeholder={t('user:search_group_org_user')}
                  bgColor="myGray.50"
                  onChange={(e) => setSearchKey(e.target.value)}
                />
              </Box>

              <Flex flexDirection="column" mt="3" overflow={'auto'} flex={'1 0 0'} h={0}>
                {/* Entry */}
                {!searchKey && !filterClass && (
                  <Box px={2}>
                    {entryList.current.map((item) => {
                      return (
                        <HStack
                          key={item.value}
                          justifyContent="space-between"
                          py="2"
                          px="3"
                          borderRadius="sm"
                          alignItems="center"
                          _hover={HoverBoxStyle}
                          _notLast={{ mb: 1 }}
                          onClick={() => setFilterClass(item.value as any)}
                        >
                          <MyAvatar src={item.icon} w="1.5rem" borderRadius={'50%'} />
                          <Box ml="2" w="full">
                            {item.label}
                          </Box>
                          <MyIcon name="core/chat/chevronRight" w="16px" />
                        </HStack>
                      );
                    })}
                  </Box>
                )}

                {/* Path */}
                {!searchKey && filterClass && (
                  <Box mb={1} px={2}>
                    <Path
                      paths={[
                        {
                          parentId: filterClass,
                          parentName:
                            filterClass === 'member'
                              ? t('user:team.group.members')
                              : filterClass === 'org'
                                ? t('user:team.org.org')
                                : t('user:team.group.group')
                        },
                        ...paths
                      ]}
                      onClick={(parentId) => {
                        if (parentId === '') {
                          setFilterClass(undefined);
                          onPathClick('');
                        } else if (
                          parentId === 'member' ||
                          parentId === 'org' ||
                          parentId === 'group'
                        ) {
                          setFilterClass(parentId);
                          onPathClick('');
                        } else {
                          onPathClick(parentId);
                        }
                      }}
                      rootName={t('common:Team')}
                    />
                  </Box>
                )}
                {(filterClass === 'member' || searchKey) &&
                  (() => {
                    const MemberList = (
                      <RenderMemberList
                        members={memberWithPer}
                        setCollaboratorList={setCollaboratorList}
                        editCollaborators={editCollaborators}
                        defaultRole={defaultRole}
                      />
                    );
                    return searchKey ? (
                      <Box px={2}>{MemberList}</Box>
                    ) : (
                      <TeamMemberScrollData
                        flexDirection={'column'}
                        gap={1}
                        userSelect={'none'}
                        height={'fit-content'}
                        px={2}
                      >
                        {MemberList}
                      </TeamMemberScrollData>
                    );
                  })()}
                {(filterClass === 'org' || searchKey) &&
                  (() => {
                    const Orgs = orgs?.map((org) => {
                      const addTheOrg = () => {
                        setCollaboratorList((state) => {
                          if (state.find((v) => v.orgId === org._id)) {
                            return state.filter((v) => v.orgId !== org._id);
                          }
                          return [
                            ...state,
                            {
                              ...org,
                              orgId: org._id,
                              permission: new Permission({ role: defaultRole })
                            }
                          ];
                        });
                      };
                      const isChecked = !!editCollaborators.find((v) => v.orgId === org._id);
                      return (
                        <MemberItemCard
                          avatar={org.avatar}
                          key={org._id}
                          name={org.name}
                          onChange={addTheOrg}
                          isChecked={isChecked}
                          rightSlot={
                            org.total && (
                              <MyIcon
                                name="core/chat/chevronRight"
                                w="16px"
                                p="4px"
                                rounded={'6px'}
                                _hover={{
                                  bgColor: 'myGray.200'
                                }}
                                onClick={(e) => {
                                  onClickOrg(org);
                                  e.stopPropagation();
                                }}
                              />
                            )
                          }
                        />
                      );
                    });
                    return searchKey ? (
                      <Box px={2}>{Orgs}</Box>
                    ) : (
                      <OrgMemberScrollData px={2}>
                        {Orgs}
                        <RenderMemberList
                          members={orgMembersWithPer}
                          setCollaboratorList={setCollaboratorList}
                          editCollaborators={editCollaborators}
                          defaultRole={defaultRole}
                        />
                      </OrgMemberScrollData>
                    );
                  })()}
                {(filterClass === 'group' || searchKey) && (
                  <Box
                    {...(searchKey
                      ? {}
                      : {
                          flex: '1 0 0',
                          overflow: 'auto'
                        })}
                    px={2}
                  >
                    {groups?.map((group) => {
                      const addGroup = () => {
                        setCollaboratorList((state) => {
                          if (state.find((v) => v.groupId === group._id)) {
                            return state.filter((v) => v.groupId !== group._id);
                          }
                          return [
                            ...state,
                            {
                              ...group,
                              groupId: group._id,
                              permission: new Permission({ role: defaultRole })
                            }
                          ];
                        });
                      };
                      const isChecked = !!editCollaborators.find((v) => v.groupId === group._id);
                      return (
                        <MemberItemCard
                          avatar={group.avatar}
                          key={group._id}
                          name={
                            group.name === DefaultGroupName
                              ? userInfo?.team.teamName ?? ''
                              : group.name
                          }
                          onChange={addGroup}
                          isChecked={isChecked}
                        />
                      );
                    })}
                  </Box>
                )}
              </Flex>
            </Flex>

            <Flex h={'100%'} flexDirection="column" overflow={'auto'} p="2">
              <Flex alignItems={'center'} mt={2} mb={3}>
                <Box>{`${t('common:chosen')}: ${editCollaborators.length}`}</Box>
                {SelectedTip ? <Box ml={1}>{SelectedTip}</Box> : null}
              </Flex>
              <Flex flexDirection="column" gap={1} flex={'1 0 0'} h={0}>
                {editCollaborators.map((clb) => {
                  const onDelete = () => {
                    setCollaboratorList((state) => {
                      return state.filter((v) => getCollaboratorId(v) !== getCollaboratorId(clb));
                    });
                  };
                  const onRoleChange = (role: RoleValueType) => {
                    setCollaboratorList((state) => {
                      const index = state.findIndex(
                        (v) => getCollaboratorId(v) === getCollaboratorId(clb)
                      );
                      if (index === -1) return state;
                      return [
                        ...state.slice(0, index),
                        {
                          ...state[index],
                          permission: new Permission({ role })
                        },
                        ...state.slice(index + 1)
                      ];
                    });
                  };
                  return (
                    <MemberItemCard
                      key={'chosen-' + getCollaboratorId(clb)}
                      avatar={clb.avatar}
                      name={clb.name ?? ''}
                      onDelete={onDelete}
                      role={clb.permission.role}
                      onRoleChange={onRoleChange}
                      disabled={
                        clb.permission.role === OwnerRoleVal ||
                        clb.tmbId === userInfo?.team.tmbId ||
                        (clb.permission.hasManagePer && !myRole.isOwner)
                      }
                    />
                  );
                })}
              </Flex>
            </Flex>
          </Grid>
        </ModalBody>
        <ModalFooter>
          <Button isLoading={isUpdating} ml="4" h={'32px'} onClick={onConfirm}>
            {t('common:Confirm')}
          </Button>
        </ModalFooter>
      </MyModal>
      <ConfirmDisableInheritPer />
    </>
  );
}

export default MemberModal;

const RenderMemberList = ({
  members,
  setCollaboratorList,
  editCollaborators,
  defaultRole
}: {
  members: Array<Omit<TeamMemberItemType, 'permission'> & { permission: Permission }>;
  setCollaboratorList: React.Dispatch<React.SetStateAction<CollaboratorItemDetailType[]>>;
  editCollaborators: CollaboratorItemDetailType[];
  defaultRole: RoleValueType;
}) => {
  const { userInfo } = useUserStore();
  const myRole = useContextSelector(CollaboratorContext, (v) => v.myRole);

  return (
    <>
      {members?.map((member) => {
        const addTheMember = () => {
          setCollaboratorList((state) => {
            if (state.find((v) => v.tmbId === member.tmbId)) {
              return state.filter((v) => v.tmbId !== member.tmbId);
            }
            return [
              ...state,
              {
                tmbId: member.tmbId,
                avatar: member.avatar,
                name: member.memberName,
                teamId: member.teamId,
                permission: new Permission({ role: defaultRole })
              }
            ];
          });
        };
        const isChecked = !!editCollaborators.find((v) => v.tmbId === member.tmbId);
        return (
          <MemberItemCard
            role={member.permission.role}
            avatar={member.avatar}
            key={member.tmbId}
            name={member.memberName}
            onChange={addTheMember}
            isChecked={isChecked}
            orgs={member.orgs}
            disabled={
              member.permission.role === OwnerRoleVal ||
              member.tmbId === userInfo?.team.tmbId ||
              (member.permission.hasManagePer && !myRole.isOwner)
            }
          />
        );
      })}
    </>
  );
};
