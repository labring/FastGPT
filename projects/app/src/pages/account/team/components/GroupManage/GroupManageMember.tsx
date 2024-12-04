import {
  Box,
  ModalBody,
  Flex,
  Button,
  ModalFooter,
  Checkbox,
  Grid,
  HStack
} from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
import Tag from '@fastgpt/web/components/common/Tag';

import { useTranslation } from 'next-i18next';
import React, { useMemo, useState } from 'react';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useContextSelector } from 'use-context-selector';
import { TeamContext } from '../context';
import { putUpdateGroup } from '@/web/support/user/team/group/api';
import { GroupMemberRole } from '@fastgpt/global/support/permission/memberGroup/constant';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { DEFAULT_TEAM_AVATAR } from '@fastgpt/global/common/system/constants';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';

export type GroupFormType = {
  members: {
    tmbId: string;
    role: `${GroupMemberRole}`;
  }[];
};

function GroupEditModal({ onClose, editGroupId }: { onClose: () => void; editGroupId?: string }) {
  // 1. Owner can not be deleted, toast
  // 2. Owner/Admin can manage members
  // 3. Owner can add/remove admins
  const { t } = useTranslation();
  const { userInfo } = useUserStore();
  const { toast } = useToast();
  const [hoveredMemberId, setHoveredMemberId] = useState<string | undefined>(undefined);
  const {
    members: allMembers,
    refetchGroups,
    groups,
    refetchMembers
  } = useContextSelector(TeamContext, (v) => v);

  const group = useMemo(() => {
    return groups.find((item) => item._id === editGroupId);
  }, [editGroupId, groups]);

  const [members, setMembers] = useState(group?.members || []);
  const [searchKey, setSearchKey] = useState('');
  const filtered = useMemo(() => {
    return [
      ...allMembers.filter((member) => {
        if (member.memberName.toLowerCase().includes(searchKey.toLowerCase())) return true;
        return false;
      })
    ];
  }, [searchKey, allMembers]);

  const { run: onUpdate, loading: isLoadingUpdate } = useRequest2(
    async () => {
      if (!editGroupId || !members.length) return;
      return putUpdateGroup({
        groupId: editGroupId,
        memberList: members
      });
    },
    {
      onSuccess: () => Promise.all([onClose(), refetchGroups(), refetchMembers()])
    }
  );

  const isSelected = (memberId: string) => {
    return members.find((item) => item.tmbId === memberId);
  };

  const myRole = useMemo(() => {
    if (userInfo?.team.permission.hasManagePer) {
      return 'owner';
    }
    return members.find((item) => item.tmbId === userInfo?.team.tmbId)?.role ?? 'member';
  }, [members, userInfo]);

  const handleToggleSelect = (memberId: string) => {
    if (
      myRole === 'owner' &&
      memberId === group?.members.find((item) => item.role === 'owner')?.tmbId
    ) {
      toast({
        title: t('user:team.group.toast.can_not_delete_owner'),
        status: 'error'
      });
      return;
    }

    if (
      myRole === 'admin' &&
      group?.members.find((item) => String(item.tmbId) === memberId)?.role !== 'member'
    ) {
      return;
    }

    if (isSelected(memberId)) {
      setMembers(members.filter((item) => item.tmbId !== memberId));
    } else {
      setMembers([...members, { tmbId: memberId, role: 'member' }]);
    }
  };

  const handleToggleAdmin = (memberId: string) => {
    if (myRole === 'owner' && isSelected(memberId)) {
      const oldRole = members.find((item) => item.tmbId === memberId)?.role;
      if (oldRole === 'admin') {
        setMembers(
          members.map((item) => (item.tmbId === memberId ? { ...item, role: 'member' } : item))
        );
      } else {
        setMembers(
          members.map((item) => (item.tmbId === memberId ? { ...item, role: 'admin' } : item))
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
          <Flex flexDirection="column" p="4">
            <SearchInput
              placeholder={t('user:search_user')}
              fontSize="sm"
              bg={'myGray.50'}
              onChange={(e) => {
                setSearchKey(e.target.value);
              }}
            />
            <Flex flexDirection="column" mt={3} flexGrow="1" overflow={'auto'} maxH={'400px'}>
              {filtered.map((member) => {
                return (
                  <HStack
                    py="2"
                    px={3}
                    borderRadius={'md'}
                    alignItems="center"
                    key={member.tmbId}
                    cursor={'pointer'}
                    _hover={{
                      bg: 'myGray.50',
                      ...(!isSelected(member.tmbId) ? { svg: { color: 'myGray.50' } } : {})
                    }}
                    _notLast={{ mb: 2 }}
                    onClick={() => handleToggleSelect(member.tmbId)}
                  >
                    <Checkbox
                      isChecked={!!isSelected(member.tmbId)}
                      icon={<MyIcon name={'common/check'} w={'12px'} />}
                    />
                    <Avatar src={member.avatar} w="1.5rem" borderRadius={'50%'} />
                    <Box>{member.memberName}</Box>
                  </HStack>
                );
              })}
            </Flex>
          </Flex>
          <Flex borderLeft="1px" borderColor="myGray.200" flexDirection="column" p="4" h={'100%'}>
            <Box mt={2}>{t('common:chosen') + ': ' + members.length}</Box>
            <Flex mt={3} flexDirection="column" flexGrow="1" overflow={'auto'} maxH={'400px'}>
              {members.map((member) => {
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
                      <Avatar
                        src={allMembers.find((item) => item.tmbId === member.tmbId)?.avatar}
                        w="1.5rem"
                        borderRadius={'md'}
                      />
                      <Box>
                        {allMembers.find((item) => item.tmbId === member.tmbId)?.memberName}
                      </Box>
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
            </Flex>
          </Flex>
        </Grid>
      </ModalBody>
      <ModalFooter alignItems="flex-end">
        <Button isLoading={isLoading} onClick={onUpdate}>
          {t('common:common.Save')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
}

export default GroupEditModal;
