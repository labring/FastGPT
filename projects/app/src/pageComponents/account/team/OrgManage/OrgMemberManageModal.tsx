import { getOrgMembers, putUpdateOrgMembers } from '@/web/support/user/team/org/api';
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
import { useEffect, useMemo, useState } from 'react';
import { OrgListItemType } from '@fastgpt/global/support/user/team/org/type';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { getOrgChildrenPath } from '@fastgpt/global/support/user/team/org/constant';
import { getTeamMembers } from '@/web/support/user/team/api';

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
  currentOrg: OrgListItemType;
  refetchOrgs: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  const {
    data: allMembers,
    ScrollData: MemberScrollData,
    isLoading: isLoadingMembers
  } = useScrollPagination(getTeamMembers, {
    pageSize: 20,
    params: {
      withLeaved: false
    }
  });

  const {
    data: orgMembers,
    ScrollData: OrgMemberScrollData,
    isLoading: isLoadingOrgMembers
  } = useScrollPagination(getOrgMembers, {
    pageSize: 20,
    params: {
      orgPath: getOrgChildrenPath(currentOrg)
    }
  });

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
        members: selected.map((member) => ({
          tmbId: member.tmbId
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
            <MemberScrollData mt={3} flexGrow="1" overflow={'auto'} isLoading={isLoadingMembers}>
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
          {/* <Flex mt={3} flexDirection="column" flexGrow="1" overflow={'auto'} maxH={'100%'}> */}
          <Flex flexDirection="column" p="4" overflowY="auto" overflowX="hidden">
            <OrgMemberScrollData
              mt={3}
              flexGrow="1"
              overflow={'auto'}
              isLoading={isLoadingOrgMembers}
            >
              <Box mt={2}>{`${t('common:chosen')}:${selected.length}`}</Box>
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
