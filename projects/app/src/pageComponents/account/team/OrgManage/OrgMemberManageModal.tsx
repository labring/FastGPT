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
import { useMemo, useState } from 'react';
import { useContextSelector } from 'use-context-selector';
import { TeamContext } from '../context';
import { OrgType } from '@fastgpt/global/support/user/team/org/type';

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

function OrgMemberManageModal({
  currentOrg,
  refetchOrgs,
  onClose
}: {
  currentOrg: OrgType;
  refetchOrgs: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { members: allMembers, MemberScrollData } = useContextSelector(TeamContext, (v) => v);

  const [selectedMembers, setSelectedMembers] = useState<string[]>(
    currentOrg.members.map((item) => item.tmbId)
  );

  const [searchKey, setSearchKey] = useState('');
  const filterMembers = useMemo(() => {
    if (!searchKey) return allMembers;
    const regx = new RegExp(searchKey, 'i');
    return allMembers.filter((member) => regx.test(member.memberName));
  }, [searchKey, allMembers]);

  const { run: onUpdate, loading: isLoadingUpdate } = useRequest2(
    () => {
      return putUpdateOrgMembers({
        orgId: currentOrg._id,
        members: selectedMembers.map((tmbId) => ({
          tmbId
        }))
      });
    },
    {
      successToast: t('common:common.Update Success'),
      onSuccess() {
        refetchOrgs();
        onClose();
      }
    }
  );

  const isSelected = (memberId: string) => {
    return selectedMembers.find((tmbId) => tmbId === memberId);
  };

  const handleToggleSelect = (memberId: string) => {
    if (isSelected(memberId)) {
      setSelectedMembers((state) => state.filter((tmbId) => tmbId !== memberId));
    } else {
      setSelectedMembers((state) => [...state, memberId]);
    }
  };

  const isLoading = isLoadingUpdate;

  return (
    <MyModal
      isOpen
      title={t('user:team.group.manage_member')}
      iconSrc={currentOrg?.avatar}
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
              <MemberScrollData>
                {filterMembers.map((member) => {
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
              </MemberScrollData>
            </Flex>
          </Flex>
          <Flex borderLeft="1px" borderColor="myGray.200" flexDirection="column" p="4" h={'100%'}>
            <Box mt={2}>{`${t('common:chosen')}:${selectedMembers.length}`}</Box>
            <Flex mt={3} flexDirection="column" flexGrow="1" overflow={'auto'} maxH={'400px'}>
              {selectedMembers.map((tmbId) => {
                const member = allMembers.find((item) => item.tmbId === tmbId)!;
                return (
                  <HStack
                    justifyContent="space-between"
                    py="2"
                    px={3}
                    borderRadius={'md'}
                    key={tmbId}
                    _hover={{ bg: 'myGray.50' }}
                    _notLast={{ mb: 2 }}
                  >
                    <HStack>
                      <Avatar src={member?.avatar} w="1.5rem" borderRadius={'md'} />
                      <Box>{member?.memberName}</Box>
                    </HStack>
                    <MyIcon
                      name={'common/closeLight'}
                      w={'1rem'}
                      cursor={'pointer'}
                      _hover={{ color: 'red.600' }}
                      onClick={() => handleToggleSelect(tmbId)}
                    />
                  </HStack>
                );
              })}
            </Flex>
          </Flex>
        </Grid>
      </ModalBody>
      <ModalFooter>
        <Button variant={'whiteBase'} mr={3} onClick={onClose}>
          {t('common:common.Close')}
        </Button>
        <Button isLoading={isLoading} onClick={onUpdate}>
          {t('common:common.Save')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
}

export default OrgMemberManageModal;
