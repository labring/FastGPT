import React, { useCallback, useState } from 'react';
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
import {
  ChatSidebarActionEnum,
  ChatSidebarExpandEnum,
  useChatSidebarContext
} from '@/web/core/chat/context/chatSidebarContext';

const MotionBox = motion(Box);
const MotionFlex = motion(Flex);

// 定义动画配置
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
      delay: 0.1 // 等sidebar宽度变化完成后再显示内容
    }
  },
  hide: {
    opacity: 0,
    transition: {
      duration: 0.1 // 内容快速淡出
    }
  }
};

const SliderApps = ({ apps, activeAppId }: { apps: AppListItemType[]; activeAppId: string }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const isTeamChat = router.pathname === '/chat/team';
  const { userInfo } = useUserStore();

  const { expand, action, isFolded, setAction, setExpand } = useChatSidebarContext();

  const [imageLoaded, setImageLoaded] = useState(false);

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

  const onChangeApp = useCallback(
    (appId: string) => {
      router.replace({
        query: {
          ...router.query,
          appId
        }
      });
    },
    [router]
  );

  const handleToggleSidebar = useCallback(() => {
    switch (expand) {
      case ChatSidebarExpandEnum.FOLD:
        setExpand(ChatSidebarExpandEnum.EXPAND);
        break;
      case ChatSidebarExpandEnum.EXPAND:
        setExpand(ChatSidebarExpandEnum.FOLD);
        break;
    }
  }, [expand, setExpand]);

  return (
    <MotionFlex
      flexDirection={'column'}
      h={'100%'}
      variants={sidebarVariants}
      animate={isFolded ? 'folded' : 'expanded'}
      initial={false}
      overflow={'hidden'}
    >
      <MotionFlex
        mt={4}
        alignItems={'center'}
        py={2}
        justifyContent={'space-between'}
        animate={{ paddingLeft: isFolded ? 0 : 12 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
      >
        <AnimatePresence mode="wait">
          {!isFolded && (
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
                    src="/imgs/fastgpt_slogan.png"
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

        {/* 收起状态时显示折叠版logo */}
        <AnimatePresence mode="wait">
          {isFolded && (
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
                <Image
                  w="32px"
                  h="32px"
                  src="/imgs/fastgpt_slogan_fold.png"
                  alt="FastGPT logo"
                  loading="eager"
                />
              </MotionBox>
            </MotionBox>
          )}
        </AnimatePresence>

        {/* 展开状态时显示fold图标 */}
        <AnimatePresence mode="wait">
          {!isFolded && (
            <MotionBox variants={contentVariants} initial="hide" animate="show" exit="hide">
              <Flex pr={3}>
                <MotionBox layout={false}>
                  <MyIcon
                    name={'core/chat/sidebar/fold'}
                    p={2}
                    cursor={'pointer'}
                    onClick={handleToggleSidebar}
                    _hover={{
                      bg: 'myGray.200'
                    }}
                    borderRadius={'8px'}
                  />
                </MotionBox>
              </Flex>
            </MotionBox>
          )}
        </AnimatePresence>
      </MotionFlex>

      <Flex mt={4} flexDirection={'column'} gap={1} px={4}>
        {/* 收起状态时显示expand图标 */}
        <AnimatePresence mode="wait">
          {isFolded && (
            <MotionBox variants={contentVariants} initial="hide" animate="show" exit="hide">
              <Flex
                flex={1}
                alignItems={'center'}
                justifyContent={'center'}
                p={2}
                cursor={'pointer'}
                _hover={{
                  bg: 'myGray.200'
                }}
                borderRadius={'8px'}
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

        <Flex
          flex={1}
          alignItems={'center'}
          gap={2}
          p={2}
          cursor={'pointer'}
          _hover={{
            bg: 'myGray.200'
          }}
          borderRadius={'8px'}
          color={action === ChatSidebarActionEnum.HOME ? 'primary.600' : 'myGray.500'}
          bg={action === ChatSidebarActionEnum.HOME ? 'myGray.200' : 'transparent'}
          fontSize={14}
          fontWeight={500}
          onClick={() => setAction(ChatSidebarActionEnum.HOME)}
        >
          <Flex flexGrow={isFolded ? 1 : 0} alignItems={'center'} justifyContent={'center'}>
            <MotionBox layout={false}>
              <MyIcon
                w={isFolded ? '20px' : '24px'}
                h={isFolded ? '20px' : '24px'}
                name={'core/chat/sidebar/home'}
              />
            </MotionBox>
          </Flex>

          {!isFolded && <Box userSelect={'none'}>{t('common:core.chat.side_bar Home')}</Box>}
        </Flex>
      </Flex>

      <AnimatePresence mode="wait">
        {!isFolded && (
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
                        _hover={{
                          bg: 'myGray.200'
                        }}
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
                            onChangeApp(item.id);
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
                  {...(item._id === activeAppId
                    ? {
                        bg: 'primary.100',
                        color: 'primary.600'
                      }
                    : {
                        _hover: {
                          bg: 'primary.100',
                          color: 'primary.600'
                        },
                        onClick: () => onChangeApp(item._id)
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
          flexDirection={isFolded ? 'column' : 'row'}
          alignItems={'center'}
          justifyContent={isFolded ? 'center' : 'space-between'}
          gap={isFolded ? 3 : 0}
          layout={false}
          h={isFolded ? 'auto' : '40px'}
          minH="40px"
        >
          {/* 设置按钮 - 在收起状态时显示在上方，展开状态时显示在右侧 */}
          <MotionBox
            order={isFolded ? 1 : 2}
            layout={false}
            w="40px"
            h="40px"
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            <Flex
              _hover={{ bg: 'myGray.200' }}
              borderRadius={'8px'}
              p={2}
              cursor={'pointer'}
              w="40px"
              h="40px"
              alignItems="center"
              justifyContent="center"
              onClick={() => setAction(ChatSidebarActionEnum.SETTING)}
            >
              <Flex alignItems={'center'} justifyContent={'center'}>
                <MyIcon w={'20px'} h={'20px'} name={'core/chat/sidebar/setting'} />
              </Flex>
            </Flex>
          </MotionBox>

          {/* 头像区域 - 在收起状态时显示在下方，展开状态时显示在左侧 */}
          <MotionBox
            order={isFolded ? 2 : 1}
            layout={false}
            w={isFolded ? '40px' : '100%'}
            h="40px"
            display="flex"
            alignItems="center"
            justifyContent={'flex-start'}
          >
            {userInfo ? (
              <UserAvatarPopover placement={isFolded ? 'right' : 'top-end'}>
                <Flex
                  alignItems="center"
                  gap={2}
                  w="100%"
                  h="40px"
                  minW={'40px'}
                  justifyContent={'center'}
                >
                  <Flex flexShrink={0} alignItems={'center'} justifyContent={'center'}>
                    <Avatar src={userInfo.avatar} bg="myGray.200" borderRadius="50%" w={8} h={8} />
                  </Flex>
                  <AnimatePresence mode="wait">
                    {!isFolded && (
                      <MotionBox
                        className="textEllipsis"
                        flexGrow={1}
                        fontSize={'sm'}
                        variants={contentVariants}
                        initial="hide"
                        animate="show"
                        exit="hide"
                        overflow="hidden"
                        whiteSpace="nowrap"
                        textOverflow="ellipsis"
                        minW={0}
                      >
                        {userInfo.username}
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
                minW={isFolded ? '40px' : 'auto'}
                justifyContent={isFolded ? 'center' : 'flex-start'}
                cursor="pointer"
                _hover={{ bg: 'myGray.100' }}
                borderRadius="md"
                p={2}
              >
                <Box flexShrink={0}>
                  <Avatar bg="myGray.200" borderRadius="50%" w={8} h={8} />
                </Box>
                <AnimatePresence mode="wait">
                  {!isFolded && (
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
