import React, { useCallback } from 'react';
import type { BoxProps } from '@chakra-ui/react';
import { Flex, Box, HStack, Image } from '@chakra-ui/react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'next-i18next';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { type AppListItemType } from '@fastgpt/global/core/app/type';
import MyDivider from '@fastgpt/web/components/common/MyDivider';
import { useUserStore } from '@/web/support/user/useUserStore';
import UserAvatarPopover from '@/pageComponents/chat/UserAvatarPopover';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyIcon from '@fastgpt/web/components/common/Icon';
import {
  ChatSidebarPaneEnum,
  DEFAULT_LOGO_BANNER_COLLAPSED_URL,
  DEFAULT_LOGO_BANNER_URL
} from '@/pageComponents/chat/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useContextSelector } from 'use-context-selector';
import { ChatPageContext } from '@/web/core/chat/context/chatPageContext';
import { usePathname } from 'next/navigation';

type Props = {
  activeAppId: string;
};

const MotionBox = motion(Box);
const MotionFlex = motion(Flex);

const ANIMATION_DURATION = 0.15;
const ANIMATION_EASE = 'easeInOut';
const TEXT_DELAY = 0.1;

const contentVariants = {
  show: {
    opacity: 1,
    transition: { duration: 0.05, delay: 0.02 }
  },
  hide: {
    opacity: 0,
    transition: { duration: 0.05 }
  }
};

const textVariants = {
  show: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.1,
      delay: ANIMATION_DURATION + TEXT_DELAY,
      ease: 'easeOut'
    }
  },
  hide: {
    opacity: 0,
    x: -10,
    transition: {
      duration: 0.001,
      ease: 'easeIn'
    }
  }
};

// 图标快速动画（无延迟）
const iconVariants = {
  show: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.1,
      delay: 0.05,
      ease: 'easeOut'
    }
  },
  hide: {
    opacity: 0,
    scale: 0.8,
    transition: {
      duration: 0.1,
      ease: 'easeIn'
    }
  }
};

// 通用动画容器
const AnimatedSection: React.FC<
  {
    show: boolean;
    children: React.ReactNode;
    variant?: 'content' | 'text' | 'icon';
  } & BoxProps
> = ({ show, children, variant = 'content', ...props }) => {
  const getVariants = () => {
    switch (variant) {
      case 'text':
        return textVariants;
      case 'icon':
        return iconVariants;
      default:
        return contentVariants;
    }
  };

  return (
    <AnimatePresence mode="wait">
      {show && (
        <MotionBox
          variants={getVariants()}
          initial="hide"
          animate="show"
          exit="hide"
          layout={false}
          {...props}
        >
          {children}
        </MotionBox>
      )}
    </AnimatePresence>
  );
};

// 文字动画组件
type AnimatedTextProps = {
  show: boolean;
  children: React.ReactNode;
  className?: string;
  [key: string]: any;
};

const AnimatedText: React.FC<AnimatedTextProps> = ({ show, children, className, ...props }) => (
  <AnimatePresence mode="wait">
    {show && (
      <MotionBox
        variants={textVariants}
        initial="hide"
        animate="show"
        exit="hide"
        className={className}
        layout={false}
        {...props}
      >
        {children}
      </MotionBox>
    )}
  </AnimatePresence>
);

