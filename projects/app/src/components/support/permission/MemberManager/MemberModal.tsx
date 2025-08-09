import Path from '@/components/common/folder/Path';
import { getTeamMembers } from '@/web/support/user/team/api';
import { getGroupList } from '@/web/support/user/team/group/api';
import useOrg from '@/web/support/user/team/org/hooks/useOrg';
import { useUserStore } from '@/web/support/user/useUserStore';
import { ChevronDownIcon } from '@chakra-ui/icons';
import { Box, Button, Flex, Grid, HStack, ModalBody, ModalFooter, Text } from '@chakra-ui/react';
import {
  DEFAULT_ORG_AVATAR,
  DEFAULT_TEAM_AVATAR,
  DEFAULT_USER_AVATAR
} from '@fastgpt/global/common/system/constants';
import { type UpdateClbPermissionProps } from '@fastgpt/global/support/permission/collaborator';
import { type MemberGroupListItemType } from '@fastgpt/global/support/permission/memberGroup/type';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import { type OrgListItemType } from '@fastgpt/global/support/user/team/org/type';
import { type TeamMemberItemType } from '@fastgpt/global/support/user/team/type';
import MyAvatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { useTranslation } from 'next-i18next';
import { type ValueOf } from 'next/dist/shared/lib/constants';
import { useMemo, useRef, useState } from 'react';
import { useContextSelector } from 'use-context-selector';
import { CollaboratorContext } from './context';
import MemberItemCard from './MemberItemCard';
import RoleSelect from './RoleSelect';

const HoverBoxStyle = {
  bgColor: 'myGray.50',
  cursor: 'pointer'
};

