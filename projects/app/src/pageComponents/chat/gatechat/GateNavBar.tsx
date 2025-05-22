import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Box, Flex, Text, HStack } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useGateStore } from '@/web/support/user/team/gate/useGateStore';
import { HUMAN_ICON } from '@fastgpt/global/common/system/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { AppListItemType } from '@fastgpt/global/core/app/type';
import { useRouter } from 'next/router';
import MyPopover from '@fastgpt/web/components/common/MyPopover/index';
import dynamic from 'next/dynamic';
import { getMyApps } from '@/web/core/app/api';
import type {
  GetResourceFolderListProps,
  GetResourceListItemResponse
} from '@fastgpt/global/common/parentFolder/type';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';

const SelectOneResource = dynamic(() => import('@/components/common/folder/SelectOneResource'));

type Props = {
  apps?: AppListItemType[];
  activeAppId?: string;
};

const GateNavBar = ({ apps, activeAppId }: Props) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { userInfo, setUserInfo } = useUserStore();
  const { initCopyRightConfig, copyRightConfig } = useGateStore();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const companyNameRef = useRef<HTMLSpanElement>(null);
  const [companyNameScale, setCompanyNameScale] = useState(1);
  const [showUserPopover, setShowUserPopover] = useState(false);
  const [userPopoverVisibility, setUserPopoverVisibility] = useState(false);
  const userPopoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isChatPage = router.pathname === '/chat/gate';
  const isStorePage = router.pathname === '/chat/gate/store';

  useEffect(() => {
    initCopyRightConfig();
  }, [initCopyRightConfig]);
  useEffect(() => {
    if (companyNameRef.current && !isCollapsed) {
      const containerWidth = 130;
      const scale = Math.min(1, containerWidth / (companyNameRef.current.offsetWidth + 5));
      setCompanyNameScale(scale);
    }
  }, [copyRightConfig?.name, isCollapsed]);

  const handleLogout = useCallback(() => {
    setUserInfo(null);
    router.replace('/login');
  }, [router, setUserInfo]);

  const handleUserPopoverEnter = () => {
    if (userPopoverTimeoutRef.current) {
      clearTimeout(userPopoverTimeoutRef.current);
      userPopoverTimeoutRef.current = null;
    }
    setShowUserPopover(true);
    setUserPopoverVisibility(true);
  };

  const handleUserPopoverLeave = () => {
    setShowUserPopover(false); // 先触发淡出动画

    userPopoverTimeoutRef.current = setTimeout(() => {
      setUserPopoverVisibility(false); // 动画完成后才真正隐藏元素
    }, 300); // 与动画时长相同
  };

  return (
    <Flex
      w={isCollapsed ? '64px' : '15%'}
      minW={isCollapsed ? '64px' : '226px'}
      maxW={isCollapsed ? '64px' : '226px'}
      h="100%"
      bg="#F4F4F7"
      direction="column"
      justify="space-between"
      p={isCollapsed ? '24px 12px 12px 12px' : '24px 12px 12px 12px'}
      transition="all 0.4s ease-in-out"
      zIndex={1}
    >
      {/* Logo and Navigation Items */}
      <Flex
        direction="column"
        align={isCollapsed ? 'center' : 'flex-start'}
        gap={3}
        w="100%"
        transition="all 0.4s ease-in-out"
      >
        <Box
          w={isCollapsed ? 'auto' : 'auto'}
          h={isCollapsed ? 'auto' : 'auto'}
          display="flex"
          position="relative"
          transition="all 0.4s ease-in-out"
          justifyContent={isCollapsed ? 'center' : 'flex-start'}
        >
          <Flex
            align="center"
            cursor="pointer"
            onClick={() => setIsCollapsed(!isCollapsed)}
            position="relative"
            gap={3}
            style={{
              transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
          >
            {userInfo?.team.teamAvatar ? (
              <Flex
                boxSize="36px"
                borderRadius="9px"
                overflow="hidden"
                flexShrink={0}
                transition="all 0.4s ease-in-out"
                justifyContent="center"
                alignItems="center"
              >
                <Avatar
                  boxSize="100%"
                  src={userInfo?.team.teamAvatar}
                  borderRadius="9px"
                  objectFit="cover"
                />
              </Flex>
            ) : (
              <Box
                boxSize="36px"
                bg="white"
                border="0.75px solid #ECECEC"
                borderRadius="9px"
                overflow="hidden"
                flexShrink={0}
                transition="all 0.4s ease-in-out"
              >
                <Avatar
                  boxSize="100%"
                  src={userInfo?.team.teamAvatar}
                  borderRadius="9px"
                  objectFit="cover"
                />
              </Box>
            )}
            <Box
              opacity={isCollapsed ? 0 : 1}
              maxW={isCollapsed ? 0 : '130px'}
              w="130px"
              transition="all 0.4s ease-in-out"
              overflow="hidden"
              transform="scale(1, 1)"
              transformOrigin="left center"
              className="company-name"
              position={isCollapsed ? 'absolute' : 'relative'}
              width={isCollapsed ? '0' : 'auto'}
              height={isCollapsed ? '0' : 'auto'}
            >
              <Text
                as="span"
                fontSize="md"
                fontWeight="bold"
                color="#111824"
                fontFamily="Inter"
                whiteSpace="nowrap"
                ref={companyNameRef}
                style={{
                  transform: `scale(${companyNameScale})`,
                  display: 'inline-block',
                  transformOrigin: 'left'
                }}
              >
                {copyRightConfig?.name || '没渲染出来'}
              </Text>
            </Box>
          </Flex>
        </Box>

        {/* Navigation Items */}
        <Flex
          direction="column"
          w="100%"
          alignItems={isCollapsed ? 'center' : 'flex-start'}
          transition="all 0.2s"
        >
          {/* Chat Button */}
          <Flex
            align="center"
            p="8px"
            gap="8px"
            w={isCollapsed ? '44px' : '100%'}
            h="44px"
            borderRadius="8px"
            cursor="pointer"
            bg={isChatPage ? 'rgba(17, 24, 36, 0.05)' : 'transparent'}
            _hover={{ bg: isChatPage ? 'rgba(17, 24, 36, 0.1)' : 'rgba(17, 24, 36, 0.05)' }}
            flexGrow={0}
            transition="all 0.4s ease-in-out"
            className="nav-item"
            onClick={() => {
              if (isChatPage) {
                // 如果已经在聊天页面，通过更改路由参数来触发页面刷新
                router.replace({
                  pathname: router.pathname,
                  query: { ...router.query, refresh: Date.now() }
                });
              } else {
                router.push('/chat/gate');
              }
            }}
            justifyContent={isCollapsed ? 'center' : 'flex-start'}
            sx={{
              '&.nav-item': {
                '& > .nav-content': {
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: isCollapsed ? '20px' : '100%',
                  transition: 'all 0.4s ease-in-out'
                }
              }
            }}
          >
            <Box className="nav-content">
              <MyIcon
                name="support/gate/chat/sidebar/chatGray"
                width="20px"
                height="20px"
                color={isChatPage ? '#3370FF' : '#8A95A7'}
                fill={isChatPage ? '#3370FF' : '#8A95A7'}
              />
              <Box
                opacity={isCollapsed ? 0 : 1}
                maxW={isCollapsed ? 0 : '130px'}
                transition="all 0.4s ease-in-out"
                overflow="hidden"
              >
                <Text
                  fontSize="14px"
                  fontWeight="500"
                  lineHeight="20px"
                  letterSpacing="0.1px"
                  fontFamily="PingFang SC"
                  color={isChatPage ? '#3370FF' : '#667085'}
                  transformOrigin="left center"
                  whiteSpace="nowrap"
                >
                  {t('common:navbar.Chat')}
                </Text>
              </Box>
            </Box>
          </Flex>

          {/* App Store Button */}
          <Flex
            align="center"
            p="8px"
            gap="8px"
            w={isCollapsed ? '44px' : '100%'}
            h="44px"
            borderRadius="8px"
            cursor="pointer"
            bg={isStorePage ? 'rgba(17, 24, 36, 0.05)' : 'transparent'}
            _hover={{ bg: isStorePage ? 'rgba(17, 24, 36, 0.1)' : 'rgba(17, 24, 36, 0.05)' }}
            flexGrow={0}
            transition="all 0.4s ease-in-out"
            className="nav-item"
            onClick={() => router.push('/chat/gate/store')}
            justifyContent={isCollapsed ? 'center' : 'flex-start'}
            sx={{
              '&.nav-item': {
                '& > .nav-content': {
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: isCollapsed ? '20px' : '100%',
                  transition: 'all 0.4s ease-in-out'
                }
              }
            }}
          >
            <Box className="nav-content">
              <MyIcon
                name="support/gate/chat/sidebar/appGray"
                width="20px"
                height="20px"
                color={isStorePage ? '#3370FF' : '#8A95A7'}
                fill={isStorePage ? '#3370FF' : '#8A95A7'}
              />
              <Box
                opacity={isCollapsed ? 0 : 1}
                maxW={isCollapsed ? 0 : '130px'}
                transition="all 0.4s ease-in-out"
                overflow="hidden"
              >
                <Text
                  fontSize="14px"
                  fontWeight="500"
                  lineHeight="20px"
                  letterSpacing="0.1px"
                  fontFamily="PingFang SC"
                  color={isStorePage ? '#3370FF' : '#667085'}
                  transformOrigin="left center"
                  whiteSpace="nowrap"
                >
                  {t('common:App')}
                </Text>
              </Box>
            </Box>
          </Flex>

          {/* Divider */}
          <Box w="100%" h="2px" bg="#E8EBF0" transition="width 0.2s" my={3} />
          {/* Recent Apps - matched with SliderApps style */}
          {apps && apps.length > 0 && (
            <>
              <HStack
                px={2}
                w={isCollapsed ? '44px' : '100%'}
                color={'myGray.500'}
                fontSize={'sm'}
                justifyContent={isCollapsed ? 'center' : 'space-between'}
                transition="all 0.2s"
                opacity={isCollapsed ? 0 : 1}
                mb={2}
                sx={{
                  '& > .recent-title': {
                    opacity: isCollapsed ? 0 : 1,
                    transform: `scale(${isCollapsed ? 0 : 1})`,
                    transformOrigin: 'left center',
                    transition: 'all 0.2s',
                    whiteSpace: 'nowrap'
                  }
                }}
              >
                <Box className="recent-title">{t('common:core.chat.Recent use')}</Box>
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
                      userSelect={'none'}
                      opacity={isCollapsed ? 0 : 1}
                      transform={`scale(${isCollapsed ? 0 : 1})`}
                      transformOrigin="left center"
                      transition="all 0.2s"
                      _hover={{
                        bg: 'myGray.200'
                      }}
                    >
                      <Box
                        opacity={isCollapsed ? 0 : 1}
                        transform={`scale(${isCollapsed ? 0 : 1})`}
                        transformOrigin="left center"
                        transition="all 0.2s"
                        whiteSpace="nowrap"
                      >
                        {t('common:More')}
                      </Box>
                      <MyIcon
                        name={'common/select'}
                        w={'1rem'}
                        opacity={isCollapsed ? 0 : 1}
                        transition="all 0.2s"
                      />
                    </HStack>
                  }
                >
                  {({ onClose }) => (
                    <Box minH={'200px'}>
                      <SelectOneResource
                        maxH={'60vh'}
                        value={activeAppId}
                        onSelect={(id) => {
                          if (!id) return;
                          router.replace({
                            pathname: '/chat/gate/application',
                            query: {
                              ...router.query,
                              appId: id
                            }
                          });
                          onClose();
                        }}
                        server={useCallback(async ({ parentId }: GetResourceFolderListProps) => {
                          return getMyApps({
                            parentId,
                            type: [
                              AppTypeEnum.folder,
                              AppTypeEnum.simple,
                              AppTypeEnum.workflow,
                              AppTypeEnum.plugin
                            ]
                          }).then((res) =>
                            res.map<GetResourceListItemResponse>((item) => ({
                              id: item._id,
                              name: item.name,
                              avatar: item.avatar,
                              isFolder: item.type === AppTypeEnum.folder
                            }))
                          );
                        }, [])}
                      />
                    </Box>
                  )}
                </MyPopover>
              </HStack>

              <Box
                maxH={isCollapsed ? '0' : 'calc(100vh - 300px)'}
                opacity={isCollapsed ? 0 : 1}
                transition="all 0.2s"
                overflowY="auto"
                w="100%"
                px={0}
              >
                {apps.map((item) => (
                  <Flex
                    key={item._id}
                    py={2}
                    px={2}
                    mb={2}
                    cursor={'pointer'}
                    borderRadius={'md'}
                    alignItems={'center'}
                    fontSize={'sm'}
                    w="100%"
                    {...(item._id === activeAppId
                      ? {
                          background: 'rgba(51, 112, 255, 0.05)',
                          color: '#3370FF'
                        }
                      : {
                          _hover: {
                            bg: 'rgba(17, 24, 36, 0.05)',
                            color: '#3370FF'
                          }
                        })}
                    onClick={
                      item._id !== activeAppId
                        ? () =>
                            router.replace({
                              pathname: '/chat/gate/application',
                              query: {
                                ...router.query,
                                appId: item._id
                              }
                            })
                        : undefined
                    }
                  >
                    <Avatar src={item.avatar} w={'1.5rem'} borderRadius={'md'} />
                    <Box
                      flex="1"
                      ml={2}
                      className={'textEllipsis'}
                      fontWeight={500}
                      opacity={isCollapsed ? 0 : 1}
                      transform={`scale(${isCollapsed ? 0 : 1})`}
                      transformOrigin="left center"
                      transition="all 0.2s"
                    >
                      {item.name}
                    </Box>
                  </Flex>
                ))}
              </Box>
            </>
          )}
        </Flex>
      </Flex>

      {/* User Profile with Popover */}
      <Box
        position="relative"
        onMouseEnter={handleUserPopoverEnter}
        onMouseLeave={handleUserPopoverLeave}
      >
        <Flex
          align="center"
          gap={2}
          w="100%"
          justifyContent={isCollapsed ? 'center' : 'flex-start'}
          transition="all 0.2s"
          cursor="pointer"
          position="relative"
        >
          {userInfo?.avatar ? (
            <Flex boxSize="36px" borderRadius="50%" overflow="hidden" flexShrink={0}>
              <Avatar boxSize="100%" src={userInfo?.avatar} borderRadius="50%" objectFit="cover" />
            </Flex>
          ) : (
            <Box
              boxSize="36px"
              border="2px solid #fff"
              borderRadius="50%"
              overflow="hidden"
              flexShrink={0}
            >
              <Avatar
                boxSize="100%"
                src={userInfo?.avatar || HUMAN_ICON}
                borderRadius="50%"
                objectFit="cover"
              />
            </Box>
          )}
          <Box
            opacity={isCollapsed ? 0 : 1}
            transform={`scale(${isCollapsed ? 0 : 1})`}
            transformOrigin="left center"
            transition="all 0.2s"
            overflow="hidden"
            flex="1"
          >
            <Text
              fontSize="xs"
              fontWeight="medium"
              letterSpacing="0.1px"
              color="#111824"
              fontFamily="PingFang SC"
              className="textEllipsis"
            >
              {userInfo?.username || 'unauthorized'}
            </Text>
          </Box>
        </Flex>

        {/* Custom Popover */}
        <Flex
          position="absolute"
          left={isCollapsed ? '40px' : '45px'}
          bottom="0"
          direction="column"
          alignItems="flex-start"
          width="192px"
          padding="16px 16px 8px 16px"
          borderRadius="10px"
          bg="white"
          boxShadow="0px 32px 64px -12px rgba(19, 51, 107, 0.20), 0px 0px 1px 0px rgba(19, 51, 107, 0.20)"
          zIndex={10}
          opacity={showUserPopover ? 1 : 0}
          transform={showUserPopover ? 'translateY(0)' : 'translateY(10px)'}
          transition="opacity 0.3s ease, transform 0.3s ease"
          display={userPopoverVisibility ? 'flex' : 'none'}
          pointerEvents={showUserPopover ? 'auto' : 'none'}
          onMouseEnter={handleUserPopoverEnter}
          onMouseLeave={handleUserPopoverLeave}
        >
          <Flex alignItems="center" gap={3} width="100%">
            {userInfo?.avatar ? (
              <Flex boxSize="36px" borderRadius="50%" overflow="hidden" flexShrink={0}>
                <Avatar
                  boxSize="100%"
                  src={userInfo?.avatar}
                  borderRadius="50%"
                  objectFit="cover"
                />
              </Flex>
            ) : (
              <Box
                boxSize="36px"
                border="2px solid #fff"
                borderRadius="50%"
                overflow="hidden"
                flexShrink={0}
              >
                <Avatar
                  boxSize="100%"
                  src={userInfo?.avatar || HUMAN_ICON}
                  borderRadius="50%"
                  objectFit="cover"
                />
              </Box>
            )}
            <Box>
              <Text
                fontSize="sm"
                fontWeight="bold"
                color="#111824"
                className="textEllipsis"
                maxW="120px"
              >
                {userInfo?.username || 'unauthorized'}
              </Text>
            </Box>
          </Flex>

          {/* Divider */}
          <Box w="100%" h="1px" bg="#E8EBF0" transition="width 0.2s" mt={'12px'} mb={'4px'} />

          <Flex
            alignItems="center"
            width="100%"
            cursor="pointer"
            p={2}
            borderRadius="md"
            _hover={{ bg: 'rgba(17, 24, 36, 0.05)' }}
            onClick={handleLogout}
          >
            <MyIcon name="support/account/loginoutLight" width="16px" height="16px" />
            <Text fontSize="sm" ml={2}>
              {t('account:logout')}
            </Text>
          </Flex>
        </Flex>
      </Box>
    </Flex>
  );
};

export default GateNavBar;
