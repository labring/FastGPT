import React, { useCallback } from 'react';
import { Box, Flex, Text, useDisclosure } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useUserStore } from '@/web/support/user/useUserStore';
import { clearToken } from '@/web/support/user/auth';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
import LanguageMenuItems from '@/pageComponents/chat/LanguageSelector/LanguageMenuItems';
import { useChatLanguageSwitch } from '@/pageComponents/chat/LanguageSelector/useChatLanguageSwitch';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import PhoneDrawer from '@fastgpt/web/components/common/PhoneDrawer';

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
  const { isPc } = useSystem();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { currentLang, onChangeLanguage } = useChatLanguageSwitch('account');

  const { openConfirm, ConfirmModal } = useConfirm({ content: t('common:confirm_logout') });

  const handleLogout = useCallback(() => {
    setUserInfo(null);
    clearToken();
  }, [setUserInfo]);

  const onLogout = useCallback(
    (closeMenu?: () => void) => {
      closeMenu?.();
      openConfirm({ onConfirm: handleLogout })();
    },
    [handleLogout, openConfirm]
  );

  const logoutContent = (
    <>
      <MyIcon name="core/chat/sidebar/logout" w="18px" />
      <Text fontSize="14px">{t('common:logout')}</Text>
    </>
  );

  // 移动端没有 hover，头像点击后复用通用底部抽屉，并额外挂载登出操作。
  if (!isPc) {
    return (
      <>
        <Box cursor="pointer" w="full" onClick={onOpen}>
          {children}
        </Box>

        <PhoneDrawer
          isOpen={isOpen}
          onClose={onClose}
          bodyProps={{ display: 'flex', flexDirection: 'column', gap: 3 }}
        >
          <LanguageMenuItems
            currentLang={currentLang}
            variant="mobileList"
            onSelect={(lng) => onChangeLanguage(lng, onClose)}
          />

          <Box borderTop="1px solid" borderColor="myGray.150" w="100%" />

          <Flex
            alignItems="center"
            cursor="pointer"
            _hover={{ bg: 'myGray.100' }}
            py={1}
            px={2}
            borderRadius="4px"
            gap={1}
            h="44px"
            color="myGray.600"
            fontWeight={500}
            letterSpacing="0.15px"
            onClick={() => onLogout(onClose)}
            w="100%"
          >
            <MyIcon name="core/chat/sidebar/logout" w="16px" />
            <Text fontSize="16px" lineHeight="24px">
              {t('common:logout')}
            </Text>
          </Flex>
        </PhoneDrawer>

        <ConfirmModal />
      </>
    );
  }

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
        w="178px"
        {...props}
      >
        {({ onClose }) => (
          <Flex p={2} direction="column" gap={1}>
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

            <LanguageMenuItems
              currentLang={currentLang}
              variant="list"
              onSelect={(lng) => onChangeLanguage(lng, onClose)}
            />

            <Box borderTop="1px solid" borderColor="myGray.100" w="100%" />

            <Flex
              alignItems="center"
              cursor="pointer"
              _hover={{ bg: 'myGray.100' }}
              py={1}
              px={2}
              borderRadius="4px"
              gap={1}
              h="30px"
              onClick={() => onLogout(onClose)}
              w="100%"
            >
              {logoutContent}
            </Flex>
          </Flex>
        )}
      </MyPopover>

      <ConfirmModal />
    </>
  );
};

export default UserAvatarPopover;