const LogoSection = () => {
  const isCollapsed = useContextSelector(ChatPageContext, (v) => v.collapse === 1);
  const logos = useContextSelector(ChatPageContext, (v) => v.logos);
  const isHomeActive = useContextSelector(
    ChatPageContext,
    (v) => v.pane === ChatSidebarPaneEnum.HOME
  );
  const onTriggerCollapse = useContextSelector(ChatPageContext, (v) => v.onTriggerCollapse);
  const wideLogoSrc = logos.wideLogoUrl;
  const squareLogoSrc = logos.squareLogoUrl;

  return (
    <MotionFlex
      mt={4}
      py={2}
      alignItems="center"
      animate={{ paddingLeft: isCollapsed ? 0 : 12 }}
      transition={{ duration: ANIMATION_DURATION, ease: ANIMATION_EASE }}
      justifyContent={isCollapsed ? 'center' : 'space-between'}
    >
      <AnimatedSection show={!isCollapsed}>
        <Image
          w="135px"
          h="33px"
          loading="eager"
          alt="FastGPT slogan"
          src={wideLogoSrc || DEFAULT_LOGO_BANNER_URL}
          fallbackSrc={DEFAULT_LOGO_BANNER_URL}
        />
      </AnimatedSection>

      <AnimatedSection show={isCollapsed}>
        <Flex justifyContent="center" w="100%">
          <Image
            w="33px"
            h="33px"
            src={squareLogoSrc || DEFAULT_LOGO_BANNER_COLLAPSED_URL}
            fallbackSrc={DEFAULT_LOGO_BANNER_COLLAPSED_URL}
            alt="FastGPT logo"
            loading="eager"
          />
        </Flex>
      </AnimatedSection>

      <AnimatedSection show={!isCollapsed}>
        <Flex pr={3}>
          <MyIcon
            p={1}
            cursor={'pointer'}
            borderRadius={'8px'}
            _hover={{ bg: 'myGray.200' }}
            name={'core/chat/sidebar/fold'}
            color={isHomeActive ? 'primary.500' : 'myGray.400'}
            onClick={onTriggerCollapse}
          />
        </Flex>
      </AnimatedSection>
    </MotionFlex>
  );
};

const ActionButton: React.FC<{
  text?: string;
  isActive?: boolean;
  isCollapsed: boolean;
  icon: Parameters<typeof MyIcon>[0]['name'];
  onClick: () => void;
}> = ({ icon, text, isActive = false, isCollapsed, onClick }) => {
  return (
    <Flex
      p={2}
      flex={1}
      cursor={'pointer'}
      borderRadius={'8px'}
      alignItems={'center'}
      justifyContent={isCollapsed ? 'center' : 'flex-start'}
      {...(isActive
        ? {
            bg: 'primary.100',
            color: 'primary.600'
          }
        : {
            bg: 'transparent',
            color: 'myGray.500',
            _hover: {
              bg: isCollapsed ? 'myGray.200' : 'primary.100'
            }
          })}
      onClick={onClick}
    >
      <MyIcon w="20px" h="20px" name={icon} viewBox="0 0 20 20" mr={isCollapsed ? 0 : 2} />
      <AnimatedText
        show={!isCollapsed && !!text}
        fontSize="sm"
        fontWeight={500}
        flexShrink={0}
        whiteSpace="nowrap"
      >
        {text}
      </AnimatedText>
    </Flex>
  );
};

