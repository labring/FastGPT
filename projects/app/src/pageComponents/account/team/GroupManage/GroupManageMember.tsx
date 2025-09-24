import { Box, ModalBody, Flex, Button, ModalFooter, Grid, HStack } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
import Tag from '@fastgpt/web/components/common/Tag';

import { useTranslation } from 'next-i18next';
import React, { useEffect, useMemo, useState } from 'react';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { putUpdateGroup } from '@/web/support/user/team/group/api';
import type { GroupMemberRole } from '@fastgpt/global/support/permission/memberGroup/constant';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { DEFAULT_TEAM_AVATAR } from '@fastgpt/global/common/system/constants';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import { type MemberGroupListItemType } from '@fastgpt/global/support/permission/memberGroup/type';
import { getTeamMembers } from '@/web/support/user/team/api';
import { type TeamMemberItemType } from '@fastgpt/global/support/user/team/type';
import { type PaginationResponse } from '@fastgpt/web/common/fetch/type';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import _ from 'lodash';
import MemberItemCard from '@/components/support/permission/MemberManager/MemberItemCard';

export type GroupFormType = {
  members: {
    tmbId: string;
    role: `${GroupMemberRole}`;
  }[];
};

// 1. Owner can not be deleted, toast
// 2. Owner/Admin can manage members
// 3. Owner can add/remove admins
function GroupEditModal({
  onClose,
  group,
  onSuccess
}: {
  onClose: () => void;
  group: MemberGroupListItemType<true>;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const { userInfo } = useUserStore();
  const { toast } = useToast();

  const [searchKey, setSearchKey] = useState('');
  const [selected, setSelected] = useState<
    { name: string; tmbId: string; avatar: string; role: `${GroupMemberRole}` }[]
  >([]);

  const {
    data: allMembers = [],
    ScrollData: MemberScrollData,
    refreshList
  } = useScrollPagination<
    any,
    PaginationResponse<TeamMemberItemType<{ withOrgs: true; withPermission: true }>>
  >(getTeamMembers, {
    pageSize: 20,
    params: {
      status: 'active',
      withOrgs: true,
      searchKey
    },
    throttleWait: 500,
    debounceWait: 200,
    refreshDeps: [searchKey]
  });

  const groupId = useMemo(() => String(group._id), [group._id]);

  const { data: groupMembers = [], ScrollData: GroupScrollData } = useScrollPagination<
    any,
    PaginationResponse<
      TeamMemberItemType<{ withOrgs: true; withPermission: true; withGroupRole: true }>
    >
  >(getTeamMembers, {
    pageSize: 100000,
    params: {
      groupId: groupId
    }
  });

  useEffect(() => {
    if (!groupId) return;
    setSelected(
      groupMembers.map((item) => ({
        name: item.memberName,
        tmbId: item.tmbId,
        avatar: item.avatar,
        role: (item.groupRole ?? 'member') as `${GroupMemberRole}`
      }))
    );
  }, [groupId, groupMembers]);

  const [hoveredMemberId, setHoveredMemberId] = useState<string>();

  const { runAsync: onUpdate, loading: isLoadingUpdate } = useRequest2(
    async () => {
      if (!group._id || !groupMembers.length) return;

      return putUpdateGroup({
        groupId: group._id,
        memberList: selected
      });
    },
    {
      onSuccess: () => Promise.all([onClose(), onSuccess()])
    }
  );

  const isSelected = (memberId: string) => {
    return selected.find((item) => item.tmbId === memberId);
  };

  const myRole = useMemo(() => {
    if (userInfo?.team.permission.hasManagePer) {
      return 'owner';
    }
    return groupMembers.find((item) => item.tmbId === userInfo?.team.tmbId)?.groupRole ?? 'member';
  }, [groupMembers, userInfo]);

  const handleToggleSelect = (memberId: string) => {
    if (
      myRole === 'owner' &&
      memberId === groupMembers.find((item) => item.groupRole === 'owner')?.tmbId
    ) {
      toast({
        title: t('user:team.group.toast.can_not_delete_owner'),
        status: 'error'
      });
      return;
    }

    if (
      myRole === 'admin' &&
      selected.find((item) => String(item.tmbId) === memberId)?.role !== 'member'
    ) {
      return;
    }

    if (isSelected(memberId)) {
      setSelected(selected.filter((item) => item.tmbId !== memberId));
    } else {
      const member = allMembers.find((m) => m.tmbId === memberId);
      if (!member) return;
      setSelected([
        ...selected,
        {
          name: member.memberName,
          avatar: member.avatar,
          tmbId: member.tmbId,
          role: 'member'
        }
      ]);
    }
  };

  const handleToggleAdmin = (memberId: string) => {
    if (myRole === 'owner' && isSelected(memberId)) {
      const oldRole = groupMembers.find((item) => item.tmbId === memberId)?.groupRole;
      if (oldRole === 'admin') {
        setSelected(
          selected.map((item) => (item.tmbId === memberId ? { ...item, role: 'member' } : item))
        );
      } else {
        setSelected(
          selected.map((item) => (item.tmbId === memberId ? { ...item, role: 'admin' } : item))
        );
      }
    }
  };

  const isLoading = isLoadingUpdate;
  return (
    <MyModal
      onClose={onClose}
      title={t('user:team.group.manage_member')}
      iconSrc={group?.avatar ?? DEFAULT_TEAM_AVATAR}
      iconColor="primary.600"
      minW="800px"
      h={'100%'}
      isCentered
    >
      <ModalBody flex={1}>
        <Grid
          border="1px solid"
          borderColor="myGray.200"
          borderRadius="0.5rem"
          gridTemplateColumns="1fr 1fr"
          h={'100%'}
        >
          <Flex flexDirection="column" p="4" overflowY={'auto'} overflowX={'hidden'}>
            <SearchInput
              placeholder={t('user:search_user')}
              fontSize="sm"
              bg={'myGray.50'}
              onChange={(e) => {
                setSearchKey(e.target.value);
              }}
            />
            <MemberScrollData mt={3} flexGrow="1" overflow={'auto'}>
              {allMembers.map((member) => {
                return (
                  <MemberItemCard
                    avatar={member.avatar}
                    key={member.tmbId}
                    name={member.memberName}
                    onChange={() => handleToggleSelect(member.tmbId)}
                    isChecked={!!isSelected(member.tmbId)}
                    orgs={member.orgs}
                  />
                );
              })}
            </MemberScrollData>
          </Flex>
          <Flex borderLeft="1px" borderColor="myGray.200" flexDirection="column" p="4" h={'100%'}>
            <Box mt={2} mb={3}>
              {t('common:chosen') + ': ' + selected.length}
            </Box>
            <GroupScrollData flex={'1 0 0'} h={0}>
              {selected.map((member) => {
                return (
                  <HStack
                    onMouseEnter={() => setHoveredMemberId(member.tmbId)}
                    onMouseLeave={() => setHoveredMemberId(undefined)}
                    justifyContent="space-between"
                    py="2"
                    px={3}
                    borderRadius={'md'}
                    key={member.tmbId + member.role}
                    _hover={{ bg: 'myGray.50' }}
                    _notLast={{ mb: 2 }}
                  >
                    <HStack>
                      <Avatar src={member.avatar} w="1.5rem" borderRadius={'md'} />
                      <Box>{member.name}</Box>
                    </HStack>
                    <Box mr="auto">
                      {(() => {
                        if (member.role === 'owner') {
                          return (
                            <Tag ml={2} colorSchema="gray">
                              {t('user:team.group.role.owner')}
                            </Tag>
                          );
                        } else if (member.role === 'admin') {
                          return (
                            <Tag ml={2} mr="auto">
                              {t('user:team.group.role.admin')}
                              {myRole === 'owner' && (
                                <MyIcon
                                  ml={1}
                                  name={'common/closeLight'}
                                  w={'1rem'}
                                  cursor={'pointer'}
                                  _hover={{ color: 'red.600' }}
                                  onClick={() => handleToggleAdmin(member.tmbId)}
                                />
                              )}
                            </Tag>
                          );
                        } else if (member.role === 'member') {
                          return (
                            myRole === 'owner' &&
                            hoveredMemberId === member.tmbId && (
                              <Tag
                                ml={2}
                                colorSchema="yellow"
                                cursor={'pointer'}
                                onClick={() => handleToggleAdmin(member.tmbId)}
                              >
                                {t('user:team.group.set_as_admin')}
                              </Tag>
                            )
                          );
                        }
                      })()}
                    </Box>
                    {(myRole === 'owner' || (myRole === 'admin' && member.role === 'member')) && (
                      <MyIcon
                        name={'common/closeLight'}
                        w={'1rem'}
                        cursor={'pointer'}
                        _hover={{ color: 'red.600' }}
                        onClick={() => handleToggleSelect(member.tmbId)}
                      />
                    )}
                  </HStack>
                );
              })}
            </GroupScrollData>
          </Flex>
        </Grid>
      </ModalBody>
      <ModalFooter>
        <Button variant={'whiteBase'} mr={3} onClick={onClose}>
          {t('common:Close')}
        </Button>
        <Button isLoading={isLoading} onClick={onUpdate}>
          {t('common:Save')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
}

export default GroupEditModal;
