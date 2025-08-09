import React, { useCallback, useState } from 'react';
import { Flex, Box, HStack, Image, Skeleton } from '@chakra-ui/react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { type AppListItemType } from '@fastgpt/global/core/app/type';
import MyDivider from '@fastgpt/web/components/common/MyDivider';
import { useUserStore } from '@/web/support/user/useUserStore';
import UserAvatarPopover from '@/pageComponents/chat/UserAvatarPopover';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import SelectOneResource from '@/components/common/folder/SelectOneResource';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type {
  GetResourceFolderListProps,
  GetResourceListItemResponse
} from '@fastgpt/global/common/parentFolder/type';
import { getMyApps } from '@/web/core/app/api';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { ChatSidebarPaneEnum, type CollapseStatusType } from '@/web/components/chat/constants';
import type { ChatSettingSchema } from '@fastgpt/global/core/chat/setting/type';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { StandardSubLevelEnum } from '@fastgpt/global/support/wallet/sub/constants';

type Props = {
  activeAppId: string;
  apps: AppListItemType[];
  pane: ChatSidebarPaneEnum;
  collapse: CollapseStatusType;
  logos: Pick<ChatSettingSchema, 'wideLogoUrl' | 'squareLogoUrl'>;
  onCollapse: (collapse: CollapseStatusType) => void;
  onPaneChange: (pane: ChatSidebarPaneEnum) => void;
};

const MotionBox = motion(Box);
const MotionFlex = motion(Flex);

const ANIMATION_DURATION = 0.15;
const ANIMATION_EASE = 'easeInOut';
const TEXT_DELAY = 0.1;

const sidebarVariants = {
  expanded: {
    width: 202,
    transition: { duration: ANIMATION_DURATION, ease: ANIMATION_EASE }
  },
  folded: {
    width: 72,
    transition: { duration: ANIMATION_DURATION, ease: ANIMATION_EASE }
  }
};

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
type AnimatedSectionProps = {
  show: boolean;
  children: React.ReactNode;
  variant?: 'content' | 'text' | 'icon';
};

