import React, { useMemo, useRef, useState } from 'react';
import { Box, Button, Flex, HStack, Input, useDisclosure, useOutsideClick } from '@chakra-ui/react';
import type { PaginationResponse } from '@fastgpt/global/openapi/api';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import type { TeamMemberItemType } from '@fastgpt/global/support/user/team/type';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTag from '@fastgpt/web/components/common/Tag';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { getTeamMembers } from '@/web/support/user/team/api';

export type MemberTransferTarget = {
  tmbId: string;
  memberName: string;
  avatar?: string | null;
};

export type MemberTransferLeaveModalProps = {
  mode: 'leave' | 'remove';
  isSyncMode?: boolean;
  member: MemberTransferTarget;
  onConfirm: (transferTmbId: string) => Promise<unknown>;
  onClose: () => void;
};

/** 成员主动离开团队或被移出/停用时选择资源与权限接收人的弹窗，默认预选团队所有者。 */
export function MemberTransferLeaveModal({
  mode,
  isSyncMode = false,
  member,
  onConfirm,
  onClose
}: MemberTransferLeaveModalProps) {
  const { t } = useSafeTranslation();
  const [inputValue, setInputValue] = useState('');
  const [searchKey, setSearchKey] = useState('');
  const [selectedMember, setSelectedMember] = useState<TeamMemberItemType | null>(null);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const dropdownContainerRef = useRef<HTMLDivElement>(null);

  const {
    data: members = [],
    isInitialLoading,
    ScrollData: MemberScrollData
  } = useScrollPagination<any, PaginationResponse<TeamMemberItemType>>(getTeamMembers, {
    pageSize: 20,
    params: {
      status: 'active',
      searchKey
    },
    refreshDeps: [searchKey],
    debounceWait: 200,
    throttleWait: 500
  });

  const filteredMembers = useMemo(
    () => members.filter((item) => item.tmbId !== member.tmbId),
    [members, member.tmbId]
  );

  // 首次加载默认预选团队所有者，保持与历史默认行为一致，同时允许随时切换为其他活跃成员。
  const defaultOwnerMember = useMemo(
    () =>
      !searchKey
        ? (filteredMembers.find((item) => item.role === TeamMemberRoleEnum.owner) ?? null)
        : null,
    [filteredMembers, searchKey]
  );
  const effectiveSelectedMember = hasUserInteracted
    ? selectedMember
    : (selectedMember ?? defaultOwnerMember);
  const displayInputValue = hasUserInteracted
    ? inputValue
    : (effectiveSelectedMember?.memberName ?? inputValue);

  const {
    isOpen: isOpenMemberListMenu,
    onClose: onCloseMemberListMenu,
    onOpen: onOpenMemberListMenu
  } = useDisclosure();

  useOutsideClick({
    ref: dropdownContainerRef,
    handler: () => {
      onCloseMemberListMenu();
      if (effectiveSelectedMember) {
        setInputValue(effectiveSelectedMember.memberName);
        setSearchKey('');
      }
    }
  });

  const modalTitle =
    mode === 'leave'
      ? t('account_team:user_team_leave_team')
      : isSyncMode
        ? t('account_team:confirm_forbidden')
        : t('account_team:delete_from_team');

  const confirmButtonText =
    mode === 'leave'
      ? t('account_team:user_team_leave_team')
      : isSyncMode
        ? t('account_team:confirm_forbidden')
        : t('common:Confirm');

  const transferTip =
    mode === 'leave'
      ? t('account_team:leave_team_transfer_tip')
      : isSyncMode
        ? t('account_team:forbidden_member_transfer_tip', { username: member.memberName })
        : t('account_team:remove_member_transfer_tip', { username: member.memberName });

  const handleConfirm = async () => {
    if (!effectiveSelectedMember || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onConfirm(effectiveSelectedMember.tmbId);
      onClose();
    } catch {
      // 调用方已通过 useRequest 统一提示错误，这里保留弹窗供用户修正选择。
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <MyModal
      isOpen
      onClose={onClose}
      title={modalTitle}
      isCentered
      footer={
        <HStack spacing={3}>
          <Button onClick={onClose} variant={'whiteBase'}>
            {t('common:Cancel')}
          </Button>
          <Button
            onClick={handleConfirm}
            colorScheme="red"
            isDisabled={!effectiveSelectedMember}
            isLoading={isSubmitting}
          >
            {confirmButtonText}
          </Button>
        </HStack>
      }
    >
      <HStack>
        <Avatar src={member.avatar ?? undefined} w={'1.75rem'} borderRadius={'md'} />
        <Box fontWeight={500} color={'myGray.900'}>
          {member.memberName}
        </Box>
      </HStack>

      <Flex ref={dropdownContainerRef} mt={4} justify="start" flexDirection="column">
        <Box fontSize="14px" fontWeight="500" color="myGray.900">
          {t('account_team:transfer_member_resources_to')}
        </Box>
        <Flex mt={3} alignItems="center" position={'relative'}>
          {effectiveSelectedMember && (
            <Avatar
              src={effectiveSelectedMember.avatar}
              w={'20px'}
              borderRadius={'md'}
              position="absolute"
              left={3}
              zIndex={1}
            />
          )}
          <Input
            placeholder={t('account_team:search_member')}
            value={displayInputValue}
            onChange={(e) => {
              setHasUserInteracted(true);
              const nextValue = e.target.value;
              setInputValue(nextValue);
              setSearchKey(nextValue);
              setSelectedMember(null);
              onOpenMemberListMenu();
            }}
            onFocus={() => {
              onOpenMemberListMenu();
            }}
            {...(effectiveSelectedMember && { pl: '10' })}
          />
        </Flex>

        {isOpenMemberListMenu && (
          <Flex
            mt={2}
            w={'100%'}
            flexDirection={'column'}
            gap={1}
            p={1}
            boxShadow="lg"
            bg="white"
            borderRadius="md"
            border={'1px solid'}
            borderColor={'myGray.200'}
            zIndex={10}
            maxH={'240px'}
            overflow={'auto'}
          >
            {filteredMembers.length > 0 ? (
              <MemberScrollData>
                {filteredMembers.map((item) => {
                  const isSelected = effectiveSelectedMember?.tmbId === item.tmbId;
                  return (
                    <Box
                      key={item.tmbId}
                      p="2"
                      mx="1"
                      borderRadius="md"
                      cursor={'pointer'}
                      bg={isSelected ? 'primary.50' : undefined}
                      _hover={{ bg: isSelected ? 'primary.50' : 'myGray.100' }}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setHasUserInteracted(true);
                        setSelectedMember(item);
                        setInputValue(item.memberName);
                        setSearchKey('');
                        onCloseMemberListMenu();
                      }}
                    >
                      <Flex align="center" gap={2}>
                        <Avatar src={item.avatar} w="1.25rem" />
                        <Box flex="1" minW={0} className="textEllipsis">
                          {item.memberName}
                        </Box>
                        {item.role === TeamMemberRoleEnum.owner && (
                          <MyTag colorSchema="gray">{t('account_team:owner')}</MyTag>
                        )}
                      </Flex>
                    </Box>
                  );
                })}
              </MemberScrollData>
            ) : (
              !isInitialLoading && (
                <Box py={3} textAlign="center" fontSize="sm" color="myGray.500">
                  {t('account_team:no_transfer_member_found')}
                </Box>
              )
            )}
          </Flex>
        )}

        <MyTag mt={4} colorSchema="blue" alignItems="flex-start" py={2} whiteSpace="normal">
          <MyIcon name="common/info" w="1rem" mt="2px" flexShrink={0} />
          <Box ml={2} lineHeight="1.5">
            {transferTip}
          </Box>
        </MyTag>
      </Flex>
    </MyModal>
  );
}

export default MemberTransferLeaveModal;
