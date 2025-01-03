import { useUserStore } from '@/web/support/user/useUserStore';
import { ChevronDownIcon } from '@chakra-ui/icons';
import {
  Box,
  Button,
  Checkbox,
  Flex,
  Grid,
  HStack,
  ModalBody,
  ModalFooter,
  Tag,
  Text
} from '@chakra-ui/react';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import MyAvatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { useMemo, useState } from 'react';
import { useContextSelector } from 'use-context-selector';
import PermissionSelect from './PermissionSelect';
import PermissionTags from './PermissionTags';
import { CollaboratorContext } from './context';
import { DEFAULT_ORG_AVATAR, DEFAULT_TEAM_AVATAR } from '@fastgpt/global/common/system/constants';
import Path from '@/components/common/folder/Path';
import { getChildrenPath } from '@fastgpt/global/support/user/team/org/constant';
import { ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
import { OrgType } from '@fastgpt/global/support/user/team/org/type';

export type AddModalPropsType = {
  onClose: () => void;
  mode?: 'member' | 'all';
};

function AddMemberModal({ onClose, mode = 'member' }: AddModalPropsType) {
  const { t } = useTranslation();
  const { userInfo, loadAndGetTeamMembers, loadAndGetGroups, myGroups, loadAndGetOrgs } =
    useUserStore();

  const { permissionList, collaboratorList, onUpdateCollaborators, getPerLabelList, permission } =
    useContextSelector(CollaboratorContext, (v) => v);

  const [searchText, setSearchText] = useState<string>('');
  const [filterClass, setFilterClass] = useState<'member' | 'org' | 'group'>();
  const [parentPath, setParentPath] = useState('');

  const { data: [members = [], groups = [], orgs = []] = [], loading: loadingMembersAndGroups } =
    useRequest2(
      async () => {
        if (!userInfo?.team?.teamId) return [[], []];
        return Promise.all([
          loadAndGetTeamMembers(true),
          loadAndGetGroups(true),
          loadAndGetOrgs(true)
        ]);
      },
      {
        manual: false,
        refreshDeps: [userInfo?.team?.teamId]
      }
    );

  const currentOrg = useMemo(() => {
    const splitPath = parentPath.split('/');
    const currentOrgId = splitPath[splitPath.length - 1];
    if (!currentOrgId) return;

    return orgs.find((org) => org.pathId === currentOrgId);
  }, [orgs, parentPath]);
  const paths = useMemo(() => {
    const splitPath = parentPath.split('/').filter(Boolean);
    return splitPath
      .map((id) => {
        const org = orgs.find((org) => org.pathId === id)!;

        if (org.path === '') return;

        return {
          parentId: getChildrenPath(org),
          parentName: org.name
        };
      })
      .filter(Boolean) as ParentTreePathItemType[];
  }, [parentPath, orgs]);

  const filterMembers = useMemo(() => {
    if (!searchText && filterClass !== 'member' && filterClass !== 'org') return [];
    if (searchText) return members.filter((item) => item.memberName.includes(searchText));
    if (filterClass === 'org') {
      if (!currentOrg) return [];
      return members.filter((item) => {
        const tmbId = userInfo?.team?.tmbId;
        if (item.tmbId === tmbId) return false;
        return currentOrg.members.find((v) => v.tmbId === item.tmbId);
      });
    }
    return members.filter((item) => item.tmbId !== userInfo?.team?.tmbId);
  }, [members, searchText, filterClass, currentOrg, userInfo]);

  const filterGroups = useMemo(() => {
    if (mode !== 'all') return [];
    if (!searchText && filterClass !== 'group') return [];
    return groups.filter((item) => {
      if (permission.isOwner) return true; // owner can see all groups
      if (myGroups.find((i) => String(i._id) === String(item._id))) return false;
      if (!searchText) return true;
      return item.name.includes(searchText);
    });
  }, [groups, searchText, filterClass, myGroups, mode, permission]);

  const filterOrgs: (OrgType & { count?: number })[] = useMemo(() => {
    if (mode !== 'all') return [];
    if (!searchText && filterClass !== 'org') return [];
    if (searchText) return orgs.filter((item) => item.name.includes(searchText));
    if (parentPath === '') {
      setParentPath(`/${orgs[0].pathId}`);
      return [];
    }
    return orgs
      .filter((org) => org.path === parentPath)
      .map((item) => ({
        ...item,
        count: item.members.length + orgs.filter((org) => org.path === getChildrenPath(item)).length
      }));
  }, [orgs, searchText, filterClass, mode, parentPath]);

  const [selectedMemberIdList, setSelectedMembers] = useState<string[]>([]);
  const [selectedGroupIdList, setSelectedGroupIdList] = useState<string[]>([]);
  const [selectedOrgIdList, setSelectedOrgIdList] = useState<string[]>([]);
  const [selectedPermission, setSelectedPermission] = useState(permissionList['read'].value);
  const perLabel = useMemo(() => {
    return getPerLabelList(selectedPermission).join('、');
  }, [getPerLabelList, selectedPermission]);

  const { runAsync: onConfirm, loading: isUpdating } = useRequest2(
    () =>
      onUpdateCollaborators({
        members: selectedMemberIdList,
        groups: selectedGroupIdList,
        orgs: selectedOrgIdList,
        permission: selectedPermission
      }),
    {
      successToast: t('common:common.Add Success'),
      errorToast: 'Error',
      onSuccess() {
        onClose();
      }
    }
  );

  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc="modal/AddClb"
      title={t('user:team.add_collaborator')}
      minW="800px"
      h={'100%'}
      isCentered
      isLoading={loadingMembersAndGroups}
    >
      <ModalBody flex={'1'}>
        <Grid
          border="1px solid"
          borderColor="myGray.200"
          borderRadius="0.5rem"
          gridTemplateColumns="1fr 1fr"
          h={'100%'}
        >
          <Flex flexDirection="column" borderRight="1px solid" borderColor="myGray.200" p="4">
            <SearchInput
              placeholder={t('user:search_user')}
              bgColor="myGray.50"
              onChange={(e) => setSearchText(e.target.value)}
            />

            <Flex flexDirection="column" mt="2" overflow={'auto'} maxH="400px">
              {!searchText &&
                (filterClass === undefined ? (
                  <>
                    <HStack
                      justifyContent="space-between"
                      py="2"
                      px="3"
                      borderRadius="sm"
                      alignItems="center"
                      _hover={{
                        bgColor: 'myGray.50',
                        cursor: 'pointer'
                      }}
                      onClick={() => setFilterClass('member')}
                    >
                      <MyAvatar src="/imgs/avatar/BlueAvatar.svg" w="1.5rem" borderRadius={'50%'} />
                      <Box ml="2" w="full">
                        {t('account_team:member')}
                      </Box>
                      <MyIcon name="core/chat/chevronRight" w="16px" />
                    </HStack>
                    <HStack
                      justifyContent="space-between"
                      py="2"
                      px="3"
                      borderRadius="sm"
                      alignItems="center"
                      _hover={{
                        bgColor: 'myGray.50',
                        cursor: 'pointer'
                      }}
                      onClick={() => setFilterClass('org')}
                    >
                      <MyAvatar src={DEFAULT_ORG_AVATAR} w="1.5rem" borderRadius={'50%'} />
                      <Box ml="2" w="full">
                        {t('account_team:org')}
                      </Box>
                      <MyIcon name="core/chat/chevronRight" w="16px" />
                    </HStack>
                    <HStack
                      justifyContent="space-between"
                      py="2"
                      px="3"
                      borderRadius="sm"
                      alignItems="center"
                      _hover={{
                        bgColor: 'myGray.50',
                        cursor: 'pointer'
                      }}
                      onClick={() => setFilterClass('group')}
                    >
                      <MyAvatar src={DEFAULT_TEAM_AVATAR} w="1.5rem" borderRadius={'50%'} />
                      <Box ml="2" w="full">
                        {t('account_team:group')}
                      </Box>
                      <MyIcon name="core/chat/chevronRight" w="16px" />
                    </HStack>
                  </>
                ) : (
                  <Path
                    paths={[
                      {
                        parentId: filterClass,
                        parentName:
                          filterClass === 'member'
                            ? t('account_team:member')
                            : filterClass === 'org'
                              ? t('account_team:org')
                              : t('account_team:group')
                      },
                      ...paths
                    ]}
                    onClick={(parentId) => {
                      if (parentId === '') {
                        setFilterClass(undefined);
                        setParentPath('');
                      } else if (
                        parentId === 'member' ||
                        parentId === 'org' ||
                        parentId === 'group'
                      ) {
                        setFilterClass(parentId);
                        setParentPath('');
                      } else {
                        setParentPath(parentId);
                      }
                    }}
                    rootName={t('common:common.Team')}
                  />
                ))}
              {filterOrgs.map((org) => {
                const onChange = () => {
                  setSelectedOrgIdList((state) => {
                    if (state.includes(org._id)) {
                      return state.filter((v) => v !== org._id);
                    }
                    return [...state, org._id];
                  });
                };
                const collaborator = collaboratorList.find((v) => v.orgId === org._id);
                return (
                  <HStack
                    justifyContent="space-between"
                    key={org._id}
                    py="2"
                    px="3"
                    borderRadius="sm"
                    alignItems="center"
                    _hover={{
                      bgColor: 'myGray.50',
                      cursor: 'pointer'
                    }}
                    onClick={onChange}
                  >
                    <Checkbox
                      isChecked={selectedOrgIdList.includes(org._id)}
                      pointerEvents="none"
                    />
                    <MyAvatar src={org.avatar} w="1.5rem" borderRadius={'50%'} />
                    <HStack ml="2" w="full" gap="5px">
                      <Text>{org.name}</Text>
                      {org.count && (
                        <>
                          <Tag size="sm" my="auto">
                            {org.count}
                          </Tag>
                        </>
                      )}
                    </HStack>
                    {!!collaborator && (
                      <PermissionTags permission={collaborator.permission.value} />
                    )}
                    {org.count && (
                      <MyIcon
                        name="core/chat/chevronRight"
                        w="16px"
                        p="4px"
                        rounded={'6px'}
                        _hover={{
                          bgColor: 'myGray.200'
                        }}
                        onClick={() => {
                          setParentPath(getChildrenPath(org));
                        }}
                      />
                    )}
                  </HStack>
                );
              })}
              {filterGroups.map((group) => {
                const onChange = () => {
                  setSelectedGroupIdList((state) => {
                    if (state.includes(group._id)) {
                      return state.filter((v) => v !== group._id);
                    }
                    return [...state, group._id];
                  });
                };
                const collaborator = collaboratorList.find((v) => v.groupId === group._id);
                return (
                  <HStack
                    justifyContent="space-between"
                    key={group._id}
                    py="2"
                    px="3"
                    borderRadius="sm"
                    alignItems="center"
                    _hover={{
                      bgColor: 'myGray.50',
                      cursor: 'pointer'
                    }}
                    onClick={onChange}
                  >
                    <Checkbox
                      isChecked={selectedGroupIdList.includes(group._id)}
                      onClick={onChange}
                      pointerEvents="none"
                    />
                    <MyAvatar src={group.avatar} w="1.5rem" borderRadius={'50%'} />
                    <Box ml="2" w="full">
                      {group.name === DefaultGroupName ? userInfo?.team.teamName : group.name}
                    </Box>
                    {!!collaborator && (
                      <PermissionTags permission={collaborator.permission.value} />
                    )}
                  </HStack>
                );
              })}
              {filterMembers.map((member) => {
                const onChange = () => {
                  setSelectedMembers((state) => {
                    if (state.includes(member.tmbId)) {
                      return state.filter((v) => v !== member.tmbId);
                    }
                    return [...state, member.tmbId];
                  });
                };
                const collaborator = collaboratorList.find((v) => v.tmbId === member.tmbId);
                return (
                  <HStack
                    justifyContent="space-between"
                    key={member.tmbId}
                    py="2"
                    px="3"
                    borderRadius="sm"
                    alignItems="center"
                    _hover={{
                      bgColor: 'myGray.50',
                      cursor: 'pointer'
                    }}
                    onClick={onChange}
                  >
                    <Checkbox
                      isChecked={selectedMemberIdList.includes(member.tmbId)}
                      icon={<MyIcon name={'common/check'} w={'12px'} />}
                      onClick={onChange}
                      pointerEvents="none"
                    />
                    <MyAvatar src={member.avatar} w="1.5rem" borderRadius={'50%'} />
                    <Box w="full" ml="2">
                      {member.memberName}
                    </Box>
                    {!!collaborator && (
                      <PermissionTags permission={collaborator.permission.value} />
                    )}
                  </HStack>
                );
              })}
            </Flex>
          </Flex>
          <Flex p="4" flexDirection="column">
            <Box>
              {`${t('user:has_chosen')}: `}
              {selectedMemberIdList.length + selectedGroupIdList.length + selectedOrgIdList.length}
            </Box>
            <Flex flexDirection="column" mt="2" overflow={'auto'} maxH="400px">
              {selectedOrgIdList.map((orgId) => {
                const org = orgs.find((v) => String(v._id) === orgId);
                return (
                  <HStack
                    justifyContent="space-between"
                    key={orgId}
                    py="2"
                    px="3"
                    borderRadius="sm"
                    alignItems="center"
                    _hover={{
                      bgColor: 'myGray.50',
                      cursor: 'pointer',
                      ...(!selectedOrgIdList.includes(orgId) ? { svg: { color: 'myGray.50' } } : {})
                    }}
                    onClick={() =>
                      setSelectedOrgIdList(selectedOrgIdList.filter((v) => v !== orgId))
                    }
                  >
                    <MyAvatar src={org?.avatar} w="1.5rem" borderRadius={'50%'} />
                    <Box w="full" ml="2">
                      {org?.name}
                    </Box>
                    <MyIcon
                      name="common/closeLight"
                      w="16px"
                      cursor={'pointer'}
                      _hover={{
                        color: 'red.600'
                      }}
                    />
                  </HStack>
                );
              })}
              {selectedGroupIdList.map((groupId) => {
                const onChange = () => {
                  setSelectedGroupIdList((state) => {
                    if (state.includes(groupId)) {
                      return state.filter((v) => v !== groupId);
                    }
                    return [...state, groupId];
                  });
                };
                const group = groups.find((v) => String(v._id) === groupId);
                return (
                  <HStack
                    justifyContent="space-between"
                    key={groupId}
                    py="2"
                    px="3"
                    borderRadius="sm"
                    alignItems="center"
                    _hover={{
                      bgColor: 'myGray.50',
                      cursor: 'pointer',
                      ...(!selectedGroupIdList.includes(groupId)
                        ? { svg: { color: 'myGray.50' } }
                        : {})
                    }}
                    onClick={onChange}
                  >
                    <MyAvatar src={group?.avatar} w="1.5rem" borderRadius={'50%'} />
                    <Box w="full" ml="2">
                      {group?.name === DefaultGroupName ? userInfo?.team.teamName : group?.name}
                    </Box>
                    <MyIcon
                      name="common/closeLight"
                      w="16px"
                      cursor={'pointer'}
                      _hover={{
                        color: 'red.600'
                      }}
                    />
                  </HStack>
                );
              })}
              {selectedMemberIdList.map((tmbId) => {
                const member = members.find((v) => v.tmbId === tmbId);
                return member ? (
                  <HStack
                    justifyContent="space-between"
                    key={tmbId}
                    alignItems="center"
                    py="2"
                    px={3}
                    borderRadius={'md'}
                    _hover={{ bg: 'myGray.50' }}
                    onClick={() =>
                      setSelectedMembers(selectedMemberIdList.filter((v) => v !== tmbId))
                    }
                  >
                    <MyAvatar src={member.avatar} w="1.5rem" borderRadius="50%" />
                    <Box w="full" ml={2}>
                      {member.memberName}
                    </Box>
                    <MyIcon
                      name="common/closeLight"
                      w="16px"
                      cursor={'pointer'}
                      _hover={{
                        color: 'red.600'
                      }}
                    />
                  </HStack>
                ) : null;
              })}
            </Flex>
          </Flex>
        </Grid>
      </ModalBody>
      <ModalFooter>
        <PermissionSelect
          value={selectedPermission}
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
              {t(perLabel as any)}
              <ChevronDownIcon fontSize={'md'} />
            </Flex>
          }
          onChange={(v) => setSelectedPermission(v)}
        />
        <Button isLoading={isUpdating} ml="4" h={'32px'} onClick={onConfirm}>
          {t('common:common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
}

export default AddMemberModal;