const NavigationSection = () => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();

  const isEnableHome = useContextSelector(
    ChatPageContext,
    (v) => v.chatSettings?.enableHome ?? true
  );
  const isCollapsed = useContextSelector(ChatPageContext, (v) => v.collapse === 1);
  const onTriggerCollapse = useContextSelector(ChatPageContext, (v) => v.onTriggerCollapse);
  const isHomeActive = useContextSelector(
    ChatPageContext,
    (v) => v.pane === ChatSidebarPaneEnum.HOME
  );
  const isTeamAppsActive = useContextSelector(
    ChatPageContext,
    (v) => v.pane === ChatSidebarPaneEnum.TEAM_APPS
  );
  const isFavouriteAppsActive = useContextSelector(
    ChatPageContext,
    (v) => v.pane === ChatSidebarPaneEnum.FAVORITE_APPS
  );
  const handlePaneChange = useContextSelector(ChatPageContext, (v) => v.handlePaneChange);

  return (
    <Flex mt={4} flexDirection={'column'} gap={1} px={4}>
      <AnimatedSection show={isCollapsed}>
        <ActionButton isCollapsed icon="core/chat/sidebar/expand" onClick={onTriggerCollapse} />
      </AnimatedSection>

      <AnimatePresence mode="wait">
        {isCollapsed ? (
          <AnimatedSection show={true}>
            <Flex flexDir="column" gap={2}>
              {feConfigs.isPlus && (
                <>
                  {isEnableHome && (
                    <ActionButton
                      icon="core/chat/sidebar/home"
                      isCollapsed={true}
                      isActive={isHomeActive}
                      onClick={() => handlePaneChange(ChatSidebarPaneEnum.HOME)}
                    />
                  )}

                  <ActionButton
                    icon="core/chat/sidebar/star"
                    isCollapsed={true}
                    isActive={isFavouriteAppsActive}
                    onClick={() => handlePaneChange(ChatSidebarPaneEnum.FAVORITE_APPS)}
                  />
                </>
              )}

              <ActionButton
                icon="common/app"
                isCollapsed={true}
                isActive={isTeamAppsActive}
                onClick={() => handlePaneChange(ChatSidebarPaneEnum.TEAM_APPS)}
              />
            </Flex>
          </AnimatedSection>
        ) : (
          <AnimatedSection show={true}>
            <Flex flexDir="column" gap={2}>
              {feConfigs.isPlus && (
                <>
                  {isEnableHome && (
                    <ActionButton
                      icon="core/chat/sidebar/home"
                      text={t('chat:sidebar.home')}
                      isCollapsed={false}
                      isActive={isHomeActive}
                      onClick={() => handlePaneChange(ChatSidebarPaneEnum.HOME)}
                    />
                  )}

                  <ActionButton
                    icon="core/chat/sidebar/star"
                    text={t('chat:sidebar.favourite_apps')}
                    isCollapsed={false}
                    isActive={isFavouriteAppsActive}
                    onClick={() => handlePaneChange(ChatSidebarPaneEnum.FAVORITE_APPS)}
                  />
                </>
              )}

              <ActionButton
                icon="common/app"
                text={t('chat:sidebar.team_apps')}
                isCollapsed={false}
                isActive={isTeamAppsActive}
                onClick={() => handlePaneChange(ChatSidebarPaneEnum.TEAM_APPS)}
              />
            </Flex>
          </AnimatedSection>
        )}
      </AnimatePresence>
    </Flex>
  );
};

const BottomSection = () => {
  const pathname = usePathname();
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const isProVersion = !!feConfigs.isPlus;

  const { userInfo } = useUserStore();
  const isLoggedIn = !!userInfo;
  const avatar = userInfo?.avatar;
  const isAdmin = !!userInfo?.team.permission.hasManagePer;
  const isShare = pathname === '/chat/share';

  const isCollapsed = useContextSelector(ChatPageContext, (v) => v.collapse === 1);
  const isSettingActive = useContextSelector(
    ChatPageContext,
    (v) => v.pane === ChatSidebarPaneEnum.SETTING
  );
  const onSettingClick = useContextSelector(ChatPageContext, (v) => v.handlePaneChange);

  return (
    <MotionBox mt={'auto'} px={3} py={4} layout={false}>
      <MotionFlex
        flexDirection={isCollapsed ? 'column' : 'row'}
        alignItems={'center'}
        justifyContent={isCollapsed ? 'center' : 'space-between'}
        gap={isCollapsed ? 3 : 0}
        layout={false}
        h={isCollapsed ? 'auto' : '40px'}
        minH="40px"
      >
        {isAdmin && isProVersion && !isShare && (
          <MotionBox
            order={isCollapsed ? 1 : 2}
            layout={false}
            w="40px"
            h="40px"
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            <Flex
              _hover={{ bg: 'myGray.200' }}
              bg={isSettingActive ? 'myGray.200' : 'transparent'}
              borderRadius={'8px'}
              p={2}
              cursor={'pointer'}
              w="40px"
              h="40px"
              alignItems="center"
              justifyContent="center"
              onClick={() => onSettingClick(ChatSidebarPaneEnum.SETTING)}
            >
              <MyIcon
                w={'20px'}
                h={'20px'}
                name={'common/setting'}
                fill={isSettingActive ? 'primary.500' : 'myGray.400'}
              />
            </Flex>
          </MotionBox>
        )}

        <MotionBox
          order={isCollapsed ? 2 : 1}
          layout={false}
          w={isCollapsed ? '40px' : '100%'}
          h="40px"
          display="flex"
          alignItems="center"
          justifyContent={'flex-start'}
          maxW={isCollapsed ? 'fit-content' : 'calc(100% - 52px)'}
        >
          {isLoggedIn ? (
            <UserAvatarPopover
              isCollapsed={isCollapsed}
              placement={isCollapsed ? 'right-start' : 'top-end'}
            >
              <Flex
                alignItems="center"
                gap={2}
                w="100%"
                h="40px"
                minW={'40px'}
                justifyContent={'center'}
              >
                <Avatar src={avatar} bg="myGray.200" borderRadius="50%" w={8} h={8} />
                <AnimatedText
                  show={!isCollapsed}
                  className="textEllipsis"
                  flexGrow={1}
                  fontSize={'sm'}
                  fontWeight={500}
                  minW={0}
                >
                  {userInfo?.team?.memberName}
                </AnimatedText>
              </Flex>
            </UserAvatarPopover>
          ) : (
            <Flex
              alignItems="center"
              gap={2}
              w="100%"
              h="40px"
              minW={isCollapsed ? '40px' : 'auto'}
              justifyContent={isCollapsed ? 'center' : 'flex-start'}
              cursor="pointer"
              _hover={{ bg: 'myGray.100' }}
              borderRadius="md"
              p={2}
            >
              <Avatar bg="myGray.200" borderRadius="50%" w={8} h={8} />
              <AnimatedText
                show={!isCollapsed}
                flexGrow={1}
                fontWeight={500}
                color="myGray.600"
                overflow="hidden"
                whiteSpace="nowrap"
                textOverflow="ellipsis"
                minW={0}
              >
                {t('login:Login')}
              </AnimatedText>
            </Flex>
          )}
        </MotionBox>
      </MotionFlex>
    </MotionBox>
  );
};

