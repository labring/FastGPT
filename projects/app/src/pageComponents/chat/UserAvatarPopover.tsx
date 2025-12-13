import React, { useCallback } from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useUserStore } from '@/web/support/user/useUserStore';
import { clearToken } from '@/web/support/user/auth';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';

type UserAvatarPopoverProps = {
  isCollapsed: boolean;
  children: React.ReactNode;
  placement?: Parameters<typeof MyPopover>[0]['placement'];
};

const UserAvatarPopover = ({
  isCollapsed,
  children,
  placement = 'top-end',
  ...props
}: UserAvatarPopoverProps) => {
  const { t } = useTranslation();
  const { setUserInfo, userInfo } = useUserStore();

  const { openConfirm, ConfirmModal } = useConfirm({ content: t('common:confirm_logout') });

  const handleLogout = useCallback(() => {
    setUserInfo(null);
    clearToken();
  }, [setUserInfo]);

  return (
    <>
      <MyPopover
        Trigger={
          <Box cursor="pointer" w="full">
            {children}
          </Box>
        }
        trigger="hover"
        placement={placement}
        w="160px"
        {...props}
      >
        {({ onClose }) => {
          const onLogout = useCallback(() => {
            onClose();
            openConfirm({ onConfirm: handleLogout })();
          }, [onClose]);

          return (
            <Flex p={2} direction="column" gap={3}>
              {!!isCollapsed && (
                <Flex
                  borderBottom="1px solid"
                  alignItems="center"
                  borderColor="myGray.200"
                  pb={2}
                  px={2}
                  fontWeight="500"
                  fontSize="14px"
                  gap={2}
                >
                  <Avatar src={userInfo?.avatar} bg="myGray.200" borderRadius="50%" w={5} h={5} />
                  <Box flex="1 1 0" minW="0" whiteSpace="pre-wrap">
                    {userInfo?.team.memberName ?? '-'}
                  </Box>
                </Flex>
              )}

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
                <Text fontSize="14px">{t('common:logout')}</Text>
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
