import React, { useCallback } from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useUserStore } from '@/web/support/user/useUserStore';
import { clearToken } from '@/web/support/user/auth';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyIcon from '@fastgpt/web/components/common/Icon';

interface UserAvatarPopoverProps {
  userInfo: any;
  children: React.ReactNode;
  placement?: Parameters<typeof MyPopover>[0]['placement'];
}

const UserAvatarPopover = ({
  userInfo,
  children,
  placement = 'top-end'
}: UserAvatarPopoverProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { setUserInfo } = useUserStore();

  const { openConfirm, ConfirmModal } = useConfirm({ content: t('account:confirm_logout') });

  const handleLogout = useCallback(() => {
    setUserInfo(null);
    clearToken();
    toast({
      title: t('account:logout'),
      status: 'success'
    });
  }, [setUserInfo, toast, t]);

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
            <Box p={2}>
              <Flex direction="column" gap={3}>
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
                  <Text fontSize="14px"> {t('account:logout')}</Text>
                </Flex>
              </Flex>
            </Box>
          );
        }}
      </MyPopover>

      <ConfirmModal />
    </>
  );
};

export default UserAvatarPopover;
