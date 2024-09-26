import { useUserStore } from '@/web/support/user/useUserStore';
import {
  Box,
  Flex,
  HStack,
  Input,
  ModalBody,
  ModalFooter,
  Button,
  useDisclosure
} from '@chakra-ui/react';
import { TeamMemberItemType } from '@fastgpt/global/support/user/team/type';
import Avatar from '@fastgpt/web/components/common/Avatar';
import Icon from '@fastgpt/web/components/common/Icon';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyTag from '@fastgpt/web/components/common/Tag';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import React, { useState } from 'react';

export type ChangeOwnerModalProps = {
  avatar?: string;
  name: string;
  onChangeOwner: (tmbId: string) => Promise<unknown>;
};

export function ChangeOwnerModal({
  onClose,
  avatar,
  name,
  onChangeOwner
}: ChangeOwnerModalProps & { onClose: () => void }) {
  const { t } = useTranslation();
  const { loadAndGetTeamMembers } = useUserStore();

  const [inputValue, setInputValue] = React.useState('');

  const { data: teamMembers = [] } = useRequest2(loadAndGetTeamMembers, {
    manual: false
  });
  const memberList = teamMembers.filter((item) => {
    return item.memberName.includes(inputValue);
  });

  const {
    isOpen: isOpenMemberListMenu,
    onClose: onCloseMemberListMenu,
    onOpen: onOpenMemberListMenu
  } = useDisclosure();
  const [selectedMember, setSelectedMember] = useState<TeamMemberItemType | null>(null);

  const { runAsync, loading } = useRequest2(onChangeOwner, {
    onSuccess: onClose,
    successToast: t('common:permission.change_owner_success'),
    errorToast: t('common:permission.change_owner_failed')
  });

  const onConfirm = async () => {
    if (!selectedMember) {
      return;
    }
    await runAsync(selectedMember.tmbId);
  };

  return (
    <MyModal
      isOpen
      iconSrc="modal/changePer"
      iconColor="primary.600"
      onClose={onClose}
      title={t('common:permission.change_owner')}
      isLoading={loading}
    >
      <ModalBody>
        <HStack>
          <Avatar src={avatar} w={'1.75rem'} borderRadius={'md'} />
          <Box>{name}</Box>
        </HStack>
        <Flex mt={4} justify="start" flexDirection="column">
          <Box fontSize="14px" fontWeight="500">
            {t('common:permission.change_owner_to')}
          </Box>
          <Flex mt="4" alignItems="center" position={'relative'}>
            {selectedMember && (
              <Avatar
                src={selectedMember.avatar}
                w={'20px'}
                borderRadius={'md'}
                position="absolute"
                left={3}
              />
            )}
            <Input
              placeholder={t('common:permission.change_owner_placeholder')}
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setSelectedMember(null);
              }}
              onFocus={() => {
                onOpenMemberListMenu();
                setSelectedMember(null);
              }}
              // onBlur={() => {
              //   setTimeout(() => {
              //     onCloseMemberListMenu();
              //   }, 10);
              // }}
              {...(selectedMember && { pl: '10' })}
            />
          </Flex>
          {isOpenMemberListMenu && memberList.length > 0 && (
            <Flex
              mt={2}
              w={'100%'}
              flexDirection={'column'}
              gap={2}
              p={1}
              boxShadow="lg"
              bg="white"
              borderRadius="md"
              zIndex={10}
              maxH={'300px'}
              overflow={'auto'}
            >
              {memberList.map((item) => (
                <Box
                  key={item.tmbId}
                  p="2"
                  _hover={{ bg: 'myGray.100' }}
                  mx="1"
                  borderRadius="md"
                  cursor={'pointer'}
                  onClickCapture={() => {
                    setInputValue(item.memberName);
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
            </Flex>
          )}

          <MyTag mt="4" colorSchema="blue">
            <Icon name="common/info" w="1rem" />
            <Box ml="2">{t('common:permission.change_owner_tip')}</Box>
          </MyTag>
        </Flex>
      </ModalBody>
      <ModalFooter>
        <HStack>
          <Button onClick={onClose} variant={'whiteBase'}>
            {t('common:common.Cancel')}
          </Button>
          <Button onClick={onConfirm}>{t('common:common.Confirm')}</Button>
        </HStack>
      </ModalFooter>
    </MyModal>
  );
}

export default ChangeOwnerModal;
