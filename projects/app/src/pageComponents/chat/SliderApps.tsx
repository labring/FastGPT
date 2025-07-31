import React, { useCallback, useEffect, useState } from 'react';
import { Flex, Box, HStack, Image, Text, Skeleton } from '@chakra-ui/react';
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
import { ChatSidebarPanelEnum, type CollapseStatusType } from '@/global/core/chat/constants';
import type { ChatSettingSchema } from '@fastgpt/global/core/chat/type';
import { useSystemStore } from '@/web/common/system/useSystemStore';

type Props = {
  activeAppId: string;
  apps: AppListItemType[];
  pane: ChatSidebarPanelEnum;
  collapse: CollapseStatusType;
  logos: Pick<ChatSettingSchema, 'wideLogoUrl' | 'squareLogoUrl'>;
  onCollapse: (collapse: CollapseStatusType) => void;
  onPaneChange: (pane: ChatSidebarPanelEnum) => void;
};

const MotionBox = motion(Box);
const MotionFlex = motion(Flex);

// define animation config
const sidebarVariants = {
  expanded: {
    width: 202,
    transition: {
      duration: 0.1,
      ease: 'easeInOut'
    }
  },
  folded: {
    width: 72,
    transition: {
      duration: 0.1,
      ease: 'easeInOut'
    }
  }
};