const AnimatedSection: React.FC<AnimatedSectionProps> = ({
  show,
  children,
  variant = 'content'
}) => {
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

const LogoSection: React.FC<{
  isCollapsed: boolean;
  wideLogoSrc?: string;
  imageLoaded: boolean;
  squareLogoSrc?: string;
  isHomeActive?: boolean;
  showFoldButton?: boolean;
  onToggle?: () => void;
  onImageLoad: () => void;
}> = ({
  isCollapsed,
  wideLogoSrc,
  squareLogoSrc,
  imageLoaded,
  onImageLoad,
  showFoldButton,
  onToggle,
  isHomeActive
}) => (
  <MotionFlex
    mt={4}
    py={2}
    alignItems="center"
    animate={{ paddingLeft: isCollapsed ? 0 : 12 }}
    transition={{ duration: ANIMATION_DURATION, ease: ANIMATION_EASE }}
    justifyContent={isCollapsed ? 'center' : 'space-between'}
  >
    <AnimatedSection show={!isCollapsed}>
      <Skeleton
        w="143px"
        h="33px"
        pl={2}
        borderRadius="md"
        startColor="gray.100"
        endColor="gray.300"
        isLoaded={imageLoaded}
      >
        <Image
          w="135px"
          h="33px"
          loading="eager"
          alt="FastGPT slogan"
          src={wideLogoSrc}
          onLoad={onImageLoad}
          onError={onImageLoad}
        />
      </Skeleton>
    </AnimatedSection>

    <AnimatedSection show={isCollapsed}>
      <Flex justifyContent="center" w="100%">
        <Image w="33px" h="33px" src={squareLogoSrc} alt="FastGPT logo" loading="eager" />
      </Flex>
    </AnimatedSection>

    {showFoldButton && (
      <AnimatedSection show={!isCollapsed}>
        <Flex pr={3}>
          <MyIcon
            p={1}
            cursor={'pointer'}
            borderRadius={'8px'}
            _hover={{ bg: 'myGray.200' }}
            name={'core/chat/sidebar/fold'}
            color={isHomeActive ? 'primary.500' : 'myGray.400'}
            onClick={onToggle}
          />
        </Flex>
      </AnimatedSection>
    )}
  </MotionFlex>
);

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
      bg={isActive ? 'primary.100' : 'transparent'}
      color={isActive ? 'primary.600' : 'myGray.500'}
      _hover={{
        bg: isCollapsed ? 'myGray.200' : 'primary.100',
        color: 'primary.600'
      }}
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

const NavigationSection: React.FC<{
  isCollapsed: boolean;
  isHomeActive: boolean;
  onToggle: () => void;
  onHomeClick: () => void;
}> = ({ isCollapsed, isHomeActive, onToggle, onHomeClick }) => {
  //------------ hooks ------------//
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const isProVersion = !!feConfigs.isPlus;

  return (
    <Flex mt={4} flexDirection={'column'} gap={1} px={4}>
      <AnimatedSection show={isCollapsed}>
        <ActionButton isCollapsed icon="core/chat/sidebar/expand" onClick={onToggle} />
      </AnimatedSection>

      {isProVersion && (
        <AnimatePresence mode="wait">
          {isCollapsed ? (
            <AnimatedSection show={true}>
              <ActionButton
                icon="core/chat/sidebar/home"
                isCollapsed={true}
                isActive={isHomeActive}
                onClick={onHomeClick}
              />
            </AnimatedSection>
          ) : (
            <AnimatedSection show={true}>
              <ActionButton
                icon="core/chat/sidebar/home"
                text={t('chat:sidebar.home')}
                isCollapsed={false}
                isActive={isHomeActive}
                onClick={onHomeClick}
              />
            </AnimatedSection>
          )}
        </AnimatePresence>
      )}
    </Flex>
  );
};

const BottomSection: React.FC<{
  isCollapsed: boolean;
  isLoggedIn: boolean;
  isSettingActive: boolean;
  avatar?: string;
  username?: string;
  onSettingClick: () => void;
}> = ({ isCollapsed, isLoggedIn, isSettingActive, avatar, username, onSettingClick }) => {
  //------------ hooks ------------//
  const { t } = useTranslation();
  const { userInfo } = useUserStore();
  const { feConfigs } = useSystemStore();

  //------------ derived states ------------//
  const isAdmin = !!userInfo?.team.permission.hasManagePer;
  const isProVersion = !!feConfigs.isPlus;

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
        {isAdmin && isProVersion && (
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
              onClick={onSettingClick}
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
                  overflow="hidden"
                  whiteSpace="nowrap"
                  textOverflow="ellipsis"
                  minW={0}
                >
                  {username}
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

const SliderApps = ({
  apps,
  activeAppId,
  collapse,
  pane,
  logos,
  onCollapse,
  onPaneChange
}: Props) => {
  const router = useRouter();
  const { t } = useTranslation();

  const { feConfigs } = useSystemStore();
  const { userInfo, teamPlanStatus } = useUserStore();

  const [imageLoaded, setImageLoaded] = useState(false);

  const isLoggedIn = !!userInfo;
  const isTeamChat = router.pathname === '/chat/team';
  const { avatar, username } = userInfo as NonNullable<typeof userInfo>;
  const isProVersion = !!feConfigs.isPlus;
  const isEnterprisePlan =
    teamPlanStatus?.standard?.currentSubLevel === StandardSubLevelEnum.enterprise;
  const isWideLogoEmpty = !logos.wideLogoUrl;
  const isSquareLogoEmpty = !logos.squareLogoUrl;
  const showDefaultWideLogo = isProVersion
    ? isWideLogoEmpty
    : isEnterprisePlan
      ? isWideLogoEmpty
      : true;
  const showDefaultSquareLogo = isProVersion
    ? isSquareLogoEmpty
    : isEnterprisePlan
      ? isSquareLogoEmpty
      : true;
  const wideLogoSrc = showDefaultWideLogo ? '/imgs/fastgpt_banner.png' : logos.wideLogoUrl;
  const squareLogoSrc = showDefaultSquareLogo
    ? '/imgs/fastgpt_banner_fold.svg'
    : logos.squareLogoUrl;
  const isCollapsed = Boolean(collapse);
  const isHomeActive = pane === ChatSidebarPaneEnum.HOME;
  const isSettingActive = pane === ChatSidebarPaneEnum.SETTING;

  const getAppList = useCallback(async ({ parentId }: GetResourceFolderListProps) => {
    return getMyApps({
      parentId,
      type: [AppTypeEnum.folder, AppTypeEnum.simple, AppTypeEnum.workflow, AppTypeEnum.plugin]
    }).then((res) =>
      res.map<GetResourceListItemResponse>((item) => ({
        id: item._id,
        name: item.name,
        avatar: item.avatar,
        isFolder: item.type === AppTypeEnum.folder
      }))
    );
  }, []);

  const isRecentlyUsedAppSelected = (id: string): boolean =>
    pane === ChatSidebarPaneEnum.RECENTLY_USED_APPS && id === activeAppId;

  const handleToggleSidebar = () => onCollapse(collapse === 0 ? 1 : 0);

  const handleSelectRecentlyUsedApp = useCallback(
    (id: string) => {
      if (pane === ChatSidebarPaneEnum.RECENTLY_USED_APPS && id === activeAppId) return;
      onPaneChange(ChatSidebarPaneEnum.RECENTLY_USED_APPS);
      router.replace({ query: { ...router.query, appId: id } });
    },
    [pane, router, activeAppId, onPaneChange]
  );

  return (
    <MotionFlex
      flexDirection={'column'}
      h={'100%'}
      variants={sidebarVariants}
      animate={collapse ? 'folded' : 'expanded'}
      initial={false}
      overflow={'hidden'}
    >
      <LogoSection
        isCollapsed={isCollapsed}
        wideLogoSrc={wideLogoSrc}
        squareLogoSrc={squareLogoSrc}
        imageLoaded={imageLoaded}
        onImageLoad={() => setImageLoaded(true)}
        showFoldButton={true}
        onToggle={handleToggleSidebar}
        isHomeActive={isHomeActive}
      />

      <NavigationSection
        isCollapsed={isCollapsed}
        isHomeActive={isHomeActive}
        onToggle={handleToggleSidebar}
        onHomeClick={() => onPaneChange(ChatSidebarPaneEnum.HOME)}
      />

      {/* recently used apps */}
      <AnimatedSection show={!isCollapsed}>
        <Box flex="1" display="flex" flexDirection="column" overflow="hidden">
          <MyDivider h={1} my={1} mx="16px" w="calc(100% - 32px)" />

          {!isTeamChat && (
            <HStack
              px={3}
              my={2}
              color={'myGray.500'}
              fontSize={'sm'}
              justifyContent={'space-between'}
            >
              <Box
                whiteSpace={'nowrap'}
                overflow={'hidden'}
                textOverflow={'ellipsis'}
                pl={2}
                flexGrow={1}
              >
                {t('common:core.chat.Recent use')}
              </Box>
              <MyPopover
                placement="bottom-end"
                offset={[20, 10]}
                p={4}
                trigger="hover"
                Trigger={
                  <HStack
                    spacing={0.5}
                    cursor={'pointer'}
                    px={2}
                    py={'0.5'}
                    borderRadius={'md'}
                    mr={-2}
                    userSelect={'none'}
                    _hover={{ bg: 'myGray.200' }}
                  >
                    <Box>{t('common:More')}</Box>
                    <MyIcon name={'common/select'} w={'1rem'} />
                  </HStack>
                }
              >
                {({ onClose }) => (
                  <Box minH={'200px'}>
                    <SelectOneResource
                      maxH={'60vh'}
                      value={activeAppId}
                      onSelect={(item) => {
                        if (!item) return;
                        handleSelectRecentlyUsedApp(item.id);
                        onClose();
                      }}
                      server={getAppList}
                    />
                  </Box>
                )}
              </MyPopover>
            </HStack>
          )}

          <MyBox flex={'1'} overflow={'overlay'} px={4} position={'relative'}>
            {apps.map((item) => (
              <Flex
                key={item._id}
                py={2}
                px={2}
                mb={3}
                cursor={'pointer'}
                borderRadius={'md'}
                alignItems={'center'}
                fontSize={'sm'}
                {...(isRecentlyUsedAppSelected(item._id)
                  ? { bg: 'primary.100', color: 'primary.600' }
                  : {
                      _hover: { bg: 'primary.100', color: 'primary.600' },
                      onClick: () => handleSelectRecentlyUsedApp(item._id)
                    })}
              >
                <Avatar src={item.avatar} w={'1.5rem'} borderRadius={'md'} />
                <Box ml={2} className={'textEllipsis'}>
                  {item.name}
                </Box>
              </Flex>
            ))}
          </MyBox>
        </Box>
      </AnimatedSection>

      <BottomSection
        isCollapsed={isCollapsed}
        isLoggedIn={isLoggedIn}
        isSettingActive={isSettingActive}
        avatar={avatar}
        username={username}
        onSettingClick={() => onPaneChange(ChatSidebarPaneEnum.SETTING)}
      />
    </MotionFlex>
  );
};

export default React.memo(SliderApps);
