import { putUpdateOrgMembers } from '@/web/support/user/team/org/api';
import { Box, Button, Flex, Grid, HStack, ModalBody, ModalFooter } from '@chakra-ui/react';
import type { GroupMemberRole } from '@fastgpt/global/support/permission/memberGroup/constant';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import React, { useState } from 'react';
import { type OrgListItemType } from '@fastgpt/global/support/user/team/org/type';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { getTeamMembers } from '@/web/support/user/team/api';
import MemberItemCard from '@/components/support/permission/MemberManager/MemberItemCard';
import { type TeamMemberItemType } from '@fastgpt/global/support/user/team/type';

export type GroupFormType = {
  members: {
    tmbId: string;
    role: `${GroupMemberRole}`;
  }[];
};

type SelectedOrgMemberType = {
  name: string;
  tmbId: string;
  avatar: string;
};

type OrgMemberManageContentProps = {
  currentOrg: OrgListItemType;
  initialMembers: TeamMemberItemType[];
  refetchOrgs: () => void;
  onClose: () => void;
};

function OrgMemberManageContent({
  currentOrg,
  initialMembers,
  refetchOrgs,
  onClose
}: OrgMemberManageContentProps) {
  const { t } = useSafeTranslation();
  const [searchKey, setSearchKey] = useState('');

  const { data: allMembers, ScrollData: MemberScrollData } = useScrollPagination(getTeamMembers, {
    pageSize: 20,
    params: {
      withOrgs: true,
      withPermission: false,
      status: 'active',
      searchKey
    },
    throttleWait: 500,
    debounceWait: 200,
    refreshDeps: [searchKey]
  });

  const [selected, setSelected] = useState<SelectedOrgMemberType[]>(() =>
    initialMembers.map((item) => ({
      name: item.memberName,
      tmbId: item.tmbId,
      avatar: item.avatar
    }))
  );

  const { run: onUpdate, loading: isLoadingUpdate } = useRequest(
    () => {
      return putUpdateOrgMembers({
        orgId: currentOrg._id,
        members: selected.map((member) => ({
          tmbId: member.tmbId
        }))
      });
    },
    {
      successToast: t('common:update_success'),
      onSuccess() {
        refetchOrgs();
        onClose();
      }
    }
  );

  const isSelected = (tmbId: string) => {
    return selected.find((tmb) => tmb.tmbId === tmbId);
  };

  const handleToggleSelect = (tmbId: string) => {
    if (isSelected(tmbId)) {
      setSelected((state) => state.filter((tmb) => tmb.tmbId !== tmbId));
    } else {
      const member = allMembers.find((item) => item.tmbId === tmbId);
      if (!member) return;
      setSelected((state) => [
        ...state,
        {
          name: member.memberName,
          tmbId,
          avatar: member.avatar
        }
      ]);
    }
  };

  return (
    <>
      <ModalBody flex={1}>
        <Grid
          border="1px solid"
          borderColor="myGray.200"
          borderRadius="0.5rem"
          gridTemplateColumns="1fr 1fr"
          h={'100%'}
        >
          <Flex
            flexDirection="column"
            p="4"
            overflowY="auto"
            overflowX="hidden"
            borderRight={'1px solid'}
            borderColor={'myGray.200'}
          >
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
          <Flex flexDirection="column" p="4" overflowY="auto" overflowX="hidden">
            <Box mt={2} mb={3}>{`${t('common:chosen')}:${selected.length}`}</Box>
            <Box flexGrow="1" overflow={'auto'}>
              {selected.map((member) => {
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
                      <Avatar src={member?.avatar} w="1.5rem" borderRadius={'md'} />
                      <Box>{member?.name}</Box>
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
            </Box>
          </Flex>
        </Grid>
      </ModalBody>
      <ModalFooter>
        <Button variant={'whiteBase'} mr={3} onClick={onClose}>
          {t('common:Close')}
        </Button>
        <Button isLoading={isLoadingUpdate} onClick={onUpdate}>
          {t('common:Save')}
        </Button>
      </ModalFooter>
    </>
  );
}

function OrgMemberManageModal({
  currentOrg,
  refetchOrgs,
  onClose
}: {
  currentOrg: OrgListItemType;
  refetchOrgs: () => void;
  onClose: () => void;
}) {
  const { t } = useSafeTranslation();
  const orgId = currentOrg._id;

  const { data: orgMembers, loading: isLoadingOrgMembers } = useRequest(
    async () => {
      const res = await getTeamMembers({
        orgId,
        pageSize: 100000,
        pageNum: 1,
        withOrgs: false,
        withPermission: false
      });
      return res.list;
    },
    {
      manual: false,
      refreshDeps: [orgId]
    }
  );

  return (
    <MyModal
      isOpen
      onClose={onClose}
      title={t('user:team.group.manage_member')}
      iconSrc={currentOrg?.avatar}
      minW="800px"
      h={'100%'}
      isCentered
      isLoading={isLoadingOrgMembers || !orgMembers}
    >
      {orgMembers && !isLoadingOrgMembers && (
        <OrgMemberManageContent
          key={orgId}
          currentOrg={currentOrg}
          initialMembers={orgMembers}
          refetchOrgs={refetchOrgs}
          onClose={onClose}
        />
      )}
    </MyModal>
  );
}

export default OrgMemberManageModal;
