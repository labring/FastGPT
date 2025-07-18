import React, { useCallback } from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useUserStore } from '@/web/support/user/useUserStore';
import { clearToken } from '@/web/support/user/auth';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import MyIcon from '@fastgpt/web/components/common/Icon';

type UserAvatarPopoverProps = {
  children: React.ReactNode;
  placement?: Parameters<typeof MyPopover>[0]['placement'];
};

const UserAvatarPopover = ({ children, placement = 'top-end' }: UserAvatarPopoverProps) => {
  const { t } = useTranslation();
  const { setUserInfo } = useUserStore();

  const { openConfirm, ConfirmModal } = useConfirm({ content: t('common:confirm_logout') });

  const handleLogout = useCallback(() => {
    setUserInfo(null);
    clearToken();
  }, [setUserInfo]);

  return (
    <>
      <MyPopover
        Trigger={<Box cursor="pointer">{children}</Box>}
        trigger="hover"
        placement={placement}
        w="160px"
      >
        {({ onClose }) => {
          const onLogout = useCallback(() => {
            onClose();
            openConfirm(handleLogout)();
          }, [onClose]);

          return (
            <Flex p={2} direction="column" gap={3}>
              <Flex
                alignItems="center"
                cursor="pointer"
                _hover={{ bg: 'myGray.100' }}
                py={1}
                px={2}
                borderRadius="4px"
                gap={1}
                onClick={onLogout}
                w="100%"
              >
                <MyIcon name="core/chat/sidebar/logout" />
                <Text fontSize="14px"> {t('common:logout')}</Text>
              </Flex>
            </Flex>
          );
        }}
      </MyPopover>

      <ConfirmModal />
    </>
  );
};

export default UserAvatarPopover;
