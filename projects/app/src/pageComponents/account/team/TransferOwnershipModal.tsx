import React, { useState } from 'react';
import {
  Box,
  Flex,
  HStack,
  Input,
  ModalBody,
  ModalFooter,
  Button,
  useDisclosure,
  Alert,
  AlertIcon,
  AlertDescription
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { type TeamMemberItemType } from '@fastgpt/global/support/user/team/type';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getTeamMembers, putTransferTeamOwnership } from '@/web/support/user/team/api';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { type PaginationResponse } from '@fastgpt/web/common/fetch/type';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useContextSelector } from 'use-context-selector';
import { TeamContext } from './context';

export function TransferOwnershipModal({
  onSuccess,
  onClose
}: {
  onSuccess: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { userInfo, initUserInfo } = useUserStore();
  const { myTeams, onSwitchTeam } = useContextSelector(TeamContext, (v) => v);

  const [searchKey, setSearchKey] = useState('');
  const [selectedMember, setSelectedMember] = useState<TeamMemberItemType | null>(null);

  const { data: members = [], ScrollData: MemberScrollData } = useScrollPagination<
    any,
    PaginationResponse<TeamMemberItemType>
  >(getTeamMembers, {
    pageSize: 20,
    params: {
      searchKey,
      status: 'active'
    },
    refreshDeps: [searchKey],
    debounceWait: 200,
    throttleWait: 500
  });

  // Filter out current owner
  const filteredMembers = members.filter((m) => m.userId !== userInfo?._id);

  const {
    isOpen: isOpenMemberListMenu,
    onClose: onCloseMemberListMenu,
    onOpen: onOpenMemberListMenu
  } = useDisclosure();

  const { runAsync: onTransfer, loading } = useRequest(
    async () => {
      if (!selectedMember) return;
      await putTransferTeamOwnership(selectedMember.userId);

      // Refresh user info to get updated permissions
      await initUserInfo();

      // Try to switch to another team if available
      const otherTeams = myTeams.filter((t) => t.teamId !== userInfo?.team.teamId);
      if (otherTeams.length > 0) {
        await onSwitchTeam(otherTeams[0].teamId);
      }
    },
    {
      onSuccess,
      successToast: t('account_team:transfer_success'),
      errorToast: t('account_team:transfer_failed')
    }
  );

  return (
    <MyModal
      isOpen
      iconSrc="modal/changePer"
      iconColor="primary.600"
      onClose={onClose}
      title={t('account_team:transfer_team_ownership')}
    >
      <ModalBody>
        <HStack mb={4}>
          <Avatar src={userInfo?.team.teamAvatar} w={'1.75rem'} borderRadius={'md'} />
          <Box>{userInfo?.team.teamName}</Box>
        </HStack>

        <Alert status="warning" mb={4} borderRadius="md">
          <AlertIcon />
          <AlertDescription fontSize="sm">{t('account_team:transfer_warning')}</AlertDescription>
        </Alert>

        <Flex flexDirection="column">
          <Box fontSize="14px" fontWeight="500" color="myGray.900" mb={2}>
            {t('account_team:select_new_owner')}
          </Box>
          <Flex alignItems="center" position="relative">
            {selectedMember && (
              <Avatar
                src={selectedMember.avatar}
                w="20px"
                borderRadius="md"
                position="absolute"
                left={3}
              />
            )}
            <Input
              placeholder={t('account_team:search_member')}
              value={searchKey}
              onChange={(e) => {
                setSearchKey(e.target.value);
                setSelectedMember(null);
              }}
              onFocus={() => {
                onOpenMemberListMenu();
                setSelectedMember(null);
              }}
              {...(selectedMember && { pl: '10' })}
            />
          </Flex>

          {isOpenMemberListMenu && filteredMembers.length > 0 && (
            <Flex
              mt={2}
              w="100%"
              flexDirection="column"
              gap={2}
              p={1}
              boxShadow="lg"
              bg="white"
              borderRadius="md"
              zIndex={10}
              maxH="300px"
              overflow="auto"
            >
              <MemberScrollData>
                {filteredMembers.map((item) => (
                  <Box
                    key={item.tmbId}
                    p="2"
                    _hover={{ bg: 'myGray.100' }}
                    mx="1"
                    borderRadius="md"
                    cursor="pointer"
                    onClickCapture={() => {
                      setSearchKey(item.memberName);
                      setSelectedMember(item);
                      onCloseMemberListMenu();
                    }}
                  >
                    <Flex align="center">
                      <Avatar src={item.avatar} w="1.25rem" />
                      <Box ml="2">{item.memberName}</Box>
                    </Flex>
                  </Box>
                ))}
              </MemberScrollData>
            </Flex>
          )}
        </Flex>
      </ModalBody>
      <ModalFooter>
        <HStack>
          <Button onClick={onClose} variant="whiteBase">
            {t('common:Cancel')}
          </Button>
          <Button
            isLoading={loading}
            isDisabled={!selectedMember}
            onClick={onTransfer}
            colorScheme="red"
          >
            {t('account_team:confirm_transfer')}
          </Button>
        </HStack>
      </ModalFooter>
    </MyModal>
  );
}

export default TransferOwnershipModal;
