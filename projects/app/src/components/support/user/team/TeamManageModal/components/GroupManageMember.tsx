import {
  Box,
  ModalBody,
  Flex,
  Button,
  ModalFooter,
  Checkbox,
  Grid,
  HStack,
  Input,
  InputGroup,
  InputLeftElement
} from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';

import { useTranslation } from 'next-i18next';
import React, { useMemo, useState } from 'react';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useContextSelector } from 'use-context-selector';
import { TeamModalContext } from '../context';
import { putUpdateGroup } from '@/web/support/user/team/group/api';

export type GroupFormType = {
  members: string[];
};

function GroupEditModal({ onClose, editGroupId }: { onClose: () => void; editGroupId?: string }) {
  // TODO:
  // 1. Owner can not be deleted
  // 2. Owner/Admin can manage members
  // 3. Owner can add/remove admins
  const { t } = useTranslation();
  const {
    members: allMembers,
    refetchGroups,
    groups,
    refetchMembers
  } = useContextSelector(TeamModalContext, (v) => v);

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
    async (data: GroupFormType) => {
      if (!editGroupId) return;
      return putUpdateGroup({
        groupId: editGroupId,
        memberList: data.members.map((item) => ({ tmbId: item, role: 'member' }))
      });
    },
    {
      onSuccess: () => Promise.all([onClose(), refetchGroups(), refetchMembers()])
    }
  );

  const isLoading = isLoadingUpdate;
  const isSelected = (memberId: string) => {
    return members.find((item) => item.tmbId === memberId);
  };

  const handleToggleSelect = (memberId: string) => {
    if (isSelected(memberId)) {
      setMembers(members.filter((item) => item.tmbId !== memberId));
    } else {
      setMembers([...members, { tmbId: memberId, role: 'member' }]);
    }
  };

  return (
    <MyModal
      onClose={onClose}
      title={t('user:team.group.manage_member')}
      iconSrc="support/permission/collaborator"
      iconColor="primary.600"
      minW={['90vw', '1000px']}
      h={'600px'}
      isCentered
    >
      <ModalBody flex={1} overflow={'auto'} display={'flex'} flexDirection={'column'} gap={4}>
        <Grid
          templateColumns="1fr 1fr"
          borderRadius="8px"
          border="1px solid"
          borderColor="myGray.200"
          h={'100%'}
        >
          <Flex flexDirection="column" p="4" h={'100%'} overflow={'auto'}>
            <InputGroup alignItems="center" size={'sm'}>
              <InputLeftElement>
                <MyIcon name="common/searchLight" w="16px" color={'myGray.500'} />
              </InputLeftElement>
              <Input
                placeholder={t('user:search_user')}
                fontSize="sm"
                bg={'myGray.50'}
                onChange={(e) => {
                  setSearchKey(e.target.value);
                }}
              />
            </InputGroup>

            <Flex flexDirection="column" mt={3}>
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
          <Flex
            borderLeft="1px"
            borderColor="myGray.200"
            flexDirection="column"
            p="4"
            h={'100%'}
            overflow={'auto'}
          >
            <Box mt={3}>{t('common:chosen') + ': ' + members.length}</Box>
            <Box mt={5}>
              {members.map((member) => {
                return (
                  <HStack
                    justifyContent="space-between"
                    py="2"
                    px={3}
                    borderRadius={'md'}
                    key={member.tmbId}
                    _hover={{ bg: 'myGray.50' }}
                    _notLast={{ mb: 2 }}
                  >
                    <Avatar
                      src={allMembers.find((item) => item.tmbId === member.tmbId)?.avatar}
                      w="1.5rem"
                      borderRadius={'md'}
                    />
                    <Box w="full">
                      {allMembers.find((item) => item.tmbId === member.tmbId)?.memberName}
                    </Box>
                    <MyIcon
                      name={'common/closeLight'}
                      w={'1rem'}
                      cursor={'pointer'}
                      _hover={{ color: 'red.600' }}
                      onClick={() => handleToggleSelect(member.tmbId)}
                    />
                  </HStack>
                );
              })}
            </Box>
          </Flex>
        </Grid>
      </ModalBody>
      <ModalFooter alignItems="flex-end">
        <Button isLoading={isLoading}>{t('common:common.Save')}</Button>
      </ModalFooter>
    </MyModal>
  );
}

export default GroupEditModal;
