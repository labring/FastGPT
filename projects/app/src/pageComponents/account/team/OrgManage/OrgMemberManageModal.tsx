import { putUpdateOrgMembers } from '@/web/support/user/team/org/api';
import { Box, Button, Flex, Grid, HStack, ModalBody, ModalFooter } from '@chakra-ui/react';
import type { GroupMemberRole } from '@fastgpt/global/support/permission/memberGroup/constant';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { useEffect, useState } from 'react';
import { type OrgListItemType } from '@fastgpt/global/support/user/team/org/type';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { getTeamMembers } from '@/web/support/user/team/api';
import MemberItemCard from '@/components/support/permission/MemberManager/MemberItemCard';

export type GroupFormType = {
  members: {
    tmbId: string;
    role: `${GroupMemberRole}`;
  }[];
};

function OrgMemberManageModal({
  currentOrg,
  refetchOrgs,
  onClose
}: {
  currentOrg: OrgListItemType;
  refetchOrgs: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
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

  const { data: orgMembers, ScrollData: OrgMemberScrollData } = useScrollPagination(
    getTeamMembers,
    {
      pageSize: 100000,
      params: {
        orgId: currentOrg._id,
        withOrgs: false,
        withPermission: false
      }
    }
  );

  const [selected, setSelected] = useState<{ name: string; tmbId: string; avatar: string }[]>([]);

  useEffect(() => {
    setSelected(
      orgMembers.map((item) => ({
        name: item.memberName,
        tmbId: item.tmbId,
        avatar: item.avatar
      }))
    );
  }, [orgMembers]);

  const { run: onUpdate, loading: isLoadingUpdate } = useRequest2(
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
      // setSelectedTmbIds((state) => state.filter((tmbId) => tmbId !== memberId));
    } else {
      // setSelectedTmbIds((state) => [...state, memberId]);
      const member = allMembers.find((item) => item.tmbId === tmbId)!;
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
            <OrgMemberScrollData flexGrow="1" overflow={'auto'}>
              <Box mt={2} mb={3}>{`${t('common:chosen')}:${selected.length}`}</Box>
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
            </OrgMemberScrollData>
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

export default OrgMemberManageModal;
