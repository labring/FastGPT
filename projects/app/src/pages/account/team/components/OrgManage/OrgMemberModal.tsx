import { putUpdateOrgMembers } from '@/web/support/user/team/org/api';
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
import type { GroupMemberRole } from '@fastgpt/global/support/permission/memberGroup/constant';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { IconNameType } from '@fastgpt/web/components/common/Icon/type';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useContextSelector } from 'use-context-selector';
import { TeamContext } from '../context';

export type GroupFormType = {
  members: {
    tmbId: string;
    role: `${GroupMemberRole}`;
  }[];
};

function CheckboxIcon({
  name
}: {
  isChecked?: boolean;
  isIndeterminate?: boolean;
  name: IconNameType;
}) {
  return <MyIcon name={name} w="12px" />;
}

function OrgMemberModal({ onClose, editOrgId }: { onClose: () => void; editOrgId?: string }) {
  // 1. Owner can not be deleted, toast
  // 2. Owner/Admin can manage members
  // 3. Owner can add/remove admins
  const { t } = useTranslation();
  const {
    members: allMembers,
    orgs,
    refetchOrgs,
    refetchMembers
  } = useContextSelector(TeamContext, (v) => v);

  const org = useMemo(() => orgs.find((item) => item._id === editOrgId), [editOrgId, orgs]);

  const [members, setMembers] = useState<{ tmbId: string }[]>(org?.members || []);

  useEffect(() => {
    setMembers(org?.members || []);
  }, [org]);

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
      if (!editOrgId) return;
      return putUpdateOrgMembers({
        orgId: editOrgId,
        members
      });
    },
    {
      onSuccess: () => Promise.all([onClose(), refetchOrgs(), refetchMembers()])
    }
  );

  const isSelected = (memberId: string) => {
    return members.find((item) => item.tmbId === memberId);
  };

  const handleToggleSelect = (memberId: string) => {
    if (isSelected(memberId)) {
      setMembers(members.filter((item) => item.tmbId !== memberId));
    } else {
      setMembers([...members, { tmbId: memberId }]);
    }
  };

  const isLoading = isLoadingUpdate;
  return (
    <MyModal
      onClose={onClose}
      isOpen={!!editOrgId}
      title={t('user:team.group.manage_member')}
      iconSrc={org?.avatar}
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
                      icon={<CheckboxIcon name={'common/check'} />}
                      pointerEvents="none"
                    />
                    <Avatar src={member.avatar} w="1.5rem" borderRadius={'50%'} />
                    <Box>{member.memberName}</Box>
                  </HStack>
                );
              })}
            </Flex>
          </Flex>
          <Flex borderLeft="1px" borderColor="myGray.200" flexDirection="column" p="4" h={'100%'}>
            <Box mt={2}>{`${t('common:chosen')}:${members.length}`}</Box>
            <Flex mt={3} flexDirection="column" flexGrow="1" overflow={'auto'} maxH={'400px'}>
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

export default OrgMemberModal;
