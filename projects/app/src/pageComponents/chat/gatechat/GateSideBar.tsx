import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Box, Flex, Text, HStack, IconButton } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useGateStore } from '@/web/support/user/team/gate/useGateStore';
import { HUMAN_ICON } from '@fastgpt/global/common/system/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { AppListItemType } from '@fastgpt/global/core/app/type';
import { useRouter } from 'next/router';
import MyPopover from '@fastgpt/web/components/common/MyPopover/index';
import dynamic from 'next/dynamic';
import { getMyApps } from '@/web/core/app/api';
import {
  GetResourceFolderListProps,
  GetResourceListItemResponse
} from '@fastgpt/global/common/parentFolder/type';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';

const SelectOneResource = dynamic(() => import('@/components/common/folder/SelectOneResource'));

type Props = {
  apps?: AppListItemType[];
  activeAppId?: string;
};

const GateSideBar = ({ apps, activeAppId }: Props) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { userInfo } = useUserStore();
  const { copyRightConfig } = useGateStore();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const companyNameRef = useRef<HTMLSpanElement>(null);
  const [companyNameScale, setCompanyNameScale] = useState(1);

  const isChatPage = router.pathname === '/chat/gate';

  useEffect(() => {
    if (companyNameRef.current && !isCollapsed) {
      const containerWidth = 130;
      const scale = Math.min(1, containerWidth / (companyNameRef.current.offsetWidth + 5));
      setCompanyNameScale(scale);
    }
  }, [copyRightConfig?.name, isCollapsed]);

  return (
    <Flex
      w={isCollapsed ? '60px' : '15%'}
      minW={isCollapsed ? '60px' : '220px'}
      maxW={isCollapsed ? '60px' : '220px'}
      h="100%"
      bg="#F4F4F7"
      direction="column"
      justify="space-between"
      p={6}
      transition="all 0.2s"
    >
      {/* Logo and Navigation Items */}
      <Flex direction="column" align="flex-start" gap={4}>
        <Flex
          align="center"
          cursor="pointer"
          onClick={() => setIsCollapsed(!isCollapsed)}
          position="relative"
          minW={isCollapsed ? '36px' : 'auto'}
          gap={3}
        >
          <Box
            boxSize="36px"
            bg="white"
            border="0.75px solid #ECECEC"
            borderRadius="9px"
            overflow="hidden"
            flexShrink={0}
          >
            <Avatar
              boxSize="100%"
              src={userInfo?.team.teamAvatar}
              borderRadius="9px"
              objectFit="cover"
            />
          </Box>
          <Box
            opacity={isCollapsed ? 0 : 1}
            maxW={isCollapsed ? 0 : '130px'}
            w="130px"
            transition="all 0.2s"
            overflow="hidden"
            transform="scale(1, 1)"
            transformOrigin="left center"
            className="company-name"
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

        {/* Divider */}
        <Box w={isCollapsed ? '36px' : '100%'} h="2px" bg="#E8EBF0" transition="width 0.2s" />

        {/* Navigation Items */}
        <Flex direction="column" gap={6} w={isCollapsed ? '36px' : '100%'} transition="width 0.2s">
          <Flex
            align="center"
            p="8px"
            gap="8px"
            w={isCollapsed ? '36px' : '100%'}
            h="44px"
            borderRadius="8px"
            cursor="pointer"
            bg={isChatPage ? 'rgba(51, 112, 255, 0.05)' : 'transparent'}
            _hover={{ bg: isChatPage ? 'rgba(51, 112, 255, 0.1)' : 'rgba(17, 24, 36, 0.05)' }}
            flexGrow={0}
            transition="width 0.2s"
            className="nav-item"
            onClick={() => router.push('/chat/gate')}
            sx={{
              '&.nav-item': {
                '& > .nav-content': {
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: isCollapsed ? '20px' : '100%',
                  transition: 'all 0.2s'
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
              />
              <Text
                fontSize="14px"
                fontWeight="500"
                lineHeight="20px"
                letterSpacing="0.1px"
                fontFamily="PingFang SC"
                color={isChatPage ? '#3370FF' : '#667085'}
                opacity={isCollapsed ? 0 : 1}
                transform={`scale(${isCollapsed ? 0 : 1})`}
                transformOrigin="left center"
                transition="all 0.2s"
                whiteSpace="nowrap"
              >
                {t('common:navbar.Chat')}
              </Text>
            </Box>
          </Flex>

          {/* Recent Apps - matched with SliderApps style */}
          {apps && apps.length > 0 && (
            <>
              {!isCollapsed && (
                <HStack
                  px={4}
                  my={2}
                  color={'myGray.500'}
                  fontSize={'sm'}
                  justifyContent={'space-between'}
                >
                  <Box>{t('common:core.chat.Recent use')}</Box>
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
                        <Box>{t('common:common.More')}</Box>
                        <MyIcon name={'common/select'} w={'1rem'} />
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
              )}

              <Box
                maxH={isCollapsed ? '0' : 'calc(100vh - 300px)'}
                opacity={isCollapsed ? 0 : 1}
                transition="all 0.2s"
                overflowY="auto"
                px={2}
              >
                {apps.map((item) => (
                  <Flex
                    key={item._id}
                    py={2}
                    px={3}
                    mb={3}
                    cursor={'pointer'}
                    borderRadius={'md'}
                    alignItems={'center'}
                    fontSize={'sm'}
                    {...(item._id === activeAppId
                      ? {
                          bg: 'white',
                          boxShadow: 'md',
                          color: 'primary.600'
                        }
                      : {
                          _hover: {
                            bg: 'myGray.200'
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

      {/* User Profile */}
      <Flex align="center" gap={2} w={isCollapsed ? '36px' : '100%'} transition="all 0.2s">
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
            {userInfo?.username || '未登录'}
          </Text>
        </Box>
      </Flex>
    </Flex>
  );
};

export default GateSideBar;