const ChatSlider = ({ activeAppId }: Props) => {
  const { t } = useTranslation();

  const isCollapsed = useContextSelector(ChatPageContext, (v) => v.collapse === 1);
  const pane = useContextSelector(ChatPageContext, (v) => v.pane);
  const myApps = useContextSelector(ChatPageContext, (v) => v.myApps);

  const handlePaneChange = useContextSelector(ChatPageContext, (v) => v.handlePaneChange);

  return (
    <MotionFlex
      flexDirection={'column'}
      h={'100%'}
      w={'100%'}
      variants={{
        expanded: {
          transition: { duration: ANIMATION_DURATION, ease: ANIMATION_EASE }
        },
        folded: {
          transition: { duration: ANIMATION_DURATION, ease: ANIMATION_EASE }
        }
      }}
      animate={isCollapsed ? 'folded' : 'expanded'}
      initial={false}
      userSelect={'none'}
    >
      <LogoSection />

      <NavigationSection />

      {/* recently used apps */}
      <AnimatedSection show={!isCollapsed} display={'flex'} flexDir={'column'} flex={'1 0 0'}>
        <MyDivider h={1} my={1} mx="16px" w="calc(100% - 32px)" />

        <HStack px={3} my={2} color={'myGray.500'} fontSize={'sm'} justifyContent={'space-between'}>
          <Box
            whiteSpace={'nowrap'}
            overflow={'hidden'}
            textOverflow={'ellipsis'}
            pl={2}
            flexGrow={1}
          >
            {t('common:core.chat.Recent use')}
          </Box>
        </HStack>

        <MyBox flex={'1 0 0'} h={0} overflow={'overlay'} px={4} position={'relative'}>
          {myApps.map((item) => (
            <Flex
              key={item.appId}
              py={2}
              px={2}
              mb={3}
              cursor={'pointer'}
              borderRadius={'md'}
              alignItems={'center'}
              fontSize={'sm'}
              {...(pane === ChatSidebarPaneEnum.RECENTLY_USED_APPS && item.appId === activeAppId
                ? { bg: 'primary.100', color: 'primary.600' }
                : {
                    _hover: { bg: 'primary.100' },
                    onClick: () =>
                      handlePaneChange(ChatSidebarPaneEnum.RECENTLY_USED_APPS, item.appId)
                  })}
            >
              <Avatar src={item.avatar} w={'1.5rem'} borderRadius={'md'} />
              <Box ml={2} className={'textEllipsis'}>
                {item.name}
              </Box>
            </Flex>
          ))}
        </MyBox>
      </AnimatedSection>

      <BottomSection />
    </MotionFlex>
  );
};

export default React.memo(ChatSlider);
