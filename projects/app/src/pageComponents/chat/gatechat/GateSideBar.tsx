import React, { useState, useRef, useEffect } from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useGateStore } from '@/web/support/user/team/gate/useGateStore';
import { HUMAN_ICON } from '@fastgpt/global/common/system/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { AppListItemType } from '@fastgpt/global/core/app/type';
import { useRouter } from 'next/router';

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
        </Flex>

        {/* Recent Apps */}
        {apps && apps.length > 0 && (
          <Box w={isCollapsed ? '36px' : '100%'} mt={4} transition="all 0.2s" overflow="hidden">
            <Box className="nav-item">
              <Box className="nav-content">
                <Text
                  fontSize="14px"
                  fontWeight="500"
                  lineHeight="20px"
                  letterSpacing="0.1px"
                  fontFamily="PingFang SC"
                  color="myGray.500"
                  mb={3}
                  opacity={isCollapsed ? 0 : 1}
                  transform={`scale(${isCollapsed ? 0 : 1})`}
                  transformOrigin="left center"
                  transition="all 0.2s"
                  whiteSpace="nowrap"
                >
                  {t('common:core.chat.Recent use')}
                </Text>
              </Box>
            </Box>
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
                  py={'9px'}
                  px={2}
                  mb={2}
                  cursor={'pointer'}
                  borderRadius={'8px'}
                  alignItems={'center'}
                  gap={'8px'}
                  fontSize={'14px'}
                  lineHeight={'20px'}
                  letterSpacing={'0.1px'}
                  fontFamily={'PingFang SC'}
                  transition="all 0.2s"
                  h="40px"
                  w="100%"
                  bg={item._id === activeAppId ? 'rgba(51, 112, 255, 0.05)' : 'transparent'}
                  color={item._id === activeAppId ? '#3370FF' : 'myGray.700'}
                  _hover={{
                    bg: item._id === activeAppId ? 'rgba(51, 112, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'
                  }}
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
                  <Avatar
                    src={item.avatar}
                    w={'20px'}
                    h={'20px'}
                    borderRadius={'4px'}
                    bg="linear-gradient(200.75deg, #67BFFF 13.74%, #5BA6FF 89.76%)"
                  />
                  <Box
                    flex="1"
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
          </Box>
        )}
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