const contentVariants = {
  show: {
    opacity: 1,
    transition: {
      duration: 0.1,
      delay: 0.1 // wait for sidebar width change to complete
    }
  },
  hide: {
    opacity: 0,
    transition: {
      duration: 0.01 // content fade out quickly
    }
  }
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
  //------------ hooks ------------//
  const router = useRouter();
  const { t } = useTranslation();

  //------------ stores ------------//
  const { feConfigs } = useSystemStore();
  const { userInfo, teamPlanStatus } = useUserStore();

  //------------ states ------------//
  const [imageLoaded, setImageLoaded] = useState(false);

  //------------ derived states ------------//
  const isTeamChat = router.pathname === '/chat/team';
  const { avatar, username } = userInfo as NonNullable<typeof userInfo>;
  const isCommercialVersion = !!feConfigs.isPlus;
  const isEnterprisePlan = !!teamPlanStatus?.standard?.currentSubLevel;
  const isWideLogoEmpty = !logos.wideLogoUrl;
  const isSquareLogoEmpty = !logos.squareLogoUrl;
  const showDefaultWideLogo = isCommercialVersion
    ? isWideLogoEmpty
    : isEnterprisePlan
      ? isWideLogoEmpty
      : true;
  const showDefaultSquareLogo = isCommercialVersion
    ? isSquareLogoEmpty
    : isEnterprisePlan
      ? isSquareLogoEmpty
      : true;
  const wideLogoSrc = showDefaultWideLogo ? '/imgs/fastgpt_slogan.png' : logos.wideLogoUrl;
  const squareLogoSrc = showDefaultSquareLogo
    ? '/imgs/fastgpt_slogan_fold.svg'
    : logos.squareLogoUrl;

  const isLoggedIn = !!userInfo;

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
    pane === ChatSidebarPanelEnum.RECENTLY_USED_APPS && id === activeAppId;

  const handleToggleSidebar = () => onCollapse(collapse === 0 ? 1 : 0);

  const handleSelectRecentlyUsedApp = useCallback(
    (id: string) => {
      if (pane === ChatSidebarPanelEnum.RECENTLY_USED_APPS && id === activeAppId) return;
      onPaneChange(ChatSidebarPanelEnum.RECENTLY_USED_APPS);
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
      <MotionFlex
        mt={4}
        alignItems={'center'}
        py={2}
        justifyContent={'space-between'}
        animate={{ paddingLeft: collapse ? 0 : 12 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
      >
        <AnimatePresence mode="wait">
          {!collapse && (
            <MotionBox variants={contentVariants} initial="hide" animate="show" exit="hide">
              <MotionBox layout={false}>
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
                    src={wideLogoSrc}
                    alt="FastGPT slogan"
                    loading="eager"
                    onLoad={() => setImageLoaded(true)}
                    onError={() => setImageLoaded(true)}
                  />
                </Skeleton>
              </MotionBox>
            </MotionBox>
          )}
        </AnimatePresence>

        {/* show folded logo when folded */}
        <AnimatePresence mode="wait">
          {collapse && (
            <MotionBox
              variants={contentVariants}
              initial="hide"
              animate="show"
              exit="hide"
              display="flex"
              justifyContent="center"
              w="100%"
            >
              <MotionBox layout={false}>
                <Image w="33px" h="33px" src={squareLogoSrc} alt="FastGPT logo" loading="eager" />
              </MotionBox>
            </MotionBox>
          )}
        </AnimatePresence>

        {/* show fold icon when expanded */}
        <AnimatePresence mode="wait">
          {!collapse && (
            <MotionBox variants={contentVariants} initial="hide" animate="show" exit="hide">
              <Flex pr={3}>
                <MotionBox layout={false}>
                  <MyIcon
                    p={1}
                    cursor={'pointer'}
                    borderRadius={'8px'}
                    _hover={{ bg: 'myGray.200' }}
                    name={'core/chat/sidebar/fold'}
                    onClick={handleToggleSidebar}
                  />
                </MotionBox>
              </Flex>
            </MotionBox>
          )}
        </AnimatePresence>
      </MotionFlex>

      <Flex mt={4} flexDirection={'column'} gap={1} px={4}>
        {/* show expand icon when folded */}
        <AnimatePresence mode="wait">
          {collapse && (
            <MotionBox variants={contentVariants} initial="hide" animate="show" exit="hide">
              <Flex
                p={2}
                flex={1}
                cursor={'pointer'}
                borderRadius={'8px'}
                alignItems={'center'}
                justifyContent={'center'}
                _hover={{ bg: 'myGray.200' }}
                onClick={handleToggleSidebar}
              >
                <MotionBox layout={false}>
                  <MyIcon
                    w={'20px'}
                    h={'20px'}
                    viewBox={'0 0 20 20'}
                    name={'core/chat/sidebar/expand'}
                  />
                </MotionBox>
              </Flex>
            </MotionBox>
          )}
        </AnimatePresence>
      </Flex>

      <AnimatePresence mode="wait">
        {!collapse && (
          <MotionBox
            variants={contentVariants}
            initial="hide"
            animate="show"
            exit="hide"
            flex="1"
            display="flex"
            flexDirection="column"
            overflow="hidden"
          >
            <MyDivider h={1} my={1} mx="16px" w="calc(100% - 32px)" />

            {!isTeamChat && (
              <>
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
              </>
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
                    ? {
                        bg: 'primary.100',
                        color: 'primary.600'
                      }
                    : {
                        _hover: {
                          bg: 'primary.100',
                          color: 'primary.600'
                        },
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
          </MotionBox>
        )}
      </AnimatePresence>

      {/* 底部区域 - 头像和设置按钮 */}
      <MotionBox mt={'auto'} px={3} py={4} layout={false}>
        <MotionFlex
          flexDirection={collapse ? 'column' : 'row'}
          alignItems={'center'}
          justifyContent={collapse ? 'center' : 'space-between'}
          gap={collapse ? 3 : 0}
          layout={false}
          h={collapse ? 'auto' : '40px'}
          minH="40px"
        >
          {/* 设置按钮 - 在收起状态时显示在上方，展开状态时显示在右侧 */}
          <MotionBox
            order={collapse ? 1 : 2}
            layout={false}
            w="40px"
            h="40px"
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            <Flex
              _hover={{ bg: 'myGray.200' }}
              bg={pane === ChatSidebarPanelEnum.SETTING ? 'myGray.200' : 'transparent'}
              borderRadius={'8px'}
              p={2}
              cursor={'pointer'}
              w="40px"
              h="40px"
              alignItems="center"
              justifyContent="center"
              onClick={() => onPaneChange(ChatSidebarPanelEnum.SETTING)}
            >
              <Flex alignItems={'center'} justifyContent={'center'}>
                <MyIcon
                  w={'20px'}
                  h={'20px'}
                  name={'common/setting'}
                  fill={pane === ChatSidebarPanelEnum.SETTING ? 'primary.500' : 'myGray.400'}
                />
              </Flex>
            </Flex>
          </MotionBox>

          {/* 头像区域 - 在收起状态时显示在下方，展开状态时显示在左侧 */}
          <MotionBox
            order={collapse ? 2 : 1}
            layout={false}
            w={collapse ? '40px' : '100%'}
            h="40px"
            display="flex"
            alignItems="center"
            justifyContent={'flex-start'}
          >
            {isLoggedIn ? (
              <UserAvatarPopover
                collapse={collapse}
                placement={collapse ? 'right-start' : 'top-end'}
              >
                <Flex
                  alignItems="center"
                  gap={2}
                  w="100%"
                  h="40px"
                  minW={'40px'}
                  justifyContent={'center'}
                >
                  <Flex flexShrink={0} alignItems={'center'} justifyContent={'center'}>
                    <Avatar src={avatar} bg="myGray.200" borderRadius="50%" w={8} h={8} />
                  </Flex>
                  <AnimatePresence mode="wait">
                    {!collapse && (
                      <MotionBox
                        className="textEllipsis"
                        flexGrow={1}
                        fontSize={'sm'}
                        fontWeight={500}
                        variants={contentVariants}
                        initial="hide"
                        animate="show"
                        exit="hide"
                        overflow="hidden"
                        whiteSpace="nowrap"
                        textOverflow="ellipsis"
                        minW={0}
                      >
                        {username}
                      </MotionBox>
                    )}
                  </AnimatePresence>
                </Flex>
              </UserAvatarPopover>
            ) : (
              <Flex
                alignItems="center"
                gap={2}
                w="100%"
                h="40px"
                minW={collapse ? '40px' : 'auto'}
                justifyContent={collapse ? 'center' : 'flex-start'}
                cursor="pointer"
                _hover={{ bg: 'myGray.100' }}
                borderRadius="md"
                p={2}
              >
                <Box flexShrink={0}>
                  <Avatar bg="myGray.200" borderRadius="50%" w={8} h={8} />
                </Box>
                <AnimatePresence mode="wait">
                  {!collapse && (
                    <MotionBox
                      flexGrow={1}
                      fontWeight={500}
                      color="myGray.600"
                      variants={contentVariants}
                      initial="hide"
                      animate="show"
                      exit="hide"
                      overflow="hidden"
                      whiteSpace="nowrap"
                      textOverflow="ellipsis"
                      minW={0}
                    >
                      {t('login:Login')}
                    </MotionBox>
                  )}
                </AnimatePresence>
              </Flex>
            )}
          </MotionBox>
        </MotionFlex>
      </MotionBox>
    </MotionFlex>
  );
};

export default React.memo(SliderApps);