function MemberModal({
  onClose,
  addPermissionOnly: addOnly = false
}: {
  onClose: () => void;
  addPermissionOnly?: boolean;
}) {
  const { t } = useTranslation();
  const { userInfo } = useUserStore();
  const collaboratorList = useContextSelector(CollaboratorContext, (v) => v.collaboratorList);
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

  const {
    data: members,
    ScrollData: TeamMemberScrollData,
    refreshList
  } = useScrollPagination(getTeamMembers, {
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

  const {
    data: groups = [],
    loading: loadingGroupsAndOrgs,
    runAsync: refreshGroups
  } = useRequest2(
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

  const [selectedOrgList, setSelectedOrgIdList] = useState<OrgListItemType[]>([]);

  const [selectedMemberList, setSelectedMemberList] = useState<
    Omit<TeamMemberItemType, 'permission' | 'teamId'>[]
  >([]);

  const [selectedGroupList, setSelectedGroupList] = useState<MemberGroupListItemType<false>[]>([]);
  const roleList = useContextSelector(CollaboratorContext, (v) => v.roleList);
  const getRoleLabelList = useContextSelector(CollaboratorContext, (v) => v.getRoleLabelList);
  const [selectedRole, setSelectedRole] = useState<number | undefined>(roleList?.read?.value);
  const roleLabel = useMemo(() => {
    if (selectedRole === undefined) return '';
    return getRoleLabelList(selectedRole!).join('、');
  }, [getRoleLabelList, selectedRole]);

  const onUpdateCollaborators = useContextSelector(
    CollaboratorContext,
    (v) => v.onUpdateCollaborators
  );

  const { runAsync: onConfirm, loading: isUpdating } = useRequest2(
    () =>
      onUpdateCollaborators({
        members: selectedMemberList.map((item) => item.tmbId),
        groups: selectedGroupList.map((item) => item._id),
        orgs: selectedOrgList.map((item) => item._id),
        permission: addOnly ? undefined : selectedRole!
      } as UpdateClbPermissionProps<ValueOf<typeof addOnly>>),
    {
      successToast: t('common:add_success'),
      onSuccess() {
        onClose();
      }
    }
  );

  const entryList = useRef([
    { label: t('user:team.group.members'), icon: DEFAULT_USER_AVATAR, value: 'member' },
    { label: t('user:team.org.org'), icon: DEFAULT_ORG_AVATAR, value: 'org' },
    { label: t('user:team.group.group'), icon: DEFAULT_TEAM_AVATAR, value: 'group' }
  ]);

  const selectedList = useMemo(() => {
    return [
      ...selectedOrgList.map((item) => ({
        id: `org-${item._id}`,
        avatar: item.avatar,
        name: item.name,
        onDelete: () => setSelectedOrgIdList(selectedOrgList.filter((v) => v._id !== item._id)),
        orgs: undefined
      })),
      ...selectedGroupList.map((item) => ({
        id: `group-${item._id}`,
        avatar: item.avatar,
        name: item.name === DefaultGroupName ? userInfo?.team.teamName : item.name,
        onDelete: () => setSelectedGroupList(selectedGroupList.filter((v) => v._id !== item._id)),
        orgs: undefined
      })),
      ...selectedMemberList.map((item) => ({
        id: `member-${item.tmbId}`,
        avatar: item.avatar,
        name: item.memberName,
        onDelete: () =>
          setSelectedMemberList(selectedMemberList.filter((v) => v.tmbId !== item.tmbId)),
        orgs: item.orgs
      }))
    ];
  }, [selectedOrgList, selectedGroupList, selectedMemberList, userInfo?.team.teamName]);

  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc={addOnly ? 'keyPrimary' : 'modal/AddClb'}
      title={addOnly ? t('user:team.add_permission') : t('user:team.add_collaborator')}
      minW="800px"
      maxW={'60vw'}
      h={'100%'}
      maxH={'90vh'}
      isCentered
      isLoading={loadingGroupsAndOrgs}
    >
      <ModalBody flex={'1'}>
        <Grid
          border="1px solid"
          borderColor="myGray.200"
          borderRadius="0.5rem"
          gridTemplateColumns="1fr 1fr"
          h={'100%'}
        >
          <Flex
            h={'100%'}
            flexDirection="column"
            borderRight="1px solid"
            borderColor="myGray.200"
            p="4"
          >
            <SearchInput
              placeholder={t('user:search_group_org_user')}
              bgColor="myGray.50"
              onChange={(e) => setSearchKey(e.target.value)}
            />

            <Flex flexDirection="column" mt="3" overflow={'auto'} flex={'1 0 0'} h={0}>
              {/* Entry */}
              {!searchKey && !filterClass && (
                <>
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
                </>
              )}

              {/* Path */}
              {!searchKey && filterClass && (
                <Box mb={1}>
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
                  const Members = members?.map((member) => {
                    const onChange = () => {
                      setSelectedMemberList((state) => {
                        if (state.find((v) => v.tmbId === member.tmbId)) {
                          return state.filter((v) => v.tmbId !== member.tmbId);
                        }
                        return [...state, member];
                      });
                    };
                    const collaborator = collaboratorList?.find((v) => v.tmbId === member.tmbId);
                    return (
                      <MemberItemCard
                        addOnly={addOnly}
                        avatar={member.avatar}
                        key={member.tmbId}
                        name={member.memberName}
                        role={collaborator?.permission.role}
                        onChange={onChange}
                        isChecked={!!selectedMemberList.find((v) => v.tmbId === member.tmbId)}
                        orgs={member.orgs}
                      />
                    );
                  });
                  return searchKey ? (
                    Members
                  ) : (
                    <TeamMemberScrollData
                      flexDirection={'column'}
                      gap={1}
                      userSelect={'none'}
                      height={'fit-content'}
                    >
                      {Members}
                    </TeamMemberScrollData>
                  );
                })()}
              {(filterClass === 'org' || searchKey) &&
                (() => {
                  const Orgs = orgs?.map((org) => {
                    const onChange = () => {
                      setSelectedOrgIdList((state) => {
                        if (state.find((v) => v._id === org._id)) {
                          return state.filter((v) => v._id !== org._id);
                        }
                        return [...state, org];
                      });
                    };
                    const collaborator = collaboratorList?.find((v) => v.orgId === org._id);
                    return (
                      <MemberItemCard
                        avatar={org.avatar}
                        key={org._id}
                        name={org.name}
                        onChange={onChange}
                        addOnly={addOnly}
                        role={collaborator?.permission.role}
                        isChecked={!!selectedOrgList.find((v) => String(v._id) === String(org._id))}
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
                                // setPath(getOrgChildrenPath(org));
                                e.stopPropagation();
                              }}
                            />
                          )
                        }
                      />
                    );
                  });
                  return searchKey ? (
                    Orgs
                  ) : (
                    <OrgMemberScrollData>
                      {Orgs}
                      {orgMembers.map((member) => {
                        const isChecked = !!selectedMemberList.find(
                          (v) => v.tmbId === member.tmbId
                        );
                        const collaborator = collaboratorList?.find(
                          (v) => v.tmbId === member.tmbId
                        );
                        return (
                          <MemberItemCard
                            avatar={member.avatar}
                            key={member.tmbId}
                            name={member.memberName}
                            onChange={() => {
                              setSelectedMemberList((state) => {
                                if (state.find((v) => v.tmbId === member.tmbId)) {
                                  return state.filter((v) => v.tmbId !== member.tmbId);
                                }
                                return [...state, member];
                              });
                            }}
                            isChecked={isChecked}
                            role={collaborator?.permission.role}
                            addOnly={addOnly && !!member.permission.role}
                            orgs={member.orgs}
                          />
                        );
                      })}
                    </OrgMemberScrollData>
                  );
                })()}
              {(filterClass === 'group' || searchKey) &&
                groups?.map((group) => {
                  const onChange = () => {
                    setSelectedGroupList((state) => {
                      if (state.find((v) => v._id === group._id)) {
                        return state.filter((v) => v._id !== group._id);
                      }
                      return [...state, group];
                    });
                  };
                  const collaborator = collaboratorList?.find((v) => v.groupId === group._id);
                  return (
                    <MemberItemCard
                      avatar={group.avatar}
                      key={group._id}
                      name={
                        group.name === DefaultGroupName ? userInfo?.team.teamName ?? '' : group.name
                      }
                      role={collaborator?.permission.role}
                      onChange={onChange}
                      isChecked={!!selectedGroupList.find((v) => v._id === group._id)}
                      addOnly={addOnly}
                    />
                  );
                })}
            </Flex>
          </Flex>

          <Flex h={'100%'} p="4" flexDirection="column">
            <Box>
              {`${t('user:has_chosen')}: `}
              {selectedMemberList.length + selectedGroupList.length + selectedOrgList.length}
            </Box>
            <Flex flexDirection="column" mt="2" gap={1} overflow={'auto'} flex={'1 0 0'} h={0}>
              {selectedList.map((item) => {
                return (
                  <MemberItemCard
                    key={item.id}
                    avatar={item.avatar}
                    name={item.name ?? ''}
                    onChange={item.onDelete}
                    onDelete={item.onDelete}
                    orgs={item?.orgs}
                  />
                );
              })}
            </Flex>
          </Flex>
        </Grid>
      </ModalBody>
      <ModalFooter>
        {!addOnly && !!roleList && (
          <RoleSelect
            value={selectedRole}
            Button={
              <Flex
                alignItems={'center'}
                bg={'myGray.50'}
                border="base"
                fontSize={'sm'}
                px={3}
                borderRadius={'md'}
                h={'32px'}
              >
                {roleLabel}
                <ChevronDownIcon fontSize={'md'} />
              </Flex>
            }
            onChange={(v) => setSelectedRole(v)}
          />
        )}
        {addOnly && (
          <HStack bg={'blue.50'} color={'blue.600'} padding={'6px 12px'} rounded={'5px'}>
            <MyIcon name="common/info" w="1rem" h="1rem" />
            <Text fontSize="12px">{t('user:permission_add_tip')}</Text>
          </HStack>
        )}
        <Button isLoading={isUpdating} ml="4" h={'32px'} onClick={onConfirm}>
          {t('common:Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
}

export default MemberModal;
