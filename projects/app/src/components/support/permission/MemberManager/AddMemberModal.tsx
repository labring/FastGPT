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
  ModalFooter
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

export type AddModalPropsType = {
  onClose: () => void;
  mode?: 'member' | 'all';
};

function AddMemberModal({ onClose, mode = 'member' }: AddModalPropsType) {
  const { t } = useTranslation();
  const { userInfo, loadAndGetTeamMembers, loadAndGetGroups, myGroups, loadAndGetOrgs, myOrgs } =
    useUserStore();

  const { permissionList, collaboratorList, onUpdateCollaborators, getPerLabelList, permission } =
    useContextSelector(CollaboratorContext, (v) => v);
  const [searchText, setSearchText] = useState<string>('');

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

  const filterMembers = useMemo(() => {
    return members.filter((item) => {
      if (item.tmbId === userInfo?.team?.tmbId) return false;
      if (!searchText) return true;
      return item.memberName.includes(searchText);
    });
  }, [members, searchText, userInfo?.team?.tmbId]);

  const filterGroups = useMemo(() => {
    if (mode !== 'all') return [];
    return groups.filter((item) => {
      if (permission.isOwner) return true; // owner can see all groups
      if (myGroups.find((i) => String(i._id) === String(item._id))) return false;
      if (!searchText) return true;
      return item.name.includes(searchText);
    });
  }, [groups, searchText, myGroups, mode, permission]);

  const filterOrgs = useMemo(() => {
    if (mode !== 'all') return [];
    return orgs.filter((item) => {
      if (item.path === '') return false; // exclude root org
      if (!permission.isOwner && myOrgs.find((i) => String(i._id) !== String(item._id)))
        return false;
      if (!searchText) return true;
      return item.name.includes(searchText);
    });
  }, [orgs, searchText, myOrgs, mode, permission]);

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
                      cursor: 'pointer',
                      ...(!selectedOrgIdList.includes(org._id)
                        ? { svg: { color: 'myGray.50' } }
                        : {})
                    }}
                    onClick={onChange}
                  >
                    <Checkbox isChecked={selectedOrgIdList.includes(org._id)} />
                    <MyAvatar src={org.avatar} w="1.5rem" borderRadius={'50%'} />
                    <Box ml="2" w="full">
                      {org.name}
                    </Box>
                    {!!collaborator && (
                      <PermissionTags permission={collaborator.permission.value} />
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
                      cursor: 'pointer',
                      ...(!selectedGroupIdList.includes(group._id)
                        ? { svg: { color: 'myGray.50' } }
                        : {})
                    }}
                    onClick={onChange}
                  >
                    <Checkbox isChecked={selectedGroupIdList.includes(group._id)} />
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
                      cursor: 'pointer',
                      ...(!selectedMemberIdList.includes(member.tmbId)
                        ? { svg: { color: 'myGray.50' } }
                        : {})
                    }}
                    onClick={onChange}
                  >
                    <Checkbox
                      isChecked={selectedMemberIdList.includes(member.tmbId)}
                      icon={<MyIcon name={'common/check'} w={'12px'} />}
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
                const member = filterMembers.find((v) => v.tmbId === tmbId);
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
